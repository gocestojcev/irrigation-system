#pragma once

#include <Arduino.h>

void saveLogs();
void loadLogs();
void appendLog(int line, bool started, uint8_t source, uint32_t durationSec, uint32_t epoch);
void saveSchedule(int line);
void loadSchedules();
