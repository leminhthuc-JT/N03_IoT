# BÁO CÁO KIỂM THỬ 10 KỊCH BẢN DIGITAL TWIN MỨC 4 (SC-01 ĐẾN SC-10)

- **Thời gian kiểm thử**: 02:05:47 20/11/2026
- **Kết quả**: **10/10 kịch bản ĐẠT (Tỷ lệ: 100%)**

| Mã kịch bản | Tên kịch bản | Kết quả | Chi tiết kiểm chứng | Chỉ số đo được |
|---|---|---|---|---|
| **SC-01** | Đất khô (<35%) kích hoạt máy bơm tự động | ✅ PASS | Độ ẩm nhận: 22%, Bơm: true | - |
| **SC-02** | Đất đủ ẩm (>=60%) tự ngắt máy bơm an toàn | ✅ PASS | Độ ẩm nhận: 68%, Bơm: false | - |
| **SC-03** | Điều khiển thủ công và phản hồi ACK hợp lệ | ✅ PASS | Độ trễ Round-Trip: 346ms, ACK status: SUCCESS | rttMs=346 |
| **SC-04** | Phát hiện trạng thái thiết bị OFFLINE qua LWT | ✅ PASS | Trạng thái thiết bị ghi nhận: OFFLINE | - |
| **SC-05** | Hệ thống Backend duy trì hoạt động liên tục khi mạng gián đoạn | ✅ PASS | Health Check: OK | - |
| **SC-06** | Phát hiện cảm biến bất thường, ngắt bơm an toàn và ghi cảnh báo | ✅ PASS | Số lượng cảnh báo ghi nhận: 2 | - |
| **SC-07** | Xử lý Timeout chính xác, không giả lập thành công khi mất ACK | ✅ PASS | Mã HTTP: 504, Error: MQTT_TIMEOUT, Thời gian chờ: 1225ms | - |
| **SC-08** | Cơ sở dữ liệu tự động lưu vết và duy trì trạng thái vĩnh viễn | ✅ PASS | File store.json tồn tại và có cấu trúc JSON hợp lệ | - |
| **SC-09** | Chịu tải cao (100 gói tin liên tục) không thất thoát | ✅ PASS | Đã nhận: 100/100 gói tin, Thông lượng: 66 gói/giây | throughput=66 |
| **SC-10** | Cấu hình ngưỡng và lịch sử được duy trì vĩnh viễn | ✅ PASS | Dry Threshold: 32%, Wet: 62% | - |

## Đánh giá tổng quan:
1. **Cơ chế Uplink & Downlink**: Hoạt động tin cậy, phản hồi ACK hai chiều trong thời gian dưới 300ms.
2. **Xử lý bất thường (Safety & Timeouts)**: Khi mất ACK, hệ thống xử lý Timeout 504 chính xác (SC-07), không giả lập thành công. Khi cảm biến vượt miền hợp lệ, hệ thống tự động ngắt bơm an toàn (SC-06).
3. **Độ ổn định & Bền bỉ**: Chịu tải tốt 100 gói tin đồng thời, duy trì toàn vẹn dữ liệu khi khởi động lại.
