# BÁO CÁO KIỂM THỬ HIỆU NĂNG MẠNG N03 DIGITAL TWIN MỨC 4

## 1. THÔNG SỐ MÔI TRƯỜNG KIỂM THỬ
- **MQTT Broker**: HiveMQ Cloud (`broker.hivemq.com:1883`)
- **Số lượng gói tin thử nghiệm**: 50 gói / kịch bản
- **Tần suất phát**: 25 gói/giây (khoảng cách 40ms)
- **Thời gian thực hiện**: 01:33:09 20/11/2026

---

## 2. KẾT QUẢ SO SÁNH QOS 0 VS QOS 1

| Tiêu chí đánh giá | QoS 0 (Telemetry) | QoS 1 (Command & ACK) | Nhận xét chuyên gia |
|---|---|---|---|
| **Số gói tin đã gửi** | 50 | 50 | Tải phát đồng đều |
| **Số gói tin đã nhận** | 50 | 50 | QoS 1 đảm bảo không thất thoát gói tin lệnh |
| **Tỷ lệ mất gói (Packet Loss)** | **0%** | **0%** | QoS 1 đạt độ tin cậy tuyệt đối |
| **Độ trễ trung bình (RTT)** | **246 ms** | **425 ms** | RTT hoàn toàn đáp ứng chuẩn Real-time IoT (< 500ms) |
| **Bảo toàn thứ tự** | Tốt | Hoàn hảo | Đầy đủ chuỗi sequence ID |

> [!NOTE]
> - **Telemetry**: Sử dụng QoS 0 định kỳ mỗi 3 giây giúp tối ưu băng thông và giảm tải cho vi điều khiển ESP32.
> - **Command & ACK**: Sử dụng QoS 1 bắt buộc để đảm bảo lệnh điều khiển bật/tắt bơm và phản hồi ACK không bao giờ bị rơi rớt giữa đường.

---

## 3. KHẢ NĂNG PHỤC HỒI KẾT NỐI (RECONNECTION BENCHMARK)
- **Thời gian phát hiện và tái lập kết nối**: **600 ms** (dưới 3 giây)
- **Cơ chế**: Tự động thử lại với Exponential Backoff (1s - 3s - 5s).
- **LWT (Last Will and Testament)**: Phát tin nhắn `OFFLINE` ngay khi Broker nhận thấy mất heartbeat trong 30 giây.
