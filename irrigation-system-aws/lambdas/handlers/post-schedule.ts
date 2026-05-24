import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { errorJson, getCallerSub, json } from '../common/http';
import { hasDeviceAccess } from '../common/access';
import { acceptedResponse, newCommandId } from '../common/commands';
import { updateDesiredShadow } from '../common/iot';
import { isValidLineId, parseJsonBody, validateScheduleSetBody } from '../common/validation';
import { markCommandFailed, putPendingCommand } from '../common/command-store';
import { elapsedMs, logError, logInfo, logWarn, startTimer } from '../common/logger';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const startedAt = startTimer();
  const requestId = event.requestContext.requestId;
  const deviceId = event.pathParameters?.deviceId;
  const lineId = event.pathParameters?.lineId;
  logInfo('api.post_schedule.request', { requestId, deviceId, lineId });

  if (!deviceId || !lineId) return errorJson(400, 'VALIDATION_MISSING_FIELD', 'Missing path parameters.', { event });
  if (!isValidLineId(lineId)) return errorJson(400, 'VALIDATION_INVALID_LINE_ID', 'lineId must be 1, 2, or 3.', { event });

  const sub = getCallerSub(event);
  if (!sub) return errorJson(401, 'AUTH_INVALID_TOKEN', 'Missing verified user context from authorizer.', { event });

  const table = process.env.ACCESS_TABLE_NAME;
  if (!table) return errorJson(500, 'INTERNAL_ERROR', 'Missing ACCESS_TABLE_NAME configuration.', { event });

  const commandsTable = process.env.COMMANDS_TABLE_NAME;
  if (!commandsTable) return errorJson(500, 'INTERNAL_ERROR', 'Missing COMMANDS_TABLE_NAME configuration.', { event });

  if (!(await hasDeviceAccess(table, sub, deviceId, 'operator'))) {
    logWarn('api.post_schedule.forbidden', { requestId, deviceId, userSub: sub, lineId });
    return errorJson(403, 'AUTH_FORBIDDEN_DEVICE', 'You do not have access to this device.', { event });
  }

  const parsed = parseJsonBody<unknown>(event.body);
  if (!parsed.ok) {
    return errorJson(400, 'VALIDATION_INVALID_JSON', 'Body is not valid JSON.', { event });
  }

  const validated = validateScheduleSetBody(parsed.value);
  if (!validated.ok) {
    return errorJson(400, 'VALIDATION_INVALID_SCHEDULE', validated.message, { event });
  }

  const body = validated.value;

  const commandId = newCommandId();
  const acceptedAt = new Date().toISOString();

  logInfo('api.post_schedule.command_pending', {
    requestId,
    commandId,
    deviceId,
    userSub: sub,
    lineId,
  });

  await putPendingCommand(commandsTable, {
    commandId,
    deviceId,
    type: 'schedule.set',
    requestedBy: sub,
    acceptedAt,
  });

  try {
    await updateDesiredShadow(deviceId, {
      command: {
        schemaVersion: '1.0',
        commandId,
        deviceId,
        type: 'schedule.set',
        issuedAt: acceptedAt,
        requestedBy: sub,
        payload: { lineId: Number(lineId), ...body },
      },
    });
  } catch {
    logError('api.post_schedule.iot_publish_failed', {
      requestId,
      commandId,
      deviceId,
      lineId,
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

  logInfo('api.post_schedule.accepted', {
    requestId,
    commandId,
    deviceId,
    lineId,
    elapsedMs: elapsedMs(startedAt),
  });

  return json(202, acceptedResponse(commandId, acceptedAt));
};
