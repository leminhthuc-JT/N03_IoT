# N03 SMART GARDEN – BACKEND REST API & WEBSOCKET DOCUMENTATION

Base URL: `http://localhost:3000` (hoặc IP máy chủ cổng 3000)
WebSocket URL: `ws://localhost:3000`

---

## 1. REST API ENDPOINTS

### 1.1. Health Check
- **Endpoint**: `GET /api/health`
- **Response**:
```json
{
  "status": "OK",
  "version": "3.0.0-Level4",
  "mqttConnected": true,
  "wsClients": 2,
  "timestamp": "2026-11-20T01:30:00.000Z"
}
```

### 1.2. Danh sách thiết bị
- **Endpoint**: `GET /api/devices`
- **Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "device01",
      "name": "ESP32 Garden Station 01",
      "location": "Khu vườn số 01 - Luống A",
      "status": "ONLINE",
      "ip": "192.168.1.105",
      "firmwareVersion": "3.0.0-L4",
      "lastSeen": "2026-11-20T01:30:00.000Z"
    }
  ]
}
```

### 1.3. Telemetry mới nhất
- **Endpoint**: `GET /api/telemetry/latest?deviceId=device01`
- **Response**:
```json
{
  "success": true,
  "data": {
    "deviceId": "device01",
    "moisture": 48,
    "adc": 1960,
    "temperature": 28.5,
    "humidity": 65.0,
    "light": 72,
    "pump": false,
    "valve": false,
    "mode": "AUTO",
    "recordedAt": "2026-11-20T01:30:00.000Z"
  }
}
```

### 1.4. Lịch sử Telemetry theo chuỗi thời gian
- **Endpoint**: `GET /api/telemetry/history?deviceId=device01&limit=50&from=...&to=...`
- **Query Params**:
  - `limit`: Số bản ghi tối đa (mặc định 100).
  - `from`, `to`: ISO-8601 timestamp giới hạn khoảng thời gian.
- **Response**:
```json
{
  "success": true,
  "total": 50,
  "data": [ ... ]
}
```

### 1.5. Gửi Downlink Command tới Thiết bị (Kèm cơ chế chờ ACK - SC-07)
- **Endpoint**: `POST /api/command`
- **Body**:
```json
{
  "deviceId": "device01",
  "command": "PUMP_ON",
  "timeoutMs": 4000
}
```
- **Response thành công (HTTP 200)**:
```json
{
  "success": true,
  "command": "PUMP_ON",
  "ack": {
    "deviceId": "device01",
    "cmdId": "cmd_1732065840000_123",
    "status": "SUCCESS",
    "pump": true,
    "valve": true,
    "mode": "MANUAL",
    "ts": 1732065840250,
    "message": "Pump turned ON"
  },
  "message": "Command executed and verified by device ACK"
}
```
- **Response Timeout khi thiết bị mất mạng / không phản hồi (HTTP 504)**:
```json
{
  "success": false,
  "command": "PUMP_ON",
  "error": "MQTT_TIMEOUT",
  "message": "Thiết bị không phản hồi trong 4000ms. Không có ACK."
}
```

### 1.6. Quản lý cấu hình ngưỡng (Thresholds)
- **Lấy ngưỡng**: `GET /api/thresholds`
- **Cập nhật ngưỡng**: `PUT /api/thresholds`
```json
{
  "dryThreshold": 35,
  "wetThreshold": 60,
  "maxPumpDurationMs": 600000,
  "autoMode": true
}
```

### 1.7. Danh sách cảnh báo (Alerts)
- **Endpoint**: `GET /api/alerts?limit=50`
- **Thêm cảnh báo**: `POST /api/alerts`

### 1.8. Nhật ký các phiên tưới nước (Water Logs)
- **Endpoint**: `GET /api/water-logs?limit=50`
- **Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "wl_1732065840000",
      "deviceId": "device01",
      "startTime": "2026-11-20T01:10:00.000Z",
      "endTime": "2026-11-20T01:13:30.000Z",
      "startMoisture": 28,
      "endMoisture": 62,
      "moistureGain": 34,
      "durationSec": 210,
      "triggeredBy": "AUTO",
      "status": "COMPLETED"
    }
  ]
}
```

---

## 2. GIAO THỨC WEBSOCKET HAI CHIỀU

Khi client kết nối tới `ws://localhost:3000`:
- **Gói tin Snapshot khởi tạo (`INIT`)**:
```json
{
  "type": "INIT",
  "data": {
    "devices": [ ... ],
    "latestTelemetry": { ... },
    "thresholds": { ... },
    "recentAlerts": [ ... ],
    "recentWaterLogs": [ ... ]
  },
  "timestamp": "2026-11-20T01:30:00.000Z"
}
```
- **Gói tin Telemetry thời gian thực (`TELEMETRY`)**:
Được phát tự động mỗi khi ESP32 gửi dữ liệu mới lên Broker.
- **Gói tin Trạng thái thiết bị (`DEVICE_STATUS`)**:
Báo `ONLINE` hoặc `OFFLINE`.
- **Gói tin Xác nhận lệnh (`COMMAND_ACK`)**:
Báo kết quả thực thi lệnh phần cứng tức thì cho Web Dashboard và Mobile PWA.
