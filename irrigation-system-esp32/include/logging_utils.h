#pragma once

#include <Arduino.h>

String formatTimeFromEpoch(uint32_t epoch);
String formatIso8601FromEpoch(uint32_t epoch);
void logRequest();
void sendJson(int code, const String &payload);
