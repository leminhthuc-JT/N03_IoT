# HƯỚNG DẪN XỬ LÝ SỰ CỐ (TROUBLESHOOTING GUIDE)

## 1. LỖI KẾT NỐI MQTT (BROKER DISCONNECTED)
- **Triệu chứng**: Dashboard báo "Mất kết nối MQTT" hoặc Backend báo `ENOTFOUND broker.hivemq.com`.
- **Nguyên nhân**: Thiết bị mất kết nối internet hoặc tường lửa chặn cổng 1883.
- **Cách khắc phục**:
  1. Kiểm tra kết nối Internet trên máy tính.
  2. Thử ping tới `broker.hivemq.com`.
  3. Trên Web Dashboard, có thể chuyển sang cổng WebSocket WSS `8884` thay vì cổng `8000` hoặc `1883`.

## 2. LỖI TIMEOUT KHI ĐIỀU KHIỂN BƠM (SC-07)
- **Triệu chứng**: Nhấn Bật bơm trên Web Dashboard hoặc ứng dụng PWA, nhận thông báo lỗi HTTP 504 Timeout sau 4 giây.
- **Nguyên nhân**: ESP32 chưa được bật mô phỏng trên Wokwi, hoặc ESP32 đang ở chế độ `AUTO` và từ chối lệnh bật bơm thủ công.
- **Cách khắc phục**:
  1. Đảm bảo mô phỏng Wokwi đang chạy (`Wokwi: Start Simulator`).
  2. Kiểm tra xem chế độ hiện tại là `MANUAL` hay `AUTO`. Chuyển sang `MANUAL` trước khi bật bơm.

## 3. CẢM BIẾN HIỂN THỊ "BẤT THƯỜNG" (SC-06)
- **Triệu chứng**: Màn hình OLED hoặc Dashboard hiện cảnh báo `SENSOR_FAULT`.
- **Nguyên nhân**: Chiết áp Potentiometer trong Wokwi bị kéo quá ngưỡng hoặc dây nối ADC bị lỏng.
- **Cách khắc phục**:
  1. Điều chỉnh Potentiometer trong khoảng điện áp $0 - 3.3V$.
  2. Kiểm tra dây nối GPIO34 (Soil Moisture) và GPIO35 (LDR) trong `diagram.json`.

## 4. DỮ LIỆU BỊ RESET KHI TẮT SERVER
- **Triệu chứng**: Khởi động lại máy làm mất lịch sử các lần tưới nước.
- **Nguyên nhân**: File `backend/data/store.json` bị xóa hoặc không có quyền ghi.
- **Cách khắc phục**:
  1. Kiểm tra quyền ghi tại thư mục `backend/data/`.
  2. Backend tự động ghi đệm vào file `store.json` mỗi khi có telemetry mới.
