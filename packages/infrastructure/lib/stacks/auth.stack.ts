import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';
import type { Config } from '../../../../config';

export interface AuthStackProps extends cdk.StackProps {
  config: Config;
  alertTopic: sns.ITopic;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { config, alertTopic } = props;

    // Post-confirmation Lambda trigger (bundled with esbuild)
    const postConfirmationFn = new NodejsFunction(this, 'PostConfirmation', {
      functionName: `${config.familyName}Family-PostConfirmation`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../../api/src/handlers/auth/post-confirmation.ts'),
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ALERT_TOPIC_ARN: alertTopic.topicArn,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        externalModules: ['@aws-sdk/*'],
      },
    });

    alertTopic.grantPublish(postConfirmationFn);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${config.familyName}Family-UserPool`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      customAttributes: {
        editorRequested: new cognito.StringAttribute({ mutable: true }),
      },
      lambdaTriggers: {
        postConfirmation: postConfirmationFn,
      },
    });

    // Grant Cognito permission to add user to group
    // Note: we use a region-scoped wildcard to avoid circular dependency
    // (Lambda -> UserPool -> Lambda). The handler uses event.userPoolId instead of an env var.
    postConfirmationFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminAddUserToGroup'],
        resources: [
          cdk.Arn.format({ service: 'cognito-idp', resource: 'userpool', resourceName: '*' }, this),
        ],
      }),
    );

    // User groups
    const adminsGroup = new cognito.CfnUserPoolGroup(this, 'AdminsGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admins',
      description: 'Administrators - full control including user management',
    });

    new cognito.CfnUserPoolGroup(this, 'EditorsGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'editors',
      description: 'Editors - can add/edit people and upload photos',
    });

    new cognito.CfnUserPoolGroup(this, 'VisitorsGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'visitors',
      description: 'Visitors - can browse and contribute',
    });

    // User pool client
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `${config.familyName}Family-WebClient`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // Create initial admin user
    const adminUser = new cognito.CfnUserPoolUser(this, 'AdminUser', {
      userPoolId: this.userPool.userPoolId,
      username: config.admin.email,
      userAttributes: [
        { name: 'email', value: config.admin.email },
        { name: 'name', value: config.admin.name },
        { name: 'email_verified', value: 'true' },
      ],
      desiredDeliveryMediums: ['EMAIL'],
    });

    const adminGroupAttachment = new cognito.CfnUserPoolUserToGroupAttachment(
      this,
      'AdminGroupAttachment',
      {
        userPoolId: this.userPool.userPoolId,
        groupName: 'admins',
        username: config.admin.email,
      },
    );
    adminGroupAttachment.addDependency(adminUser);
    adminGroupAttachment.addDependency(adminsGroup);

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
