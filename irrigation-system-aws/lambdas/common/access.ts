import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type Role = 'viewer' | 'operator' | 'owner';

const roleRank: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  owner: 3,
};

export const hasDeviceAccess = async (
  tableName: string,
  userSub: string,
  deviceId: string,
  minimumRole: Role,
): Promise<boolean> => {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: `USER#${userSub}`,
        SK: `DEVICE#${deviceId}`,
      },
      ConsistentRead: true,
    }),
  );

  const role = result.Item?.role as Role | undefined;
  const status = result.Item?.status as string | undefined;

  if (!role || status !== 'active') {
    return false;
  }

  return roleRank[role] >= roleRank[minimumRole];
};
