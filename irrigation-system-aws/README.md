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

## Configure Cognito authorizer
For each environment in [cdk.json](cdk.json), set `userPoolId` to the target Cognito User Pool ID.

Example:
- `eu-central-1_abc123Dev`
- `eu-central-1_xyz789Prod`

All API methods are protected with a Cognito User Pool authorizer.

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
