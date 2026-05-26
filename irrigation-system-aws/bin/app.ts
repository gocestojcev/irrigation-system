import * as cdk from 'aws-cdk-lib';
import { IrrigationApiStack } from '../infra/stacks/irrigation-api-stack';

type EnvConfig = {
  account: string;
  region: string;
  stage: string;
};

const app = new cdk.App();
const environments = app.node.tryGetContext('environments') as Record<string, EnvConfig> | undefined;

if (!environments) {
  throw new Error('Missing context.environments in cdk.json');
}

for (const [name, cfg] of Object.entries(environments)) {
  new IrrigationApiStack(app, `IrrigationApiStack-${name}`, {
    env: { account: cfg.account, region: cfg.region },
    stage: cfg.stage,
  });
}
