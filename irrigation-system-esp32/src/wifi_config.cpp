#include "wifi_config.h"

#include <WiFi.h>
#include <esp_netif.h>

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

void applyReliableDns() {
  esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
  if (netif == nullptr) {
    Serial.println("[WIFI] Could not override DNS (netif missing)");
    return;
  }

  esp_netif_dns_info_t dns;
  dns.ip.type = ESP_IPADDR_TYPE_V4;

  IPAddress primary(8, 8, 8, 8);
  dns.ip.u_addr.ip4.addr = static_cast<uint32_t>(primary);
  esp_netif_set_dns_info(netif, ESP_NETIF_DNS_MAIN, &dns);

  IPAddress secondary(1, 1, 1, 1);
  dns.ip.u_addr.ip4.addr = static_cast<uint32_t>(secondary);
  esp_netif_set_dns_info(netif, ESP_NETIF_DNS_BACKUP, &dns);
}

}  // namespace

void connectWifi() {
  String ssid;
  String password;
  if (!loadWifiCredentials(ssid, password)) {
    Serial.println("[WIFI] No credentials configured. Set NVS or secrets/wifi_secrets.h");
    return;
  }

  // Prefer public DNS; router DNS (192.168.100.1) timed out in testing.
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, IPAddress(8, 8, 8, 8), IPAddress(1, 1, 1, 1));

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
  applyReliableDns();
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("DNS: ");
  Serial.print(WiFi.dnsIP(0));
  Serial.print(", ");
  Serial.println(WiFi.dnsIP(1));
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
