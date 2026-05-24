#pragma once

#include <Arduino.h>

#include "config.h"

struct ActivityLogEntry {
  uint32_t epoch;
  uint8_t line;
  uint8_t event;
  uint8_t source;
  uint32_t durationSec;
};

struct LineSchedule {
  bool enabled;
  int startSec;
  int durationSec;
  int intervalSec;
  int endSec;
  uint8_t daysMask;
};

struct LineRuntimeState {
  bool on;
  bool scheduledOn;
  bool manualOn;
};

struct RuntimeLineStates {
  LineRuntimeState line[LINE_COUNT + 1];
};
