# BẢNG TIÊU CHÍ NGHIỆM THU HỆ THỐNG N03 SMART GARDEN

| STT | Tiêu chí nghiệm thu kỹ thuật | Hiện trạng thực tế triển khai | Trạng thái |
|---|---|---|:---:|
| 1 | **ESP32 đọc cảm biến và gửi telemetry** | Firmware ESP32 đọc cảm biến độ ẩm đất Analog qua chân ADC GPIO34, đóng gói bản tin JSON gửi định kỳ mỗi 3s lên topic `garden/device01/telemetry`. | ✅ ĐẠT |
| 2 | **Lọc số & Thuật toán vùng trễ Hysteresis** | Thuật toán lọc trung bình trượt 5 mẫu Moving Average triệt tiêu gai nhiễu ADC; giải thuật điều khiển vùng trễ 35% - 60% chống rung rơ-le. | ✅ ĐẠT |
| 3 | **Cơ chế ngắt an toàn Watchdog** | Máy bơm tự động ngắt sau tối đa 10 phút bơm liên tục để bảo vệ động cơ và chống úng rễ cây. | ✅ ĐẠT |
| 4 | **Node-RED xử lý sự kiện và luật tự động** | Flow Node-RED tiếp nhận, lọc dữ liệu, kiểm tra các điều kiện cảnh báo bất thường và chuyển tiếp thông điệp. | ✅ ĐẠT |
| 5 | **Backend tiếp nhận và quản lý dữ liệu** | Máy chủ Node.js/Express tiếp nhận MQTT qua HiveMQ Cloud, cung cấp RESTful API và quản lý kênh WebSocket hai chiều. | ✅ ĐẠT |
| 6 | **Web Dashboard & Mobile PWA thời gian thực** | Giao diện Web SPA chuẩn PWA kết nối WebSocket độ trễ dưới 20ms, hiển thị Đồng hồ đo độ ẩm (Gauge Chart) 0-100% với kim xoay mượt mà và đổi màu theo 3 trạng thái. | ✅ ĐẠT |
| 7 | **Điều khiển thủ công hai chiều** | Hỗ trợ chuyển đổi chế độ AUTO/MANUAL, nút Bật/Tắt bơm và nút Dừng khẩn cấp (Emergency Stop) từ xa. | ✅ ĐẠT |
| 8 | **ESP32 nhận lệnh và chuyển mạch rơ-le** | Vi điều khiển nhận lệnh trên `garden/device01/command`, chuyển trạng thái Relay GPIO26 tức thời. | ✅ ĐẠT |
| 9 | **Cơ chế phản hồi ACK có đối soát** | ESP32 xuất bản tin xác nhận lên `garden/device01/ack` mang đúng mã `cmdId` của lệnh vừa nhận kèm trạng thái vật lý thực tế của bơm. | ✅ ĐẠT |
| 10 | **Xử lý Timeout 504 khi mất thiết bị** | Backend chờ ACK trong 4 giây; nếu thiết bị mất kết nối sẽ trả mã lỗi HTTP 504 Gateway Timeout, ngăn chặn việc báo trạng thái ảo. | ✅ ĐẠT |
| 11 | **Lưu trữ bền vững lịch sử và cấu hình** | Lưu cấu hình ngưỡng độ ẩm, mảng tròn 100 điểm đo gần nhất và nhật ký các phiên tưới trong `store.json`. | ✅ ĐẠT |
| 12 | **Kiểm thử các kịch bản bất thường (SC-01 đến SC-10)** | Toàn bộ 10 kịch bản chức năng và an toàn mạng đạt tỷ lệ vượt qua 100% qua công cụ Scenario Runner. | ✅ ĐẠT |
| 13 | **Tự động phục hồi kết nối** | ESP32 và Web Dashboard tự động kết nối lại mạng Wi-Fi, Broker MQTT và WebSocket khi đường truyền bị gián đoạn. | ✅ ĐẠT |
| 14 | **Tài liệu triển khai và hướng dẫn đầy đủ** | Đầy đủ tài liệu kiến trúc hệ thống, đặc tả API, luồng dữ liệu, hướng dẫn vận hành và ma trận Topic MQTT. | ✅ ĐẠT |

---
**KẾT LUẬN NGHIỆM THU: TOÀN BỘ 14/14 TIÊU CHÍ KỸ THUẬT ĐẠT 100%.**
