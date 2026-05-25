export const isValidTimeValue = (value) =>
  /^(([01]\d|2[0-3]):[0-5]\d:[0-5]\d|24:00:00)$/.test(value);

export const parseHhMmSsToSeconds = (value) => {
  if (!isValidTimeValue(value)) {
    return null;
  }

  if (value === '24:00:00') {
    return 86400;
  }

  const [hours, minutes, seconds] = value.split(':').map((part) => Number.parseInt(part, 10));
  return (hours * 3600) + (minutes * 60) + seconds;
};

export const secondsToHhMmSs = (totalSeconds, { preserveMidnightBoundary = false } = {}) => {
  if (preserveMidnightBoundary && totalSeconds > 0 && totalSeconds % 86400 === 0) {
    return '24:00:00';
  }

  const normalized = ((totalSeconds % 86400) + 86400) % 86400;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;
  return [hours, minutes, seconds].map((x) => String(x).padStart(2, '0')).join(':');
};

export const localTimeToUtcTime = (localTime, referenceDate = new Date()) => {
  const seconds = parseHhMmSsToSeconds(localTime);
  if (seconds === null) return localTime;

  const offsetMinutes = referenceDate.getTimezoneOffset();
  return secondsToHhMmSs(seconds + (offsetMinutes * 60), { preserveMidnightBoundary: true });
};

export const utcTimeToLocalTime = (utcTime, referenceDate = new Date()) => {
  const seconds = parseHhMmSsToSeconds(utcTime);
  if (seconds === null) return utcTime;

  const offsetMinutes = referenceDate.getTimezoneOffset();
  return secondsToHhMmSs(seconds - (offsetMinutes * 60), { preserveMidnightBoundary: true });
};

export const scheduleFromApiToLocal = (item, referenceDate = new Date()) => ({
  ...item,
  Start: utcTimeToLocalTime(item?.Start || '00:00:00', referenceDate),
  End: utcTimeToLocalTime(item?.End || '24:00:00', referenceDate),
});

export const timeStringToHoursMinutes = (timeStr) => {
  const parts = timeStr.split(':');
  return {
    hours: Number.parseInt(parts[0] || '0', 10),
    minutes: Number.parseInt(parts[1] || '0', 10),
  };
};

export const hoursMinutesToTimeString = (hours, minutes) => {
  const h = String(hours).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  return `${h}:${m}:00`;
};

export const formatTimeDisplay = (value) => {
  if (typeof value !== 'string') return '--:--';
  if (value === '24:00:00') return '24:00';

  const parts = value.split(':');
  if (parts.length < 2) return value;
  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
};

export const scheduleToDraft = (item) => {
  const startTime = timeStringToHoursMinutes(item?.Start || '08:00:00');
  const isEndOfDay = (item?.End || '24:00:00') === '24:00:00';
  const endTime = timeStringToHoursMinutes(isEndOfDay ? '00:00:00' : (item?.End || '24:00:00'));

  return {
    enabled: !!item?.Enabled,
    start: item?.Start || '08:00:00',
    startHours: String(startTime.hours),
    startMinutes: String(startTime.minutes),
    end: item?.End || '24:00:00',
    endHours: String(endTime.hours),
    endMinutes: String(endTime.minutes),
    endIsEndOfDay: isEndOfDay,
    durationMinutes: String(Math.max(1, Math.round((item?.Duration || 60) / 60))),
    intervalHours: String(
      Number.isFinite(item?.IntervalSec)
        ? (Math.round(item.IntervalSec) === 0 ? 0 : Math.max(1, Math.round(item.IntervalSec / 3600)))
        : 0
    ),
    daysMask: Number.isFinite(item?.DaysMask) ? item.DaysMask : 127,
  };
};

