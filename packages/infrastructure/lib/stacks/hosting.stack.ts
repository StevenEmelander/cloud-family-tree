import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import type { Config } from '../../../../config';

export interface HostingStackProps extends cdk.StackProps {
  config: Config;
}

export class HostingStack extends cdk.Stack {
  public readonly siteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);

    const { config } = props;
    const domainName = config.domain.name;

    // Look up hosted zone
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: config.domain.hostedZoneId,
      zoneName: domainName,
    });

    // S3 bucket for static site
    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `${config.familyName.toLowerCase()}-family-site`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ACM certificate in us-east-1 (required for CloudFront)
    const siteCertificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
      domainName,
      subjectAlternativeNames: [`*.${domainName}`],
      hostedZone,
      region: 'us-east-1',
    });

    // CloudFront Function to rewrite dynamic routes for Next.js static export.
    // /people/{id}/ → /people/_/index.html (the static placeholder page)
    // /people/{id}/index.txt → /people/_/index.txt (RSC prefetch)
    // All other paths get /index.html appended for directory-style URLs.
    const urlRewriteFn = new cloudfront.Function(this, 'UrlRewriteFunction', {
      functionName: `${config.familyName}Family-UrlRewrite`,
      code: cloudfront.FunctionCode.fromInline(
        `
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Rewrite /people/{id}/index.txt to the static placeholder (RSC prefetch)
  if (uri.match(/^\\/people\\/[^_][^\\/]*\\/index\\.txt$/)) {
    request.uri = '/people/_/index.txt';
    return request;
  }

  // Rewrite /people/{id}/ or /people/{id} to the static placeholder
  if (uri.match(/^\\/people\\/[^_][^\\/]*\\/?$/)) {
    request.uri = '/people/_/index.html';
    return request;
  }

  // Append index.html for directory-style URLs
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }

  return request;
}
      `.trim(),
      ),
    });

    // Security response headers applied to all CloudFront responses
    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeadersPolicy',
      {
        responseHeadersPolicyName: `${config.familyName}Family-SecurityHeaders`,
        securityHeadersBehavior: {
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            override: true,
          },
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
        },
      },
    );

    // Long-lived cache policy for hashed static assets (_next/static/*)
    const immutableCachePolicy = new cloudfront.CachePolicy(this, 'ImmutableCachePolicy', {
      cachePolicyName: `${config.familyName}Family-ImmutableAssets`,
      defaultTtl: cdk.Duration.days(365),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket);

    // CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeadersPolicy,
        functionAssociations: [
          {
            function: urlRewriteFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        '_next/static/*': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: immutableCachePolicy,
          responseHeadersPolicy: securityHeadersPolicy,
        },
      },
      domainNames: [domainName, `www.${domainName}`],
      certificate: siteCertificate,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // Deploy all site files with no-cache (safe default for HTML + RSC .txt files)
    const webOutDir = path.join(__dirname, '..', '..', '..', 'web', 'out');

    new s3deploy.BucketDeployment(this, 'DeploySiteFiles', {
      sources: [s3deploy.Source.asset(webOutDir)],
      destinationBucket: this.siteBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      cacheControl: [s3deploy.CacheControl.noCache()],
      prune: true,
    });

    // Overwrite _next/static/* with immutable cache (content-hashed filenames)
    new s3deploy.BucketDeployment(this, 'DeployStaticAssets', {
      sources: [
        s3deploy.Source.asset(path.join(webOutDir, '_next', 'static')),
      ],
      destinationBucket: this.siteBucket,
      destinationKeyPrefix: '_next/static',
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.days(365)),
        s3deploy.CacheControl.immutable(),
      ],
      prune: false,
    });

    // Site DNS records
    new route53.ARecord(this, 'SiteARecord', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    new route53.AaaaRecord(this, 'SiteAAAARecord', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    new route53.ARecord(this, 'WwwARecord', {
      zone: hostedZone,
      recordName: 'www',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    new route53.AaaaRecord(this, 'WwwAAAARecord', {
      zone: hostedZone,
      recordName: 'www',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    // Outputs
    new cdk.CfnOutput(this, 'SiteBucketName', { value: this.siteBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${domainName}` });
  }
}
