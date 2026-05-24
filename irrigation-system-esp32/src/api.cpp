// api.cpp
// Registers and implements all HTTP REST API routes for the irrigation controller.

#include "api.h"

#include <cstring>

#include "config.h"
#include "device_api.h"
#include "globals.h"
#include "logging_utils.h"
#include "relay_control.h"
#include "storage.h"

namespace {

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
  sendJson(200, buildStatusJson());
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

  sendJson(200, buildScheduleJson(line));
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
  String errorOut;
  if (!applyScheduleSetFromJson(line, body, errorOut)) {
    sendJson(400, String("{\"error\": \"") + errorOut + "\"}");
    return;
  }

  sendJson(200, buildScheduleJson(line));
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
  String errorOut;
  if (!clearActivityLogs(errorOut)) {
    sendJson(400, String("{\"error\": \"") + errorOut + "\"}");
    return;
  }
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
