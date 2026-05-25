#include "iot_client.h"

#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>

#include "device_api.h"
#include "config.h"
#include "globals.h"
#include "logging_utils.h"

#if __has_include("iot_secrets.h")
#include "iot_secrets.h"
#define IOT_SECRETS_AVAILABLE 1
#else
#define IOT_THING_NAME ""
#define IOT_ENDPOINT ""
#define IOT_DEVICE_CERT ""
#define IOT_DEVICE_PRIVATE_KEY ""
#endif

void notifyLogEvent(int line, bool started, uint8_t source, uint32_t durationSec, uint32_t epoch);

namespace {

static const char AWS_ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF
ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6
b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv
b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj
ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM
9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw
IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6
VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L
93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm
jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC
AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA
A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI
U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs
N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv
o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU
5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy
rqXRfboQnoZsG4q5WTP468SQvvG5
-----END CERTIFICATE-----
)EOF";

WiFiClientSecure net;
PubSubClient mqtt(net);
Preferences iotPrefs;

unsigned long nextReconnectAttemptMs = 0;
unsigned long reconnectBackoffMs = 1000;
const unsigned long maxReconnectBackoffMs = 30000;
unsigned long lastShadowHeartbeatMs = 0;

String deltaTopic;
String shadowUpdateTopic;
String shadowRejectedTopic;
String commandResultTopic;
String logTopic;

bool mqttReady = false;
bool mqttTransportConfigured = false;
bool initialShadowPublished = false;

void onMqttMessage(char *topic, byte *payload, unsigned int length);

void configureMqttTransport() {
  if (mqttTransportConfigured) return;

  net.setCACert(AWS_ROOT_CA);
  net.setCertificate(IOT_DEVICE_CERT);
  net.setPrivateKey(IOT_DEVICE_PRIVATE_KEY);
  net.setTimeout(20000);

  mqtt.setServer(IOT_ENDPOINT, 8883);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(8192);
  mqtt.setKeepAlive(60);

  mqttTransportConfigured = true;
}

void flushMqtt(unsigned int iterations = 8) {
  for (unsigned int i = 0; i < iterations; i++) {
    mqtt.loop();
  }
}

bool secretsConfigured() {
  return strlen(IOT_THING_NAME) > 0 && strlen(IOT_ENDPOINT) > 0
      && strlen(IOT_DEVICE_CERT) > 0 && strlen(IOT_DEVICE_PRIVATE_KEY) > 0;
}

String readSecret(const char *value) {
  return String(value);
}

bool isDuplicateCommand(const String &commandId) {
  if (!iotPrefs.begin("iot", false)) return false;
  String last = iotPrefs.getString("lastCmd", "");
  iotPrefs.end();
  return last == commandId;
}

void rememberCommandId(const String &commandId) {
  if (!iotPrefs.begin("iot", false)) return;
  iotPrefs.putString("lastCmd", commandId);
  iotPrefs.end();
}

String sourceNameFromCode(uint8_t source) {
  if (source == 1) return "manual";
  if (source == 2) return "scheduled";
  if (source == 3) return "system";
  return "manual";
}

void publishJson(const char *topic, const String &payload, bool retained = false) {
  if (!mqtt.connected()) return;
  if (!mqtt.publish(topic, payload.c_str(), retained)) {
    Serial.print("[IOT] Publish failed (");
    Serial.print(payload.length());
    Serial.print(" bytes) topic=");
    Serial.println(topic);
    return;
  }

  flushMqtt();
}

void publishCommandResult(
  const String &commandId,
  const char *status,
  const char *errorCode = nullptr,
  const char *errorMessage = nullptr
) {
  const String timestamp = formatIso8601FromEpoch(timeClient.getEpochTime());

  JsonDocument doc;
  doc["schemaVersion"] = "1.0";
  doc["commandId"] = commandId;
  doc["deviceId"] = readSecret(IOT_THING_NAME);
  doc["status"] = status;
  doc["updatedAt"] = timestamp;

  if (strcmp(status, "applied") == 0) {
    doc["appliedAt"] = timestamp;
  }
  if (errorCode) doc["errorCode"] = errorCode;
  if (errorMessage) doc["errorMessage"] = errorMessage;

  String payload;
  serializeJson(doc, payload);
  publishJson(commandResultTopic.c_str(), payload);
}

