# N03 IoT – HƯỚNG DẪN CHẠY TOÀN BỘ HỆ THỐNG

> Hướng dẫn từng bước để khởi động và chạy toàn bộ hệ thống N03 IoT từ Wokwi → MQTT → Node-RED → Web Dashboard.

---

## Bước 0: Chuẩn Bị Phần Mềm

### Phần mềm cần cài đặt:

| # | Phần mềm | Mục đích | Link |
|---|---|---|---|
| 1 | **Node.js** (v18+) | Chạy Node-RED | https://nodejs.org |
| 2 | **Node-RED** | Middleware xử lý MQTT | `npm install -g node-red` |
| 3 | **Trình duyệt** (Chrome/Edge) | Wokwi + Web Dashboard | - |
| 4 | **MQTTX** (tùy chọn) | Debug MQTT messages | https://mqttx.app |

### Cài đặt Node-RED Dashboard:
```bash
cd ~/.node-red
npm install @flowfuse/node-red-dashboard
```

---

## Bước 1: Khởi Động Wokwi (Tầng 1 – ESP32)

1. **Mở trình duyệt** và truy cập Wokwi project:
   ```
   https://wokwi.com/projects/478329239930352641
   ```

2. **Cập nhật firmware:**
   - Mở file `sketch.ino` trên Wokwi
   - Xóa toàn bộ nội dung cũ
   - Dán nội dung từ file `firmware/sketch_v2.ino`

3. **Cập nhật sơ đồ mạch:**
   - Tab `diagram.json` trên Wokwi
   - Thay nội dung bằng file `simulation/diagram_v2.json`

4. **Cập nhật thư viện:**
   - Tab `libraries.txt` trên Wokwi
   - Thay nội dung bằng file `simulation/libraries_v2.txt`

5. **Chạy mô phỏng:**
   - Nhấn nút ▶ **Start Simulation**
   - Kiểm tra Serial Monitor:
     - `WiFi connected`
     - `MQTT connected`
     - `[SENSOR]` logs mỗi 5 giây

6. **Thử nghiệm cảm biến:**
   - Vặn **potentiometer** trên sơ đồ Wokwi
   - Giá trị moisture thay đổi trên OLED

---

## Bước 2: Khởi Động Node-RED (Tầng 3 – Middleware)

1. **Mở Terminal / Command Prompt:**
   ```bash
   node-red
   ```

2. **Mở trình duyệt:**
   ```
   http://localhost:1880
   ```

3. **Import flows:**
   - Menu ☰ → **Import** → **Clipboard**
   - Dán nội dung file `node-red/flows_v2.json`
   - Nhấn **Import**

4. **Deploy:**
   - Nhấn nút **Deploy** (góc trên phải)
   - Kiểm tra không có lỗi

5. **Mở Dashboard:**
   ```
   http://localhost:1880/dashboard
   ```

6. **Kiểm tra:**
   - Gauge hiển thị giá trị moisture từ ESP32
   - Chart cập nhật theo thời gian thực
   - Nút Mode và Pump hoạt động

---

## Bước 3: Mở Web Dashboard (Tầng 4 – Application)

### Cách 1: Dùng Live Server (VS Code)
1. Mở thư mục `web-dashboard/` trong VS Code
2. Click chuột phải `index.html` → **Open with Live Server**

### Cách 2: Dùng Python HTTP Server
```bash
cd D:\hk7\InternetOfThings\DoAn\web-dashboard
python -m http.server 5500
```
Mở trình duyệt: `http://localhost:5500`

### Cách 3: Dùng file BAT
- Double-click file `web-dashboard/run_dashboard.bat`

### Kiểm tra Web Dashboard:
- **MQTT pill** chuyển xanh "Connected"
- **ESP32 pill** chuyển xanh "ONLINE" (khi Wokwi đang chạy)
- **Gauge** hiển thị giá trị moisture
- **Chart** vẽ biểu đồ
- **Log** hiển thị các sự kiện MQTT
- **Nút điều khiển** hoạt động (Mode, Pump, E-STOP)

---

## Bước 4: Kiểm Tra MQTT (Tầng 2 – Network)

### Dùng MQTTX (tùy chọn):

1. **Tạo kết nối mới:**
   - Host: `broker.hivemq.com`
   - Port: `1883`
   - Protocol: MQTT

2. **Subscribe các topic:**
   ```
   garden/demo/telemetry
   garden/demo/status
   garden/demo/cmd/mode
   garden/demo/cmd/pump
   garden/demo/alert
   ```

3. **Gửi lệnh test:**
   - Publish `MANUAL` to `garden/demo/cmd/mode`
   - Publish `ON` to `garden/demo/cmd/pump`
   - Publish `OFF` to `garden/demo/cmd/pump`
   - Publish `AUTO` to `garden/demo/cmd/mode`

---

## Bước 5: Cấu Hình Blynk IoT (Tùy chọn)

> Xem hướng dẫn chi tiết: `documentation/BLYNK_SETUP_GUIDE.md`

1. Tạo tài khoản Blynk: https://blynk.cloud
2. Tạo Template → Datastreams V0–V5
3. Tạo Device → Lấy Auth Token
4. Cập nhật `config/config.h` với Auth Token
5. Cập nhật firmware trên Wokwi (thêm Blynk token)
6. Deploy lại

---

## Sơ Đồ Thứ Tự Khởi Động

```
  ① Wokwi (ESP32)        ② Node-RED           ③ Web Dashboard
  ─────────────────       ─────────────        ──────────────────
  Start Simulation   →    node-red         →   Open index.html
  Serial: Connected       Import flows         MQTT: Connected
  Telemetry publish       Deploy                ESP32: ONLINE
       │                     │                     │
       └──────── MQTT ───────┘─────── MQTT ────────┘
                    │
              HiveMQ Broker
           broker.hivemq.com
```

> **Lưu ý:** Thứ tự khởi động không bắt buộc. Mỗi thành phần hoạt động độc lập và tự kết nối lại khi các thành phần khác sẵn sàng.

---

## Khắc Phục Sự Cố Thường Gặp

| Vấn đề | Nguyên nhân | Giải pháp |
|---|---|---|
| Web Dashboard không kết nối MQTT | Port 8884 bị firewall chặn | Thử đổi port sang 8000 (WS) trong Settings |
| ESP32 không kết nối WiFi | Wokwi dùng WiFi ảo | Kiểm tra simulation đang chạy, WiFi Wokwi luôn thành công |
| Node-RED không nhận telemetry | Chưa import flow hoặc chưa Deploy | Import `flows_v2.json` và Deploy |
| Gauge Web Dashboard không cập nhật | ESP32 chưa gửi telemetry | Kiểm tra Wokwi đang chạy, chờ 5 giây |
| Nút bơm bị khóa | Đang ở chế độ AUTO | Chuyển sang MANUAL để mở khóa |
| MQTT messages bị trùng | Nhiều client dùng cùng client ID | Mỗi Web Dashboard tab tạo client ID ngẫu nhiên, không ảnh hưởng |

---

*Tài liệu này là một phần của đồ án N03 IoT – Hệ thống Giám sát và Tưới cây Tự động.*
