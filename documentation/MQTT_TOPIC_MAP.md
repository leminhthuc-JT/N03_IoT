# N03 IoT – BẢN ĐỒ MQTT TOPIC & ĐẶC TẢ PAYLOAD

> Tài liệu kỹ thuật mô tả chi tiết tất cả MQTT Topic, cấu trúc payload, QoS và hướng truyền dữ liệu trong hệ thống N03.

---

## 1. Tổng quan Kiến trúc MQTT

| Thành phần | Chi tiết |
|---|---|
| **MQTT Broker** | HiveMQ Cloud (Public) |
| **Broker Host** | `broker.hivemq.com` |
| **Port MQTT** | `1883` (TCP, không mã hóa) |
| **Port WSS** | `8884` (WebSocket Secure – cho Web Dashboard) |
| **Port WS** | `8000` (WebSocket – không mã hóa) |
| **Prefix** | `garden/demo/` |
| **QoS mặc định** | QoS 0 (Telemetry), QoS 1 (Command) |

---

## 2. Bản đồ Topic

### 2.1 Uplink: ESP32 → Broker → Node-RED / Web Dashboard

| # | Topic | Mô tả | Publisher | Subscriber | QoS | Tần suất |
|---|---|---|---|---|---|---|
| T1 | `garden/demo/telemetry` | Dữ liệu cảm biến + trạng thái hệ thống | ESP32 | Node-RED, Web Dashboard | 0 | Mỗi 5 giây |
| T2 | `garden/demo/status` | Trạng thái kết nối (LWT) | ESP32 / Broker LWT | Node-RED, Web Dashboard | 1 | Khi kết nối / mất kết nối |

### 2.2 Downlink: Node-RED / Web Dashboard → Broker → ESP32

| # | Topic | Mô tả | Publisher | Subscriber | QoS | Trigger |
|---|---|---|---|---|---|---|
| T3 | `garden/demo/cmd/mode` | Lệnh chuyển chế độ AUTO/MANUAL | Node-RED, Web Dashboard, Blynk | ESP32 | 1 | Khi người dùng thao tác |
| T4 | `garden/demo/cmd/pump` | Lệnh bật/tắt máy bơm | Node-RED, Web Dashboard, Blynk | ESP32 | 1 | Khi người dùng thao tác hoặc logic tự động |

### 2.3 Alert & Notification

| # | Topic | Mô tả | Publisher | Subscriber | QoS |
|---|---|---|---|---|---|
| T5 | `garden/demo/alert` | Cảnh báo bất thường | Node-RED | Web Dashboard | 1 |

---

## 3. Đặc tả Payload Chi Tiết

### 3.1 Topic: `garden/demo/telemetry` (T1)

**Hướng:** ESP32 → Broker  
**Định dạng:** JSON  
**Chu kỳ gửi:** 5 giây / lần  
**QoS:** 0

```json
{
  "moisture": 42.5,
  "adc": 1750,
  "pump": false,
  "valve": false,
  "mode": "AUTO",
  "wifi_rssi": -55,
  "uptime": 3600
}
```

| Trường | Kiểu | Mô tả | Phạm vi |
|---|---|---|---|
| `moisture` | `float` | Độ ẩm đất (%) sau lọc trung bình 5 mẫu | 0.0 – 100.0 |
| `adc` | `int` | Giá trị ADC thô (12-bit) | 0 – 4095 |
| `pump` | `bool` | Trạng thái relay máy bơm | `true` / `false` |
| `valve` | `bool` | Trạng thái van (dự phòng) | `true` / `false` |
| `mode` | `string` | Chế độ vận hành hiện tại | `"AUTO"` / `"MANUAL"` |
| `wifi_rssi` | `int` | Cường độ tín hiệu WiFi (dBm) | -100 đến 0 |
| `uptime` | `int` | Thời gian hoạt động (giây) | ≥ 0 |

**Công thức chuyển đổi ADC → Moisture:**
```
moisture_pct = map(filtered_adc, 4095, 0, 0, 100)
```
- ADC = 4095 → Đất rất khô (0%)
- ADC = 0 → Đất rất ẩm (100%)

---

### 3.2 Topic: `garden/demo/status` (T2)

**Hướng:** ESP32 → Broker (và LWT tự động từ Broker)  
**Định dạng:** Plain Text  
**QoS:** 1 (Retained)

