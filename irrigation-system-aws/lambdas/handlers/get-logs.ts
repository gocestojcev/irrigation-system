import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { errorJson, getCallerSub, json } from '../common/http';
import { hasDeviceAccess } from '../common/access';
import { queryDeviceLogs } from '../common/log-store';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const deviceId = event.pathParameters?.deviceId;
  if (!deviceId) return errorJson(400, 'VALIDATION_MISSING_FIELD', 'Missing deviceId path parameter.', { event });

  const sub = getCallerSub(event);
  if (!sub) return errorJson(401, 'AUTH_INVALID_TOKEN', 'Missing verified user context from authorizer.', { event });

  const table = process.env.ACCESS_TABLE_NAME;
  if (!table) return errorJson(500, 'INTERNAL_ERROR', 'Missing ACCESS_TABLE_NAME configuration.', { event });

  const logsTable = process.env.LOGS_TABLE_NAME;
  if (!logsTable) return errorJson(500, 'INTERNAL_ERROR', 'Missing LOGS_TABLE_NAME configuration.', { event });

  if (!(await hasDeviceAccess(table, sub, deviceId, 'viewer'))) {
    return errorJson(403, 'AUTH_FORBIDDEN_DEVICE', 'You do not have access to this device.', { event });
  }

  const limitParam = event.queryStringParameters?.limit;
  let limit = 50;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 60) {
      limit = parsed;
    }
  }

  const logs = await queryDeviceLogs(logsTable, deviceId, limit);
  return json(200, { Count: logs.length, Logs: logs });
};
