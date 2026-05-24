#pragma once

#include <stdint.h>

void setupIotClient();
void iotClientLoop();
void notifyLogEvent(int line, bool started, uint8_t source, uint32_t durationSec, uint32_t epoch);
bool isIotClientEnabled();
