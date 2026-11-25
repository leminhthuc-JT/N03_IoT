# HƯỚNG DẪN TÍCH HỢP BLYNK IOT – N03
## (Bắt buộc thực hiện thủ công – cần tài khoản Blynk)

---

## Bước 1: Tạo tài khoản Blynk

1. Truy cập: https://blynk.cloud
2. Nhấn **Sign Up** → đăng ký bằng email
3. Xác nhận email

---

## Bước 2: Tạo Template

1. Vào **Developer Zone → My Templates → New Template**
2. Điền:
   - **Template Name:** `GreenPulse`
   - **Hardware:** `ESP32`
   - **Connection Type:** `WiFi`
3. Nhấn **Done**
4. Copy **TEMPLATE_ID** (dạng `TMPLxxxxxxxxx`)

---

## Bước 3: Tạo Datastreams

Trong Template → **Datastreams** → **New Datastream → Virtual Pin**:

| Virtual Pin | Name | Data Type | Min | Max | Default | Đơn vị |
|---|---|---|---|---|---|---|
| V0 | Soil Moisture | Integer | 0 | 100 | 0 | % |
| V1 | Mode Switch | Integer | 0 | 1 | 0 | (0=AUTO, 1=MANUAL) |
| V2 | Pump Status | Integer | 0 | 1 | 0 | (0=OFF, 1=ON) |
| V3 | Pump Button | Integer | 0 | 1 | 0 | |
| V4 | Connection LED | Integer | 0 | 255 | 0 | |
| V5 | Alert Text | String | — | — | — | |

---

## Bước 4: Thiết kế Dashboard

Trong Template → **Web Dashboard** → thêm các widget:

| Widget | Pin | Cài đặt |
|---|---|---|
| Gauge | V0 | Min:0, Max:100, Title: "Độ ẩm đất (%)" |
| Chart | V0 | Line chart, 1 hour |
| Switch | V1 | Label ON: MANUAL, Label OFF: AUTO |
| Button | V3 | Mode: PUSH, Label: "BẬT BƠM" |
| LED | V2 | Color: Green, Label: "Trạng thái bơm" |
| LED | V4 | Color: Green, Label: "Kết nối MQTT" |
| Label | V5 | Label: "⚠ Thông báo" |

---

## Bước 5: Tạo Device

1. Vào **Devices → New Device → From Template**
2. Chọn template `GreenPulse`
3. Đặt tên device: `GreenPulse_ESP32`
4. Nhấn **Create**
5. Copy **Auth Token** (dạng chuỗi 32 ký tự)

---

## Bước 6: Điền thông tin vào config.h

Mở file `D:\hk7\InternetOfThings\DoAn\config\config.h`:

```cpp
#define BLYNK_TEMPLATE_ID   "TMPLxxxxxxxxx"   // ← dán TEMPLATE_ID
#define BLYNK_TEMPLATE_NAME "GreenPulse"
#define BLYNK_AUTH_TOKEN    "xxxxxxxxxxx..."   // ← dán Auth Token
```

---

## Bước 7: Nạp firmware lên Wokwi

1. Mở Wokwi project: https://wokwi.com/projects/478329239930352641
2. Thay toàn bộ nội dung `sketch.ino` bằng `firmware/sketch_v2.ino`
3. Thay `diagram.json` bằng nội dung `simulation/diagram_v2.json`
4. Thay `libraries.txt` bằng nội dung `simulation/libraries_v2.txt`

> **Lưu ý Wokwi:** Blynk hoạt động qua internet trong Wokwi nếu dùng
> `Wokwi-GUEST` WiFi. Token thật sẽ kết nối đến blynk.cloud thực.

---

## Bước 8: Import Node-RED flows

1. Mở Node-RED (thường tại http://localhost:1880)
2. Menu (☰) → **Import**
3. Chọn file `node-red/flows_v2.json`
4. Nhấn **Import**
5. Nhấn **Deploy**

---

## Bước 9: Kiểm tra hoạt động End-to-End

### Luồng dữ liệu đầy đủ:

```
[Wokwi – ESP32]
      ↓ MQTT Publish (garden/demo/telemetry)
[HiveMQ Broker]
      ↓ Subscribe
[Node-RED]
  ├── Dashboard (gauge, chart, text)
  ├── Automation Rule 1 (auto pump)
  ├── Automation Rule 2 (offline detect)
  └── Event Log (file CSV + .log)
      ↓ MQTT cmd/pump, cmd/mode
[ESP32] ← nhận lệnh, cập nhật relay

[Blynk App / Web]
  ↔ trực tiếp với ESP32 qua Blynk cloud
     V0: hiển thị độ ẩm
     V1: switch AUTO/MANUAL
     V3: nút bật bơm
     V4: LED kết nối
     V5: cảnh báo
```

---

## Checklist xác nhận

- [ ] Blynk template tạo xong, có TEMPLATE_ID
- [ ] Datastreams V0–V5 đã tạo
- [ ] Auth Token đã copy vào config.h
- [ ] Wokwi chạy được, Serial Monitor thấy "Dang ket noi WiFi..."
- [ ] MQTT broker nhận telemetry (kiểm tra bằng MQTTX)
- [ ] Node-RED Dashboard thấy gauge và chart cập nhật
- [ ] Nhấn Toggle Mode → ESP32 nhận lệnh mode
- [ ] Nhấn BẬT BƠM ở chế độ MANUAL → LED đỏ GPIO25 sáng
- [ ] Automation Rule 1 gửi lệnh bơm khi độ ẩm < 35%
- [ ] Automation Rule 2 cảnh báo offline sau 60 giây không có data
