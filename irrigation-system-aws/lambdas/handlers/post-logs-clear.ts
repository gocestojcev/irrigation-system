import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { errorJson, getCallerSub, json } from '../common/http';
import { hasDeviceAccess } from '../common/access';
import { acceptedResponse, newCommandId } from '../common/commands';
import { updateDesiredShadow } from '../common/iot';
import { markCommandFailed, putPendingCommand } from '../common/command-store';
import { elapsedMs, logError, logInfo, logWarn, startTimer } from '../common/logger';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const startedAt = startTimer();
  const requestId = event.requestContext.requestId;
  const deviceId = event.pathParameters?.deviceId;
  logInfo('api.post_logs_clear.request', { requestId, deviceId });

  if (!deviceId) return errorJson(400, 'VALIDATION_MISSING_FIELD', 'Missing deviceId path parameter.', { event });

  const sub = getCallerSub(event);
  if (!sub) return errorJson(401, 'AUTH_INVALID_TOKEN', 'Missing verified user context from authorizer.', { event });

  const table = process.env.ACCESS_TABLE_NAME;
  if (!table) return errorJson(500, 'INTERNAL_ERROR', 'Missing ACCESS_TABLE_NAME configuration.', { event });

  const commandsTable = process.env.COMMANDS_TABLE_NAME;
  if (!commandsTable) return errorJson(500, 'INTERNAL_ERROR', 'Missing COMMANDS_TABLE_NAME configuration.', { event });

  if (!(await hasDeviceAccess(table, sub, deviceId, 'operator'))) {
    logWarn('api.post_logs_clear.forbidden', { requestId, deviceId, userSub: sub });
    return errorJson(403, 'AUTH_FORBIDDEN_DEVICE', 'You do not have access to this device.', { event });
  }

  const commandId = newCommandId();
  const acceptedAt = new Date().toISOString();

  logInfo('api.post_logs_clear.command_pending', {
    requestId,
    commandId,
    deviceId,
    userSub: sub,
  });

  await putPendingCommand(commandsTable, {
    commandId,
    deviceId,
    type: 'logs.clear',
    requestedBy: sub,
    acceptedAt,
  });

  try {
    await updateDesiredShadow(deviceId, {
      command: {
        schemaVersion: '1.0',
        commandId,
        deviceId,
        type: 'logs.clear',
        issuedAt: acceptedAt,
        requestedBy: sub,
        payload: {},
      },
    });
  } catch {
    logError('api.post_logs_clear.iot_publish_failed', {
      requestId,
      commandId,
      deviceId,
      elapsedMs: elapsedMs(startedAt),
    });
    await markCommandFailed(commandsTable, {
      commandId,
      deviceId,
      errorCode: 'UPSTREAM_IOT_UNAVAILABLE',
      errorMessage: 'Unable to publish command to IoT shadow.',
    });

    return errorJson(503, 'UPSTREAM_IOT_UNAVAILABLE', 'Unable to publish command to IoT shadow.', { event });
  }

  logInfo('api.post_logs_clear.accepted', {
    requestId,
    commandId,
    deviceId,
    elapsedMs: elapsedMs(startedAt),
  });

  return json(202, acceptedResponse(commandId, acceptedAt));
};
