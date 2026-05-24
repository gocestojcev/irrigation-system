#pragma once

#include <Arduino.h>

#define LINE_COUNT 3
#define MAX_LINE_COUNT 32

// Relay GPIO pins, index 0 = line 1, index 1 = line 2, ...
static const int relayPins[LINE_COUNT] = {22, 23, 21};

static const int RELAY_ON = LOW;
static const int RELAY_OFF = HIGH;

static const char NTP_SERVER[] = "pool.ntp.org";
static const long NTP_OFFSET_SECONDS = 0;
static const unsigned long NTP_UPDATE_INTERVAL_MS = 60000;

// Publish reported shadow state periodically while MQTT is connected.
static const unsigned long SHADOW_HEARTBEAT_INTERVAL_MS = 60000;

static const int MAX_LOG_ENTRIES = 60;

// Safe defaults for a newly added line (firmware upgrade 2 -> 3 lines).
static const int DEFAULT_SCHEDULE_START_SEC = 8 * 3600;  // 08:00:00
static const int DEFAULT_SCHEDULE_DURATION_SEC = 60;
static const int DEFAULT_SCHEDULE_INTERVAL_SEC = 0;
static const int DEFAULT_SCHEDULE_END_SEC = 86400;       // 24:00:00
static const uint8_t DEFAULT_SCHEDULE_DAYS_MASK = 127;