export const scheduleFromDraft = (item, draft) => {
  if (!draft) return item;

  const startHours = Number.parseInt(draft.startHours || '0', 10);
  const startMinutes = Number.parseInt(draft.startMinutes || '0', 10);
  const endHours = Number.parseInt(draft.endHours || '0', 10);
  const endMinutes = Number.parseInt(draft.endMinutes || '0', 10);
  const durationMinutes = Number.parseInt(draft.durationMinutes || '1', 10);
  const intervalHours = Number.parseInt(draft.intervalHours || '0', 10);

  return {
    ...item,
    Enabled: !!draft.enabled,
    Start: hoursMinutesToTimeString(startHours, startMinutes),
    End: draft.endIsEndOfDay ? '24:00:00' : hoursMinutesToTimeString(endHours, endMinutes),
    Duration: durationMinutes * 60,
    IntervalSec: intervalHours * 3600,
    DaysMask: draft.daysMask,
  };
};

export const getScheduleForDisplay = (item, { scheduleDirty = {}, scheduleDrafts = {} } = {}) => {
  if (scheduleDirty[item.line] && scheduleDrafts[item.line]) {
    return scheduleFromDraft(item, scheduleDrafts[item.line]);
  }
  return item;
};

export const buildScheduleWindow = (schedule) => {
  const startSeconds = parseHhMmSsToSeconds(schedule?.Start);
  const endSeconds = parseHhMmSsToSeconds(schedule?.End);

  if (startSeconds === null || endSeconds === null) {
    return null;
  }

  const windowEndSeconds = endSeconds <= startSeconds ? endSeconds + 86400 : endSeconds;
  return {
    startSeconds,
    endSeconds,
    windowEndSeconds,
    crossesMidnight: windowEndSeconds > 86400,
    isFullDay: startSeconds === 0 && endSeconds === 86400,
  };
};

export const formatScheduleWindow = (schedule) => {
  const window = buildScheduleWindow(schedule);
  if (!window) return '--:-- → --:--';

  if (window.isFullDay) {
    return '00:00 → 24:00';
  }

  return `${formatTimeDisplay(schedule?.Start)} → ${formatTimeDisplay(schedule?.End)}${window.crossesMidnight ? ' (overnight)' : ''}`;
};

export const daysMaskBitForDayIndex = (dayIndex) => Math.pow(2, dayIndex);

export const findNextScheduledRunDate = (schedule, referenceDate = new Date()) => {
  if (!schedule?.Enabled || !schedule?.Start || !schedule?.DaysMask) {
    return null;
  }

  const window = buildScheduleWindow(schedule);
  if (!window) {
    return null;
  }

  const intervalSeconds = Number.isFinite(schedule?.IntervalSec) ? Math.max(0, Math.round(schedule.IntervalSec)) : 0;

  for (let offset = -1; offset <= 7; offset += 1) {
    const dayStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + offset, 0, 0, 0, 0);
    const dayBit = daysMaskBitForDayIndex(dayStart.getDay());
    if ((schedule.DaysMask & dayBit) === 0) {
      continue;
    }

    const startAt = new Date(dayStart.getTime() + (window.startSeconds * 1000));
    const endAt = new Date(dayStart.getTime() + (window.windowEndSeconds * 1000));

    if (intervalSeconds === 0) {
      if (startAt > referenceDate) {
        return startAt;
      }
      continue;
    }

    for (let runMs = startAt.getTime(); runMs < endAt.getTime(); runMs += intervalSeconds * 1000) {
      if (runMs > referenceDate.getTime()) {
        return new Date(runMs);
      }
    }
  }

  return null;
};

export const getNextScheduledRun = (schedule, referenceDate = new Date()) => {
  const nextRun = findNextScheduledRunDate(schedule, referenceDate);
  if (!nextRun) return 'No upcoming runs';

  const now = referenceDate;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const nextDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  const timeText = `${String(nextRun.getHours()).padStart(2, '0')}:${String(nextRun.getMinutes()).padStart(2, '0')}`;

  if (nextRun >= todayStart && nextRun < tomorrowStart) {
    return `Today at ${timeText}`;
  }

  if (nextRun >= tomorrowStart && nextRun < nextDayStart) {
    return `Tomorrow at ${timeText}`;
  }

  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][nextRun.getDay()];
  return `${dayName} at ${timeText}`;
};
