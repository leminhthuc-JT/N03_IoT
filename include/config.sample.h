// ============================================
// config.sample.h – CẤU HÌNH MẪU N03
// Sao chép file này thành config.h và điền thông tin thực.
// KHÔNG commit file config.h lên git.
// ============================================

#pragma once

// --- WiFi ---
#define WIFI_SSID       "your_wifi_ssid"
#define WIFI_PASS       "your_wifi_password"

// --- MQTT Broker ---
#define MQTT_HOST       "broker.hivemq.com"
#define MQTT_PORT       1883
// Nếu Broker yêu cầu xác thực:
#define MQTT_USER       ""
#define MQTT_PASS       ""

// --- Blynk ---
#define BLYNK_AUTH_TOKEN  "your_blynk_auth_token"
#define BLYNK_TEMPLATE_ID "your_template_id"
#define BLYNK_TEMPLATE_NAME "GreenPulse"

// --- MQTT Topics (giữ nguyên để khớp với Node-RED) ---
#define TOPIC_TELEMETRY  "garden/demo/telemetry"
#define TOPIC_MODE       "garden/demo/cmd/mode"
#define TOPIC_PUMP       "garden/demo/cmd/pump"
#define TOPIC_STATUS     "garden/demo/status"

// --- GPIO ---
#define SOIL_PIN         34
#define RELAY_PIN        26
#define PUMP_LED_PIN     25
#define VALVE_LED_PIN    27

// --- Ngưỡng độ ẩm ---
#define DRY_THRESHOLD    35
#define WET_THRESHOLD    60

// --- Giới hạn thời gian bơm (ms) ---
#define MAX_PUMP_DURATION_MS  (10UL * 60 * 1000)  // 10 phút
