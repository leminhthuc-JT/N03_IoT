// =====================================================================
// N03 SMART GARDEN – GIÁM SÁT ĐỘ ẨM ĐẤT & ĐIỀU KHIỂN TƯỚI TỰ ĐỘNG
// Phần cứng: ESP32 DevKit V4 + Cảm biến độ ẩm đất + Relay + OLED SSD1306
// Giao thức: MQTT HiveMQ Cloud hai chiều (Uplink Telemetry + Downlink ACK)
// Ngưỡng: < 35%: Đất khô (Bật bơm) | 35-60%: Trung bình | >= 60%: Đủ ẩm (Tắt bơm)
// =====================================================================

#if __has_include("config.h")
  #include "config.h"
#endif

// ---- Cấu hình mặc định ----
#ifndef WIFI_SSID
  #define WIFI_SSID          "Wokwi-GUEST"
#endif
#ifndef WIFI_PASS
  #define WIFI_PASS          ""
#endif
#ifndef MQTT_HOST
  #define MQTT_HOST          "broker.hivemq.com"
#endif
#ifndef MQTT_PORT
  #define MQTT_PORT          1883
#endif
#ifndef MQTT_USER
  #define MQTT_USER          ""
#endif
#ifndef MQTT_PASS
  #define MQTT_PASS          ""
#endif
#ifndef BLYNK_AUTH_TOKEN
  #define BLYNK_AUTH_TOKEN   ""
#endif
#ifndef BLYNK_TEMPLATE_ID
  #define BLYNK_TEMPLATE_ID  ""
#endif
#ifndef BLYNK_TEMPLATE_NAME
  #define BLYNK_TEMPLATE_NAME "GreenPulse"
#endif

#define BLYNK_PRINT Serial

#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>

#if defined(BLYNK_TEMPLATE_ID) && defined(BLYNK_AUTH_TOKEN)
  #include <BlynkSimpleEsp32.h>
  #define BLYNK_AVAILABLE true
#else
  #define BLYNK_AVAILABLE false
#endif

bool blynkEnabled = false;

// =====================================================================
// 1. KHAI BÁO CHÂN PHẦN CỨNG (Chỉ tập trung vào Độ ẩm đất & Máy bơm)
// =====================================================================
#define SOIL_PIN       34   // ADC1_CH6 – Cảm biến độ ẩm đất
#define RELAY_PIN      26   // OUTPUT   – Relay điều khiển máy bơm
#define PUMP_LED_PIN   25   // OUTPUT   – LED đỏ chỉ thị bơm
#define VALVE_LED_PIN  27   // OUTPUT   – LED xanh chỉ thị van tưới

// =====================================================================
// 2. OLED SSD1306 (I2C: GPIO21 SDA, GPIO22 SCL)
// =====================================================================
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT  64
#define OLED_RESET     -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// =====================================================================
// 3. MQTT TOPICS (Chuẩn hóa phạm vi đề tài N03)
// =====================================================================
const char* TOPIC_DEVICE01_TELEMETRY = "garden/device01/telemetry";
const char* TOPIC_DEVICE01_STATUS    = "garden/device01/status";
const char* TOPIC_DEVICE01_COMMAND   = "garden/device01/command";
const char* TOPIC_DEVICE01_ACK       = "garden/device01/ack";
const char* TOPIC_DEVICE01_ALERT     = "garden/device01/alert";

// Topic legacy hỗ trợ tương thích ngược
const char* TOPIC_LEGACY_TELEMETRY   = "garden/demo/telemetry";
const char* TOPIC_LEGACY_MODE        = "garden/demo/cmd/mode";
const char* TOPIC_LEGACY_PUMP        = "garden/demo/cmd/pump";
const char* TOPIC_LEGACY_STATUS      = "garden/demo/status";
const char* TOPIC_LEGACY_ALERT       = "garden/demo/alert";

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// =====================================================================
// 4. BIẾN TRẠNG THÁI & NGƯỠNG ĐỘ ẨM ĐẤT
// =====================================================================
const int DRY_THRESHOLD = 35;   // % – Dưới 35%: Đất khô -> Bật bơm tự động
const int WET_THRESHOLD = 60;   // % – Từ 60% trở lên: Đất đủ ẩm -> Tắt bơm tự động

