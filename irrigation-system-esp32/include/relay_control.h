#pragma once

#include <stdint.h>

enum class LineTriggerSource : uint8_t {
	Unknown = 0,
	Manual = 1,
	Scheduled = 2,
	System = 3
};

bool isValidLine(int line);
int pinForLine(int line);
void initializeRelayPins();
void setLineOutput(int line, bool on, LineTriggerSource source = LineTriggerSource::Unknown);
bool isLineCurrentlyOn(int line);
void applyManualLineCommand(int line, bool on);