bool publishReportedStateOnly(bool retain = false) {
  JsonDocument doc;
  JsonObject reported = doc["state"]["reported"].to<JsonObject>();
  reported["schemaVersion"] = "1.0";
  reported["deviceId"] = readSecret(IOT_THING_NAME);

  JsonDocument statusDoc;
  deserializeJson(statusDoc, buildStatusJson());
  reported["status"] = statusDoc.as<JsonObject>();

  JsonDocument scheduleDoc;
  deserializeJson(scheduleDoc, buildAllSchedulesJson());
  reported["schedule"] = scheduleDoc.as<JsonObject>();

  if (doc.overflowed()) {
    Serial.println("[IOT] Shadow JSON overflow while building reported state");
    return false;
  }

  String payload;
  serializeJson(doc, payload);
  if (!mqtt.connected()) return false;
  if (!mqtt.publish(shadowUpdateTopic.c_str(), payload.c_str(), retain)) {
    Serial.print("[IOT] Shadow publish failed (");
    Serial.print(payload.length());
    Serial.println(" bytes)");
    return false;
  }

  flushMqtt();
  Serial.print("[IOT] Shadow reported published (");
  Serial.print(payload.length());
  Serial.println(" bytes)");
  return true;
}

void publishReportedShadow(const String &commandId, const char *commandStatus) {
  const String timestamp = formatIso8601FromEpoch(timeClient.getEpochTime());

  JsonDocument doc;
  JsonObject reported = doc["state"]["reported"].to<JsonObject>();
  reported["schemaVersion"] = "1.0";
  reported["deviceId"] = readSecret(IOT_THING_NAME);

  JsonDocument statusDoc;
  deserializeJson(statusDoc, buildStatusJson());
  reported["status"] = statusDoc.as<JsonObject>();

  JsonDocument scheduleDoc;
  deserializeJson(scheduleDoc, buildAllSchedulesJson());
  reported["schedule"] = scheduleDoc.as<JsonObject>();

  JsonObject lastCommand = reported["lastCommand"].to<JsonObject>();
  lastCommand["commandId"] = commandId;
  lastCommand["status"] = commandStatus;
  lastCommand["updatedAt"] = timestamp;

  doc["state"]["desired"]["command"] = nullptr;

  String payload;
  serializeJson(doc, payload);
  publishJson(shadowUpdateTopic.c_str(), payload);
}

bool handleCommandEnvelope(JsonObject command) {
  const char *schemaVersion = command["schemaVersion"];
  const char *commandId = command["commandId"];
  const char *type = command["type"];
  JsonObject payload = command["payload"].as<JsonObject>();

  if (!schemaVersion || strcmp(schemaVersion, "1.0") != 0) return false;
  if (!commandId || !type) return false;

  String commandIdStr(commandId);
  if (isDuplicateCommand(commandIdStr)) {
    publishCommandResult(commandIdStr, "applied");
    publishReportedShadow(commandIdStr, "applied");
    return true;
  }

  String errorOut;
  bool ok = false;

  if (strcmp(type, "line.set") == 0) {
    int lineId = payload["lineId"] | 0;
    const char *value = payload["Value"];
    if (lineId < 1 || lineId > LINE_COUNT || !value) {
      publishCommandResult(commandIdStr, "failed", "VALIDATION_INVALID_FIELD", "Invalid line.set payload");
      publishReportedShadow(commandIdStr, "failed");
      return true;
    }
    ok = applyLineSet(lineId, strcmp(value, "on") == 0, errorOut);
  } else if (strcmp(type, "schedule.set") == 0) {
    int lineId = payload["lineId"] | 0;
    if (lineId < 1 || lineId > LINE_COUNT) {
      publishCommandResult(commandIdStr, "failed", "VALIDATION_INVALID_FIELD", "Invalid schedule.set lineId");
      publishReportedShadow(commandIdStr, "failed");
      return true;
    }
    String body;
    serializeJson(payload, body);
    ok = applyScheduleSetFromJson(lineId, body, errorOut);
  } else if (strcmp(type, "logs.clear") == 0) {
    ok = clearActivityLogs(errorOut);
  } else {
    publishCommandResult(commandIdStr, "failed", "VALIDATION_INVALID_FIELD", "Unknown command type");
    publishReportedShadow(commandIdStr, "failed");
    return true;
  }

  if (ok) {
    rememberCommandId(commandIdStr);
    publishCommandResult(commandIdStr, "applied");
    publishReportedShadow(commandIdStr, "applied");
  } else {
    publishCommandResult(commandIdStr, "failed", "DEVICE_COMMAND_REJECTED", errorOut.c_str());
    publishReportedShadow(commandIdStr, "failed");
  }

  return true;
}

void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  String message;
  message.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  const String topicStr(topic);
  if (topicStr == shadowRejectedTopic) {
    Serial.print("[IOT] Shadow rejected: ");
    Serial.println(message);
    return;
  }

  if (topicStr != deltaTopic) return;

  JsonDocument doc;
  if (deserializeJson(doc, message)) {
    Serial.println("[IOT] Shadow delta JSON parse failed");
    return;
  }

  JsonObject state = doc["state"].as<JsonObject>();
  if (state.isNull()) return;

  JsonObject command = state["command"].as<JsonObject>();
  if (command.isNull()) {
    JsonObject desired = state["desired"].as<JsonObject>();
    if (!desired.isNull()) command = desired["command"].as<JsonObject>();
  }
  if (command.isNull()) return;

  Serial.println("[IOT] Shadow delta command received");
  handleCommandEnvelope(command);
}