const int RELAY_ON  = HIGH;
const int RELAY_OFF = LOW;

const unsigned long MAX_PUMP_MS = 10UL * 60 * 1000;  // Giới hạn 10 phút ngắt an toàn

bool pumpStatus  = false;
bool valveStatus = false;
String systemMode = "AUTO";

unsigned long pumpStartTime = 0;
unsigned long msgCounter    = 0;

int currentMoisture = 50;  // %
int currentADC      = 2048;

// =====================================================================
// 5. BỘ ĐẾM THỜI GIAN
// =====================================================================
unsigned long lastSensorRead   = 0;
unsigned long lastTelemetry    = 0;
unsigned long lastWiFiAttempt  = 0;
unsigned long lastMQTTAttempt  = 0;
unsigned long lastBlynkUpdate  = 0;

const unsigned long SENSOR_INTERVAL    = 1000;    // Đọc cảm biến 1s
const unsigned long TELEMETRY_INTERVAL = 3000;    // Telemetry 3s
const unsigned long RECONNECT_INTERVAL = 5000;    // Reconnect 5s
const unsigned long BLYNK_INTERVAL     = 2000;

// =====================================================================
// 6. THUẬT TOÁN MOVING AVERAGE LỌC NHIỄU ADC ĐỘ ẨM ĐẤT (5 MẪU)
// =====================================================================
#define MA_SIZE 5
int adcBuffer[MA_SIZE] = {0};
int adcIndex = 0;
bool adcBufferFull = false;

int readMoisture() {
  int raw = analogRead(SOIL_PIN);
  adcBuffer[adcIndex] = raw;
  adcIndex = (adcIndex + 1) % MA_SIZE;
  if (adcIndex == 0) adcBufferFull = true;

  int count = adcBufferFull ? MA_SIZE : adcIndex;
  long sum = 0;
  for (int i = 0; i < count; i++) sum += adcBuffer[i];
  int avgADC = (count > 0) ? (int)(sum / count) : raw;

  currentADC = avgADC;
  int pct = map(avgADC, 0, 4095, 0, 100);
  currentMoisture = constrain(pct, 0, 100);
  return currentMoisture;
}

// =====================================================================
// 7. CẬP NHẬT ĐIỀU KHIỂN XUẤT (Relay & LED)
// =====================================================================
void applyOutputs() {
  valveStatus = pumpStatus;

  if (pumpStatus && pumpStartTime == 0) {
    pumpStartTime = millis();
  }
  if (!pumpStatus) {
    pumpStartTime = 0;
  }

  digitalWrite(RELAY_PIN,     pumpStatus  ? RELAY_ON : RELAY_OFF);
  digitalWrite(PUMP_LED_PIN,  pumpStatus  ? HIGH     : LOW);
  digitalWrite(VALVE_LED_PIN, valveStatus ? HIGH     : LOW);
}

// =====================================================================
// 8. HIỂN THỊ OLED SSD1306 (Tập trung chuyên biệt vào Độ ẩm đất & Bơm)
// =====================================================================
void displayStatus() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Dòng 1: Tiêu đề hệ thống
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("N03 SMART GARDEN");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  // Dòng 2: Độ ẩm đất lớn (Font to rõ ràng)
  display.setTextSize(2);
  display.setCursor(0, 16);
  display.print(currentMoisture);
  display.print("%");

  // Nhãn phân loại trạng thái đất
  display.setTextSize(1);
  display.setCursor(65, 18);
  if      (currentMoisture < DRY_THRESHOLD)  display.println("DAT KHO!");
  else if (currentMoisture >= WET_THRESHOLD) display.println("DAT DU AM");
  else                                       display.println("DAT TRUNG BINH");

  // Dòng 3: Giá trị ADC cảm biến
  display.setCursor(65, 29);
  display.printf("ADC:%d", currentADC);

  // Dòng 4: Chế độ vận hành & Trạng thái máy bơm
  display.setCursor(0, 42);
  display.print("MODE:");
  display.print(systemMode);
  display.print("  BOM:");
  display.println(pumpStatus ? "ON" : "OFF");

  // Dòng 5: Trạng thái mạng
  display.setCursor(0, 54);
  display.print("WiFi:");
  display.print(WiFi.status() == WL_CONNECTED ? "OK" : "--");
  display.print(" MQTT:");
  display.print(mqtt.connected() ? "OK" : "--");
  display.print(" RSSI:");
  display.print(WiFi.RSSI());

  display.display();
}