| Payload | Khi nào | Ai gửi |
|---|---|---|
| `ONLINE` | ESP32 kết nối thành công MQTT | ESP32 |
| `OFFLINE` | ESP32 mất kết nối | Broker (LWT) |

**Cấu hình LWT trên ESP32:**
```cpp
mqttClient.setWill("garden/demo/status", "OFFLINE", true, 1);
// Khi connect thành công:
mqttClient.publish("garden/demo/status", "ONLINE", true, 1);
```

---

### 3.3 Topic: `garden/demo/cmd/mode` (T3)

**Hướng:** Node-RED / Web Dashboard / Blynk → Broker → ESP32  
**Định dạng:** Plain Text HOẶC JSON  
**QoS:** 1

| Payload | Hành vi trên ESP32 |
|---|---|
| `AUTO` | Chuyển sang chế độ tự động |
| `MANUAL` | Chuyển sang chế độ thủ công |
| `{"mode":"AUTO"}` | Chuyển sang AUTO (JSON fallback) |
| `{"mode":"MANUAL"}` | Chuyển sang MANUAL (JSON fallback) |

**Firmware v2 xử lý cả 2 format:**
```cpp
// Plain text
if (payload == "AUTO") systemMode = MODE_AUTO;
// JSON fallback
JsonDocument doc;
if (!deserializeJson(doc, payload)) {
  String mode = doc["mode"].as<String>();
  mode.toUpperCase();
  if (mode == "AUTO") systemMode = MODE_AUTO;
}
```

---

### 3.4 Topic: `garden/demo/cmd/pump` (T4)

**Hướng:** Node-RED / Web Dashboard / Blynk → Broker → ESP32  
**Định dạng:** Plain Text  
**QoS:** 1

| Payload | Hành vi trên ESP32 |
|---|---|
| `ON` | Bật relay máy bơm (chỉ khi MANUAL mode) |
| `OFF` | Tắt relay máy bơm |

**Lưu ý quan trọng:**
- Firmware v2 chỉ cho phép lệnh pump khi ở chế độ MANUAL
- Ở chế độ AUTO, firmware bỏ qua lệnh pump từ MQTT
- Safety timeout: Bơm tự động tắt sau 10 phút liên tục

---

### 3.5 Topic: `garden/demo/alert` (T5)

**Hướng:** Node-RED → Broker → Web Dashboard  
**Định dạng:** Plain Text hoặc JSON  
**QoS:** 1

Các loại cảnh báo:

| Alert Message | Trigger |
|---|---|
| `ESP32 OFFLINE > 60s` | Node-RED phát hiện mất kết nối |
| `Moisture sensor error` | Giá trị cảm biến ngoài phạm vi hợp lệ |
| `Pump safety timeout` | Bơm chạy quá 10 phút liên tục |

---

## 4. Sơ đồ Luồng Dữ Liệu

```
┌─────────────────────────────────────────────────────────────────┐
│                        HiveMQ Broker                           │
│                   broker.hivemq.com:1883                       │
│                                                                │
│  Topic                    Direction       QoS                  │
│  ─────────────────────    ──────────      ───                  │
│  garden/demo/telemetry    ESP32 → ☁       0                   │
│  garden/demo/status       ESP32 ↔ ☁ (LWT) 1 (Retained)       │
│  garden/demo/cmd/mode     ☁ → ESP32       1                   │
│  garden/demo/cmd/pump     ☁ → ESP32       1                   │
│  garden/demo/alert        NodeRED → ☁     1                   │
└───────┬──────────┬──────────────┬──────────────┬───────────────┘
        │          │              │              │
   ┌────▼────┐  ┌──▼──────┐  ┌───▼────────┐  ┌──▼──────────┐
   │  ESP32  │  │ Node-RED│  │ Web Dash   │  │  Blynk IoT  │
   │ Wokwi  │  │ :1880   │  │ :5500/8080 │  │  Cloud App   │
   └─────────┘  └─────────┘  └────────────┘  └─────────────┘
```

---

## 5. Quy tắc Đặt tên Topic

| Quy tắc | Giá trị |
|---|---|
| Prefix | `garden/demo/` |
| Namespace cảm biến | `telemetry` |
| Namespace lệnh | `cmd/<action>` |
| Namespace trạng thái | `status` |
| Namespace cảnh báo | `alert` |
| Wildcard subscribe | `garden/demo/#` (cho logging) |

---

*Tài liệu này là một phần của đồ án N03 IoT – Hệ thống Giám sát và Tưới cây Tự động.*
