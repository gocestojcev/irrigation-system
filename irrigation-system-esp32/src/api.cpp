// api.cpp
// Registers and implements all HTTP REST API routes for the irrigation controller.
// Handlers cover line control (GET/POST /line/{n}), schedule management
// (GET/POST /schedule/{n}), and activity logs (GET/POST /logs).
// All handler functions are kept in an anonymous namespace; only
// registerRoutes() is exposed publicly via api.h.

#include "api.h"

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
  while (idx < body.length() && (body[idx] == ' ' || body[idx] == '\t')) idx++;

  String num = "";
  if (idx < body.length() && (body[idx] == '-' || (body[idx] >= '0' && body[idx] <= '9'))) {
    num += body[idx++];
  } else {
    return false;
  }

  while (idx < body.length() && body[idx] >= '0' && body[idx] <= '9') {
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

int parseValue(const String &body) {
  int idx = body.indexOf("\"Value\"");
  if (idx < 0) return -1;
  idx = body.indexOf(':', idx);
  if (idx < 0) return -1;
  String value = body.substring(idx + 1);
  value.trim();
  if (value.endsWith("}")) value = value.substring(0, value.length() - 1);
  value.trim();
  if (value == "\"on\"") return 1;
  if (value == "\"off\"") return 0;
  return -1;
}

String scheduleToJson(const LineSchedule &schedule) {
  String enabled = schedule.enabled ? "true" : "false";
  return "{\"Enabled\": " + enabled
+       + ", \"Start\": \"" + secToHms(schedule.startSec)
+       + "\", \"Duration\": " + String(schedule.durationSec)
+       + ", \"IntervalSec\": " + String(schedule.intervalSec)
+       + ", \"End\": \"" + secToHms(schedule.endSec)
+       + "\", \"DaysMask\": " + String((int)schedule.daysMask)
+       + ", \"Days\": " + daysMaskToJsonArray(schedule.daysMask)
+       + "}";
}

String sourceToJson(const LineRuntimeState &line) {
  if (line.manualOn) return "manual";
  if (line.scheduledOn) return "scheduled";
  return "off";
}

void handleLineGet(int line) {
  logRequest();
  if (!isValidLine(line)) {
    String message = "{\"error\": \"URI not found\", \"uri\": \"" + server.uri() + "\"}";
    sendJson(404, message);
    return;
  }

  String value = isLineCurrentlyOn(line) ? "\"on\"" : "\"off\"";
  sendJson(200, "{\"Value\": " + value + "}");
}

void handleStatusGet() {
  logRequest();

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

  sendJson(200, payload);
}

void handleLinePost(int line) {
  logRequest();
  if (!isValidLine(line)) {
    String message = "{\"error\": \"URI not found\", \"uri\": \"" + server.uri() + "\"}";
    sendJson(404, message);
    return;
  }

  if (!server.hasArg("plain")) {
    sendJson(400, "{\"error\": \"missing body\"}");
    return;
  }

  String body = server.arg("plain");
  int value = parseValue(body);
  if (value < 0) {
    sendJson(400, "{\"error\": \"invalid value, expected {\"Value\":\"on\"} or {\"Value\":\"off\"}\"}");
    return;
  }

  applyManualLineCommand(line, value == 1);
  sendJson(200, String("{\"Value\": ") + (value == 1 ? "\"on\"" : "\"off\"") + "}");
}

void handleScheduleGet(int line) {
  logRequest();
  if (!isValidLine(line)) {
    String message = "{\"error\": \"URI not found\", \"uri\": \"" + server.uri() + "\"}";
    sendJson(404, message);
    return;
  }

  sendJson(200, scheduleToJson(schedules[line]));
}

void handleSchedulePost(int line) {
  logRequest();
  if (!isValidLine(line)) {
    String message = "{\"error\": \"URI not found\", \"uri\": \"" + server.uri() + "\"}";
    sendJson(404, message);
    return;
  }

  if (!server.hasArg("plain")) {
    sendJson(400, "{\"error\": \"missing body\"}");
    return;
  }

  String body = server.arg("plain");
  int enabledField = parseOptionalBoolField(body, "Enabled");
  if (enabledField == -1) {
    sendJson(400, "{\"error\": \"invalid Enabled, expected true or false\"}");
    return;
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
        sendJson(400, "{\"error\": \"invalid DaysMask, expected 0..127\"}");
        return;
      }
      updated.daysMask = (uint8_t)daysMask;
    }
    schedules[line] = updated;
    saveSchedule(line);
    sendJson(200, scheduleToJson(schedules[line]));
    return;
  }

  if (!hasStart || !hasDuration) {
    sendJson(400, "{\"error\": \"missing Start or Duration\"}");
    return;
  }

  int startSec = parseHmsToSec(startStr);
  if (startSec < 0) {
    sendJson(400, "{\"error\": \"invalid Start, expected HH:MM:SS\"}");
    return;
  }

  int endSec = 86400;
  if (hasEnd) {
    endSec = parseHmsToSec(endStr);
    if (endSec < 0) {
      sendJson(400, "{\"error\": \"invalid End, expected HH:MM:SS\"}");
      return;
    }
    if (endSec <= startSec) {
      sendJson(400, "{\"error\": \"invalid End, must be after Start\"}");
      return;
    }
  }

  if (duration < 1 || duration > 86400) {
    sendJson(400, "{\"error\": \"invalid Duration, expected 1..86400\"}");
    return;
  }

  if (hasIntervalSec == 1) {
    if (intervalSec < 0 || intervalSec > 86400) {
      sendJson(400, "{\"error\": \"invalid IntervalSec, expected 0..86400\"}");
      return;
    }
    if (intervalSec > 0 && intervalSec < duration) {
      sendJson(400, "{\"error\": \"invalid IntervalSec, expected 0 or >= Duration\"}");
      return;
    }
  }

  if (hasDaysMask == 1 && (daysMask < 0 || daysMask > 127)) {
    sendJson(400, "{\"error\": \"invalid DaysMask, expected 0..127\"}");
    return;
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

  String errorMessage;
  if (!validateScheduleCandidate(line, candidate, errorMessage)) {
    sendJson(400, "{\"error\": \"" + errorMessage + "\"}");
    return;
  }

  schedules[line] = candidate;
  saveSchedule(line);
  sendJson(200, scheduleToJson(schedules[line]));
}

