import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';
import type { Config } from '../../../../config';
import type { Tables } from './database.stack';

export interface ApiStackProps extends cdk.StackProps {
  config: Config;
  tables: Tables;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  photosBucket: s3.Bucket;
  alertTopic: sns.ITopic;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, tables, userPool, userPoolClient, photosBucket, alertTopic } = props;

    // Shared environment variables for all Lambdas
    const sharedEnv: Record<string, string> = {
      PEOPLE_TABLE_NAME: tables.people.tableName,
      RELATIONSHIPS_TABLE_NAME: tables.relationships.tableName,
      ARTIFACTS_TABLE_NAME: tables.artifacts.tableName,
      PHOTOS_BUCKET_NAME: photosBucket.bucketName,
      ENTRIES_TABLE_NAME: tables.entries.tableName,
      SOURCES_TABLE_NAME: tables.sources.tableName,
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      REQUIRE_AUTH_FOR_READ: String(config.access.requireAuthForRead),
      FRONTEND_DOMAIN: config.domain.enabled ? `https://${config.domain.name}` : '',
    };

    const apiSrcDir = path.join(__dirname, '../../../api/src');

    const allTables: dynamodb.Table[] = [
      tables.people,
      tables.relationships,
      tables.artifacts,
      tables.entries,
      tables.sources,
    ];

    // Helper to create bundled Lambda functions using NodejsFunction (esbuild)
    const createLambda = (
      name: string,
      handlerPath: string,
      memorySize = 256,
      timeout = 30,
      grantTables: dynamodb.Table[] = allTables,
    ) => {
      const fn = new NodejsFunction(this, name, {
        functionName: `${config.familyName}Family-${name}`,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        entry: path.join(apiSrcDir, `${handlerPath}.ts`),
        handler: 'handler',
        memorySize,
        timeout: cdk.Duration.seconds(timeout),
        environment: sharedEnv,
        logRetention: logs.RetentionDays.ONE_MONTH,
        bundling: {
          minify: true,
          sourceMap: true,
          target: 'node22',
          // AWS SDK v3 is available in the Lambda runtime
          externalModules: ['@aws-sdk/*'],
        },
      });

      // Grant DynamoDB access only to specified tables
      for (const table of grantTables) {
        table.grantReadWriteData(fn);
      }
      return fn;
    };

    // Create Lambda functions
    const healthFn = createLambda('Health', 'handlers/health', 256, 30, []);
    const createPersonFn = createLambda('CreatePerson', 'handlers/people/create');
    const getPersonFn = createLambda('GetPerson', 'handlers/people/get');
    const listPeopleFn = createLambda('ListPeople', 'handlers/people/list');
    const updatePersonFn = createLambda('UpdatePerson', 'handlers/people/update');
    const deletePersonFn = createLambda('DeletePerson', 'handlers/people/delete');

    const createRelationshipFn = createLambda(
      'CreateRelationship',
      'handlers/relationships/create',
    );
    const listRelationshipsFn = createLambda(
      'ListRelationships',
      'handlers/relationships/list-by-person',
    );
    const updateRelationshipFn = createLambda(
      'UpdateRelationship',
      'handlers/relationships/update',
    );
    const deleteRelationshipFn = createLambda(
      'DeleteRelationship',
      'handlers/relationships/delete',
    );

    const createArtifactUrlFn = createLambda(
      'CreateArtifactUrl',
      'handlers/artifacts/create-upload-url',
    );
    const confirmArtifactFn = createLambda('ConfirmArtifact', 'handlers/artifacts/confirm-upload');
    const listArtifactsFn = createLambda('ListArtifacts', 'handlers/artifacts/list');
    const deleteArtifactFn = createLambda('DeleteArtifact', 'handlers/artifacts/delete');
    const getArtifactUrlFn = createLambda('GetArtifactUrl', 'handlers/artifacts/get-url');
    const associateArtifactFn = createLambda('AssociateArtifact', 'handlers/artifacts/associate');
    const disassociateArtifactFn = createLambda(
      'DisassociateArtifact',
      'handlers/artifacts/disassociate',
    );
    const updateArtifactFn = createLambda('UpdateArtifact', 'handlers/artifacts/update');
    const getArtifactAssociationsFn = createLambda(
      'GetArtifactAssociations',
      'handlers/artifacts/get-associations',
    );

    const gedcomImportFn = createLambda('GedcomImport', 'handlers/gedcom/import', 1024, 300);
    const gedcomExportFn = createLambda('GedcomExport', 'handlers/gedcom/export', 512, 60);
    const gedzipImportFn = createLambda('GedzipImport', 'handlers/gedcom/import-gedzip', 1024, 600);
    const gedzipExportFn = createLambda('GedzipExport', 'handlers/gedcom/export-gedzip', 1024, 600);
    const gedzipUploadUrlFn = createLambda('GedzipUploadUrl', 'handlers/gedcom/upload-gedzip-url');

    // Source CRUD Lambdas (only need sources table)
    const sourceTables = [tables.sources];
    const createSourceFn = createLambda('CreateSource', 'handlers/sources/create', 256, 30, sourceTables);
    const listSourcesFn = createLambda('ListSources', 'handlers/sources/list', 256, 30, sourceTables);
    const getSourceFn = createLambda('GetSource', 'handlers/sources/get', 256, 30, sourceTables);
    const updateSourceFn = createLambda('UpdateSource', 'handlers/sources/update', 256, 30, sourceTables);
    const deleteSourceFn = createLambda('DeleteSource', 'handlers/sources/delete', 256, 30, sourceTables);

    // Admin user management Lambdas (use Cognito, no DynamoDB tables needed)
    const noTables: dynamodb.Table[] = [];
    const listUsersFn = createLambda('ListUsers', 'handlers/admin/list-users', 256, 30, noTables);
    const approveUserFn = createLambda('ApproveUser', 'handlers/admin/approve-user', 256, 30, noTables);
    const deleteUserFn = createLambda('DeleteUser', 'handlers/admin/delete-user', 256, 30, noTables);
    const setUserRoleFn = createLambda('SetUserRole', 'handlers/admin/set-user-role', 256, 30, noTables);
    const requestEditorFn = createLambda('RequestEditor', 'handlers/admin/request-editor', 256, 30, noTables);

    // Entry Lambdas (need entries + people tables)
    const entryTables = [tables.entries, tables.people];
    const createEntryFn = createLambda('CreateEntry', 'handlers/entries/create', 256, 30, entryTables);
    const listEntriesFn = createLambda('ListEntries', 'handlers/entries/list', 256, 30, entryTables);
    const listAllEntriesFn = createLambda('ListAllEntries', 'handlers/entries/list-all', 256, 30, entryTables);
    const updateEntryFn = createLambda('UpdateEntry', 'handlers/entries/update', 256, 30, entryTables);
    const deleteEntryFn = createLambda('DeleteEntry', 'handlers/entries/delete', 256, 30, entryTables);

    // Grant Cognito admin permissions to admin Lambdas
    const cognitoAdminPolicy = new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminListGroupsForUser',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminRemoveUserFromGroup',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:ListUsers',
      ],
      resources: [userPool.userPoolArn],
    });

    for (const fn of [listUsersFn, approveUserFn, deleteUserFn, setUserRoleFn, requestEditorFn]) {
      fn.addToRolePolicy(cognitoAdminPolicy);
    }

    // Grant SNS publish to request-editor Lambda
    requestEditorFn.addEnvironment('ALERT_TOPIC_ARN', alertTopic.topicArn);
    alertTopic.grantPublish(requestEditorFn);

    // Grant S3 access to artifact and GEDCOM functions
    photosBucket.grantReadWrite(createArtifactUrlFn);
    photosBucket.grantReadWrite(confirmArtifactFn);
    photosBucket.grantRead(listArtifactsFn);
    photosBucket.grantReadWrite(deleteArtifactFn);
    photosBucket.grantRead(getArtifactUrlFn);
    photosBucket.grantRead(getArtifactAssociationsFn);
    photosBucket.grantReadWrite(gedzipImportFn);
    photosBucket.grantReadWrite(gedzipExportFn);
    photosBucket.grantReadWrite(gedzipUploadUrlFn);

    // CORS origins
    const allowedOrigins = config.domain.enabled
      ? [`https://${config.domain.name}`, `https://www.${config.domain.name}`]
      : apigateway.Cors.ALL_ORIGINS;

    // Single origin value used in gateway error responses (must be quoted string literal)
    const corsOriginValue = config.domain.enabled ? `'https://${config.domain.name}'` : "'*'";

    // API Gateway
    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName: `${config.familyName}Family-API`,
      description: `${config.familyName} Family Tree API`,
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 500,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
      },
    });

    // Add Gateway Responses for 4XX/5XX so CORS headers are always present
    // (API Gateway authorizer rejections would otherwise omit CORS headers)
    this.api.addGatewayResponse('Unauthorized', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        'Access-Control-Allow-Origin': corsOriginValue,
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      },
    });
    this.api.addGatewayResponse('AccessDenied', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        'Access-Control-Allow-Origin': corsOriginValue,
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      },
    });
    this.api.addGatewayResponse('Default4XX', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': corsOriginValue,
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      },
    });
    this.api.addGatewayResponse('Default5XX', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': corsOriginValue,
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      },
    });

    // Cognito authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'CognitoAuthorizer',
    });

    const authOpts: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Routes
    const health = this.api.root.addResource('health');
    health.addMethod('GET', new apigateway.LambdaIntegration(healthFn));

    const people = this.api.root.addResource('people');
    people.addMethod('GET', new apigateway.LambdaIntegration(listPeopleFn));
    people.addMethod('POST', new apigateway.LambdaIntegration(createPersonFn), authOpts);

    const person = people.addResource('{id}');
    person.addMethod('GET', new apigateway.LambdaIntegration(getPersonFn));
    person.addMethod('PUT', new apigateway.LambdaIntegration(updatePersonFn), authOpts);
    person.addMethod('DELETE', new apigateway.LambdaIntegration(deletePersonFn), authOpts);

    const personRelationships = person.addResource('relationships');
    personRelationships.addMethod('GET', new apigateway.LambdaIntegration(listRelationshipsFn));

    const personAncestors = person.addResource('ancestors');
    personAncestors.addMethod('GET', new apigateway.LambdaIntegration(listRelationshipsFn));

    const personDescendants = person.addResource('descendants');
    personDescendants.addMethod('GET', new apigateway.LambdaIntegration(listRelationshipsFn));

    const personArtifacts = person.addResource('artifacts');
    personArtifacts.addMethod('GET', new apigateway.LambdaIntegration(listArtifactsFn));

    const relationships = this.api.root.addResource('relationships');
    relationships.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createRelationshipFn),
      authOpts,
    );

    const relationship = relationships.addResource('{id}');
    relationship.addMethod('PUT', new apigateway.LambdaIntegration(updateRelationshipFn), authOpts);
    relationship.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(deleteRelationshipFn),
      authOpts,
    );

    const artifacts = this.api.root.addResource('artifacts');
    const artifactsUploadUrl = artifacts.addResource('upload-url');
    artifactsUploadUrl.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createArtifactUrlFn),
      authOpts,
    );

    const artifactsConfirm = artifacts.addResource('confirm');
    artifactsConfirm.addMethod(
      'POST',
      new apigateway.LambdaIntegration(confirmArtifactFn),
      authOpts,
    );

    const artifactItem = artifacts.addResource('{id}');
    artifactItem.addMethod('PUT', new apigateway.LambdaIntegration(updateArtifactFn), authOpts);
    artifactItem.addMethod('DELETE', new apigateway.LambdaIntegration(deleteArtifactFn), authOpts);

    const artifactItemUrl = artifactItem.addResource('url');
    artifactItemUrl.addMethod('GET', new apigateway.LambdaIntegration(getArtifactUrlFn));

    const artifactAssociate = artifactItem.addResource('associate');
    artifactAssociate.addMethod(
      'POST',
      new apigateway.LambdaIntegration(associateArtifactFn),
      authOpts,
    );

    const artifactDisassociate = artifactAssociate.addResource('{personId}');
    artifactDisassociate.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(disassociateArtifactFn),
      authOpts,
    );

    const artifactAssociations = artifactItem.addResource('associations');
    artifactAssociations.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getArtifactAssociationsFn),
    );

    const tree = this.api.root.addResource('tree');

    const importGedcom = tree.addResource('import-gedcom');
    importGedcom.addMethod('POST', new apigateway.LambdaIntegration(gedcomImportFn), authOpts);

    const exportGedcom = tree.addResource('export-gedcom');
    exportGedcom.addMethod('GET', new apigateway.LambdaIntegration(gedcomExportFn), authOpts);

    const importGedzip = tree.addResource('import-gedzip');
    importGedzip.addMethod('POST', new apigateway.LambdaIntegration(gedzipImportFn), authOpts);

    const exportGedzip = tree.addResource('export-gedzip');
    exportGedzip.addMethod('POST', new apigateway.LambdaIntegration(gedzipExportFn), authOpts);

    const uploadGedzipUrl = tree.addResource('upload-gedzip');
    uploadGedzipUrl.addMethod('POST', new apigateway.LambdaIntegration(gedzipUploadUrlFn), authOpts);

    // Source routes
    const sourcesResource = this.api.root.addResource('sources');
    sourcesResource.addMethod('GET', new apigateway.LambdaIntegration(listSourcesFn));
    sourcesResource.addMethod('POST', new apigateway.LambdaIntegration(createSourceFn), authOpts);

    const sourceItem = sourcesResource.addResource('{id}');
    sourceItem.addMethod('GET', new apigateway.LambdaIntegration(getSourceFn));
    sourceItem.addMethod('PUT', new apigateway.LambdaIntegration(updateSourceFn), authOpts);
    sourceItem.addMethod('DELETE', new apigateway.LambdaIntegration(deleteSourceFn), authOpts);

    // Admin routes
    const admin = this.api.root.addResource('admin');
    const adminUsers = admin.addResource('users');
    adminUsers.addMethod('GET', new apigateway.LambdaIntegration(listUsersFn), authOpts);

    const adminUsersApprove = adminUsers.addResource('approve');
    adminUsersApprove.addMethod('POST', new apigateway.LambdaIntegration(approveUserFn), authOpts);

    const adminUsersSetRole = adminUsers.addResource('set-role');
    adminUsersSetRole.addMethod('POST', new apigateway.LambdaIntegration(setUserRoleFn), authOpts);

    const adminUsersRequestEditor = adminUsers.addResource('request-editor');
    adminUsersRequestEditor.addMethod(
      'POST',
      new apigateway.LambdaIntegration(requestEditorFn),
      authOpts,
    );

    const adminUser = adminUsers.addResource('{username}');
    adminUser.addMethod('DELETE', new apigateway.LambdaIntegration(deleteUserFn), authOpts);

    // Entry routes
    const personEntries = person.addResource('entries');
    personEntries.addMethod('GET', new apigateway.LambdaIntegration(listEntriesFn));
    personEntries.addMethod('POST', new apigateway.LambdaIntegration(createEntryFn), authOpts);

    const entries = this.api.root.addResource('entries');
    entries.addMethod('GET', new apigateway.LambdaIntegration(listAllEntriesFn));
    const entry = entries.addResource('{id}');
    entry.addMethod('PUT', new apigateway.LambdaIntegration(updateEntryFn), authOpts);
    entry.addMethod('DELETE', new apigateway.LambdaIntegration(deleteEntryFn), authOpts);

    // API custom domain
    if (config.domain.enabled) {
      const domainName = config.domain.name;
      const apiDomainName = `api.${domainName}`;

      const hostedZone = config.domain.hostedZoneId
        ? route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
            hostedZoneId: config.domain.hostedZoneId,
            zoneName: domainName,
          })
        : route53.HostedZone.fromLookup(this, 'HostedZone', { domainName });

      const apiCertificate = new acm.Certificate(this, 'ApiCertificate', {
        domainName: apiDomainName,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });

      const customDomain = this.api.addDomainName('ApiCustomDomain', {
        domainName: apiDomainName,
        certificate: apiCertificate,
        endpointType: apigateway.EndpointType.REGIONAL,
      });

      new route53.ARecord(this, 'ApiARecord', {
        zone: hostedZone,
        recordName: 'api',
        target: route53.RecordTarget.fromAlias(new targets.ApiGatewayDomain(customDomain)),
      });

      new cdk.CfnOutput(this, 'ApiCustomUrl', { value: `https://${apiDomainName}` });
    }

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: this.api.url });
  }
}
