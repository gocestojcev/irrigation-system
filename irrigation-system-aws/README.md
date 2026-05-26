# irrigation-system-aws

AWS CDK project for the irrigation cloud backend.

**Deployment guide:** [../DEPLOYMENT.md](../DEPLOYMENT.md)

## Included
- Lambda handlers (TypeScript) with auth/access validation placeholders.
- DynamoDB `device_user_access` table.
- DynamoDB `device_commands` table for persistent `commandId` status tracking.
- IoT Topic Rule for command result ingest from `irrigation/devices/{deviceId}/command-result`.
- Scheduled timeout sweep to move stale `pending` commands to `timeout`.
- CloudWatch alarms for API 5XX and Lambda errors.
- Environment-aware stacks (`dev`, `prod`).
- Structured JSON application logging for request lifecycle and command tracking.

## Quick start
1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Synthesize: `npm run synth`
4. Deploy dev: `npm run deploy:dev`

## Configure account/region
Update [cdk.json](cdk.json) `context.environments` values for your AWS account/regions.

## Cognito (created by CDK)

Each stack creates its own Cognito User Pool and mobile app client (`irrigation-system-mobile`):

- Sign-in with **email** + password (SRP and USER_PASSWORD auth flows)
- Self sign-up is **disabled** — create users with `admin-create-user` (see [DEPLOYMENT.md](../DEPLOYMENT.md))

After deploy, copy stack outputs into the mobile app `app.json` → `extra.irrigation`:

```powershell
aws cloudformation describe-stacks --stack-name IrrigationApiStack-dev --profile goce --region eu-central-1 --query "Stacks[0].Outputs"
```

Outputs: `UserPoolId`, `UserPoolClientId`, `ApiUrl`.

The legacy script `npm run setup:cognito-client` is only needed if you import an external pool instead of using CDK-managed Cognito.

All API methods are protected with the stack's Cognito User Pool authorizer.

## Seed access mapping (pre-deploy test prep)
Use the helper script to create `user -> device` access records:

- `npm run seed:access -- --table=device_user_access_dev --user-sub=<cognito-sub> --device-id=<thingName> --role=operator --status=active`

Arguments:
- `--table` (optional if `ACCESS_TABLE_NAME` env var is set)
- `--user-sub` (required)
- `--device-id` (required)
- `--role` (`viewer|operator|owner`, default `operator`)
- `--status` (`active|disabled`, default `active`)

## Local handler fixtures
Fixture files are in [scripts/fixtures](scripts/fixtures).

- Run ingest fixture:
	- `npm run fixture:ingest`
	- or `ts-node scripts/run-fixture.ts ingest scripts/fixtures/ingest-command-result.failed.json`
- Run timeout sweep handler:
	- `npm run fixture:timeout`

Note: fixture execution still needs AWS credentials and table environment values when handlers access DynamoDB.
