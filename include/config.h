// ============================================================
// config.h – CẤU HÌNH THỰC CHO N03
// KHÔNG commit file này lên git / share lên Wokwi public
// Sao chép từ config.sample.h và điền thông tin thực.
// ============================================================

#pragma once

// --- WiFi ---
// Wokwi simulation: dùng "Wokwi-GUEST" (không cần pass)
// ESP32 thực: thay bằng SSID/pass WiFi thật
#define WIFI_SSID       "Wokwi-GUEST"
#define WIFI_PASS       ""

// --- MQTT Broker ---
#define MQTT_HOST       "broker.hivemq.com"
#define MQTT_PORT       1883
#define MQTT_USER       ""   // để trống nếu không auth
#define MQTT_PASS       ""   // để trống nếu không auth

// --- Blynk IoT ---
// Điền token thật để bật Blynk. Để trống "" nếu chưa có.
// #define BLYNK_TEMPLATE_ID   "TMPLxxxxxxxxx"
// #define BLYNK_TEMPLATE_NAME "GreenPulse"
// #define BLYNK_AUTH_TOKEN    "your_token_here"
