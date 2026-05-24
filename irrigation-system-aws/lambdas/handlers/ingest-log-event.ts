import { errorJson, json } from '../common/http';
import { validateLogEventIngestBody } from '../common/validation';
import { putLogEvent } from '../common/log-store';
import { elapsedMs, logError, logInfo, startTimer } from '../common/logger';

export const handler = async (event: unknown): Promise<{ statusCode: number; body: string }> => {
  const startedAt = startTimer();
  logInfo('iot.log_event_ingest.request');

  const logsTable = process.env.LOGS_TABLE_NAME;
  if (!logsTable) {
    return errorJson(500, 'INTERNAL_ERROR', 'Missing LOGS_TABLE_NAME configuration.');
  }

  const validated = validateLogEventIngestBody(event);
  if (!validated.ok) {
    return errorJson(400, 'VALIDATION_INVALID_FIELD', validated.message);
  }

  const payload = validated.value;
  logInfo('iot.log_event_ingest.validated', {
    deviceId: payload.deviceId,
    line: payload.Line,
    event: payload.Event,
  });

  try {
    await putLogEvent(logsTable, payload);
  } catch (error) {
    logError('iot.log_event_ingest.failed', {
      deviceId: payload.deviceId,
      elapsedMs: elapsedMs(startedAt),
      error: error instanceof Error ? error.message : 'unknown',
    });
    return errorJson(500, 'INTERNAL_ERROR', 'Unable to store log event.');
  }

  logInfo('iot.log_event_ingest.stored', {
    deviceId: payload.deviceId,
    elapsedMs: elapsedMs(startedAt),
  });

  return json(200, { ok: true });
};
