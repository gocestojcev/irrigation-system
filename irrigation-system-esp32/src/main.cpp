// main.cpp
// Entry point for the ESP32 irrigation controller.

#include <Arduino.h>

#include "api.h"
#include "config.h"
#include "globals.h"
#include "iot_client.h"
#include "relay_control.h"
#include "scheduler.h"
#include "storage.h"
#include "wifi_config.h"

void setup() {
  Serial.begin(115200);
  initializeRelayPins();

  if (!prefs.begin("sched", false)) {
    Serial.println("Failed to init preferences");
  } else {
    loadSchedules();
    loadLogs();
  }

  connectWifi();

  registerRoutes();
  server.begin();
  Serial.println("HTTP server started");

  timeClient.begin();
  timeClient.update();

  setupIotClient();
}

void loop() {
  server.handleClient();
  iotClientLoop();
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
