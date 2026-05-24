// logging_utils.cpp
// Utility helpers for diagnostics and HTTP responses.
// Provides Serial-based request/response logging (logRequest, sendJson)
// and a time-formatting helper (formatTimeFromEpoch) used in API responses.

#include "logging_utils.h"

#include "globals.h"

String formatTimeFromEpoch(uint32_t epoch) {
  int secOfDay = epoch % 86400;
  int hh = secOfDay / 3600;
  int mm = (secOfDay % 3600) / 60;
  int ss = secOfDay % 60;
  char buf[9];
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d", hh, mm, ss);
  return String(buf);
}

void logRequest() {
  String method;
  switch (server.method()) {
    case HTTP_GET: method = "GET"; break;
    case HTTP_POST: method = "POST"; break;
    case HTTP_OPTIONS: method = "OPTIONS"; break;
    default: method = "UNKNOWN"; break;
  }

  Serial.print("[REQ] ");
  Serial.print(method);
  Serial.print(" ");
  Serial.println(server.uri());

  if (server.hasArg("plain") && server.arg("plain").length() > 0) {
    Serial.print("  body: ");
    Serial.println(server.arg("plain"));
  }
}

void sendJson(int code, const String &payload) {
  Serial.print("[RES] ");
  Serial.print(code);
  Serial.print(" ");
  Serial.println(payload);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(code, "application/json", payload);
}
