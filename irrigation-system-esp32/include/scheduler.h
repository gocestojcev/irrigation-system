#pragma once

#include <Arduino.h>

#include "models.h"

int parseHmsToSec(const String &hms);
String secToHms(int secOfDay);
int dayOfWeekFromEpoch(uint32_t epoch);
bool isDayEnabled(uint8_t daysMask, int dayOfWeek);
bool isScheduleActiveNow(const LineSchedule &s, int secOfDay);
bool isScheduleActiveNow(const LineSchedule &s, int secOfDay, int dayOfWeek);
bool isIntervalScheduleActiveNow(const LineSchedule &s, int secOfDay, int dayOfWeek);
bool schedulesOverlap(const LineSchedule &a, const LineSchedule &b);
String daysMaskToJsonArray(uint8_t daysMask);
RuntimeLineStates computeRuntimeLineStates(uint32_t epoch);
bool validateScheduleCandidate(int line, const LineSchedule &candidate, String &errorMessage);
