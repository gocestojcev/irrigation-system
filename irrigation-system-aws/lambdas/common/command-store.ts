import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type CommandStatus = 'pending' | 'applied' | 'failed' | 'timeout';

export type CommandRecord = {
  commandId: string;
  deviceId: string;
  status: CommandStatus;
  statusKey?: string;
  type: 'line.set' | 'schedule.set' | 'logs.clear';
  requestedBy: string;
  acceptedAt: string;
  acceptedAtEpoch?: number;
  updatedAt: string;
  updatedAtEpoch?: number;
  appliedAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

const pk = (deviceId: string): string => `DEVICE#${deviceId}`;
const sk = (commandId: string): string => `COMMAND#${commandId}`;

export const putPendingCommand = async (
  tableName: string,
  input: {
    commandId: string;
    deviceId: string;
    type: CommandRecord['type'];
    requestedBy: string;
    acceptedAt: string;
  },
): Promise<void> => {
  const ttl = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30);
  const acceptedAtEpoch = Math.floor(new Date(input.acceptedAt).getTime() / 1000);

  const item: CommandRecord & { PK: string; SK: string; ttl: number } = {
    PK: pk(input.deviceId),
    SK: sk(input.commandId),
    commandId: input.commandId,
    deviceId: input.deviceId,
    type: input.type,
    requestedBy: input.requestedBy,
    status: 'pending',
    statusKey: 'STATUS#pending',
    acceptedAt: input.acceptedAt,
    acceptedAtEpoch,
    updatedAt: input.acceptedAt,
    updatedAtEpoch: acceptedAtEpoch,
    ttl,
  };

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    }),
  );
};

export const markCommandFailed = async (
  tableName: string,
  input: {
    commandId: string;
    deviceId: string;
    errorCode: string;
    errorMessage: string;
  },
): Promise<void> => {
  const now = new Date().toISOString();
  const updatedAtEpoch = Math.floor(new Date(now).getTime() / 1000);

  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        PK: pk(input.deviceId),
        SK: sk(input.commandId),
      },
      UpdateExpression: 'SET #status = :failed, #statusKey = :statusKey, #updatedAt = :updatedAt, #updatedAtEpoch = :updatedAtEpoch, #errorCode = :errorCode, #errorMessage = :errorMessage',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#statusKey': 'statusKey',
        '#updatedAt': 'updatedAt',
        '#updatedAtEpoch': 'updatedAtEpoch',
        '#errorCode': 'errorCode',
        '#errorMessage': 'errorMessage',
      },
      ExpressionAttributeValues: {
        ':failed': 'failed',
        ':statusKey': 'STATUS#failed',
        ':updatedAt': now,
        ':updatedAtEpoch': updatedAtEpoch,
        ':errorCode': input.errorCode,
        ':errorMessage': input.errorMessage,
      },
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
    }),
  );
};

export const updateCommandFromDevice = async (
  tableName: string,
  input: {
    commandId: string;
    deviceId: string;
    status: CommandStatus;
    updatedAt?: string;
    appliedAt?: string;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<void> => {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const updatedAtEpoch = Math.floor(new Date(updatedAt).getTime() / 1000);

  const expressionParts: string[] = ['#status = :status', '#statusKey = :statusKey', '#updatedAt = :updatedAt', '#updatedAtEpoch = :updatedAtEpoch'];
  const names: Record<string, string> = {
    '#status': 'status',
    '#statusKey': 'statusKey',
    '#updatedAt': 'updatedAt',
    '#updatedAtEpoch': 'updatedAtEpoch',
  };
  const values: Record<string, unknown> = {
    ':status': input.status,
    ':statusKey': `STATUS#${input.status}`,
    ':updatedAt': updatedAt,
    ':updatedAtEpoch': updatedAtEpoch,
  };

  if (input.appliedAt) {
    expressionParts.push('#appliedAt = :appliedAt');
    names['#appliedAt'] = 'appliedAt';
    values[':appliedAt'] = input.appliedAt;
  }

  if (input.errorCode) {
    expressionParts.push('#errorCode = :errorCode');
    names['#errorCode'] = 'errorCode';
    values[':errorCode'] = input.errorCode;
  }

  if (input.errorMessage) {
    expressionParts.push('#errorMessage = :errorMessage');
    names['#errorMessage'] = 'errorMessage';
    values[':errorMessage'] = input.errorMessage;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        PK: pk(input.deviceId),
        SK: sk(input.commandId),
      },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
    }),
  );
};

export const getCommandRecord = async (
  tableName: string,
  deviceId: string,
  commandId: string,
): Promise<CommandRecord | null> => {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: pk(deviceId),
        SK: sk(commandId),
      },
      ConsistentRead: true,
    }),
  );

  if (!result.Item) {
    return null;
  }

  return result.Item as CommandRecord;
};

export const markStalePendingAsTimeout = async (
  tableName: string,
  timeoutSeconds: number,
): Promise<number> => {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const threshold = nowEpoch - timeoutSeconds;

  const scan = await ddb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: '#status = :pending AND #acceptedAtEpoch <= :threshold',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#acceptedAtEpoch': 'acceptedAtEpoch',
      },
      ExpressionAttributeValues: {
        ':pending': 'pending',
        ':threshold': threshold,
      },
    }),
  );

  const items = (scan.Items ?? []) as Array<{ PK: string; SK: string }>;
  if (items.length === 0) return 0;

  const updatedAt = new Date().toISOString();
  const updatedAtEpoch = Math.floor(new Date(updatedAt).getTime() / 1000);

  let updated = 0;
  for (const item of items) {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          PK: item.PK,
          SK: item.SK,
        },
        UpdateExpression: 'SET #status = :status, #statusKey = :statusKey, #updatedAt = :updatedAt, #updatedAtEpoch = :updatedAtEpoch, #errorCode = :errorCode, #errorMessage = :errorMessage',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#statusKey': 'statusKey',
          '#updatedAt': 'updatedAt',
          '#updatedAtEpoch': 'updatedAtEpoch',
          '#errorCode': 'errorCode',
          '#errorMessage': 'errorMessage',
        },
        ExpressionAttributeValues: {
          ':status': 'timeout',
          ':statusKey': 'STATUS#timeout',
          ':updatedAt': updatedAt,
          ':updatedAtEpoch': updatedAtEpoch,
          ':errorCode': 'COMMAND_TIMEOUT',
          ':errorMessage': 'Command timed out waiting for device acknowledgement.',
          ':pendingCurrent': 'pending',
        },
        ConditionExpression: '#status = :pendingCurrent',
      }),
    );
    updated += 1;
  }

  return updated;
};
