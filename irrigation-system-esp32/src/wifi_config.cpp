#include "wifi_config.h"

#include <WiFi.h>

#include "globals.h"

#if __has_include("wifi_secrets.h")
#include "wifi_secrets.h"
#else
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#endif

namespace {

bool hasCompileTimeWifiCredentials() {
  return strlen(WIFI_SSID) > 0 && strlen(WIFI_PASSWORD) > 0;
}

}  // namespace

void connectWifi() {
  String ssid;
  String password;
  if (!loadWifiCredentials(ssid, password)) {
    Serial.println("[WIFI] No credentials configured. Set NVS or secrets/wifi_secrets.h");
    return;
  }

  WiFi.begin(ssid.c_str(), password.c_str());
  Serial.print("Connecting to WiFi (");
  Serial.print(ssid);
  Serial.print(")");
  unsigned long startedMs = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startedMs > 30000) {
      Serial.println();
      Serial.println("[WIFI] Connection timed out after 30s");
      return;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

bool saveWifiCredentials(const char *ssid, const char *password) {
  if (!ssid || !password || strlen(ssid) == 0) return false;
  Preferences wifiPrefs;
  if (!wifiPrefs.begin("wifi", false)) return false;
  wifiPrefs.putString("ssid", ssid);
  wifiPrefs.putString("pass", password);
  wifiPrefs.end();
  return true;
}

bool loadWifiCredentials(String &ssid, String &password) {
  Preferences wifiPrefs;
  if (wifiPrefs.begin("wifi", true)) {
    ssid = wifiPrefs.getString("ssid", "");
    password = wifiPrefs.getString("pass", "");
    wifiPrefs.end();
  }

  if (ssid.length() == 0 && hasCompileTimeWifiCredentials()) {
    ssid = WIFI_SSID;
    password = WIFI_PASSWORD;
  }

  return ssid.length() > 0 && password.length() > 0;
}
