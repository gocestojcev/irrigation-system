import crypto from 'crypto';

export type CommandType = 'line.set' | 'schedule.set' | 'logs.clear';

export const newCommandId = (): string => crypto.randomUUID();

export const acceptedResponse = (commandId: string, acceptedAt = new Date().toISOString()) => ({
  commandId,
  status: 'pending',
  acceptedAt,
});
