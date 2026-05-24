import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { errorJson, getCallerSub, json } from '../common/http';
import { hasDeviceAccess } from '../common/access';
import { getCommandRecord } from '../common/command-store';
import { elapsedMs, logInfo, logWarn, startTimer } from '../common/logger';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const startedAt = startTimer();
  const requestId = event.requestContext.requestId;
  const deviceId = event.pathParameters?.deviceId;
  const commandId = event.pathParameters?.commandId;
  logInfo('api.get_command_status.request', { requestId, deviceId, commandId });

  if (!deviceId || !commandId) return errorJson(400, 'VALIDATION_MISSING_FIELD', 'Missing path parameters.', { event });

  const sub = getCallerSub(event);
  if (!sub) return errorJson(401, 'AUTH_INVALID_TOKEN', 'Missing verified user context from authorizer.', { event });

  const table = process.env.ACCESS_TABLE_NAME;
  if (!table) return errorJson(500, 'INTERNAL_ERROR', 'Missing ACCESS_TABLE_NAME configuration.', { event });

  const commandsTable = process.env.COMMANDS_TABLE_NAME;
  if (!commandsTable) return errorJson(500, 'INTERNAL_ERROR', 'Missing COMMANDS_TABLE_NAME configuration.', { event });

  if (!(await hasDeviceAccess(table, sub, deviceId, 'viewer'))) {
    logWarn('api.get_command_status.forbidden', { requestId, deviceId, commandId, userSub: sub });
    return errorJson(403, 'AUTH_FORBIDDEN_DEVICE', 'You do not have access to this device.', { event });
  }

  const command = await getCommandRecord(commandsTable, deviceId, commandId);

  if (!command) {
    return errorJson(404, 'COMMAND_NOT_FOUND', 'Command not found for device.', { event });
  }

  logInfo('api.get_command_status.success', {
    requestId,
    deviceId,
    commandId,
    status: command.status,
    elapsedMs: elapsedMs(startedAt),
  });

  return json(200, {
    commandId: command.commandId,
    status: command.status,
    updatedAt: command.updatedAt,
    appliedAt: command.appliedAt,
    errorCode: command.errorCode,
    errorMessage: command.errorMessage,
  });
};
