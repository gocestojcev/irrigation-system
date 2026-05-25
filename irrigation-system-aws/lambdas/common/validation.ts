import Ajv, { ErrorObject, JSONSchemaType } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

export type LineSetBody = {
  Value: 'on' | 'off';
};

export type ScheduleSetBody = {
  Enabled?: boolean;
  Start?: string;
  End?: string;
  Duration?: number;
  IntervalSec?: number;
  DaysMask?: number;
};

export type CommandResultIngestBody = {
  deviceId: string;
  commandId: string;
  status: 'pending' | 'applied' | 'failed' | 'timeout';
  updatedAt?: string;
  appliedAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type LineStateBody = {
  Value: 'on' | 'off';
};

export type StatusLineBody = {
  Value: 'on' | 'off';
  Source: 'manual' | 'scheduled' | 'system' | 'off' | 'unknown';
};

export const VALID_LINE_IDS = ['1', '2', '3'] as const;
export type ValidLineId = (typeof VALID_LINE_IDS)[number];

export const isValidLineId = (lineId: string): lineId is ValidLineId =>
  (VALID_LINE_IDS as readonly string[]).includes(lineId);

export type StatusBody = {
  Epoch: number;
  Time: string;
  Line1: StatusLineBody;
  Line2: StatusLineBody;
  Line3: StatusLineBody;
  LineCount?: number;
};

export type ScheduleBody = {
  Enabled: boolean;
  Start: string;
  End: string;
  Duration: number;
  IntervalSec: number;
  DaysMask: number;
  Days?: Array<'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'>;
};

export type LogEventIngestBody = {
  deviceId: string;
  Epoch: number;
  Time: string;
  Line: 1 | 2 | 3;
  Event: 'Started' | 'Stopped';
  Source: 'manual' | 'scheduled' | 'system';
  DurationSec: number;
  DurationMin: number;
};

const hhmmssPattern = '^(([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d|24:00:00)$';

const lineSetSchema: JSONSchemaType<LineSetBody> = {
  type: 'object',
  additionalProperties: false,
  required: ['Value'],
  properties: {
    Value: { type: 'string', enum: ['on', 'off'] },
  },
};

const scheduleSetSchema: JSONSchemaType<ScheduleSetBody> = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    Enabled: { type: 'boolean', nullable: true },
    Start: { type: 'string', pattern: hhmmssPattern, nullable: true },
    End: { type: 'string', pattern: hhmmssPattern, nullable: true },
    Duration: { type: 'integer', minimum: 1, maximum: 86400, nullable: true },
    IntervalSec: { type: 'integer', minimum: 0, maximum: 86400, nullable: true },
    DaysMask: { type: 'integer', minimum: 0, maximum: 127, nullable: true },
  },
  required: [],
};

const commandResultIngestSchema: JSONSchemaType<CommandResultIngestBody> = {
  type: 'object',
  additionalProperties: false,
  required: ['deviceId', 'commandId', 'status'],
  properties: {
    deviceId: { type: 'string', minLength: 1, maxLength: 128 },
    commandId: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    },
    status: { type: 'string', enum: ['pending', 'applied', 'failed', 'timeout'] },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
    appliedAt: { type: 'string', format: 'date-time', nullable: true },
    errorCode: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    errorMessage: { type: 'string', minLength: 1, maxLength: 512, nullable: true },
  },
};

const lineStateSchema: JSONSchemaType<LineStateBody> = {
  type: 'object',
  additionalProperties: false,
  required: ['Value'],
  properties: {
    Value: { type: 'string', enum: ['on', 'off'] },
  },
};

const statusLineSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['Value', 'Source'] as const,
  properties: {
    Value: { type: 'string' as const, enum: ['on', 'off'] as const },
    Source: { type: 'string' as const, enum: ['manual', 'scheduled', 'system', 'off', 'unknown'] as const },
  },
};

const statusSchema: JSONSchemaType<StatusBody> = {
  type: 'object',
  additionalProperties: false,
  required: ['Epoch', 'Time', 'Line1', 'Line2', 'Line3'],
  properties: {
    Epoch: { type: 'integer', minimum: 0 },
    Time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$' },
    Line1: statusLineSchema,
    Line2: statusLineSchema,
    Line3: statusLineSchema,
    LineCount: { type: 'integer', minimum: 1, maximum: 32, nullable: true },
  },
};

