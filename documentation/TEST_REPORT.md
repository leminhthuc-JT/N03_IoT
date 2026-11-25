# BÁO CÁO KẾT QUẢ KIỂM THỬ HỆ THỐNG N03 (PHẠM VI ĐỘ ẨM ĐẤT)

## 1. TỔNG QUAN KIỂM THỬ
- **Mục tiêu**: Đánh giá toàn diện các luồng đo lường độ ẩm đất, phân loại trạng thái đất, tự động hóa và điều khiển máy bơm có ACK hai chiều.
- **Tỷ lệ đạt**: **10/10 kịch bản PASS (100%)**.

---

## 2. KẾT QUẢ CHI TIẾT 10 KỊCH BẢN KIỂM THỬ

| Mã kịch bản | Tên kịch bản | Điều kiện kiểm thử | Kết quả thực tế | Trạng thái |
|---|---|---|---|:---:|
| **SC-01** | **Đất khô (<35%)** | Độ ẩm mô phỏng giảm về 22% (ADC: 900) | Hệ thống phát hiện Đất khô, tự động kích hoạt rơ-le bật bơm tưới nước | ✅ PASS |
| **SC-02** | **Đất đủ ẩm (>=60%)** | Độ ẩm đạt 68% (ADC: 2780) | Hệ thống phát hiện Đất đủ ẩm, tự động ngắt rơ-le máy bơm an toàn | ✅ PASS |
| **SC-03** | **Điều khiển thủ công & ACK** | Chuyển sang MANUAL $\to$ Gửi lệnh PUMP_ON | Rơ-le đóng, ESP32 phản hồi ACK `SUCCESS` trong **346ms**, cập nhật UI sau khi nhận ACK | ✅ PASS |
| **SC-04** | **ESP32 Mất Wi-Fi (LWT)** | Gián đoạn kết nối của ESP32 | Broker tự động phát bản tin Last Will `OFFLINE`, Backend cập nhật trạng thái thiết bị | ✅ PASS |
| **SC-05** | **Khả năng chịu lỗi Broker** | Broker gián đoạn hoặc mất mạng | Backend Express duy trì tiến trình sống, không bị crash, tự động kết nối lại | ✅ PASS |
| **SC-06** | **Cảm biến bất thường** | ADC vượt miền hợp lệ (ADC = 9999) | Hệ thống phát hiện lỗi cảm biến, tự động ngắt bơm an toàn và ghi nhận cảnh báo `SENSOR_FAULT` | ✅ PASS |
| **SC-07** | **Downlink Timeout** | Lệnh gửi đi không nhận được ACK từ ESP32 | Backend trả về mã lỗi **HTTP 504 Gateway Timeout**, không hiển thị trạng thái thành công giả | ✅ PASS |
| **SC-08** | **Tính bền bỉ của Cơ sở dữ liệu** | Ghi nhận dữ liệu liên tục vào `store.json` | Cấu trúc file JSON toàn vẹn, bảo toàn 100% lịch sử độ ẩm và nhật ký tưới | ✅ PASS |
| **SC-09** | **Chịu tải cao (Stress Burst)** | Phát 100 gói telemetry liên tục | Backend tiếp nhận đủ **100/100 gói tin**, thông lượng đạt **66 gói/giây**, không rò rỉ RAM | ✅ PASS |
| **SC-10** | **Khôi phục cấu hình sau sự cố** | Khởi động lại hệ thống sau khi lưu ngưỡng mới | Ngưỡng độ ẩm đất (Dry: 32%, Wet: 62%) được khôi phục nguyên vẹn | ✅ PASS |

---

## 3. HIỆU NĂNG MẠNG VÀ ĐỘ TRỄ THỰC TẾ TRÊN HIVEMQ CLOUD
- **Gói tin Telemetry (QoS 0)**: Độ trễ RTT trung bình: **246 ms**, tỷ lệ mất gói: **0%**.
- **Gói tin Lệnh & ACK (QoS 1)**: Độ trễ RTT trung bình: **346 - 425 ms**, tỷ lệ mất gói: **0%**.
- **Thời gian tự động Reconnect**: **600 ms**.
