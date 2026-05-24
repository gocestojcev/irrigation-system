// relay_control.cpp
// All GPIO relay writes and manual-command enforcement.
// setLineOutput() is the only place that calls digitalWrite() for relay pins.
// applyManualLineCommand() manages mutual exclusivity via GPIO and manualLineState[].
// It never reads or writes schedules[] — schedule state is only changed by the API.

#include "relay_control.h"
#include <Arduino.h>
#include "config.h"
#include "globals.h"
#include "storage.h"

bool isValidLine(int line) {
  return line >= 1 && line <= LINE_COUNT;
}

int pinForLine(int line) {
  if (!isValidLine(line)) return -1;
  return relayPins[line - 1];
}

void initializeRelayPins() {
  for (int line = 1; line <= LINE_COUNT; line++) {
    pinMode(relayPins[line - 1], OUTPUT);
    setLineOutput(line, false, LineTriggerSource::System);
  }
}

void setLineOutput(int line, bool on, LineTriggerSource source) {
  int pin = pinForLine(line);
  if (pin < 0) return;

  bool currentOn = (digitalRead(pin) == RELAY_ON);
  if (currentOn == on) return;

  digitalWrite(pin, on ? RELAY_ON : RELAY_OFF);

  const char *sourceName = "unknown";
  if (source == LineTriggerSource::Manual) sourceName = "manual";
  else if (source == LineTriggerSource::Scheduled) sourceName = "scheduled";
  else if (source == LineTriggerSource::System) sourceName = "system";

  Serial.print("[ACT] line ");
  Serial.print(line);
  Serial.print(" ");
  Serial.print(on ? "on" : "off");
  Serial.print(" source=");
  Serial.println(sourceName);

  if (source != LineTriggerSource::Unknown) {
    uint32_t epoch = timeClient.getEpochTime();
    uint8_t logSource = 0;
    if (source == LineTriggerSource::Manual) logSource = 1;
    else if (source == LineTriggerSource::Scheduled) logSource = 2;
    else if (source == LineTriggerSource::System) logSource = 3;
    if (on) {
      lastStartEpoch[line] = epoch;
      uint32_t planned = (source == LineTriggerSource::Scheduled && schedules[line].enabled)
        ? (uint32_t)schedules[line].durationSec
        : 0;
      appendLog(line, true, logSource, planned, epoch);
    } else {
      uint32_t ranFor = (lastStartEpoch[line] > 0 && epoch >= lastStartEpoch[line])
        ? (epoch - lastStartEpoch[line])
        : 0;
      appendLog(line, false, logSource, ranFor, epoch);
      lastStartEpoch[line] = 0;
    }
  }
}

bool isLineCurrentlyOn(int line) {
  int pin = pinForLine(line);
  if (pin < 0) return false;
  return digitalRead(pin) == RELAY_ON;
}

void applyManualLineCommand(int line, bool on) {
  if (!isValidLine(line)) return;

  if (on) {
    for (int other = 1; other <= LINE_COUNT; other++) {
      if (other == line) continue;
      setLineOutput(other, false, LineTriggerSource::Manual);
      manualLineState[other] = false;
    }
  }

  setLineOutput(line, on, LineTriggerSource::Manual);
  manualLineState[line] = on;
}