// =====================================================================
// 9. KẾT NỐI WIFI
// =====================================================================
void connectWiFi() {
  Serial.println("[WiFi] Dang ket noi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  lastWiFiAttempt = millis();
}

// =====================================================================
// 10. KẾT NỐI MQTT (LWT Retained)
// =====================================================================
void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;

  String clientId = "N03-ESP32-";
  clientId += String((uint32_t)ESP.getEfuseMac(), HEX);

  Serial.print("[MQTT] Dang ket noi HiveMQ Broker...");

  bool ok = false;
  if (strlen(MQTT_USER) > 0) {
    ok = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS,
                      TOPIC_DEVICE01_STATUS, 1, true, "OFFLINE");
  } else {
    ok = mqtt.connect(clientId.c_str(), nullptr, nullptr,
                      TOPIC_DEVICE01_STATUS, 1, true, "OFFLINE");
  }

  if (ok) {
    Serial.println(" THANH CONG!");
    mqtt.subscribe(TOPIC_DEVICE01_COMMAND, 1);
    mqtt.subscribe(TOPIC_LEGACY_MODE, 0);
    mqtt.subscribe(TOPIC_LEGACY_PUMP, 0);

    mqtt.publish(TOPIC_DEVICE01_STATUS, "ONLINE", true);
    mqtt.publish(TOPIC_LEGACY_STATUS,   "ONLINE", true);
    Serial.println("[MQTT] Subscribe commands OK. Status -> ONLINE");
  } else {
    Serial.printf("[MQTT] THAT BAI, rc=%d\n", mqtt.state());
  }
  lastMQTTAttempt = millis();
}

// =====================================================================
// 11. PHẢN HỒI LỆNH (ACK) & GỬI CẢNH BÁO
// =====================================================================
void sendAck(const String& cmdId, const String& status, const String& message = "") {
  if (!mqtt.connected()) return;

  StaticJsonDocument<256> doc;
  doc["deviceId"] = "device01";
  doc["cmdId"]    = cmdId;
  doc["status"]   = status;
  doc["pump"]     = pumpStatus;
  doc["valve"]    = valveStatus;
  doc["mode"]     = systemMode;
  doc["moisture"] = currentMoisture;
  doc["ts"]       = millis();
  if (message.length() > 0) {
    doc["message"] = message;
  }

  char buffer[256];
  serializeJson(doc, buffer);
  mqtt.publish(TOPIC_DEVICE01_ACK, buffer);
  Serial.printf("[MQTT ACK OUT] %s\n", buffer);
}

void sendAlert(const String& code, const String& message) {
  if (!mqtt.connected()) return;

  StaticJsonDocument<256> doc;
  doc["deviceId"] = "device01";
  doc["code"]     = code;
  doc["message"]  = message;
  doc["ts"]       = millis();

  char buffer[256];
  serializeJson(doc, buffer);
  mqtt.publish(TOPIC_DEVICE01_ALERT, buffer);
  mqtt.publish(TOPIC_LEGACY_ALERT, message.c_str());
  Serial.printf("[MQTT ALERT OUT] %s\n", buffer);
}

