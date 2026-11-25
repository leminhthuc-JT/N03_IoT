# BÁO CÁO KỸ THUẬT ĐỒ ÁN
# N03 – HỆ THỐNG GIÁM SÁT VÀ TƯỚI CÂY TỰ ĐỘNG ỨNG DỤNG INTERNET OF THINGS

---

## MỤC LỤC

1. [Giới thiệu](#1-giới-thiệu)
2. [Mục tiêu và Phạm vi](#2-mục-tiêu-và-phạm-vi)
3. [Kiến trúc Hệ thống](#3-kiến-trúc-hệ-thống)
4. [Thiết kế Chi tiết](#4-thiết-kế-chi-tiết)
5. [Triển khai và Mô phỏng](#5-triển-khai-và-mô-phỏng)
6. [Giao diện Người dùng](#6-giao-diện-người-dùng)
7. [Kiểm thử](#7-kiểm-thử)
8. [Kết luận và Hướng phát triển](#8-kết-luận-và-hướng-phát-triển)

---

## 1. Giới thiệu

### 1.1 Đặt vấn đề

Trong nông nghiệp hiện đại, việc giám sát và quản lý tưới tiêu thủ công gặp nhiều hạn chế:
- Khó theo dõi liên tục tình trạng độ ẩm đất
- Lãng phí nước do tưới không đúng thời điểm
- Không có cảnh báo khi hệ thống gặp sự cố
- Thiếu dữ liệu lịch sử để phân tích

### 1.2 Giải pháp

N03 là hệ thống IoT giám sát độ ẩm đất và tự động tưới cây, cho phép:
- Giám sát độ ẩm đất **thời gian thực** từ xa
- **Tự động** bật/tắt máy bơm dựa trên ngưỡng
- **Điều khiển thủ công** từ nhiều giao diện
- **Cảnh báo** khi có tình huống bất thường
- **Ghi nhận** lịch sử hoạt động

### 1.3 Phạm vi đồ án

- Mô phỏng hoàn toàn trên Wokwi (không cần phần cứng thật)
- Sử dụng MQTT broker công cộng (HiveMQ)
- 3 giao diện người dùng: Web Dashboard, Node-RED Dashboard, Blynk IoT

---

## 2. Mục tiêu và Phạm vi

### 2.1 Mục tiêu chính

| # | Mục tiêu | Trạng thái |
|---|---|---|
| 1 | Đọc dữ liệu độ ẩm đất từ cảm biến | ✅ Hoàn thành |
| 2 | Xử lý và đánh giá độ ẩm (lọc nhiễu, phân loại) | ✅ Hoàn thành |
| 3 | Điều khiển máy bơm tự động theo ngưỡng | ✅ Hoàn thành |
| 4 | Điều khiển máy bơm thủ công từ xa | ✅ Hoàn thành |
| 5 | Hỗ trợ chế độ AUTO/MANUAL | ✅ Hoàn thành |
| 6 | Truyền dữ liệu hai chiều bằng MQTT | ✅ Hoàn thành |
| 7 | Xử lý nghiệp vụ bằng Node-RED | ✅ Hoàn thành |
| 8 | Hiển thị và điều khiển qua giao diện Web | ✅ Hoàn thành |
| 9 | Cảnh báo tình huống bất thường | ✅ Hoàn thành |
| 10 | Ghi nhận nhật ký hoạt động | ✅ Hoàn thành |
| 11 | Tự động kết nối lại khi mất mạng | ✅ Hoàn thành |
| 12 | Kiểm thử toàn bộ luồng End-to-End | ✅ Hoàn thành |

### 2.2 Yêu cầu phi chức năng

- Độ trễ telemetry: < 1 giây (trên mạng ổn định)
- Chu kỳ gửi dữ liệu: 5 giây / lần
- Safety timeout: Bơm tự tắt sau 10 phút
- Offline detection: Phát hiện mất kết nối trong 30-60 giây
- Giao diện: Responsive, hỗ trợ desktop và mobile

---

## 3. Kiến trúc Hệ thống

### 3.1 Mô hình 4 Tầng IoT

```
┌────────────────────────────────────────────────────────────┐
│  TẦNG 4 – APPLICATION                                      │
│  Web Dashboard │ Blynk IoT │ Node-RED Dashboard            │
├────────────────────────────────────────────────────────────┤
│  TẦNG 3 – MIDDLEWARE                                        │
│  Node-RED: Parse JSON, Auto Rules, Event Log, Dashboard    │
├────────────────────────────────────────────────────────────┤
│  TẦNG 2 – NETWORK                                          │
│  WiFi → Internet → HiveMQ MQTT Broker                      │
│  Topics: telemetry, status, cmd/mode, cmd/pump, alert      │
├────────────────────────────────────────────────────────────┤
│  TẦNG 1 – SENSING / ACTUATOR                               │
│  ESP32 + Soil Moisture Sensor + Relay + OLED + LED         │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Sơ đồ Thành phần

| Tầng | Thành phần | Công nghệ | Vai trò |
|---|---|---|---|
| 1 | ESP32 DevKit V1 | Arduino C++ | Vi điều khiển chính |
| 1 | Soil Moisture Sensor | Potentiometer (Wokwi) | Đo độ ẩm đất |
| 1 | Relay Module | GPIO 26 | Điều khiển máy bơm |
| 1 | OLED SSD1306 | I2C (GPIO 21, 22) | Hiển thị local |
| 1 | LED Indicator | GPIO 25 | Chỉ thị trạng thái bơm |
| 2 | HiveMQ | Public MQTT Broker | Trung gian truyền thông |
| 2 | ESP32 WiFi | Built-in | Kết nối Internet |
| 3 | Node-RED | Node.js runtime | Xử lý nghiệp vụ |
| 3 | FlowFuse Dashboard | v1.33.0 | Giao diện Node-RED |
| 4 | Web Dashboard | HTML/CSS/JS + MQTT.js | Giao diện web |
| 4 | Blynk IoT | Cloud platform | Giao diện mobile |

---

## 4. Thiết kế Chi tiết

### 4.1 Firmware ESP32 (Tầng 1)

#### Sơ đồ chân GPIO

| GPIO | Linh kiện | Chức năng |
|---|---|---|
| 34 | Soil Moisture Sensor | ADC Input (12-bit) |
| 26 | Relay Module | Digital Output (Pump) |
| 25 | LED | Digital Output (Indicator) |
| 21 | OLED SDA | I2C Data |
| 22 | OLED SCL | I2C Clock |

#### Thuật toán xử lý cảm biến

```
1. Đọc ADC 12-bit từ GPIO 34 (0 – 4095)
2. Thêm vào buffer 5 mẫu (Moving Average)
3. Tính trung bình: filtered_adc = sum(buffer) / 5
4. Chuyển đổi: moisture_pct = map(filtered_adc, 4095, 0, 0, 100)
5. Kiểm tra hợp lệ: 0 ≤ moisture_pct ≤ 100
6. Nếu không hợp lệ → đánh dấu sensor error
```

#### Logic điều khiển AUTO

```
Nếu (mode == AUTO):
    Nếu (moisture < 35%):
        Bật relay (GPIO 26 = HIGH)
        Bật LED (GPIO 25 = HIGH)
    Nếu (moisture ≥ 60%):
        Tắt relay (GPIO 26 = LOW)
        Tắt LED (GPIO 25 = LOW)
    Nếu (pump_on_time > 10 phút):
        Tắt bơm (Safety Timeout)
```

#### Thư viện sử dụng

| Thư viện | Phiên bản | Mục đích |
|---|---|---|
| WiFi.h | Built-in | Kết nối WiFi |
| PubSubClient | Latest | MQTT Client |
| ArduinoJson | v7 | Parse/Build JSON |
| Adafruit_SSD1306 | Latest | OLED Display |
| Adafruit_GFX | Latest | Graphics primitives |
| BlynkSimpleEsp32 | Latest | Blynk IoT (tùy chọn) |

### 4.2 Giao thức MQTT (Tầng 2)

#### Danh sách Topic

| Topic | Hướng | QoS | Payload | Mô tả |
|---|---|---|---|---|
| `garden/demo/telemetry` | UP | 0 | JSON | Dữ liệu cảm biến |
| `garden/demo/status` | UP | 1 | "ONLINE"/"OFFLINE" | LWT status |
| `garden/demo/cmd/mode` | DOWN | 1 | "AUTO"/"MANUAL" | Lệnh chế độ |
| `garden/demo/cmd/pump` | DOWN | 1 | "ON"/"OFF" | Lệnh bơm |
| `garden/demo/alert` | UP | 1 | String | Cảnh báo |

#### Payload Telemetry (JSON)

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

### 4.3 Node-RED Middleware (Tầng 3)

#### Danh sách Flow

| Tab | Nodes | Chức năng |
|---|---|---|
| N03 – Main | ~25 | Parse telemetry, Dashboard widgets |
| Automation Rules | ~15 | Auto pump logic, Offline detector |
| Event Log | ~14 | Subscribe all, Format, Write CSV |

#### Automation Rules

**Rule 1 – Auto Pump:**
- Input: `garden/demo/telemetry` (JSON)
- Logic: Nếu `mode == "AUTO"` và `moisture < 35%` → publish `ON`
- Logic: Nếu `mode == "AUTO"` và `moisture >= 60%` → publish `OFF`
- Output: `garden/demo/cmd/pump`

**Rule 2 – Offline Detection:**
- Inject mỗi 30 giây
- So sánh timestamp cuối cùng với hiện tại
- Nếu > 60 giây → publish cảnh báo

### 4.4 Web Dashboard (Tầng 4)

#### Công nghệ

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Layout | HTML5 | Cấu trúc trang |
| Styling | CSS3 (Custom) | Cyber-Garden Dark Theme |
| Logic | JavaScript ES6+ | MQTT engine, UI updates |
| Charts | Chart.js | Biểu đồ real-time |
| MQTT | MQTT.js v5.3.5 | WebSocket client |
| Icons | Font Awesome 6.5 | Icon set |
| Fonts | Plus Jakarta Sans, JetBrains Mono | Typography |

#### Tính năng Dashboard

| # | Tính năng | Mô tả |
|---|---|---|
| 1 | SVG Gauge | Đồng hồ đo độ ẩm (0-100%) với kim xoay |
| 2 | Real-time Chart | Biểu đồ 25 điểm cập nhật liên tục |
| 3 | Metric Cards | 4 card: Moisture, Pump, Mode, Network |
| 4 | Mode Control | Nút AUTO/MANUAL với segmented control |
| 5 | Pump Control | Nút BẬT/TẮT bơm (khóa khi AUTO) |
| 6 | E-STOP | Nút dừng khẩn cấp |
| 7 | Event Log | Console real-time với màu theo loại |
| 8 | CSV Export | Xuất nhật ký sang file CSV |
| 9 | Settings Modal | Cấu hình MQTT broker/topics |
| 10 | Toast Notifications | Thông báo popup góc phải |
| 11 | Offline Detection | Tự phát hiện ESP32 mất kết nối (30s) |
| 12 | Live Clock | Đồng hồ thời gian thực |

---

## 5. Triển khai và Mô phỏng

### 5.1 Môi trường mô phỏng

| Thành phần | Nền tảng |
|---|---|
| ESP32 + Sensors | Wokwi Online Simulator |
| MQTT Broker | HiveMQ Public Cloud |
| Node-RED | Local (localhost:1880) |
| Web Dashboard | Local HTTP Server (localhost:5500) |

### 5.2 Wokwi Project

- **URL:** https://wokwi.com/projects/478329239930352641
- **Files:** sketch_v2.ino, diagram_v2.json, libraries_v2.txt
- **Mô phỏng:** Potentiometer thay thế cảm biến độ ẩm đất

### 5.3 Hướng dẫn triển khai

Xem chi tiết: [SYSTEM_RUN_GUIDE.md](./SYSTEM_RUN_GUIDE.md)

**Tóm tắt:**
1. Paste firmware v2 vào Wokwi → Start Simulation
2. `node-red` → Import flows_v2.json → Deploy
3. Mở `web-dashboard/index.html` qua HTTP server

---

## 6. Giao diện Người dùng

### 6.1 Web Dashboard

**Theme:** Cyber-Garden Dark (nền tối #090d16, accent xanh lá #10b981)

**Layout:**
- **Header:** Logo, Live Clock, ESP32 Status, MQTT Status, Settings
- **Metric Cards (4 cột):** Độ ẩm, Máy bơm, Chế độ, Mạng
- **Main Content (2 cột):**
  - Trái: SVG Gauge + Real-time Chart
  - Phải: Bảng điều khiển + Nhật ký sự kiện
- **Footer:** Thông tin dự án

### 6.2 Node-RED Dashboard

- Gauge hiển thị độ ẩm
- Chart theo thời gian thực
- Text status
- Button điều khiển mode/pump

### 6.3 Blynk IoT

| Datastream | Pin | Widget | Chức năng |
|---|---|---|---|
| Moisture | V0 | Gauge | Hiển thị độ ẩm |
| Mode | V1 | Switch | Chuyển AUTO/MANUAL |
| Pump Status | V2 | LED | Hiển thị trạng thái bơm |
| Pump Control | V3 | Button | Bật/tắt bơm |
| System Status | V4 | Value | Trạng thái hệ thống |
| RSSI | V5 | Value | Cường độ WiFi |

---

## 7. Kiểm thử

### 7.1 Danh sách Kịch bản

Tổng cộng **16 kịch bản kiểm thử** (TC-01 đến TC-16) bao phủ:

| Nhóm | Kịch bản | Số TC |
|---|---|---|
| Khởi động & Kết nối | WiFi, MQTT, Telemetry | 3 |
| Hiển thị | OLED | 1 |
| Chế độ AUTO | Bật bơm, Tắt bơm | 2 |
| Chế độ MANUAL | Chuyển mode, Bơm thủ công, Khóa nút | 3 |
| An toàn | E-STOP | 1 |
| Mạng | Offline detection, Reconnect | 2 |
| Middleware | Node-RED Dashboard, Auto pump | 2 |
| Ứng dụng | CSV export, MQTT settings | 2 |

Xem chi tiết: [TEST_REPORT.md](./TEST_REPORT.md)

### 7.2 Kết quả mong đợi

Tất cả 16 kịch bản đều có kết quả mong đợi rõ ràng, có thể xác minh bằng:
- Serial Monitor (Wokwi)
- MQTTX (debug MQTT)
- Node-RED Debug panel
- Web Dashboard UI
- Screenshots / Video

---

## 8. Kết luận và Hướng phát triển

### 8.1 Kết quả đạt được

- ✅ Hệ thống IoT 4 tầng hoàn chỉnh
- ✅ 12/12 mục tiêu chức năng đã triển khai
- ✅ 3 giao diện người dùng (Web, Node-RED, Blynk)
- ✅ Mô phỏng hoàn toàn trên Wokwi (không cần phần cứng)
- ✅ Tài liệu kỹ thuật đầy đủ
- ✅ 16 kịch bản kiểm thử End-to-End

### 8.2 Hạn chế

- Sử dụng MQTT broker công cộng (không bảo mật, không kiểm soát)
- Chưa có cơ sở dữ liệu lưu trữ lịch sử dài hạn
- Chưa có xác thực người dùng trên Web Dashboard
- Mô phỏng trên Wokwi có giới hạn so với phần cứng thật

### 8.3 Hướng phát triển

| # | Hướng phát triển | Mô tả |
|---|---|---|
| 1 | MQTT Broker riêng | Deploy Mosquitto hoặc EMQX với TLS |
| 2 | Database | Thêm InfluxDB + Grafana để lưu và phân tích |
| 3 | Machine Learning | Dự đoán nhu cầu tưới dựa trên lịch sử |
| 4 | Multi-zone | Quản lý nhiều vùng tưới với nhiều cảm biến |
| 5 | Thời tiết | Tích hợp API thời tiết để tối ưu lịch tưới |
| 6 | Phần cứng thật | Deploy trên ESP32 thật với cảm biến thật |
| 7 | Mobile App | Phát triển app native (React Native / Flutter) |
| 8 | OTA Update | Cập nhật firmware từ xa qua WiFi |

---

## Phụ lục

### A. Danh sách File

| File | Kích thước | Mô tả |
|---|---|---|
| `firmware/sketch_v2.ino` | 18,069 bytes | Firmware ESP32 v2 |
| `simulation/diagram_v2.json` | 2,391 bytes | Sơ đồ Wokwi v2 |
| `simulation/libraries_v2.txt` | 166 bytes | Danh sách thư viện |
| `node-red/flows_v2.json` | 33,247 bytes | Node-RED flows v2 |
| `web-dashboard/index.html` | 17,234 bytes | Web Dashboard HTML |
| `web-dashboard/style.css` | 24,261 bytes | CSS Theme |
| `web-dashboard/app.js` | 24,170 bytes | JavaScript Engine |

### B. Tài liệu tham khảo

1. ESP32 Arduino Core Documentation
2. HiveMQ MQTT Broker Documentation
3. Node-RED Official Documentation
4. Chart.js Documentation
5. MQTT.js Library
6. Blynk IoT Documentation
7. Wokwi ESP32 Simulator

---

*Báo cáo này là một phần của đồ án N03 IoT – Hệ thống Giám sát và Tưới cây Tự động ứng dụng Internet of Things.*
