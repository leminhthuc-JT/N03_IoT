# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG N03 DIGITAL TWIN (LEVEL 4)

---

## CÁCH 1: TRIỂN KHAI NHANH BẰNG DOCKER COMPOSE (KHUYÊN DÙNG)

Yêu cầu: Đã cài đặt Docker Desktop.

```bash
# Khởi động toàn bộ các dịch vụ (Backend, Postgres, InfluxDB, Node-RED, Dashboard)
docker-compose up -d

# Xem log các dịch vụ
docker-compose logs -f

# Dừng hệ thống
docker-compose down
```

Các cổng dịch vụ sau khi triển khai:
- **Web Dashboard**: `http://localhost:8080`
- **Backend REST API**: `http://localhost:3000/api/health`
- **Node-RED UI**: `http://localhost:1880`
- **PostgreSQL**: `localhost:5432`
- **InfluxDB**: `http://localhost:8086`

---

## CÁCH 2: TRIỂN KHAI TRỰC TIẾP TRÊN MÁY TÍNH (NATIVE RUN)

### Bước 1: Khởi động Backend Server
```powershell
cd D:\hk7\InternetOfThings\DoAn\backend
npm install
node server.js
```

### Bước 2: Khởi động Web Dashboard
```powershell
cd D:\hk7\InternetOfThings\DoAn\web-dashboard
python -m http.server 8080 --bind 0.0.0.0
```
Truy cập: `http://localhost:8080` trên trình duyệt.

### Bước 3: Khởi chạy Wokwi Simulation
1. Cài đặt extension Wokwi trong VS Code.
2. Mở file `diagram.json` và nhấn nút Play (F1 $\to$ Wokwi: Start Simulator).
3. ESP32 sẽ tự động kết nối Wi-Fi ảo và gửi dữ liệu lên HiveMQ Broker.

### Bước 4: Kiểm tra và giám sát trên Web Dashboard & PWA
1. Mở trình duyệt tại `http://localhost:8080` (hoặc mở trực tiếp file `index.html` trong thư mục `web-dashboard/`).
2. Quan sát Đồng hồ đo độ ẩm (Gauge Chart) hiển thị trực quan mức độ ẩm 0% - 100% với kim xoay mượt mà và đổi màu cảnh báo theo 3 trạng thái Đỏ - Vàng - Xanh lá.
3. Thao tác chuyển chế độ AUTO/MANUAL và nút Bật/Tắt máy bơm để kiểm tra luồng điều khiển thời gian thực.
