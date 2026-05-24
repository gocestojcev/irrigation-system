import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { IoTDataPlaneClient, GetThingShadowCommand } from '@aws-sdk/client-iot-data-plane';
import { errorJson, getCallerSub, json } from '../common/http';
import { hasDeviceAccess } from '../common/access';
import { validateScheduleBody } from '../common/validation';

const iot = new IoTDataPlaneClient({});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const deviceId = event.pathParameters?.deviceId;
  const lineId = event.pathParameters?.lineId;

  if (!deviceId || !lineId) return errorJson(400, 'VALIDATION_MISSING_FIELD', 'Missing path parameters.', { event });
  if (!['1', '2'].includes(lineId)) return errorJson(400, 'VALIDATION_INVALID_LINE_ID', 'lineId must be 1 or 2.', { event });

  const sub = getCallerSub(event);
  if (!sub) return errorJson(401, 'AUTH_INVALID_TOKEN', 'Missing verified user context from authorizer.', { event });

  const table = process.env.ACCESS_TABLE_NAME;
  if (!table) return errorJson(500, 'INTERNAL_ERROR', 'Missing ACCESS_TABLE_NAME configuration.', { event });

  if (!(await hasDeviceAccess(table, sub, deviceId, 'viewer'))) {
    return errorJson(403, 'AUTH_FORBIDDEN_DEVICE', 'You do not have access to this device.', { event });
  }

  try {
    const result = await iot.send(new GetThingShadowCommand({ thingName: deviceId }));
    const payload = result.payload ? JSON.parse(Buffer.from(result.payload).toString('utf8')) : {};
    const schedule = payload?.state?.reported?.schedule?.[lineId];

    if (!schedule) {
      return errorJson(404, 'DEVICE_NOT_FOUND', 'Schedule not found for line.', { event });
    }

    const validated = validateScheduleBody(schedule);
    if (!validated.ok) {
      return errorJson(502, 'UPSTREAM_INVALID_STATE', `Invalid schedule payload: ${validated.message}`, { event });
    }

    return json(200, validated.value);
  } catch {
    return errorJson(404, 'DEVICE_NOT_FOUND', 'Unable to read schedule for device.', { event });
  }
};
