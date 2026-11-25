// =====================================================================
// N03 SMART GARDEN – BACKEND & WEBSOCKET SERVER (LEVEL 4)
// Tích hợp REST API, WebSocket hai chiều, HiveMQ MQTT Bridge
// Cung cấp dữ liệu thời gian thực cho Web Dashboard & Mobile PWA
// =====================================================================

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const db = require('./database');
const mqttManager = require('./mqttClient');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Khởi động kết nối MQTT
mqttManager.init();

// =====================================================================
// 1. WEBSOCKET SERVER (CHO WEB DASHBOARD & MOBILE PWA)
// =====================================================================
const wss = new WebSocketServer({ server });
const clients = new Set();

function broadcast(type, data) {
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws, req) => {
  clients.add(ws);
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client đã kết nối từ ${clientIp}. Tổng clients: ${clients.size}`);

  // Gửi gói tin khởi tạo (INIT Snapshot) ngay khi client kết nối
  const initSnapshot = {
    devices: db.getDevices(),
    latestTelemetry: db.getLatestTelemetry('device01'),
    thresholds: db.getThresholds(),
    recentAlerts: db.getAlerts(5),
    recentWaterLogs: db.getWaterLogs(5)
  };
  ws.send(JSON.stringify({ type: 'INIT', data: initSnapshot, timestamp: new Date().toISOString() }));

  // Xử lý thông điệp gửi từ client qua WebSocket (Web Dashboard / Mobile PWA)
  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message.toString());
      console.log('[WS IN] Nhận thông điệp từ client:', msg);

      if (msg.type === 'COMMAND') {
        const { command, params, timeoutMs } = msg.data || {};
        const result = await mqttManager.sendCommand('device01', command, params, timeoutMs || 4000);
        ws.send(JSON.stringify({
          type: 'COMMAND_RESPONSE',
          data: result,
          timestamp: new Date().toISOString()
        }));
      } else if (msg.type === 'SIM_TELEMETRY' && msg.data) {
        // Nhận Telemetry từ kịch bản kiểm thử mô phỏng (Scenario Runner)
        const record = db.saveTelemetry(msg.data);
        broadcast('TELEMETRY', record);

        // Đẩy lên MQTT broker để ESP32 và các bên quan sát nhận được
        if (mqttManager.connected && mqttManager.client) {
          mqttManager.client.publish('garden/device01/telemetry', JSON.stringify(record), { qos: 0 });
        }

        // Tự động kích hoạt bơm theo ngưỡng (Closed-loop Simulation)
        const thresholds = db.getThresholds();
        if (thresholds.autoMode) {
          if (record.moisture < thresholds.dryThreshold && !record.pump) {
            console.log(`[TỰ ĐỘNG TƯỚI] Độ ẩm thấp (${record.moisture}% < ${thresholds.dryThreshold}%). Gửi lệnh BẬT BƠM...`);
            mqttManager.sendCommand('device01', 'PUMP_ON', {}, 4000);
          } else if (record.moisture >= thresholds.wetThreshold && record.pump) {
            console.log(`[TỰ ĐỘNG TƯỚI] Đất đủ ẩm (${record.moisture}% >= ${thresholds.wetThreshold}%). Gửi lệnh TẮT BƠM...`);
            mqttManager.sendCommand('device01', 'PUMP_OFF', {}, 4000);
          }
        }
      }
    } catch (err) {
      console.error('[WS IN] Lỗi xử lý message:', err.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client ngắt kết nối. Còn lại: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Lỗi client:', err.message);
    clients.delete(ws);
  });
});

// Cầu nối sự kiện MQTT -> WebSocket Broadcast
mqttManager.on('error', (err) => {
  console.warn('[MQTT Server Listener] Ghi nhận cảnh báo broker:', err.message);
});

mqttManager.on('mqtt_status', (status) => {
  broadcast('BROKER_STATUS', status);
});

mqttManager.on('telemetry', (record) => {
  broadcast('TELEMETRY', record);
});

mqttManager.on('device_status', (statusData) => {
  broadcast('DEVICE_STATUS', statusData);
});

mqttManager.on('command_ack', (ackData) => {
  broadcast('COMMAND_ACK', ackData);
});

mqttManager.on('alert', (alertData) => {
  broadcast('ALERT', alertData);
});

// =====================================================================
// 2. REST API ROUTES
// =====================================================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    version: '3.0.0-Level4',
    mqttConnected: mqttManager.connected,
    wsClients: clients.size,
    timestamp: new Date().toISOString()
  });
});

// 1. Quản lý thiết bị
app.get('/api/devices', (req, res) => {
  res.json({ success: true, data: db.getDevices() });
});

// 2. Telemetry mới nhất
app.get('/api/telemetry/latest', (req, res) => {
  const deviceId = req.query.deviceId || 'device01';
  const data = db.getLatestTelemetry(deviceId);
  res.json({ success: true, data });
});

// 3. Lịch sử Telemetry
app.get('/api/telemetry/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const from = req.query.from;
  const to = req.query.to;
  const deviceId = req.query.deviceId || 'device01';

  const history = db.getTelemetryHistory({ deviceId, limit, from, to });
  res.json({ success: true, total: history.length, data: history });
});

// 4. Tiếp nhận telemetry từ Node-RED (HTTP POST forwarding)
app.post('/api/telemetry', (req, res) => {
  const payload = req.body;
  if (!payload) return res.status(400).json({ success: false, error: 'Empty payload' });

  const record = db.saveTelemetry(payload);
  broadcast('TELEMETRY', record);
  res.json({ success: true, record });
});

// 5. Gửi Downlink Command tới ESP32 (Hỗ trợ ACK & Timeout SC-07)
app.post('/api/command', async (req, res) => {
  const { deviceId = 'device01', command, params = {}, timeoutMs = 4000 } = req.body;

  if (!command) {
    return res.status(400).json({ success: false, error: 'Missing command name' });
  }

  console.log(`[API CMD] Nhận yêu cầu: ${command} cho ${deviceId}`);

  // Gọi MQTT Manager với cơ chế chờ ACK
  const result = await mqttManager.sendCommand(deviceId, command, params, timeoutMs);

  if (result.success) {
    res.json({
      success: true,
      command,
      ack: result.ack,
      message: 'Command executed and verified by device ACK'
    });
  } else {
    // SC-07: Không bao giờ trả về thành công giả khi Timeout hoặc lỗi!
    res.status(504).json({
      success: false,
      command,
      error: result.error || 'COMMAND_FAILED',
      message: result.message || 'Thiết bị không thực thi hoặc không phản hồi ACK kịp thời'
    });
  }
});

// 6. Cấu hình ngưỡng (Thresholds)
app.get('/api/thresholds', (req, res) => {
  res.json({ success: true, data: db.getThresholds() });
});

app.put('/api/thresholds', (req, res) => {
  const updated = db.updateThresholds(req.body);
  broadcast('THRESHOLDS_UPDATED', updated);
  res.json({ success: true, data: updated });
});

// 7. Cảnh báo (Alerts)
app.get('/api/alerts', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ success: true, data: db.getAlerts(limit) });
});

app.post('/api/alerts', (req, res) => {
  const saved = db.saveAlert(req.body);
  broadcast('ALERT', saved);
  res.json({ success: true, data: saved });
});

// 8. Lịch sử các lần tưới nước (Water Logs)
app.get('/api/water-logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ success: true, data: db.getWaterLogs(limit) });
});

// 9. Thống kê tổng hợp (Stats)
app.get('/api/stats', (req, res) => {
  const deviceId = req.query.deviceId || 'device01';
  const history = db.getTelemetryHistory({ deviceId, limit: 100 });
  const waterLogs = db.getWaterLogs(20);
  const latest = db.getLatestTelemetry(deviceId);

  let minMoisture = 100;
  let maxMoisture = 0;
  let sumMoisture = 0;

  if (history.length > 0) {
    history.forEach(h => {
      if (h.moisture < minMoisture) minMoisture = h.moisture;
      if (h.moisture > maxMoisture) maxMoisture = h.moisture;
      sumMoisture += h.moisture;
    });
  } else {
    minMoisture = latest.moisture;
    maxMoisture = latest.moisture;
    sumMoisture = latest.moisture;
  }

  const avgMoisture = history.length > 0 ? Math.round(sumMoisture / history.length) : latest.moisture;

  res.json({
    success: true,
    data: {
      currentMoisture: latest.moisture,
      minMoisture,
      maxMoisture,
      avgMoisture,
      pump: latest.pump,
      mode: latest.mode,
      totalWateringsToday: waterLogs.length,
      lastUpdated: latest.recordedAt
    }
  });
});

// =====================================================================
// 3. KHỞI CHẠY SERVER & BẮT LỖI CỔNG
// =====================================================================
wss.on('error', (err) => {
  console.warn('[WSS Listener] Cảnh báo WebSocket Server:', err.message);
});

let currentPort = Number(PORT);
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
    console.warn(`[LƯU Ý] Cổng ${currentPort} đang bận hoặc bị giới hạn quyền. Đang tự động chuyển sang cổng ${currentPort + 1}...`);
    currentPort += 1;
    setTimeout(() => {
      server.listen(currentPort, '0.0.0.0');
    }, 500);
  } else {
    console.error('[LỖI SERVER]', err.message);
    process.exit(1);
  }
});

server.listen(currentPort, '0.0.0.0', () => {
  console.log('===========================================================');
  console.log(`  N03 SMART GARDEN BACKEND SERVER (LEVEL 4)`);
  console.log(`  REST API:   http://localhost:${currentPort}/api/health`);
  console.log(`  WebSocket:  ws://localhost:${currentPort}`);
  console.log('===========================================================');
});
