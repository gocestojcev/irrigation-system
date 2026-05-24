import { errorJson, json } from '../common/http';
import { updateCommandFromDevice } from '../common/command-store';
import { validateCommandResultIngestBody } from '../common/validation';
import { elapsedMs, logError, logInfo, startTimer } from '../common/logger';

export const handler = async (event: unknown): Promise<{ statusCode: number; body: string }> => {
  const startedAt = startTimer();
  logInfo('iot.command_result_ingest.request');

  const commandsTable = process.env.COMMANDS_TABLE_NAME;
  if (!commandsTable) {
    return errorJson(500, 'INTERNAL_ERROR', 'Missing COMMANDS_TABLE_NAME configuration.');
  }

  const validated = validateCommandResultIngestBody(event);
  if (!validated.ok) {
    return errorJson(400, 'VALIDATION_INVALID_FIELD', validated.message);
  }

  const payload = validated.value;
  logInfo('iot.command_result_ingest.validated', {
    commandId: payload.commandId,
    deviceId: payload.deviceId,
    status: payload.status,
  });

  try {
    await updateCommandFromDevice(commandsTable, {
      deviceId: payload.deviceId,
      commandId: payload.commandId,
      status: payload.status,
      updatedAt: payload.updatedAt,
      appliedAt: payload.appliedAt,
      errorCode: payload.errorCode,
      errorMessage: payload.errorMessage,
    });
  } catch {
    logError('iot.command_result_ingest.command_not_found', {
      commandId: payload.commandId,
      deviceId: payload.deviceId,
      elapsedMs: elapsedMs(startedAt),
    });
    return errorJson(404, 'COMMAND_NOT_FOUND', 'Command record not found for acknowledgement.');
  }

  logInfo('iot.command_result_ingest.updated', {
    commandId: payload.commandId,
    deviceId: payload.deviceId,
    status: payload.status,
    elapsedMs: elapsedMs(startedAt),
  });

  return json(200, { ok: true });
};
