#include "device_api.h"

#include "config.h"
#include "globals.h"
#include "logging_utils.h"
#include "relay_control.h"
#include "scheduler.h"
#include "storage.h"

namespace {

bool parseQuotedField(const String &body, const String &key, String &out) {
  int idx = body.indexOf("\"" + key + "\"");
  if (idx < 0) return false;
  idx = body.indexOf(':', idx);
  if (idx < 0) return false;
  idx = body.indexOf('"', idx + 1);
  if (idx < 0) return false;
  int end = body.indexOf('"', idx + 1);
  if (end < 0) return false;
  out = body.substring(idx + 1, end);
  return true;
}

bool parseIntField(const String &body, const String &key, int &out) {
  int idx = body.indexOf("\"" + key + "\"");
  if (idx < 0) return false;
  idx = body.indexOf(':', idx);
  if (idx < 0) return false;

  idx++;
  while (idx < (int)body.length() && (body[idx] == ' ' || body[idx] == '\t')) idx++;

  String num = "";
  if (idx < (int)body.length() && (body[idx] == '-' || (body[idx] >= '0' && body[idx] <= '9'))) {
    num += body[idx++];
  } else {
    return false;
  }

  while (idx < (int)body.length() && body[idx] >= '0' && body[idx] <= '9') {
    num += body[idx++];
  }

  out = num.toInt();
  return true;
}

int parseOptionalBoolField(const String &body, const String &key) {
  int idx = body.indexOf("\"" + key + "\"");
  if (idx < 0) return 2;
  idx = body.indexOf(':', idx);
  if (idx < 0) return -1;
  String value = body.substring(idx + 1);
  value.trim();
  if (value.startsWith("true")) return 1;
  if (value.startsWith("false")) return 0;
  return -1;
}

int parseOptionalIntField(const String &body, const String &key, int &out) {
  return parseIntField(body, key, out) ? 1 : 2;
}

}  // namespace

String sourceToJson(const LineRuntimeState &line) {
  if (line.manualOn) return "manual";
  if (line.scheduledOn) return "scheduled";
  return "off";
}

String buildScheduleJson(int line) {
  if (!isValidLine(line)) return "{}";
  const LineSchedule &schedule = schedules[line];
  String enabled = schedule.enabled ? "true" : "false";
  return "{\"Enabled\": " + enabled
       + ", \"Start\": \"" + secToHms(schedule.startSec)
       + "\", \"Duration\": " + String(schedule.durationSec)
       + ", \"IntervalSec\": " + String(schedule.intervalSec)
       + ", \"End\": \"" + secToHms(schedule.endSec)
       + "\", \"DaysMask\": " + String((int)schedule.daysMask)
       + ", \"Days\": " + daysMaskToJsonArray(schedule.daysMask)
       + "}";
}

String buildAllSchedulesJson() {
  String payload = "{";
  for (int line = 1; line <= LINE_COUNT; line++) {
    if (line > 1) payload += ",";
    payload += "\"" + String(line) + "\":" + buildScheduleJson(line);
  }
  payload += "}";
  return payload;
}

String buildStatusJson() {
  uint32_t epoch = timeClient.getEpochTime();
  RuntimeLineStates runtime = computeRuntimeLineStates(epoch);

  String payload = "{\"Epoch\":" + String(epoch)
                 + ",\"Time\":\"" + formatTimeFromEpoch(epoch)
                 + "\",\"LineCount\":" + String(LINE_COUNT);

  for (int line = 1; line <= LINE_COUNT; line++) {
    String value = runtime.line[line].on ? "on" : "off";
    String source = sourceToJson(runtime.line[line]);
    payload += ",\"Line" + String(line) + "\":{\"Value\":\"" + value + "\",\"Source\":\"" + source + "\"}";
  }
  payload += "}";
  return payload;
}

bool applyLineSet(int line, bool on, String &errorOut) {
  if (!isValidLine(line)) {
    errorOut = "invalid line";
    return false;
  }
  applyManualLineCommand(line, on);
  errorOut = "";
  return true;
}

bool applyScheduleSetFromJson(int line, const String &body, String &errorOut) {
  if (!isValidLine(line)) {
    errorOut = "invalid line";
    return false;
  }

  int enabledField = parseOptionalBoolField(body, "Enabled");
  if (enabledField == -1) {
    errorOut = "invalid Enabled, expected true or false";
    return false;
  }

  String startStr;
  String endStr;
  int duration = 0;
  int intervalSec = 0;
  int daysMask = -1;
  bool hasStart = parseQuotedField(body, "Start", startStr);
  bool hasEnd = parseQuotedField(body, "End", endStr);
  bool hasDuration = parseIntField(body, "Duration", duration);
  int hasIntervalSec = parseOptionalIntField(body, "IntervalSec", intervalSec);
  int hasDaysMask = parseOptionalIntField(body, "DaysMask", daysMask);

  if (enabledField == 0 && !hasStart && !hasDuration && hasIntervalSec == 2) {
    LineSchedule updated = schedules[line];
    updated.enabled = false;
    if (hasDaysMask == 1) {
      if (daysMask < 0 || daysMask > 127) {
        errorOut = "invalid DaysMask, expected 0..127";
        return false;
      }
      updated.daysMask = (uint8_t)daysMask;
    }
    schedules[line] = updated;
    saveSchedule(line);
    errorOut = "";
    return true;
  }

  if (!hasStart || !hasDuration) {
    errorOut = "missing Start or Duration";
    return false;
  }

  int startSec = parseHmsToSec(startStr);
  if (startSec < 0) {
    errorOut = "invalid Start, expected HH:MM:SS";
    return false;
  }

  int endSec = 86400;
  if (hasEnd) {
    endSec = parseHmsToSec(endStr);
    if (endSec < 0) {
      errorOut = "invalid End, expected HH:MM:SS";
      return false;
    }
    if (endSec <= startSec) {
      errorOut = "invalid End, must be after Start";
      return false;
    }
  }

  if (duration < 1 || duration > 86400) {
    errorOut = "invalid Duration, expected 1..86400";
    return false;
  }

  if (hasIntervalSec == 1) {
    if (intervalSec < 0 || intervalSec > 86400) {
      errorOut = "invalid IntervalSec, expected 0..86400";
      return false;
    }
    if (intervalSec > 0 && intervalSec < duration) {
      errorOut = "invalid IntervalSec, expected 0 or >= Duration";
      return false;
    }
  }

  if (hasDaysMask == 1 && (daysMask < 0 || daysMask > 127)) {
    errorOut = "invalid DaysMask, expected 0..127";
    return false;
  }

  LineSchedule candidate = schedules[line];
  candidate.startSec = startSec;
  candidate.durationSec = duration;
  candidate.endSec = endSec;
  candidate.enabled = (enabledField == 2) ? true : (enabledField == 1);
  if (hasIntervalSec == 1) {
    candidate.intervalSec = intervalSec;
  }
  if (hasDaysMask == 1) {
    candidate.daysMask = (uint8_t)daysMask;
  }
  if (candidate.daysMask > 127) {
    candidate.daysMask = 127;
  }

  if (!validateScheduleCandidate(line, candidate, errorOut)) {
    return false;
  }

  schedules[line] = candidate;
  saveSchedule(line);
  errorOut = "";
  return true;
}

bool clearActivityLogs(String &errorOut) {
  memset(activityLogs, 0, sizeof(activityLogs));
  logCount = 0;
  logHead = 0;
  saveLogs();
  errorOut = "";
  return true;
}
