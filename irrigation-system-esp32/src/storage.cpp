// storage.cpp
// Handles all persistence to ESP32 NVS (Non-Volatile Storage) via Preferences.
// Saves and loads line schedules (enabled, startSec, durationSec, intervalSec, endSec, daysMask)
// and manages the 60-entry activity log ring buffer (saveLogs, loadLogs, appendLog).

#include "storage.h"
#include <cstring>
#include "config.h"
#include "globals.h"

static void scheduleKey(int line, const char *suffix, char *out, size_t outLen) {
  snprintf(out, outLen, "%s%d", suffix, line);
}

static void normalizeSchedule(int line) {
  if (schedules[line].startSec < 0 || schedules[line].startSec > 86399) {
    schedules[line].startSec = DEFAULT_SCHEDULE_START_SEC;
  }
  if (schedules[line].durationSec < 0 || schedules[line].durationSec > 86400) {
    schedules[line].durationSec = DEFAULT_SCHEDULE_DURATION_SEC;
  }
  if (schedules[line].intervalSec < 0 || schedules[line].intervalSec > 86400) {
    schedules[line].intervalSec = DEFAULT_SCHEDULE_INTERVAL_SEC;
  }
  if (schedules[line].intervalSec > 0 && schedules[line].intervalSec < schedules[line].durationSec) {
    schedules[line].intervalSec = schedules[line].durationSec;
  }
  if (schedules[line].endSec <= schedules[line].startSec) {
    schedules[line].endSec = DEFAULT_SCHEDULE_END_SEC;
  }
  if (schedules[line].endSec < 0 || schedules[line].endSec > 86400) {
    schedules[line].endSec = DEFAULT_SCHEDULE_END_SEC;
  }
  if (schedules[line].enabled && schedules[line].durationSec == 0) {
    schedules[line].enabled = false;
  }
  if (schedules[line].daysMask > 127) {
    schedules[line].daysMask = DEFAULT_SCHEDULE_DAYS_MASK;
  }
}

void saveLogs() {
  prefs.putUInt("lc", (uint32_t)logCount);
  prefs.putUInt("lh", (uint32_t)logHead);
  prefs.putBytes("logs", activityLogs, sizeof(activityLogs));
}

void loadLogs() {
  logCount = (int)prefs.getUInt("lc", 0);
  logHead = (int)prefs.getUInt("lh", 0);

  if (logCount < 0 || logCount > MAX_LOG_ENTRIES) logCount = 0;
  if (logHead < 0 || logHead >= MAX_LOG_ENTRIES) logHead = 0;

  size_t len = prefs.getBytesLength("logs");
  if (len == sizeof(activityLogs)) {
    prefs.getBytes("logs", activityLogs, sizeof(activityLogs));
  } else {
    memset(activityLogs, 0, sizeof(activityLogs));
    logCount = 0;
    logHead = 0;
  }
}

void appendLog(int line, bool started, uint8_t source, uint32_t durationSec, uint32_t epoch) {
  if (line < 1 || line > LINE_COUNT) return;

  ActivityLogEntry entry;
  entry.epoch = epoch;
  entry.line = (uint8_t)line;
  entry.event = started ? 1 : 0;
  entry.source = source;
  entry.durationSec = durationSec;

  if (logCount < MAX_LOG_ENTRIES) {
    int idx = (logHead + logCount) % MAX_LOG_ENTRIES;
    activityLogs[idx] = entry;
    logCount++;
  } else {
    activityLogs[logHead] = entry;
    logHead = (logHead + 1) % MAX_LOG_ENTRIES;
  }

  saveLogs();
}

void saveSchedule(int line) {
  if (line < 1 || line > LINE_COUNT) return;
  LineSchedule &s = schedules[line];

  char key[8];
  scheduleKey(line, "e", key, sizeof(key));
  prefs.putBool(key, s.enabled);
  scheduleKey(line, "s", key, sizeof(key));
  prefs.putUInt(key, (uint32_t)s.startSec);
  scheduleKey(line, "d", key, sizeof(key));
  prefs.putUInt(key, (uint32_t)s.durationSec);
  scheduleKey(line, "i", key, sizeof(key));
  prefs.putUInt(key, (uint32_t)s.intervalSec);
  scheduleKey(line, "en", key, sizeof(key));
  prefs.putUInt(key, (uint32_t)s.endSec);
  scheduleKey(line, "dm", key, sizeof(key));
  prefs.putUChar(key, s.daysMask);
}

void loadSchedules() {
  for (int line = 1; line <= LINE_COUNT; line++) {
    char key[8];

    scheduleKey(line, "e", key, sizeof(key));
    schedules[line].enabled = prefs.getBool(key, false);
    scheduleKey(line, "s", key, sizeof(key));
    schedules[line].startSec = (int)prefs.getUInt(key, DEFAULT_SCHEDULE_START_SEC);
    scheduleKey(line, "d", key, sizeof(key));
    schedules[line].durationSec = (int)prefs.getUInt(key, DEFAULT_SCHEDULE_DURATION_SEC);
    scheduleKey(line, "i", key, sizeof(key));
    schedules[line].intervalSec = (int)prefs.getUInt(key, DEFAULT_SCHEDULE_INTERVAL_SEC);
    scheduleKey(line, "en", key, sizeof(key));
    schedules[line].endSec = (int)prefs.getUInt(key, DEFAULT_SCHEDULE_END_SEC);
    scheduleKey(line, "dm", key, sizeof(key));
    schedules[line].daysMask = prefs.getUChar(key, DEFAULT_SCHEDULE_DAYS_MASK);

    normalizeSchedule(line);
  }
}
