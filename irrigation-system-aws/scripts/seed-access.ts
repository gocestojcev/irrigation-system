import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

type AccessRole = 'viewer' | 'operator' | 'owner';
type AccessStatus = 'active' | 'disabled';

type CliArgs = {
  tableName: string;
  userSub: string;
  deviceId: string;
  role: AccessRole;
  status: AccessStatus;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const readArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const getArgs = (): CliArgs => {
  const tableName = readArg('table') ?? process.env.ACCESS_TABLE_NAME;
  const userSub = readArg('user-sub');
  const deviceId = readArg('device-id');
  const role = (readArg('role') ?? 'operator') as AccessRole;
  const status = (readArg('status') ?? 'active') as AccessStatus;

  if (!tableName) throw new Error('Missing table name. Use --table=<name> or ACCESS_TABLE_NAME env var.');
  if (!userSub) throw new Error('Missing user sub. Use --user-sub=<cognito-sub>.');
  if (!deviceId) throw new Error('Missing device id. Use --device-id=<thingName>.');
  if (!['viewer', 'operator', 'owner'].includes(role)) throw new Error('Invalid role. Use viewer|operator|owner.');
  if (!['active', 'disabled'].includes(status)) throw new Error('Invalid status. Use active|disabled.');

  return { tableName, userSub, deviceId, role, status };
};

const main = async (): Promise<void> => {
  const args = getArgs();
  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: args.tableName,
      Item: {
        PK: `USER#${args.userSub}`,
        SK: `DEVICE#${args.deviceId}`,
        GSI1PK: `DEVICE#${args.deviceId}`,
        GSI1SK: `USER#${args.userSub}`,
        role: args.role,
        status: args.status,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        tableName: args.tableName,
        userSub: args.userSub,
        deviceId: args.deviceId,
        role: args.role,
        status: args.status,
      },
      null,
      2,
    ),
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
});
