// =====================================================================
// N03 SMART GARDEN – DATABASE & PERSISTENCE LAYER
// Hỗ trợ cả file-based persistent store và mở rộng PostgreSQL/InfluxDB
// Dữ liệu không bị mất khi reload hoặc restart server.
// =====================================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Đảm bảo thư mục data tồn tại
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Khung dữ liệu mặc định ban đầu
const initialData = {
  devices: [
    {
      id: "device01",
      name: "ESP32 Garden Station 01",
      location: "Khu vườn số 01 - Luống A",
      status: "ONLINE",
      ip: "192.168.1.105",
      firmwareVersion: "3.0.0-L4",
      lastSeen: new Date().toISOString()
    }
  ],
  thresholds: {
    dryThreshold: 35,
    wetThreshold: 60,
    maxPumpDurationMs: 600000, // 10 phút
    autoMode: true
  },
  telemetry: [],
  commands: [],
  alerts: [],
  waterLogs: []
};

class Database {
  constructor() {
    this.data = this.loadData();
    this.activeWatering = null; // tracking phiên tưới đang diễn ra
  }

  loadData() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...initialData, ...parsed };
      }
    } catch (err) {
      console.error('[DB] Lỗi đọc file store.json, khởi tạo lại từ đầu:', err.message);
    }
    this.saveData(initialData);
    return JSON.parse(JSON.stringify(initialData));
  }

  saveData(data = this.data) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Lỗi ghi file store.json:', err.message);
    }
  }

  // ---- DEVICE ----
  getDevices() {
    return this.data.devices;
  }

  getDevice(id = "device01") {
    let dev = this.data.devices.find(d => d.id === id);
    if (!dev) {
      dev = { id, name: `ESP32 Station ${id}`, status: "UNKNOWN", lastSeen: new Date().toISOString() };
      this.data.devices.push(dev);
      this.saveData();
    }
    return dev;
  }

  updateDeviceStatus(id = "device01", status = "ONLINE") {
    const dev = this.getDevice(id);
    dev.status = status;
    dev.lastSeen = new Date().toISOString();
    this.saveData();
    return dev;
  }

  // ---- TELEMETRY ----
  saveTelemetry(telemetry) {
    const record = {
      id: Date.now().toString(),
      deviceId: telemetry.deviceId || "device01",
      msgId: telemetry.msgId || (this.data.telemetry.length + 1),
      ts: telemetry.ts || Date.now(),
      recordedAt: new Date().toISOString(),
      moisture: Number(telemetry.moisture ?? 50),
      adc: Number(telemetry.adc ?? 2048),
      pump: Boolean(telemetry.pump),
      valve: Boolean(telemetry.valve ?? telemetry.pump),
      mode: telemetry.mode || "AUTO",
      wifi_rssi: Number(telemetry.wifi_rssi ?? -60)
    };

    // Giữ tối đa 2000 bản ghi telemetry trong file
    this.data.telemetry.push(record);
    if (this.data.telemetry.length > 2000) {
      this.data.telemetry = this.data.telemetry.slice(-2000);
    }

    // Cập nhật trạng thái device
    this.updateDeviceStatus(record.deviceId, "ONLINE");

    // Quản lý phiên tưới nước tự động (Water Log tracking)
    this.processWateringState(record);

    this.saveData();
    return record;
  }

  getLatestTelemetry(deviceId = "device01") {
    const records = this.data.telemetry.filter(t => t.deviceId === deviceId);
    if (records.length === 0) {
      return {
        deviceId,
        moisture: 50,
        adc: 2048,
        pump: false,
        valve: false,
        mode: "AUTO",
        recordedAt: new Date().toISOString()
      };
    }
    return records[records.length - 1];
  }

  getTelemetryHistory({ deviceId = "device01", limit = 100, from, to } = {}) {
    let list = this.data.telemetry.filter(t => t.deviceId === deviceId);
    if (from) {
      const fromTime = new Date(from).getTime();
      list = list.filter(t => new Date(t.recordedAt).getTime() >= fromTime);
    }
    if (to) {
      const toTime = new Date(to).getTime();
      list = list.filter(t => new Date(t.recordedAt).getTime() <= toTime);
    }
    return list.slice(-limit);
  }

  // ---- WATER LOGS ----
  processWateringState(record) {
    if (record.pump && !this.activeWatering) {
      // Bắt đầu một phiên tưới nước
      this.activeWatering = {
        id: "wl_" + Date.now(),
        deviceId: record.deviceId,
        startTime: record.recordedAt,
        startMoisture: record.moisture,
        triggeredBy: record.mode === "AUTO" ? "AUTO" : "MANUAL"
      };
    } else if (!record.pump && this.activeWatering) {
      // Kết thúc phiên tưới nước
      const endTime = record.recordedAt;
      const startMs = new Date(this.activeWatering.startTime).getTime();
      const endMs = new Date(endTime).getTime();
      const durationSec = Math.max(1, Math.round((endMs - startMs) / 1000));

      const log = {
        ...this.activeWatering,
        endTime,
        endMoisture: record.moisture,
        moistureGain: record.moisture - this.activeWatering.startMoisture,
        durationSec,
        status: "COMPLETED"
      };

      this.data.waterLogs.unshift(log);
      if (this.data.waterLogs.length > 200) {
        this.data.waterLogs = this.data.waterLogs.slice(0, 200);
      }
      this.activeWatering = null;
    }
  }

  getWaterLogs(limit = 50) {
    return this.data.waterLogs.slice(0, limit);
  }

  // ---- COMMANDS ----
  saveCommand(cmd) {
    const record = {
      cmdId: cmd.cmdId,
      deviceId: cmd.deviceId || "device01",
      command: cmd.command,
      payload: cmd.payload || {},
      status: cmd.status || "PENDING",
      createdAt: new Date().toISOString(),
      ackAt: null,
      error: null
    };
    this.data.commands.push(record);
    if (this.data.commands.length > 500) {
      this.data.commands = this.data.commands.slice(-500);
    }
    this.saveData();
    return record;
  }

  updateCommandAck(cmdId, ackData) {
    const cmd = this.data.commands.find(c => c.cmdId === cmdId);
    if (cmd) {
      cmd.status = ackData.status || "SUCCESS";
      cmd.ackAt = new Date().toISOString();
      if (ackData.error || ackData.message) {
        cmd.error = ackData.error || ackData.message;
      }
      this.saveData();
      return cmd;
    }
    return null;
  }

  getCommands(limit = 50) {
    return this.data.commands.slice(-limit).reverse();
  }

  // ---- ALERTS ----
  saveAlert(alert) {
    const record = {
      id: "alt_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      deviceId: alert.deviceId || "device01",
      code: alert.code || "WARNING",
      message: alert.message || "",
      severity: alert.severity || "medium",
      timestamp: alert.timestamp || new Date().toISOString()
    };
    this.data.alerts.unshift(record);
    if (this.data.alerts.length > 300) {
      this.data.alerts = this.data.alerts.slice(0, 300);
    }
    this.saveData();
    return record;
  }

  getAlerts(limit = 50) {
    return this.data.alerts.slice(0, limit);
  }

  // ---- THRESHOLDS ----
  getThresholds() {
    return this.data.thresholds;
  }

  updateThresholds(newThresholds) {
    this.data.thresholds = { ...this.data.thresholds, ...newThresholds };
    this.saveData();
    return this.data.thresholds;
  }
}

module.exports = new Database();
