#pragma once

#include <Arduino.h>

#include "models.h"

String buildStatusJson();
String buildScheduleJson(int line);
String buildAllSchedulesJson();
String sourceToJson(const LineRuntimeState &line);

bool applyLineSet(int line, bool on, String &errorOut);
bool applyScheduleSetFromJson(int line, const String &body, String &errorOut);
bool clearActivityLogs(String &errorOut);
