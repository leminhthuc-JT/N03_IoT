// =====================================================================
// N03 SMART GARDEN – MQTT CLIENT & PROTOCOL ADAPTER
// Quản lý giao tiếp 2 chiều với HiveMQ Broker:
//   - Nhận Telemetry, Status, Alert, ACK
//   - Gửi Downlink Command với cmdId + Cơ chế chờ ACK Timeout (SC-07)
// =====================================================================

const mqtt = require('mqtt');
const EventEmitter = require('events');
const db = require('./database');

class MQTTManager extends EventEmitter {
  constructor() {
    super();
    this.brokerUrl = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com:1883';
    this.clientId = (process.env.MQTT_CLIENT_ID || 'N03-Backend') + '-' + Math.random().toString(16).substring(2, 8);
    this.client = null;
    this.pendingCommands = new Map(); // cmdId -> { resolve, timer, cmdRecord }
    this.connected = false;
  }

  init() {
    console.log(`[MQTT] Đang kết nối tới Broker: ${this.brokerUrl} (ClientID: ${this.clientId})...`);
    this.client = mqtt.connect(this.brokerUrl, {
      clientId: this.clientId,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 10000
    });

    this.client.on('connect', () => {
      this.connected = true;
      console.log('[MQTT] Kết nối thành công tới HiveMQ Broker!');

      // Đăng ký nhận toàn bộ topic chuẩn Level 4
      const topics = [
        'garden/device01/telemetry',
        'garden/device01/status',
        'garden/device01/ack',
        'garden/device01/alert',
        // Tương thích ngược
        'garden/demo/telemetry',
        'garden/demo/status',
        'garden/demo/alert'
      ];

      this.client.subscribe(topics, (err) => {
        if (!err) {
          console.log('[MQTT] Đã đăng ký thành công các topics:', topics.join(', '));
        } else {
          console.error('[MQTT] Lỗi subscribe:', err);
        }
      });

      this.emit('mqtt_status', { connected: true });
    });

    this.client.on('reconnect', () => {
      console.log('[MQTT] Đang thử kết nối lại HiveMQ...');
    });

    this.client.on('close', () => {
      this.connected = false;
      this.emit('mqtt_status', { connected: false });
    });

    this.client.on('error', (err) => {
      console.warn('[MQTT WARNING] Không thể kết nối tới Broker:', err.message);
      this.connected = false;
      this.emit('mqtt_status', { connected: false, error: err.message });
    });

    this.client.on('message', (topic, messageBuffer) => {
      this.handleIncomingMessage(topic, messageBuffer.toString());
    });
  }

  handleIncomingMessage(topic, messageStr) {
    let payload = null;
    try {
      payload = JSON.parse(messageStr);
    } catch (e) {
      // Plain text payload
      payload = messageStr;
    }

    // 1. Telemetry
    if (topic === 'garden/device01/telemetry' || topic === 'garden/demo/telemetry') {
      if (typeof payload === 'object') {
        const record = db.saveTelemetry(payload);
        this.emit('telemetry', record);
      }
    }
    // 2. Device Status (ONLINE / OFFLINE)
    else if (topic === 'garden/device01/status' || topic === 'garden/demo/status') {
      const status = typeof payload === 'string' ? payload : (payload.status || 'UNKNOWN');
      db.updateDeviceStatus('device01', status);
      this.emit('device_status', { deviceId: 'device01', status });
      console.log(`[MQTT] Trạng thái thiết bị device01: ${status}`);
    }
    // 3. Command ACK từ ESP32
    else if (topic === 'garden/device01/ack') {
      if (typeof payload === 'object' && payload.cmdId) {
        this.handleCommandAck(payload);
      }
    }
    // 4. Alert từ ESP32
    else if (topic === 'garden/device01/alert' || topic === 'garden/demo/alert') {
      const alertObj = typeof payload === 'object' ? payload : {
        deviceId: 'device01',
        code: 'ALERT',
        message: String(payload)
      };
      const savedAlert = db.saveAlert(alertObj);
      this.emit('alert', savedAlert);
      console.warn(`[MQTT ALERT] ${alertObj.code}: ${alertObj.message}`);
    }
  }

  handleCommandAck(ack) {
    const { cmdId, status } = ack;
    console.log(`[MQTT ACK] Nhận phản hồi cho cmdId=${cmdId}, status=${status}`);

    db.updateCommandAck(cmdId, ack);
    this.emit('command_ack', ack);

    if (this.pendingCommands.has(cmdId)) {
      const { resolve, timer } = this.pendingCommands.get(cmdId);
      clearTimeout(timer);
      this.pendingCommands.delete(cmdId);
      resolve({
        success: status === 'SUCCESS',
        ack
      });
    }
  }

  /**
   * Gửi Downlink Command với cmdId + Cơ chế đợi ACK Timeout
   * Tuân thủ SC-07: Nếu không có ACK thì báo Timeout, KHÔNG trả về thành công giả!
   */
  sendCommand(deviceId = 'device01', commandName, params = {}, timeoutMs = 4000) {
    return new Promise((resolve) => {
      if (!this.connected) {
        return resolve({
          success: false,
          error: 'BROKER_DISCONNECTED',
          message: 'MQTT Broker hiện không kết nối'
        });
      }

      const cmdId = 'cmd_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      const commandPayload = {
        deviceId,
        cmdId,
        command: commandName,
        ts: Date.now(),
        ...params
      };

      // Lưu lệnh vào DB ở trạng thái PENDING
      const cmdRecord = db.saveCommand({
        cmdId,
        deviceId,
        command: commandName,
        payload: params,
        status: 'PENDING'
      });

      // Đặt bộ đếm Timeout
      const timer = setTimeout(() => {
        if (this.pendingCommands.has(cmdId)) {
          console.warn(`[MQTT TIMEOUT] Hết thời gian chờ ACK cho cmdId=${cmdId} (${timeoutMs}ms)`);
          this.pendingCommands.delete(cmdId);
          db.updateCommandAck(cmdId, { status: 'TIMEOUT', error: 'Thiết bị không phản hồi trong thời gian quy định' });
          resolve({
            success: false,
            error: 'MQTT_TIMEOUT',
            cmdId,
            message: `Thiết bị không phản hồi trong ${timeoutMs}ms. Không có ACK.`
          });
        }
      }, timeoutMs);

      this.pendingCommands.set(cmdId, { resolve, timer, cmdRecord });

      // Publish lệnh xuống MQTT
      const payloadStr = JSON.stringify(commandPayload);
      this.client.publish('garden/device01/command', payloadStr, { qos: 1 }, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingCommands.delete(cmdId);
          db.updateCommandAck(cmdId, { status: 'FAILED', error: err.message });
          resolve({ success: false, error: 'PUBLISH_ERROR', message: err.message });
        } else {
          console.log(`[MQTT OUT] Đã phát lệnh ${commandName} (cmdId: ${cmdId}) tới garden/device01/command`);
        }
      });

      // Đồng thời phát sang legacy topic để hỗ trợ firmware cũ nếu cần
      if (commandName === 'PUMP_ON') {
        this.client.publish('garden/demo/cmd/pump', 'ON');
      } else if (commandName === 'PUMP_OFF') {
        this.client.publish('garden/demo/cmd/pump', 'OFF');
      } else if (commandName === 'SET_MODE' && params.mode) {
        this.client.publish('garden/demo/cmd/mode', params.mode);
      }
    });
  }
}

module.exports = new MQTTManager();