// =====================================================================
// 12. XỬ LÝ LỆNH DOWNLINK TỪ MQTT
// =====================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  msg.trim();

  Serial.printf("[MQTT IN] topic=%s payload=%s\n", topic, msg.c_str());
  String receivedTopic = String(topic);

  // 1. Topic chuẩn: garden/device01/command
  if (receivedTopic == TOPIC_DEVICE01_COMMAND) {
    StaticJsonDocument<384> doc;
    DeserializationError err = deserializeJson(doc, msg);

    if (err) {
      Serial.printf("[CMD] JSON parse error: %s\n", err.c_str());
      return;
    }

    String cmdId   = doc["cmdId"]   | "";
    String command = doc["command"] | "";
    String modeVal = doc["mode"]    | "";

    command.toUpperCase();

    // Đổi chế độ AUTO / MANUAL
    if (command == "SET_MODE") {
      modeVal.toUpperCase();
      if (modeVal == "AUTO" || modeVal == "MANUAL") {
        systemMode = modeVal;
        Serial.printf("[MODE] Chuyen sang: %s\n", systemMode.c_str());
        if (systemMode == "AUTO") {
          readMoisture();
          if      (currentMoisture < DRY_THRESHOLD)  pumpStatus = true;
          else if (currentMoisture >= WET_THRESHOLD) pumpStatus = false;
          applyOutputs();
        }
        if (cmdId.length() > 0) sendAck(cmdId, "SUCCESS", "Mode changed to " + systemMode);
      } else {
        if (cmdId.length() > 0) sendAck(cmdId, "ERROR", "Invalid mode: " + modeVal);
      }
    }
    // Bật bơm thủ công
    else if (command == "PUMP_ON" || command == "ON") {
      if (systemMode == "MANUAL") {
        pumpStatus = true;
        applyOutputs();
        Serial.println("[PUMP] MANUAL: BAT BOM THANH CONG");
        if (cmdId.length() > 0) sendAck(cmdId, "SUCCESS", "Pump turned ON");
      } else {
        Serial.println("[PUMP] TU CHOI: He thong dang o che do AUTO");
        if (cmdId.length() > 0) sendAck(cmdId, "REJECTED_AUTO_MODE", "Pump locked in AUTO mode");
      }
    }
    // Tắt bơm thủ công
    else if (command == "PUMP_OFF" || command == "OFF") {
      if (systemMode == "MANUAL") {
        pumpStatus = false;
        applyOutputs();
        Serial.println("[PUMP] MANUAL: TAT BOM THANH CONG");
        if (cmdId.length() > 0) sendAck(cmdId, "SUCCESS", "Pump turned OFF");
      } else {
        Serial.println("[PUMP] TU CHOI: He thong dang o che do AUTO");
        if (cmdId.length() > 0) sendAck(cmdId, "REJECTED_AUTO_MODE", "Pump locked in AUTO mode");
      }
    }
    // Dừng khẩn cấp
    else if (command == "EMERGENCY_STOP") {
      pumpStatus = false;
      applyOutputs();
      Serial.println("[SAFETY] DUNG KHAN CAP: Tat may bom");
      if (cmdId.length() > 0) sendAck(cmdId, "SUCCESS", "Emergency stop executed");
      sendAlert("EMERGENCY_STOP", "He thong da kich hoat Dung Khan Cap");
    }
    else {
      if (cmdId.length() > 0) sendAck(cmdId, "ERROR", "Unknown command");
    }
    return;
  }

  // 2. Topic legacy: garden/demo/cmd/*
  String val = msg;
  val.toUpperCase();
  if (val.startsWith("{")) {
    int q1 = val.indexOf('"', val.indexOf(':'));
    int q2 = (q1 >= 0) ? val.indexOf('"', q1 + 1) : -1;
    if (q1 >= 0 && q2 > q1) val = val.substring(q1 + 1, q2);
  }

  if (receivedTopic == TOPIC_LEGACY_MODE) {
    if (val == "AUTO" || val == "MANUAL") {
      systemMode = val;
      if (systemMode == "AUTO") {
        readMoisture();
        if      (currentMoisture < DRY_THRESHOLD)  pumpStatus = true;
        else if (currentMoisture >= WET_THRESHOLD) pumpStatus = false;
        applyOutputs();
      }
    }
  } else if (receivedTopic == TOPIC_LEGACY_PUMP) {
    if (systemMode == "MANUAL") {
      if (val == "ON") {
        pumpStatus = true;
        applyOutputs();
      } else if (val == "OFF") {
        pumpStatus = false;
        applyOutputs();
      }
    }
  }
}