void handleLogsGet() {
  logRequest();
  int limit = 50;
  if (server.hasArg("limit")) {
    int requested = server.arg("limit").toInt();
    if (requested > 0 && requested <= MAX_LOG_ENTRIES) {
      limit = requested;
    }
  }

  if (limit > logCount) limit = logCount;

  String response = "{\"Count\": " + String(logCount) + ", \"Logs\": [";
  for (int i = 0; i < limit; i++) {
    int newestIdx = (logHead + logCount - 1 - i + MAX_LOG_ENTRIES) % MAX_LOG_ENTRIES;
    ActivityLogEntry &entry = activityLogs[newestIdx];
    int durationMin = (int)((entry.durationSec + 59) / 60);
    String eventName = (entry.event == 1) ? "Started" : "Stopped";
    String sourceName = "unknown";
    if (entry.source == 1) sourceName = "manual";
    else if (entry.source == 2) sourceName = "scheduled";
    else if (entry.source == 3) sourceName = "system";

    if (i > 0) response += ",";
    response += "{\"Epoch\":" + String(entry.epoch)
             + ",\"Time\":\"" + formatTimeFromEpoch(entry.epoch)
             + "\",\"Line\":" + String((int)entry.line)
             + ",\"Event\":\"" + eventName
         + "\",\"Source\":\"" + sourceName
             + "\",\"DurationSec\":" + String((uint32_t)entry.durationSec)
             + ",\"DurationMin\":" + String(durationMin)
             + "}";
  }
  response += "]}";
  sendJson(200, response);
}

void handleLogsClearPost() {
  logRequest();
  memset(activityLogs, 0, sizeof(activityLogs));
  logCount = 0;
  logHead = 0;
  saveLogs();
  sendJson(200, "{\"ok\": true}");
}

void handleOptions() {
  logRequest();
  Serial.println("[RES] 200 (CORS preflight)");
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(200, "text/plain", "");
}

void handleNotFound() {
  logRequest();
  String message = "{\"error\": \"URI not found\", \"uri\": \"" + server.uri() + "\"}";
  sendJson(404, message);
}

}  // namespace

void registerRoutes() {
  server.on("/status", HTTP_GET, handleStatusGet);
  server.on("/status", HTTP_OPTIONS, handleOptions);

  static char linePaths[LINE_COUNT][16];
  static char schedulePaths[LINE_COUNT][16];

  for (int line = 1; line <= LINE_COUNT; line++) {
    snprintf(linePaths[line - 1], sizeof(linePaths[line - 1]), "/line/%d", line);
    snprintf(schedulePaths[line - 1], sizeof(schedulePaths[line - 1]), "/schedule/%d", line);

    server.on(linePaths[line - 1], HTTP_GET, [line]() { handleLineGet(line); });
    server.on(linePaths[line - 1], HTTP_POST, [line]() { handleLinePost(line); });
    server.on(linePaths[line - 1], HTTP_OPTIONS, handleOptions);

    server.on(schedulePaths[line - 1], HTTP_GET, [line]() { handleScheduleGet(line); });
    server.on(schedulePaths[line - 1], HTTP_POST, [line]() { handleSchedulePost(line); });
    server.on(schedulePaths[line - 1], HTTP_OPTIONS, handleOptions);
  }

  server.on("/logs", HTTP_GET, handleLogsGet);
  server.on("/logs", HTTP_OPTIONS, handleOptions);
  server.on("/logs/clear", HTTP_POST, handleLogsClearPost);
  server.on("/logs/clear", HTTP_OPTIONS, handleOptions);
  server.onNotFound(handleNotFound);
}