const scheduleSchema: JSONSchemaType<ScheduleBody> = {
  type: 'object',
  additionalProperties: false,
  required: ['Enabled', 'Start', 'End', 'Duration', 'IntervalSec', 'DaysMask'],
  properties: {
    Enabled: { type: 'boolean' },
    Start: { type: 'string', pattern: hhmmssPattern },
    End: { type: 'string', pattern: hhmmssPattern },
    Duration: { type: 'integer', minimum: 1, maximum: 86400 },
    IntervalSec: { type: 'integer', minimum: 0, maximum: 86400 },
    DaysMask: { type: 'integer', minimum: 0, maximum: 127 },
    Days: {
      type: 'array',
      items: { type: 'string', enum: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
      nullable: true,
    },
  },
};

const validateLineSet = ajv.compile(lineSetSchema);
const validateScheduleSet = ajv.compile(scheduleSetSchema);
const validateCommandResultIngest = ajv.compile(commandResultIngestSchema);
const validateLineState = ajv.compile(lineStateSchema);
const validateStatus = ajv.compile(statusSchema);
const validateSchedule = ajv.compile(scheduleSchema);

const logEventIngestSchema: JSONSchemaType<LogEventIngestBody> = {
  type: 'object',
  additionalProperties: false,
  required: ['deviceId', 'Epoch', 'Time', 'Line', 'Event', 'Source', 'DurationSec', 'DurationMin'],
  properties: {
    deviceId: { type: 'string', minLength: 1, maxLength: 128 },
    Epoch: { type: 'integer', minimum: 0 },
    Time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$' },
    Line: { type: 'integer', enum: [1, 2, 3] },
    Event: { type: 'string', enum: ['Started', 'Stopped'] },
    Source: { type: 'string', enum: ['manual', 'scheduled', 'system'] },
    DurationSec: { type: 'integer', minimum: 0, maximum: 86400 },
    DurationMin: { type: 'integer', minimum: 0, maximum: 1440 },
  },
};

const validateLogEventIngest = ajv.compile(logEventIngestSchema);

export const parseJsonBody = <T>(body?: string | null): { ok: true; value: T } | { ok: false; error: string } => {
  try {
    return { ok: true, value: JSON.parse(body ?? '{}') as T };
  } catch {
    return { ok: false, error: 'VALIDATION_INVALID_JSON' };
  }
};

const formatErrors = (errors?: ErrorObject[] | null): string => {
  if (!errors || errors.length === 0) return 'Invalid payload.';
  return errors
    .slice(0, 3)
    .map((e) => `${e.instancePath || '/'} ${e.message || 'is invalid'}`)
    .join('; ');
};

export const validateLineSetBody = (payload: unknown): { ok: true; value: LineSetBody } | { ok: false; message: string } => {
  if (validateLineSet(payload)) {
    return { ok: true, value: payload };
  }
  return { ok: false, message: formatErrors(validateLineSet.errors) };
};

export const validateScheduleSetBody = (payload: unknown): { ok: true; value: ScheduleSetBody } | { ok: false; message: string } => {
  if (!validateScheduleSet(payload)) {
    return { ok: false, message: formatErrors(validateScheduleSet.errors) };
  }

  const body = payload as ScheduleSetBody;

  if (body.Start && body.End) {
    const toSec = (s: string): number => {
      if (s === '24:00:00') return 86400;
      const [h, m, sec] = s.split(':').map((x) => Number.parseInt(x, 10));
      return (h * 3600) + (m * 60) + sec;
    };

    const start = toSec(body.Start);
    const end = toSec(body.End);
    if (end <= start) {
      return { ok: false, message: '/End must be greater than /Start' };
    }
  }

  if (typeof body.IntervalSec === 'number' && typeof body.Duration === 'number') {
    if (body.IntervalSec > 0 && body.IntervalSec < body.Duration) {
      return { ok: false, message: '/IntervalSec must be 0 or >= /Duration' };
    }
  }

  return { ok: true, value: body };
};

export const validateCommandResultIngestBody = (
  payload: unknown,
): { ok: true; value: CommandResultIngestBody } | { ok: false; message: string } => {
  if (!validateCommandResultIngest(payload)) {
    return { ok: false, message: formatErrors(validateCommandResultIngest.errors) };
  }

  const body = payload as CommandResultIngestBody;

  if (body.status === 'applied' && !body.appliedAt) {
    return { ok: false, message: '/appliedAt is required when status=applied' };
  }

  if (body.status === 'failed' && !body.errorCode) {
    return { ok: false, message: '/errorCode is required when status=failed' };
  }

  return { ok: true, value: body };
};

export const validateLineStateBody = (
  payload: unknown,
): { ok: true; value: LineStateBody } | { ok: false; message: string } => {
  if (!validateLineState(payload)) {
    return { ok: false, message: formatErrors(validateLineState.errors) };
  }

  return { ok: true, value: payload as LineStateBody };
};

export const validateStatusBody = (
  payload: unknown,
): { ok: true; value: StatusBody } | { ok: false; message: string } => {
  if (!validateStatus(payload)) {
    return { ok: false, message: formatErrors(validateStatus.errors) };
  }

  return { ok: true, value: payload as StatusBody };
};

export const validateScheduleBody = (
  payload: unknown,
): { ok: true; value: ScheduleBody } | { ok: false; message: string } => {
  if (!validateSchedule(payload)) {
    return { ok: false, message: formatErrors(validateSchedule.errors) };
  }

  return { ok: true, value: payload as ScheduleBody };
};

export const validateLogEventIngestBody = (
  payload: unknown,
): { ok: true; value: LogEventIngestBody } | { ok: false; message: string } => {
  if (!validateLogEventIngest(payload)) {
    return { ok: false, message: formatErrors(validateLogEventIngest.errors) };
  }

  return { ok: true, value: payload as LogEventIngestBody };
};