// =====================================================================
// 13. GỬI TELEMETRY ĐỘ ẨM ĐẤT LÊN MQTT
// =====================================================================
void publishTelemetry() {
  if (!mqtt.connected()) return;

  msgCounter++;

  // 1. Topic chuẩn: garden/device01/telemetry
  StaticJsonDocument<256> doc;
  doc["deviceId"]  = "device01";
  doc["msgId"]     = msgCounter;
  doc["ts"]        = millis();
  doc["moisture"]  = currentMoisture;
  doc["adc"]       = currentADC;
  doc["pump"]      = pumpStatus;
  doc["valve"]     = valveStatus;
  doc["mode"]      = systemMode;
  doc["wifi_rssi"] = WiFi.RSSI();

  char buffer[256];
  serializeJson(doc, buffer);
  mqtt.publish(TOPIC_DEVICE01_TELEMETRY, buffer);
  Serial.printf("[MQTT TELEMETRY] %s\n", buffer);

  // 2. Topic legacy: garden/demo/telemetry
  char legacyBuffer[192];
  snprintf(legacyBuffer, sizeof(legacyBuffer),
    "{\"moisture\":%d,\"adc\":%d,"
    "\"pump\":%s,\"valve\":%s,"
    "\"mode\":\"%s\","
    "\"wifi_rssi\":%d}",
    currentMoisture, currentADC,
    pumpStatus  ? "true" : "false",
    valveStatus ? "true" : "false",
    systemMode.c_str(),
    WiFi.RSSI());
  mqtt.publish(TOPIC_LEGACY_TELEMETRY, legacyBuffer);
}

// =====================================================================
// 14. BLYNK INTEGRATION (Độ ẩm đất & Bơm)
// =====================================================================
#if BLYNK_AVAILABLE
BLYNK_WRITE(V1) {
  int val = param.asInt();
  String newMode = (val == 1) ? "MANUAL" : "AUTO";
  if (newMode != systemMode) {
    systemMode = newMode;
    if (mqtt.connected()) mqtt.publish(TOPIC_LEGACY_MODE, systemMode.c_str());
    if (systemMode == "AUTO") {
      readMoisture();
      if      (currentMoisture < DRY_THRESHOLD)  pumpStatus = true;
      else if (currentMoisture >= WET_THRESHOLD) pumpStatus = false;
      applyOutputs();
    }
  }
}

BLYNK_WRITE(V3) {
  if (systemMode == "MANUAL") {
    int val = param.asInt();
    pumpStatus = (val == 1);
    applyOutputs();
    if (mqtt.connected()) mqtt.publish(TOPIC_LEGACY_PUMP, pumpStatus ? "ON" : "OFF");
  } else {
    Blynk.virtualWrite(V5, "Chi dieu khien bom khi o che do MANUAL");
  }
}

void updateBlynk() {
  if (!blynkEnabled || !Blynk.connected()) return;
  Blynk.virtualWrite(V0, currentMoisture);
  Blynk.virtualWrite(V2, pumpStatus ? 1 : 0);
  Blynk.virtualWrite(V4, mqtt.connected() ? 255 : 0);

  if (currentMoisture < DRY_THRESHOLD && !pumpStatus) {
    Blynk.virtualWrite(V5, "CANH BAO: Dat kho, he thong dang chuan bi tuoi");
  } else if (pumpStatus) {
    Blynk.virtualWrite(V5, "He thong dang tuoi cay...");
  } else {
    Blynk.virtualWrite(V5, "Do am dat dat tieu chuan");
  }
}
#endif

