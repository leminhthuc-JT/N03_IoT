# HƯỚNG DẪN MÔ PHỎNG VÀ KIỂM THỬ HỆ THỐNG (SIMULATION & TESTING)

Dự án N03 tích hợp bộ Simulation Engine tự động kiểm thử 10 kịch bản nghiêm ngặt (SC-01 đến SC-10) theo tiêu chuẩn hệ thống IoT công nghiệp.

---

## 1. DANH SÁCH 10 KỊCH BẢN KIỂM THỬ

| Mã | Tên kịch bản | Điều kiện kích hoạt | Kỳ vọng đầu ra | Tiêu chuẩn đạt |
|---|---|---|---|---|
| **SC-01** | Đất khô ($<35\%$) | Độ ẩm giảm dưới ngưỡng 35% | Hệ thống tự động bật máy bơm tưới nước | Relay đóng (GPIO26=HIGH), LED đỏ sáng, gửi cảnh báo AUTO_PUMP_ON |
| **SC-02** | Đất đủ ẩm ($\ge 60\%$) | Độ ẩm đạt ngưỡng 60% trở lên | Tự động ngắt máy bơm an toàn | Relay ngắt (GPIO26=LOW), LED tắt, lưu nhật ký phiên tưới |
| **SC-03** | Điều khiển thủ công | Gửi lệnh bật/tắt ở MANUAL | ESP32 đổi trạng thái và gửi ACK thành công | Round-trip latency $< 500$ms, ACK status `SUCCESS` |
| **SC-04** | Mất kết nối Wi-Fi | Thiết bị ngắt kết nối đột ngột | Broker phát LWT `OFFLINE`, Backend cập nhật | Thiết bị chuyển trạng thái `OFFLINE` |
| **SC-05** | Mất kết nối MQTT Broker | Broker không phản hồi / đứt mạng | Backend duy trì sống, tự động reconnect | Tiến trình server không bị crash |
| **SC-06** | Cảm biến bất thường | Giá trị ADC ngoài dải $[0, 4095]$ | Ngắt bơm an toàn, phát cảnh báo `SENSOR_FAULT` | Không tưới sai dữ liệu hỏng |
| **SC-07** | Downlink Timeout | Thiết bị không phản hồi ACK | Backend trả về HTTP 504 Timeout | Không giả lập thành công khi mất ACK |
| **SC-08** | Bền bỉ Cơ sở dữ liệu | File lưu trữ `store.json` tự động sync | Dữ liệu không bị hỏng cấu trúc | JSON valid, đầy đủ lịch sử |
| **SC-09** | Tải cao (Stress Test) | Burst 100 gói telemetry liên tục | Backend tiếp nhận và lưu trữ trọn vẹn | Tỷ lệ nhận $\ge 95\%$, thông lượng cao |
| **SC-10** | Khôi phục sau sự cố | Khởi động lại hệ thống | Cấu hình ngưỡng được bảo toàn | Giữ nguyên các thông số đã lưu |

---

## 2. HƯỚNG DẪN CHẠY BỘ KIỂM THỬ TỰ ĐỘNG

Mở PowerShell tại thư mục gốc của dự án:

```powershell
# Chạy bộ kiểm thử 10 kịch bản tự động
$env:NODE_PATH = "D:\hk7\InternetOfThings\DoAn\backend\node_modules"
node "D:\hk7\InternetOfThings\DoAn\simulation-engine\scenario_runner.js"

# Chạy bài đo hiệu năng mạng (QoS, Latency, Loss, Reconnect)
node "D:\hk7\InternetOfThings\DoAn\simulation-engine\network_benchmark.js"
```

Kết quả kiểm thử được tự động ghi nhận và cập nhật vào:
- `documentation/TEST_REPORT_SCENARIOS.md`
- `documentation/NETWORK_TEST_REPORT.md`
