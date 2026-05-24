// globals.cpp
// Defines all shared global objects and state variables used across modules.
// This is the single definition point for the HTTP server, NTP client,
// NVS preferences handle, schedule data, manual line states, and activity logs.

#include "globals.h"

WebServer server(80);
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, NTP_SERVER, NTP_OFFSET_SECONDS, NTP_UPDATE_INTERVAL_MS);
Preferences prefs;

LineSchedule schedules[LINE_COUNT + 1];
bool manualLineState[LINE_COUNT + 1] = {false};
uint32_t lastStartEpoch[LINE_COUNT + 1] = {0};

ActivityLogEntry activityLogs[MAX_LOG_ENTRIES];
int logCount = 0;
int logHead = 0;
