#pragma once

#include <WebServer.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <Preferences.h>

#include "config.h"
#include "models.h"

extern WebServer server;
extern WiFiUDP ntpUDP;
extern NTPClient timeClient;
extern Preferences prefs;

extern LineSchedule schedules[LINE_COUNT + 1];
extern bool manualLineState[LINE_COUNT + 1];
extern uint32_t lastStartEpoch[LINE_COUNT + 1];

extern ActivityLogEntry activityLogs[MAX_LOG_ENTRIES];
extern int logCount;
extern int logHead;
