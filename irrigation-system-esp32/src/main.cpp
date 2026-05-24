// main.cpp
// Entry point for the ESP32 irrigation controller.
// Handles Wi-Fi connection, NTP sync, hardware initialisation,
// HTTP server startup, and the main loop that evaluates schedules
// and drives relay outputs on every iteration.

#include <Arduino.h>
#include <WiFi.h>

#include "api.h"
#include "config.h"
#include "globals.h"
#include "relay_control.h"
#include "scheduler.h"
#include "storage.h"

void setup() {
  Serial.begin(115200);
  initializeRelayPins();

  if (!prefs.begin("sched", false)) {
    Serial.println("Failed to init preferences");
  } else {
    loadSchedules();
    loadLogs();
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  registerRoutes();
  server.begin();
  Serial.println("HTTP server started");

  timeClient.begin();
  timeClient.update();
}

void loop() {
  server.handleClient();
  timeClient.update();

  uint32_t epoch = timeClient.getEpochTime();
  RuntimeLineStates runtime = computeRuntimeLineStates(epoch);

  static bool lastOn[LINE_COUNT + 1] = {false};
  static bool lastScheduledOn[LINE_COUNT + 1] = {false};

  for (int line = 1; line <= LINE_COUNT; line++) {
    if (lastScheduledOn[line] && !runtime.line[line].scheduledOn) {
      manualLineState[line] = false;
      runtime.line[line].manualOn = false;
      runtime.line[line].on = false;
    }
    lastScheduledOn[line] = runtime.line[line].scheduledOn;

    if (runtime.line[line].on != lastOn[line]) {
      Serial.println(timeClient.getFormattedTime() + " line " + String(line) + " "
        + (runtime.line[line].on ? "on" : "off"));
      lastOn[line] = runtime.line[line].on;
    }

    setLineOutput(line, runtime.line[line].on, LineTriggerSource::Scheduled);
  }
}
