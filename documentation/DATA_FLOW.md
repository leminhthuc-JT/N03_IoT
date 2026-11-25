# LUỒNG DỮ LIỆU ĐO ĐỘ ẨM ĐẤT VÀ ĐIỀU KHIỂN TƯỚI N03 (DATA FLOW)

## 1. TỔNG QUAN PHẠM VI DỮ LIỆU
Hệ thống tập trung 100% vào bài toán:
- **Đo lường độ ẩm đất** từ cảm biến analog qua ESP32 ADC.
- **Phân loại 3 trạng thái đất**:
  - Dưới 35%: Đất khô
  - Từ 35% đến dưới 60%: Đất trung bình
  - Từ 60% trở lên: Đất đủ ẩm
- **Điều khiển tưới cây tự động và thủ công** qua Relay rơ-le và máy bơm.
- **Phản hồi xác nhận lệnh (ACK)** và phát hiện thiết bị mất kết nối (LWT).

---

## 2. LUỒNG DỮ LIỆU UPLINK (TỪ CẢM BIẾN LÊN GIÁM SÁT)

```mermaid
sequenceDiagram
    autonumber
    participant Sensor as Cảm biến Độ ẩm đất (GPIO34)
    participant ESP as ESP32 (Wokwi)
    participant Broker as HiveMQ Broker (MQTT)
    participant NodeRED as Node-RED (Rule Engine)
    participant Backend as Backend Server (Node.js)
    participant UI as Web Dashboard & Mobile PWA

    loop Mỗi 1 giây
        ESP->>Sensor: analogRead(34)
        Sensor-->>ESP: Giá trị ADC (0 - 4095)
        ESP->>ESP: Lọc nhiễu Moving Average (5 mẫu) & Chuyển đổi % (0 - 100%)
    end

    loop Mỗi 3 giây
        ESP->>Broker: PUBLISH garden/device01/telemetry (QoS 0)
        Note over ESP,Broker: Payload: moisture, adc, pump, mode, rssi, ts
        Broker->>NodeRED: Chuyển tiếp Telemetry
        NodeRED->>NodeRED: Kiểm tra ngưỡng tự động (Dry < 35%, Wet >= 60%)
        Broker->>Backend: Chuyển tiếp Telemetry
        Backend->>Backend: Lưu vào Database (store.json / InfluxDB)
        Backend->>UI: Broadcast qua WebSocket (ws://localhost:3000)
        UI->>UI: Cập nhật màu đất 3D & Biểu đồ Dashboard
    end
```

---

## 3. LUỒNG DỮ LIỆU DOWNLINK (ĐIỀU KHIỂN MÁY BƠM VÀ XÁC NHẬN ACK)

```mermaid
sequenceDiagram
    autonumber
    participant User as Người dùng (Web Dashboard / PWA)
    participant Backend as Backend Server (REST API)
    participant Broker as HiveMQ Broker (MQTT)
    participant ESP as ESP32 (Firmware)
    participant Relay as Rơ-le / Bơm (GPIO26)

    User->>Backend: POST /api/command (command: "PUMP_ON", cmdId: "cmd_123")
    Backend->>Backend: Tạo bản ghi PENDING & Khởi động Timer Timeout (4s)
    Backend->>Broker: PUBLISH garden/device01/command (QoS 1)
    Broker->>ESP: Nhận lệnh Downlink
    
    alt Chế độ MANUAL
        ESP->>Relay: Bật rơ-le (digitalWrite HIGH)
        ESP->>ESP: Đổi trạng thái pumpStatus = true
        ESP->>Broker: PUBLISH garden/device01/ack (status: "SUCCESS", cmdId: "cmd_123")
        Broker->>Backend: Nhận ACK
        Backend->>Backend: Hủy Timer & Cập nhật SUCCESS vào Database
        Backend-->>User: HTTP 200 OK (Kèm ACK thực tế)
        Backend->>User: Broadcast qua WebSocket: COMMAND_ACK
        User->>User: Hiển thị Bơm ĐANG BẬT & Phun nước 3D
    else Chế độ AUTO
        ESP->>Broker: PUBLISH garden/device01/ack (status: "REJECTED_AUTO_MODE")
        Broker->>Backend: Nhận ACK Từ chối
        Backend-->>User: HTTP 400 Bơm bị khóa ở chế độ AUTO
    else ESP32 Mất kết nối / Treo (SC-07)
        Note over Backend: Hết 4000ms không nhận được ACK
        Backend->>Backend: Đánh dấu TIMEOUT
        Backend-->>User: HTTP 504 Gateway Timeout (Không hiển thị thành công giả)
    end
```
