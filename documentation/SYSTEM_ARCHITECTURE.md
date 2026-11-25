# SYSTEM ARCHITECTURE – N03 SMART GARDEN DIGITAL TWIN (PHẠM VI ĐỘ ẨM ĐẤT)

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG
Hệ thống N03 Smart Garden Digital Twin tập trung chuyên biệt vào bài toán: **Đo lường độ ẩm đất, giám sát trạng thái đất và điều khiển tự động hóa hệ thống tưới cây**.

```mermaid
flowchart TD
    subgraph Layer1["LỚP 1: Physical Device Simulation"]
        ESP32["ESP32 Dev Module"]
        SoilSen["Cảm biến Độ ẩm đất (GPIO34 ADC)"]
        Relay["Relay Điều khiển Bơm (GPIO26)"]
        OLED["Màn hình OLED SSD1306 (I2C: GPIO21/22)"]
        LEDs["LED Chỉ thị Bơm (GPIO25) / Van (GPIO27)"]
        SoilSen --> ESP32
        ESP32 --> Relay
        ESP32 --> OLED
        ESP32 --> LEDs
    end

    subgraph Layer2["LỚP 2: Communication Layer"]
        Broker["HiveMQ Cloud Broker (broker.hivemq.com)"]
        ESP32 <-->|MQTT Topics| Broker
    end

    subgraph Layer3["LỚP 3: IoT Processing (Node-RED)"]
        NodeRED["Node-RED Rule Engine\n- Kiểm tra ngưỡng tự động (Dry < 35%, Wet >= 60%)\n- Điều phối lệnh và kiểm soát an toàn\n- Phát hiện thiết bị mất kết nối"]
        Broker <-->|MQTT| NodeRED
    end

    subgraph Layer4["LỚP 4: Backend & Database"]
        Backend["Backend Server (Node.js/Express)\n- REST API quản lý thiết bị, lệnh, lịch sử\n- WebSocket Server thời gian thực (ws)\n- Xử lý Downlink chờ ACK & Timeout 504"]
        DB[("Database & Persistent Store\n- Lịch sử độ ẩm đất\n- Nhật ký các lần tưới nước (Water Logs)\n- Trạng thái thiết bị & Cảnh báo")]
        Broker <-->|MQTT| Backend
        Backend --> DB
    end

    subgraph Layer5["LỚP 5: Giao diện người dùng (User Interfaces)"]
        WebDash["Web Dashboard & Mobile PWA\n- Đồng hồ đo độ ẩm Gauge Chart 0-100% đổi 3 màu cảnh báo\n- Giám sát độ ẩm đất & trạng thái bơm thời gian thực\n- Biểu đồ lịch sử độ ẩm Chart.js\n- Lịch tưới, Điều khiển 2 chiều có ACK & Nhật ký phiên tưới"]
        Backend <-->|WSS & REST API| WebDash
    end
```

---

## 2. MA TRẬN TOPIC VÀ DỮ LIỆU ĐỘ ẨM ĐẤT

| Topic | Hướng | QoS | Payload | Chức năng |
|---|---|---|---|---|
| `garden/device01/telemetry` | ESP32 $\to$ Broker | 0 | JSON (`moisture`, `adc`, `pump`, `valve`, `mode`, `rssi`, `ts`) | Truyền dữ liệu độ ẩm đất và trạng thái bơm định kỳ 3s |
| `garden/device01/status` | ESP32 $\to$ Broker | 1 (Retain) | `ONLINE` / `OFFLINE` (LWT) | Trạng thái kết nối phần cứng |
| `garden/device01/command` | Backend $\to$ ESP32 | 1 | JSON (`cmdId`, `command`, `mode`, `ts`) | Lệnh Bật/Tắt bơm, đổi chế độ, dừng khẩn cấp |
| `garden/device01/ack` | ESP32 $\to$ Backend | 1 | JSON (`cmdId`, `status`, `pump`, `mode`, `moisture`, `ts`) | Xác nhận phản hồi sau khi rơ-le đã thực thi lệnh |
| `garden/device01/alert` | ESP32 $\to$ System | 1 | JSON (`code`, `message`, `ts`) | Cảnh báo: `SENSOR_FAULT`, `PUMP_TIMEOUT`, `EMERGENCY_STOP` |

---

## 3. BA TRẠNG THÁI ĐỘ ẨM ĐẤT
1. **Đất khô (Dưới 35%)**:
   - Màn hình OLED hiển thị: `DAT KHO!`.
   - Chế độ AUTO: Kích hoạt rơ-le bật máy bơm nước.
   - Đồng hồ đo độ ẩm (Gauge Chart): Kim xoay về vùng Đỏ ($<35\%$), nhãn cảnh báo `"Đất khô - Cần tưới"`.
2. **Đất trung bình (Từ 35% đến dưới 60%)**:
   - Màn hình OLED hiển thị: `DAT TRUNG BINH`.
   - Giữ nguyên trạng thái bơm hiện tại (tránh đóng/ngắt liên tục).
   - Đồng hồ đo độ ẩm (Gauge Chart): Kim xoay về vùng Vàng ($35\% - 60\%$), nhãn `"Độ ẩm vừa phải"`.
3. **Đất đủ ẩm (Từ 60% trở lên)**:
   - Màn hình OLED hiển thị: `DAT DU AM`.
   - Chế độ AUTO: Tự động ngắt máy bơm.
   - Đồng hồ đo độ ẩm (Gauge Chart): Kim xoay về vùng Xanh lá ($\ge 60\%$), nhãn `"Đất đủ ẩm - Tối ưu"`.
