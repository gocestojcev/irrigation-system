import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { IoTDataPlaneClient, GetThingShadowCommand } from '@aws-sdk/client-iot-data-plane';
import { errorJson, getCallerSub, json } from '../common/http';
import { hasDeviceAccess } from '../common/access';
import { validateStatusBody } from '../common/validation';

const iot = new IoTDataPlaneClient({});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const deviceId = event.pathParameters?.deviceId;
  if (!deviceId) return errorJson(400, 'VALIDATION_MISSING_FIELD', 'Missing deviceId path parameter.', { event });

  const sub = getCallerSub(event);
  if (!sub) return errorJson(401, 'AUTH_INVALID_TOKEN', 'Missing verified user context from authorizer.', { event });

  const accessTableName = process.env.ACCESS_TABLE_NAME;
  if (!accessTableName) return errorJson(500, 'INTERNAL_ERROR', 'Missing ACCESS_TABLE_NAME configuration.', { event });

  const allowed = await hasDeviceAccess(accessTableName, sub, deviceId, 'viewer');
  if (!allowed) return errorJson(403, 'AUTH_FORBIDDEN_DEVICE', 'You do not have access to this device.', { event });

  try {
    const result = await iot.send(new GetThingShadowCommand({ thingName: deviceId }));
    const payload = result.payload ? JSON.parse(Buffer.from(result.payload).toString('utf8')) : {};
    const status = payload?.state?.reported?.status;
    const validated = validateStatusBody(status);
    if (!validated.ok) {
      return errorJson(502, 'UPSTREAM_INVALID_STATE', `Invalid reported status payload: ${validated.message}`, { event });
    }

    return json(200, validated.value);
  } catch {
    return errorJson(404, 'DEVICE_NOT_FOUND', 'Unable to read reported status for device.', { event });
  }
};
