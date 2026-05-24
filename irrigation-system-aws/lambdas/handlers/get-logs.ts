import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { errorJson, getCallerSub, json } from '../common/http';
import { hasDeviceAccess } from '../common/access';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const deviceId = event.pathParameters?.deviceId;
  if (!deviceId) return errorJson(400, 'VALIDATION_MISSING_FIELD', 'Missing deviceId path parameter.', { event });

  const sub = getCallerSub(event);
  if (!sub) return errorJson(401, 'AUTH_INVALID_TOKEN', 'Missing verified user context from authorizer.', { event });

  const table = process.env.ACCESS_TABLE_NAME;
  if (!table) return errorJson(500, 'INTERNAL_ERROR', 'Missing ACCESS_TABLE_NAME configuration.', { event });

  if (!(await hasDeviceAccess(table, sub, deviceId, 'viewer'))) {
    return errorJson(403, 'AUTH_FORBIDDEN_DEVICE', 'You do not have access to this device.', { event });
  }

  // Phase 2 scaffold: replace with DynamoDB query once log ingestion is implemented in Phase 4.
  return json(200, { Count: 0, Logs: [] });
};
