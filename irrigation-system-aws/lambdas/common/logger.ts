type LogLevel = 'INFO' | 'WARN' | 'ERROR';

type LogFields = Record<string, unknown>;

const write = (level: LogLevel, event: string, fields: LogFields = {}): void => {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  // Structured JSON logs for CloudWatch Insights queries.
  console.log(JSON.stringify(payload));
};

export const logInfo = (event: string, fields?: LogFields): void => write('INFO', event, fields);
export const logWarn = (event: string, fields?: LogFields): void => write('WARN', event, fields);
export const logError = (event: string, fields?: LogFields): void => write('ERROR', event, fields);

export const startTimer = (): number => Date.now();
export const elapsedMs = (startMs: number): number => Date.now() - startMs;
