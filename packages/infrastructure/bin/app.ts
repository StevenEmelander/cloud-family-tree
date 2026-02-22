#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { config } from '../../../config';
import { ApiStack } from '../lib/stacks/api.stack';
import { AuthStack } from '../lib/stacks/auth.stack';
import { DatabaseStack } from '../lib/stacks/database.stack';
import { HostingStack } from '../lib/stacks/hosting.stack';
import { MonitoringStack } from '../lib/stacks/monitoring.stack';
import { StorageStack } from '../lib/stacks/storage.stack';

const app = new cdk.App();
const prefix = `${config.familyName}Family`;

const env = {
  account: config.awsAccount || process.env.CDK_DEFAULT_ACCOUNT,
  region: config.awsRegion,
};

const databaseStack = new DatabaseStack(app, `${prefix}-Database`, { env });

const monitoringStack = new MonitoringStack(app, `${prefix}-Monitoring`, { env, config });

const authStack = new AuthStack(app, `${prefix}-Auth`, {
  env,
  config,
  alertTopic: monitoringStack.alertTopic,
});

const storageStack = new StorageStack(app, `${prefix}-Storage`, { env, config });

new ApiStack(app, `${prefix}-Api`, {
  env,
  config,
  tables: databaseStack.tables,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  photosBucket: storageStack.photosBucket,
  alertTopic: monitoringStack.alertTopic,
});

if (config.domain.enabled) {
  new HostingStack(app, `${prefix}-Hosting`, { env, config });
}

app.synth();
