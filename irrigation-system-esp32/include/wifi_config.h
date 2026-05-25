#pragma once

#include <Arduino.h>

void connectWifi();
bool saveWifiCredentials(const char *ssid, const char *password);
bool loadWifiCredentials(String &ssid, String &password);
