# N03 SMART GARDEN – MQTT SPECIFICATION (LEVEL 4)

## 1. THÔNG TIN BROKER
- **Broker**: HiveMQ Cloud (`broker.hivemq.com`)
- **Port**: `1883` (TCP Plain) / `8884` (WSS TLS) / `8000` (WS Plain)
- **Keep-Alive**: 30 giây
- **Protocol**: MQTT v3.1.1 / v5.0

---

## 2. MA TRẬN TOPIC VÀ QUY TẮC PHÂN QUYỀN

| Topic | Hướng | QoS | Retain | Định dạng Payload | Mục đích |
|---|---|---|---|---|---|
| `garden/device01/telemetry` | Uplink (ESP32 $\to$ All) | 0 | False | JSON (ISO-8601, ts, msgId) | Định kỳ truyền dữ liệu độ ẩm đất, nhiệt độ, độ ẩm khí, ánh sáng, trạng thái bơm |
| `garden/device01/status` | Uplink (ESP32 $\to$ All) | 1 | True | Plain String (`ONLINE` / `OFFLINE`) | Báo trạng thái kết nối phần cứng; cài đặt làm LWT |
| `garden/device01/command` | Downlink (Backend $\to$ ESP32) | 1 | False | JSON (`cmdId`, `command`, `mode`, `ts`) | Phát lệnh điều khiển bật/tắt bơm, đổi chế độ, dừng khẩn cấp |
| `garden/device01/ack` | Uplink (ESP32 $\to$ Backend) | 1 | False | JSON (`cmdId`, `status`, `pump`, `mode`, `ts`) | Xác nhận thực thi lệnh kèm kết quả thực tế |
| `garden/device01/alert` | Uplink (ESP32 $\to$ Backend) | 1 | False | JSON (`code`, `message`, `severity`, `ts`) | Cảnh báo bất thường: lỗi cảm biến, quá nhiệt, timeout bơm |

---

## 3. CẤU TRÚC PAYLOAD CHI TIẾT

### 3.1. Telemetry (`garden/device01/telemetry`)
```json
{
  "deviceId": "device01",
  "msgId": 1420,
  "ts": 1732065840000,
  "moisture": 45,
  "adc": 1845,
  "temperature": 28.5,
  "humidity": 65.0,
  "light": 72,
  "pump": false,
  "valve": false,
  "mode": "AUTO",
  "wifi_rssi": -58
}
```

### 3.2. Status (`garden/device01/status`)
- Payload: `ONLINE` (khi kết nối thành công)
- LWT Payload: `OFFLINE` (được Broker tự động phát khi mất kết nối đột ngột)

### 3.3. Command Downlink (`garden/device01/command`)
```json
{
  "deviceId": "device01",
  "cmdId": "cmd_1732065840000_123",
  "command": "PUMP_ON",
  "ts": 1732065840000
}
```
Các lệnh hỗ trợ:
- `PUMP_ON`: Bật máy bơm (chỉ thực hiện khi `mode == "MANUAL"`).
- `PUMP_OFF`: Tắt máy bơm.
- `SET_MODE`: Chuyển chế độ vận hành (kèm `"mode": "AUTO"` hoặc `"mode": "MANUAL"`).
- `EMERGENCY_STOP`: Dừng khẩn cấp toàn bộ rơ-le và thiết bị.

### 3.4. Command ACK (`garden/device01/ack`)
```json
{
  "deviceId": "device01",
  "cmdId": "cmd_1732065840000_123",
  "status": "SUCCESS",
  "pump": true,
  "valve": true,
  "mode": "MANUAL",
  "ts": 1732065840250,
  "message": "Pump turned ON"
}
```
Mã trạng thái phản hồi:
- `SUCCESS`: Lệnh đã được thực thi thành công vào phần cứng.
- `REJECTED_AUTO_MODE`: Từ chối điều khiển bơm khi đang ở chế độ AUTO.
- `ERROR`: Lỗi cú pháp hoặc thông số không hợp lệ.

### 3.5. Alert (`garden/device01/alert`)
```json
{
  "deviceId": "device01",
  "code": "SENSOR_FAULT",
  "message": "ADC value 5000 exceeds valid range [0, 4095]. Bơm đã ngắt an toàn.",
  "ts": 1732065840000
}
```

---

## 4. TƯƠNG THÍCH NGƯỢC (LEGACY SUPPORT)
Để duy trì hoạt động không gián đoạn cho các phiên bản cũ và dashboard đang mở:
- ESP32 đồng thời phát song song sang `garden/demo/telemetry` và `garden/demo/status`.
- ESP32 vẫn tiếp nhận lệnh điều khiển dạng chuỗi plain text trên `garden/demo/cmd/mode` và `garden/demo/cmd/pump`.