void syncStoredLogsToCloud() {
  if (!mqtt.connected() || logCount <= 0) return;

  const int limit = min(logCount, MAX_LOG_ENTRIES);
  Serial.print("[IOT] Syncing ");
  Serial.print(limit);
  Serial.println(" stored log entries");

  for (int i = 0; i < limit; i++) {
    const int newestIdx = (logHead + logCount - 1 - i + MAX_LOG_ENTRIES) % MAX_LOG_ENTRIES;
    const ActivityLogEntry &entry = activityLogs[newestIdx];
    ::notifyLogEvent(
      (int)entry.line,
      entry.event == 1,
      entry.source,
      entry.durationSec,
      entry.epoch
    );
    flushMqtt(2);
  }
}

bool connectMqtt() {
  if (!secretsConfigured()) return false;
  if (WiFi.status() != WL_CONNECTED) return false;
  if (mqtt.connected()) return true;

  configureMqttTransport();

  mqtt.disconnect();
  net.stop();

  String clientId = readSecret(IOT_THING_NAME);
  if (!mqtt.connect(clientId.c_str())) {
    Serial.print("[IOT] MQTT connect failed, state=");
    Serial.println(mqtt.state());
    return false;
  }

  Serial.println("[IOT] MQTT connected");
  flushMqtt();

  if (!mqtt.subscribe(deltaTopic.c_str())) {
    Serial.println("[IOT] Delta subscribe failed");
  }
  if (!mqtt.subscribe(shadowRejectedTopic.c_str())) {
    Serial.println("[IOT] Shadow rejected subscribe failed");
  }
  flushMqtt();

  mqttReady = true;
  reconnectBackoffMs = 1000;
  lastShadowHeartbeatMs = millis();

  const bool retain = !initialShadowPublished;
  if (publishReportedStateOnly(retain)) {
    initialShadowPublished = true;
  }

  syncStoredLogsToCloud();

  return true;
}

void ensureMqttConnected() {
  if (!secretsConfigured()) return;
  if (mqtt.connected()) return;

  unsigned long now = millis();
  if (now < nextReconnectAttemptMs) return;

  if (connectMqtt()) return;

  nextReconnectAttemptMs = now + reconnectBackoffMs;
  reconnectBackoffMs = min(reconnectBackoffMs * 2, maxReconnectBackoffMs);
}

}  // namespace

bool isIotClientEnabled() {
  return secretsConfigured();
}

void setupIotClient() {
  if (!secretsConfigured()) {
    Serial.println("[IOT] Secrets not configured; cloud control disabled");
    return;
  }

  String thingName = readSecret(IOT_THING_NAME);
  deltaTopic = "$aws/things/" + thingName + "/shadow/update/delta";
  shadowUpdateTopic = "$aws/things/" + thingName + "/shadow/update";
  shadowRejectedTopic = "$aws/things/" + thingName + "/shadow/update/rejected";
  commandResultTopic = "irrigation/devices/" + thingName + "/command-result";
  logTopic = "irrigation/devices/" + thingName + "/logs";

  mqtt.setClient(net);
  configureMqttTransport();
  Serial.println("[IOT] Client initialized for thing " + thingName);
}

void iotClientLoop() {
  if (!secretsConfigured()) return;

  static bool wasConnected = false;
  const bool connected = mqtt.connected();
  if (wasConnected && !connected) {
    Serial.print("[IOT] MQTT disconnected, state=");
    Serial.println(mqtt.state());
    mqttReady = false;
  }
  wasConnected = connected;

  ensureMqttConnected();
  if (mqtt.connected()) {
    mqtt.loop();

    unsigned long now = millis();
    if (now - lastShadowHeartbeatMs >= SHADOW_HEARTBEAT_INTERVAL_MS) {
      publishReportedStateOnly(false);
      lastShadowHeartbeatMs = now;
    }
  }
}

void notifyLogEvent(int line, bool started, uint8_t source, uint32_t durationSec, uint32_t epoch) {
  if (!secretsConfigured() || !mqtt.connected()) return;

  JsonDocument doc;
  doc["Epoch"] = epoch;
  doc["Time"] = formatTimeFromEpoch(epoch);
  doc["Line"] = line;
  doc["Event"] = started ? "Started" : "Stopped";
  doc["Source"] = sourceNameFromCode(source);
  doc["DurationSec"] = durationSec;
  doc["DurationMin"] = (int)((durationSec + 59) / 60);

  String payload;
  serializeJson(doc, payload);
  publishJson(logTopic.c_str(), payload);
}
