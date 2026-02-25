import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { Config } from '../../../../config';

export interface StorageStackProps extends cdk.StackProps {
  config: Config;
}

export class StorageStack extends cdk.Stack {
  public readonly photosBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { config } = props;

    const corsOrigins = config.domain.enabled
      ? [`https://${config.domain.name}`, `https://www.${config.domain.name}`]
      : ['*'];

    this.photosBucket = new s3.Bucket(this, 'PhotosBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: corsOrigins,
          allowedHeaders: ['Content-Type', 'Content-Length'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          // Clean up incomplete multipart uploads
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
        {
          // Move old photos to cheaper storage
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'PhotosBucketName', { value: this.photosBucket.bucketName });
    new cdk.CfnOutput(this, 'PhotosBucketArn', { value: this.photosBucket.bucketArn });
  }
}
