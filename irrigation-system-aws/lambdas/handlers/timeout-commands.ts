import { errorJson, json } from '../common/http';
import { markStalePendingAsTimeout } from '../common/command-store';
import { elapsedMs, logInfo, startTimer } from '../common/logger';

export const handler = async (): Promise<{ statusCode: number; body: string }> => {
  const startedAt = startTimer();
  logInfo('commands.timeout_sweep.request');

  const commandsTable = process.env.COMMANDS_TABLE_NAME;
  if (!commandsTable) {
    return errorJson(500, 'INTERNAL_ERROR', 'Missing COMMANDS_TABLE_NAME configuration.');
  }

  const timeoutSecondsRaw = process.env.COMMAND_TIMEOUT_SECONDS ?? '120';
  const timeoutSeconds = Number.parseInt(timeoutSecondsRaw, 10);

  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30) {
    return errorJson(500, 'INTERNAL_ERROR', 'Invalid COMMAND_TIMEOUT_SECONDS configuration.');
  }

  const timedOut = await markStalePendingAsTimeout(commandsTable, timeoutSeconds);

  logInfo('commands.timeout_sweep.completed', {
    timedOut,
    timeoutSeconds,
    elapsedMs: elapsedMs(startedAt),
  });

  return json(200, {
    ok: true,
    timedOut,
    timeoutSeconds,
  });
};