// =====================================================================
// 15. SETUP
// =====================================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n==============================================");
  Serial.println("  N03 SMART GARDEN – DO AM DAT & TUOI TU DONG");
  Serial.println("==============================================");

  pinMode(SOIL_PIN,      INPUT);
  pinMode(RELAY_PIN,     OUTPUT);
  pinMode(PUMP_LED_PIN,  OUTPUT);
  pinMode(VALVE_LED_PIN, OUTPUT);
  applyOutputs();

  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[OLED] Khong tim thay SSD1306! Kiem tra I2C.");
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 15);
    display.println("N03 SMART GARDEN");
    display.setCursor(0, 30);
    display.println("Khoi dong he thong...");
    display.display();
  }

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setKeepAlive(30);
  mqtt.setBufferSize(384);

  connectWiFi();

#if BLYNK_AVAILABLE
  if (strlen(BLYNK_AUTH_TOKEN) > 0 && String(BLYNK_AUTH_TOKEN) != "xxxxxxxxxxxxxxxxxxxxxxxxxxx") {
    blynkEnabled = true;
    Blynk.config(BLYNK_AUTH_TOKEN);
  }
#endif

  Serial.println("[N03] Khoi dong hoan tat.");
}

// =====================================================================
// 16. VÒNG LẶP CHÍNH (Loop)
// =====================================================================
void loop() {
  unsigned long now = millis();

  // 1. WiFi
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWiFiAttempt >= RECONNECT_INTERVAL) {
      Serial.println("[WiFi] Mat ket noi, dang ket noi lai...");
      connectWiFi();
    }
    return;
  }

  // 2. MQTT
  if (!mqtt.connected()) {
    if (now - lastMQTTAttempt >= RECONNECT_INTERVAL) {
      connectMQTT();
    }
  } else {
    mqtt.loop();
  }

#if BLYNK_AVAILABLE
  if (blynkEnabled) Blynk.run();
#endif

  // 3. Đọc cảm biến độ ẩm đất mỗi 1 giây
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;
    readMoisture();

    // Kiểm tra tính hợp lệ ADC (SC-08 / Cảm biến bất thường)
    if (currentADC < 0 || currentADC > 4095) {
      Serial.println("[SAFETY] ADC vuot nguong hop le! Tat bom an toan.");
      pumpStatus = false;
      applyOutputs();
      sendAlert("SENSOR_FAULT", "Cam bien do am dat bat thuong (ADC out of range)");
    } else {
      // Tự động điều khiển tưới theo 3 trạng thái đất
      if (systemMode == "AUTO") {
        if (currentMoisture < DRY_THRESHOLD) {
          if (!pumpStatus) {
            pumpStatus = true;
            Serial.println("[AUTO] Dat kho (<35%), BAT BOM");
          }
        } else if (currentMoisture >= WET_THRESHOLD) {
          if (pumpStatus) {
            pumpStatus = false;
            Serial.println("[AUTO] Dat du am (>=60%), TAT BOM");
          }
        }
      }
      applyOutputs();
    }

    // Bảo vệ an toàn thời gian bơm tối đa
    if (pumpStatus && pumpStartTime > 0) {
      if (now - pumpStartTime >= MAX_PUMP_MS) {
        Serial.println("[SAFETY] Bom chay qua 10 phut! Tu dong ngat an toan.");
        pumpStatus = false;
        applyOutputs();
        sendAlert("PUMP_TIMEOUT", "Bom da chay lien tuc qua 10 phut, tu dong ngat.");
      }
    }

    displayStatus();

#if BLYNK_AVAILABLE
    if (blynkEnabled && now - lastBlynkUpdate >= BLYNK_INTERVAL) {
      lastBlynkUpdate = now;
      updateBlynk();
    }
#endif
  }

  // 4. Phát telemetry lên MQTT mỗi 3 giây
  if (now - lastTelemetry >= TELEMETRY_INTERVAL) {
    lastTelemetry = now;
    publishTelemetry();
  }
}
