import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LogEventIngestBody } from './validation';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const LOG_TTL_SECONDS = 90 * 24 * 60 * 60;

export const putLogEvent = async (tableName: string, payload: LogEventIngestBody): Promise<void> => {
  const sortKey = `LOG#${String(payload.Epoch).padStart(10, '0')}#${payload.Line}#${payload.Event}`;

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        PK: `DEVICE#${payload.deviceId}`,
        SK: sortKey,
        deviceId: payload.deviceId,
        Epoch: payload.Epoch,
        Time: payload.Time,
        Line: payload.Line,
        Event: payload.Event,
        Source: payload.Source,
        DurationSec: payload.DurationSec,
        DurationMin: payload.DurationMin,
        ttl: payload.Epoch + LOG_TTL_SECONDS,
      },
    }),
  );
};

export type StoredLogEntry = {
  Epoch: number;
  Time: string;
  Line: number;
  Event: 'Started' | 'Stopped';
  Source: 'manual' | 'scheduled' | 'system';
  DurationSec: number;
  DurationMin: number;
};

export const queryDeviceLogs = async (
  tableName: string,
  deviceId: string,
  limit: number,
): Promise<StoredLogEntry[]> => {
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `DEVICE#${deviceId}`,
        ':skPrefix': 'LOG#',
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  return (result.Items ?? []).map((item) => ({
    Epoch: item.Epoch as number,
    Time: item.Time as string,
    Line: item.Line as number,
    Event: item.Event as StoredLogEntry['Event'],
    Source: item.Source as StoredLogEntry['Source'],
    DurationSec: item.DurationSec as number,
    DurationMin: item.DurationMin as number,
  }));
};

export const clearDeviceLogs = async (tableName: string, deviceId: string): Promise<number> => {
  let deleted = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `DEVICE#${deviceId}`,
          ':skPrefix': 'LOG#',
        },
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: exclusiveStartKey,
        Limit: 25,
      }),
    );

    const items = result.Items ?? [];
    for (const item of items) {
      await ddb.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            PK: item.PK as string,
            SK: item.SK as string,
          },
        }),
      );
      deleted += 1;
    }

    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return deleted;
};
