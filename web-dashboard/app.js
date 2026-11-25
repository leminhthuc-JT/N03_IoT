/**
 * N03 IoT – Smart Irrigation Dashboard
 * Application Logic & MQTT Engine
 */

// =====================================================================
// 1. CONFIGURATION
// =====================================================================
const DEFAULT_CONFIG = {
  host: 'broker.hivemq.com',
  port: 8884,
  path: '/mqtt',
  topicTelemetry: 'garden/demo/telemetry',
  topicPump: 'garden/demo/cmd/pump',
  topicMode: 'garden/demo/cmd/mode',
  topicStatus: 'garden/demo/status',
  topicAlert: 'garden/demo/alert',
  dryThreshold: 35,
  wetThreshold: 60,
  maxPumpTime: 10,       // phút
  pumpCooldown: 5,       // phút
  pumpDelay: 0,          // giây
  timeoutSeconds: 30,
  cmdTimeout: 5,         // giây
  firebaseUrl: 'https://iot-n03-default-rtdb.firebaseio.com/' // Firebase Realtime Database URL gán cứng
};

let config = { ...DEFAULT_CONFIG };
let mqttClient = null;
let chartInstance = null;
let monitorChartInstance = null;
let packetCount = 0;
let pumpTimer = null;
let pumpSeconds = 0;
let lastTelemetryTime = 0;
let offlineCheckerTimer = null;
let firebaseDb = null;

// Application State
const state = {
  moisture: 0,
  adc: 0,
  pump: false,
  valve: false,
  mode: 'AUTO',
  rssi: 0,
  deviceOnline: false,
  mqttConnected: false,
  lastUpdate: null
};

// Data stores
const activityLogs = [];
const historyData = [];
const alertsData = [];
const moistureHistory = [];
const schedulesData = [];
const commandHistory = [];
let pumpTodayCount = 0;
let pumpTotalSeconds = 0;
let unreadAlerts = 0;

// History pagination
let historyPage = 1;
const historyPerPage = 20;

// =====================================================================
// 2. INITIALIZATION
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadStoredConfig();
  loadStoredData();
  initFirebase();
  initClock();
  initChart();
  initMonitorChart();
  updateMonitorChart();
  initNavigation();
  initSidebar();
  initEventListeners();
  initScheduleListeners();
  initThresholdListeners();
  connectMQTT();
  updateMoistureGauge(state.moisture);
  startOfflineChecker();
});

// =====================================================================
// 3. THEME SYSTEM
// =====================================================================
function initTheme() {
  const stored = localStorage.getItem('n03_theme');
  let theme;
  if (stored) {
    theme = stored;
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    theme = 'light';
  } else {
    theme = 'dark';
  }
  applyTheme(theme);

  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('n03_theme', next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  icon.textContent = theme === 'dark' ? '☾' : '☀';
  // Update charts if exist
  if (chartInstance) updateChartTheme(chartInstance);
  if (monitorChartInstance) updateChartTheme(monitorChartInstance);
}

function updateChartTheme(chart) {
  const style = getComputedStyle(document.documentElement);
  const gridColor = style.getPropertyValue('--chart-grid').trim();
  const textColor = style.getPropertyValue('--chart-text').trim();
  if (chart.options.scales?.y) {
    chart.options.scales.y.grid.color = gridColor;
    chart.options.scales.y.ticks.color = textColor;
  }
  if (chart.options.scales?.x) {
    chart.options.scales.x.grid.color = gridColor;
    chart.options.scales.x.ticks.color = textColor;
  }
  if (chart.options.plugins?.legend?.labels) {
    chart.options.plugins.legend.labels.color = textColor;
  }
  chart.update('none');
}

// =====================================================================
// 4. NAVIGATION & SIDEBAR
// =====================================================================
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.getAttribute('data-page');
      navigateTo(page);
      // On mobile: close sidebar after navigating
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.remove('show');
        document.body.classList.remove('sidebar-open');
      }
    });
  });
}

function navigateTo(page) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Update pages
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const activePage = document.getElementById(`page-${page}`);
  if (activePage) activePage.classList.add('active');

  // Update title
  const titles = {
    overview: 'Tổng quan',
    monitoring: 'Giám sát thời gian thực',
    control: 'Điều khiển thiết bị',
    schedule: 'Lịch tưới tự động',
    history: 'Lịch sử hoạt động',
    alerts: 'Cảnh báo & Sự kiện',
    device: 'Quản lý thiết bị',
    config: 'Cấu hình hệ thống'
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  if (page === 'monitoring') {
    updateMonitoringUI();
    updateMonitorChart();
  }
}

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const collapseBtn = document.getElementById('btn-collapse-sidebar');

  // Ensure overlay exists
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  // On mobile: close sidebar by default
  if (window.innerWidth <= 768) {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    document.body.classList.remove('sidebar-open');
  }

  function openSidebar() {
    sidebar.classList.add('open');
    document.body.classList.add('sidebar-open');
    overlay.classList.add('show');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    document.body.classList.remove('sidebar-open');
  }

  // Click hamburger (☰) → open sidebar, hide hamburger, show arrow
  toggleBtn.addEventListener('click', openSidebar);

  // Click arrow (‹‹) → close sidebar, hide arrow, show hamburger
  collapseBtn.addEventListener('click', closeSidebar);

  // Click overlay → close sidebar
  overlay.addEventListener('click', closeSidebar);
}

// =====================================================================
// 5. CLOCK
// =====================================================================
function initClock() {
  const clockEl = document.getElementById('live-clock');
  function update() {
    clockEl.textContent = new Date().toLocaleTimeString('vi-VN');
  }
  update();
  setInterval(update, 1000);
}

// =====================================================================
// 6. STORED CONFIG & DATA
// =====================================================================
function loadStoredConfig() {
  const saved = localStorage.getItem('n03_cfg');
  if (saved) {
    try { config = { ...config, ...JSON.parse(saved) }; } catch (e) {}
  }
  // Đảm bảo luôn ưu tiên Firebase URL gán cứng nếu chưa có
  if (!config.firebaseUrl) {
    config.firebaseUrl = DEFAULT_CONFIG.firebaseUrl;
  }
  updateSettingsInputs();
  updateThresholdInputs();
}

function loadStoredData() {
  try {
    const s = localStorage.getItem('n03_schedules');
    if (s) {
      const parsedS = JSON.parse(s);
      if (Array.isArray(parsedS)) {
        schedulesData.length = 0;
        schedulesData.push(...parsedS);
        renderSchedules();
      }
    }
    const h = localStorage.getItem('n03_history');
    if (h) {
      const parsedH = JSON.parse(h);
      if (Array.isArray(parsedH)) {
        historyData.length = 0;
        historyData.push(...parsedH.slice(-500));
        renderHistory();
      }
    }
    const mh = localStorage.getItem('n03_moisture_history');
    if (mh) {
      const parsedMH = JSON.parse(mh);
      if (Array.isArray(parsedMH) && parsedMH.length > 0) {
        moistureHistory.length = 0;
        moistureHistory.push(...parsedMH);
      }
    }
    loadAlerts();
    updateAlertBadge();
    renderAlerts();
  } catch (e) {
    console.error('Lỗi nạp dữ liệu từ localStorage:', e);
  }
}

// =====================================================================
// 6.5. FIREBASE REALTIME CLOUD SYNC
// =====================================================================
function initFirebase() {
  if (!config.firebaseUrl || typeof firebase === 'undefined') return;
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        databaseURL: config.firebaseUrl
      });
    }
    firebaseDb = firebase.database();
    logEvent('SYS', 'Firebase Cloud Database đã kết nối');
    
    // Lắng nghe Trạng thái & Đo lường mới nhất từ Cloud
    firebaseDb.ref('n03/telemetry').on('value', (snapshot) => {
      const lastData = snapshot.val();
      if (lastData) {
        if (lastData.moisture !== undefined) state.moisture = Number(lastData.moisture);
        if (lastData.adc !== undefined) state.adc = Number(lastData.adc);
        if (lastData.mode !== undefined) state.mode = String(lastData.mode).toUpperCase();
        if (lastData.wifi_rssi !== undefined) state.rssi = Number(lastData.wifi_rssi);
        if (lastData.pump !== undefined) {
          state.pump = (lastData.pump === true || lastData.pump === 'true' || lastData.pump === 'ON' || lastData.pump === 1);
        }
        if (lastData.timestamp) {
          state.lastUpdate = new Date(lastData.timestamp);
        }
        updateOverviewUI();
        applyPumpUI(state.pump);
        applyModeUI(state.mode);
        updateMonitoringUI();
      }
    });

    // Lắng nghe Lịch sử độ ẩm để vẽ lại biểu đồ ngay khi reload
    firebaseDb.ref('n03/moisture_points').limitToLast(100).on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const points = Object.values(data);
        if (chartInstance) {
          chartInstance.data.labels = points.slice(-25).map(p => p.time || new Date(parsePointTimestamp(p)).toLocaleTimeString('vi-VN'));
          chartInstance.data.datasets[0].data = points.slice(-25).map(p => p.value);
          chartInstance.update('none');
        }

        // Đồng bộ dữ liệu vào moistureHistory với timestamp chuẩn xác
        points.forEach(p => {
          const t = parsePointTimestamp(p);
          const val = Number(p.value);
          if (!isNaN(val) && val >= 0 && val <= 100) {
            const exists = moistureHistory.some(m => Math.abs(m.time - t) < 1000);
            if (!exists) {
              moistureHistory.push({ time: t, value: val });
            }
          }
        });

        moistureHistory.sort((a, b) => a.time - b.time);
        if (moistureHistory.length > 2000) {
          moistureHistory.splice(0, moistureHistory.length - 2000);
        }

        updateMonitoringUI();
        updateMonitorChart();
      }
    });

    // Lắng nghe Lịch tưới từ Cloud
    firebaseDb.ref('n03/schedules').on('value', (snapshot) => {
      const data = snapshot.val();
      if (Array.isArray(data)) {
        schedulesData.length = 0;
        schedulesData.push(...data);
        localStorage.setItem('n03_schedules', JSON.stringify(schedulesData));
        renderSchedules();
      } else if (data === null && schedulesData.length > 0) {
        // Nếu trên cloud chưa có mà local có, đồng bộ lên cloud
        syncToCloud('schedules', schedulesData);
      }
    });

    // Lắng nghe Lịch sử hoạt động từ Cloud
    firebaseDb.ref('n03/history').limitToLast(100).on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arr = Object.values(data);
        historyData.length = 0;
        historyData.push(...arr);
        renderHistory();
      }
    });

    // Lắng nghe Cảnh báo từ Cloud
    firebaseDb.ref('n03/alerts').limitToLast(50).on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arr = Object.values(data);
        alertsData.length = 0;
        alertsData.push(...arr.reverse());
        unreadAlerts = alertsData.filter(a => !a.read).length;
        updateAlertBadge();
        renderAlerts();
      }
    });

    // Lắng nghe Cấu hình ngưỡng từ Cloud
    firebaseDb.ref('n03/config').on('value', (snapshot) => {
      const cloudCfg = snapshot.val();
      if (cloudCfg) {
        if (cloudCfg.dryThreshold !== undefined) config.dryThreshold = cloudCfg.dryThreshold;
        if (cloudCfg.wetThreshold !== undefined) config.wetThreshold = cloudCfg.wetThreshold;
        updateThresholdInputs();
      }
    });
  } catch (err) {
    console.error('Lỗi khởi tạo Firebase:', err);
  }
}

function syncToCloud(path, data) {
  if (firebaseDb) {
    try {
      firebaseDb.ref(`n03/${path}`).set(data);
    } catch (e) {
      console.error('Lỗi syncToCloud:', e);
    }
  }
}

function pushHistoryToCloud(entry) {
  if (firebaseDb) {
    try {
      firebaseDb.ref('n03/history').push(entry);
    } catch (e) {}
  }
}

function saveSchedules() {
  localStorage.setItem('n03_schedules', JSON.stringify(schedulesData));
  syncToCloud('schedules', schedulesData);
}

function saveHistory() {
  // Keep last 500 entries
  const toSave = historyData.slice(-500);
  localStorage.setItem('n03_history', JSON.stringify(toSave));
}

function updateSettingsInputs() {
  const fields = {
    'cfg-host': config.host,
    'cfg-port': config.port,
    'cfg-path': config.path,
    'cfg-topic-telemetry': config.topicTelemetry,
    'cfg-topic-pump': config.topicPump,
    'cfg-topic-mode': config.topicMode,
    'cfg-topic-status': config.topicStatus,
    'cfg-firebase-url': config.firebaseUrl || ''
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }
}

function updateThresholdInputs() {
  const el = (id) => document.getElementById(id);
  if (el('cfg-dry-threshold')) el('cfg-dry-threshold').value = config.dryThreshold;
  if (el('cfg-wet-threshold')) el('cfg-wet-threshold').value = config.wetThreshold;
  if (el('cfg-max-pump-time')) el('cfg-max-pump-time').value = config.maxPumpTime || 10;
  if (el('cfg-pump-cooldown')) el('cfg-pump-cooldown').value = config.pumpCooldown || 5;
  if (el('cfg-pump-delay')) el('cfg-pump-delay').value = config.pumpDelay || 0;
  if (el('cfg-timeout')) el('cfg-timeout').value = config.timeoutSeconds;
  if (el('cfg-cmd-timeout')) el('cfg-cmd-timeout').value = config.cmdTimeout || 5;
}

// =====================================================================
// 7. MQTT ENGINE
// =====================================================================
function connectMQTT() {
  const proto = (window.location.protocol === 'https:' || config.port === 8884) ? 'wss' : 'ws';
  const brokerUrl = `${proto}://${config.host}:${config.port}${config.path}`;

  updateMqttStatus('connecting', 'MQTT: Đang kết nối...');
  logEvent('SYS', `Đang kết nối tới MQTT Broker: ${brokerUrl}`);

  const clientId = 'N03Web_' + Math.random().toString(16).substr(2, 6);

  try {
    if (mqttClient) mqttClient.end(true);

    mqttClient = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 4000,
      keepalive: 60
    });

    mqttClient.on('connect', () => {
      state.mqttConnected = true;
      updateMqttStatus('online', 'MQTT: Kết nối');
      logEvent('SYS', `Đã kết nối thành công! Client: ${clientId}`);
      showToast('Đã kết nối MQTT Broker', 'success');

      const topics = [
        config.topicTelemetry, config.topicStatus,
        config.topicMode, config.topicPump, config.topicAlert
      ];
      mqttClient.subscribe(topics, (err) => {
        if (!err) logEvent('SYS', `Subscribe: ${topics.join(', ')}`);
        else logEvent('ERR', `Lỗi subscribe: ${err.message}`);
      });
    });

    mqttClient.on('message', (topic, message) => {
      handleIncomingMessage(topic, message.toString());
    });

    mqttClient.on('error', (err) => {
      logEvent('ERR', `MQTT: ${err.message || 'Lỗi kết nối'}`);
      updateMqttStatus('offline', 'MQTT: Lỗi');
    });

    mqttClient.on('close', () => {
      state.mqttConnected = false;
      updateMqttStatus('offline', 'MQTT: Ngắt');
    });

    mqttClient.on('reconnect', () => {
      updateMqttStatus('connecting', 'MQTT: Thử lại...');
    });

  } catch (error) {
    updateMqttStatus('offline', 'MQTT: Lỗi');
    logEvent('ERR', `Exception: ${error.message}`);
  }
}

function updateMqttStatus(status, text) {
  const dots = ['mqtt-dot', 'sidebar-mqtt-dot'];
  dots.forEach(id => {
    const dot = document.getElementById(id);
    if (dot) {
      dot.className = 'status-dot';
      if (status === 'online') dot.classList.add('dot-online');
      else if (status === 'connecting') dot.classList.add('dot-connecting');
      else dot.classList.add('dot-offline');
    }
  });
  const label = document.getElementById('mqtt-text');
  if (label) label.textContent = text;
  const sideLabel = document.getElementById('sidebar-mqtt-text');
  if (sideLabel) sideLabel.textContent = text;
}

function updateDeviceStatus(online) {
  state.deviceOnline = online;
  const dot = document.getElementById('device-dot');
  const label = document.getElementById('device-text');
  if (dot) {
    dot.className = 'status-dot';
    dot.classList.add(online ? 'dot-online' : 'dot-offline');
  }
  if (label) label.textContent = online ? 'ESP32: Online' : 'ESP32: Offline';

  // Device page
  const devStatus = document.getElementById('dev-status');
  const devChip = document.getElementById('dev-status-chip');
  if (devStatus) devStatus.textContent = online ? 'Online' : 'Offline';
  if (devChip) {
    devChip.textContent = online ? 'Online' : 'Offline';
    devChip.style.background = online ? 'rgba(22,163,74,0.1)' : '';
    devChip.style.color = online ? 'var(--color-success)' : '';
  }
}

// =====================================================================
// 8. INCOMING MESSAGE HANDLER
// =====================================================================
function handleIncomingMessage(topic, payload) {
  packetCount++;
  const countEl = document.getElementById('packets-count');
  if (countEl) countEl.textContent = packetCount;

  if (topic === config.topicTelemetry) {
    lastTelemetryTime = Date.now();
    updateDeviceStatus(true);
    try {
      const data = JSON.parse(payload);
      processTelemetry(data);
      logEvent('RX', `Telemetry: moisture=${data.moisture}%, adc=${data.adc}`);
    } catch (e) {
      logEvent('WARN', `Telemetry không phải JSON: ${payload}`);
    }
  } else if (topic === config.topicStatus) {
    const status = payload.trim().toUpperCase();
    logEvent('RX', `Trạng thái thiết bị: ${status}`);
    addHistory('connection', `ESP32 ${status}`, 'Thiết bị');
    if (status === 'ONLINE') {
      updateDeviceStatus(true);
      showToast('ESP32 Online', 'success');
    } else if (status === 'OFFLINE') {
      updateDeviceStatus(false);
      showToast('ESP32 Offline!', 'danger');
      addAlert('danger', 'ESP32 mất kết nối', 'Thiết bị gửi cảnh báo LWT: OFFLINE');
    }
  } else if (topic === config.topicMode) {
    let modeVal = payload.trim().toUpperCase();
    if (modeVal.includes('AUTO')) modeVal = 'AUTO';
    else if (modeVal.includes('MANUAL')) modeVal = 'MANUAL';
    if (modeVal !== state.mode) {
      state.mode = modeVal;
      applyModeUI(modeVal);
      logEvent('RX', `Đồng bộ chế độ: ${modeVal}`);
      addHistory('mode', `Chế độ chuyển sang ${modeVal}`, 'MQTT');
    }
  } else if (topic === config.topicPump) {
    const cmd = payload.trim().toUpperCase();
    logEvent('RX', `Lệnh bơm: ${cmd}`);
    if (cmd === 'ON') applyPumpUI(true);
    else if (cmd === 'OFF') applyPumpUI(false);
  } else if (topic === config.topicAlert) {
    logEvent('WARN', `CẢNH BÁO: ${payload}`);
    showToast(`Cảnh báo: ${payload}`, 'warning');
    addAlert('warning', 'Cảnh báo từ thiết bị', payload);
  }
}

// =====================================================================
// 9. TELEMETRY PROCESSING
// =====================================================================
function processTelemetry(data) {
  if (data.moisture !== undefined) state.moisture = Number(data.moisture);
  if (data.adc !== undefined) state.adc = Number(data.adc);
  if (data.mode !== undefined) state.mode = String(data.mode).toUpperCase();
  if (data.wifi_rssi !== undefined) state.rssi = Number(data.wifi_rssi);
  if (data.pump !== undefined) {
    state.pump = (data.pump === true || data.pump === 'true' || data.pump === 'ON' || data.pump === 1);
  }
  state.lastUpdate = new Date();

  updateOverviewUI();
  applyPumpUI(state.pump);
  applyModeUI(state.mode);
  updateMonitoringUI();
  appendChartData(state.moisture);
  appendMonitorChartData(state.moisture);

  // Store moisture history
  moistureHistory.push({ time: Date.now(), value: state.moisture });
  if (moistureHistory.length > 1000) moistureHistory.shift();

  // Đẩy telemetry và điểm độ ẩm lên Firebase Cloud để khi reload không bao giờ bị mất
  if (firebaseDb) {
    try {
      firebaseDb.ref('n03/telemetry').set({
        moisture: state.moisture,
        adc: state.adc,
        mode: state.mode,
        wifi_rssi: state.rssi,
        pump: state.pump,
        timestamp: Date.now()
      });
      firebaseDb.ref('n03/moisture_points').push({
        time: new Date().toLocaleTimeString('vi-VN'),
        value: state.moisture,
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('Lỗi sync telemetry lên Firebase:', e);
    }
  }

  // Kiểm tra phiên tưới theo lịch có đạt ngưỡng tắt quy định hoặc hết thời gian không
  if (activeScheduleSession && state.pump) {
    const elapsedMinutes = (Date.now() - activeScheduleSession.startTime) / (60 * 1000);
    const reachMoistureLimit = state.moisture >= config.wetThreshold;
    const reachTimeLimit = elapsedMinutes >= activeScheduleSession.durationMinutes;

    if (reachMoistureLimit || reachTimeLimit) {
      const reason = reachMoistureLimit
        ? `Độ ẩm đất đã đạt ngưỡng quy định (${state.moisture}% >= ${config.wetThreshold}%)`
        : `Hết thời gian tưới (${activeScheduleSession.durationMinutes} phút)`;
      
      logEvent('SYS', `Lịch tưới hoàn tất: Tự động TẮT máy bơm (${reason})`);
      showToast(`Lịch tưới: Đã tắt bơm (${reason})`, 'info');
      addAlert('info', 'Lịch tưới hoàn thành', `Máy bơm đã tắt. Lý do: ${reason}`);
      addHistory('pump', `Lịch tưới: Tự động TẮT bơm (${reason})`, 'Lịch trình');
      
      mqttClient.publish(config.topicPump, 'OFF', { qos: 1 });
      activeScheduleSession = null;
    }
  }

  // Check alerts
  if (state.moisture < config.dryThreshold && state.mode === 'AUTO') {
    // Don't spam - only alert if was above threshold before
  }
  if (state.moisture < 10) {
    addAlert('danger', 'Độ ẩm đất cực thấp', `Độ ẩm chỉ còn ${state.moisture}%`, true);
  }
}

function updateOverviewUI() {
  // Stat cards
  const moistureEl = document.getElementById('stat-moisture');
  if (moistureEl) moistureEl.innerHTML = `${state.moisture}<small>%</small>`;

  const moistureBadge = document.getElementById('stat-moisture-badge');
  if (moistureBadge) {
    if (state.moisture < config.dryThreshold) {
      moistureBadge.textContent = 'Đất khô';
      moistureBadge.className = 'stat-badge';
    } else if (state.moisture >= config.wetThreshold) {
      moistureBadge.textContent = 'Đủ ẩm';
      moistureBadge.className = 'stat-badge stat-badge--success';
    } else {
      moistureBadge.textContent = 'Vừa phải';
      moistureBadge.className = 'stat-badge stat-badge--warning';
    }
  }

  // Cập nhật Đồng hồ đo độ ẩm (Gauge Chart) thời gian thực
  updateMoistureGauge(state.moisture);

  // RSSI
  const rssiEl = document.getElementById('stat-rssi');
  if (rssiEl && state.rssi) rssiEl.innerHTML = `${state.rssi}<small>dBm</small>`;

  const wifiBadge = document.getElementById('stat-wifi-badge');
  if (wifiBadge && state.rssi) {
    if (state.rssi > -50) { wifiBadge.textContent = 'Rất tốt'; wifiBadge.className = 'stat-badge stat-badge--success'; }
    else if (state.rssi > -70) { wifiBadge.textContent = 'Tốt'; wifiBadge.className = 'stat-badge stat-badge--success'; }
    else if (state.rssi > -85) { wifiBadge.textContent = 'Yếu'; wifiBadge.className = 'stat-badge stat-badge--warning'; }
    else { wifiBadge.textContent = 'Rất yếu'; wifiBadge.className = 'stat-badge'; }
  }

  // Last update
  if (state.lastUpdate) {
    const updateEl = document.getElementById('stat-last-update');
    if (updateEl) updateEl.textContent = state.lastUpdate.toLocaleTimeString('vi-VN');
  }

  // Pump today stats
  const pumpTodayEl = document.getElementById('stat-pump-today');
  if (pumpTodayEl) pumpTodayEl.textContent = `${pumpTodayCount} lần`;

  const pumpTotalEl = document.getElementById('stat-pump-total-time');
  if (pumpTotalEl) {
    const m = Math.floor(pumpTotalSeconds / 60);
    const s = pumpTotalSeconds % 60;
    pumpTotalEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  // Alert count
  const alertCountEl = document.getElementById('stat-alert-count');
  if (alertCountEl) alertCountEl.textContent = unreadAlerts;

  // Device page
  const devRssi = document.getElementById('dev-rssi');
  if (devRssi && state.rssi) devRssi.textContent = `${state.rssi} dBm`;
  const devLastSeen = document.getElementById('dev-last-seen');
  if (devLastSeen && state.lastUpdate) devLastSeen.textContent = state.lastUpdate.toLocaleString('vi-VN');
}

/**
 * Cập nhật Đồng hồ đo độ ẩm (Gauge Chart)
 * Hiển thị trực quan từ 0% đến 100% với kim xoay mượt mà (spring physics),
 * đổi màu cảnh báo theo 3 trạng thái: Đỏ (Khô) - Vàng (Trung bình) - Xanh lá (Đủ ẩm).
 */
function updateMoistureGauge(moisture) {
  const gaugeWrapper = document.getElementById('gauge-wrapper');
  if (!gaugeWrapper) return;

  const needleGroup = document.getElementById('gauge-needle-group');
  const digitalVal = document.getElementById('gauge-digital-val');
  const badgeChip = document.getElementById('gauge-badge');
  const badgeText = document.getElementById('gauge-state-badge-text');
  const progressArc = document.getElementById('gauge-progress-arc');

  if (moisture === null || moisture === undefined || isNaN(moisture)) {
    if (needleGroup) needleGroup.style.transform = 'rotate(-110deg)';
    if (digitalVal) digitalVal.textContent = '--%';
    if (badgeText) badgeText.textContent = 'Mất tín hiệu';
    if (badgeChip) {
      badgeChip.textContent = 'Mất kết nối';
      badgeChip.className = 'chip chip--neutral';
      badgeChip.style.backgroundColor = '';
      badgeChip.style.color = '';
      badgeChip.style.borderColor = '';
    }
    if (progressArc) progressArc.style.strokeDashoffset = '364.8';
    gaugeWrapper.classList.remove('gauge-state-dry', 'gauge-state-mid', 'gauge-state-wet');
    return;
  }

  const val = Math.max(0, Math.min(100, Number(moisture)));

  // Kim đồng hồ xoay từ -110 độ (0%) đến +110 độ (100%), tổng góc quét 220 độ
  const angle = -110 + (val / 100) * 220;
  if (needleGroup) {
    needleGroup.style.transform = `rotate(${angle.toFixed(1)}deg)`;
  }

  // Số điện tử trung tâm
  if (digitalVal) {
    digitalVal.textContent = `${Math.round(val)}%`;
  }

  // Thanh cung tiến trình phát sáng: chiều dài chuẩn 364.8
  const totalLength = 364.8;
  const offset = totalLength - (val / 100) * totalLength;
  if (progressArc) {
    progressArc.style.strokeDashoffset = offset.toFixed(1);
  }

  // Lấy ngưỡng cấu hình hiện hành (mặc định khô 35%, ướt 60%)
  const dryThresh = (config && config.dryThreshold) ? config.dryThreshold : 35;
  const wetThresh = (config && config.wetThreshold) ? config.wetThreshold : 60;

  gaugeWrapper.classList.remove('gauge-state-dry', 'gauge-state-mid', 'gauge-state-wet');

  // Đổi màu cảnh báo theo 3 trạng thái: Đỏ (Khô) - Vàng (Trung bình) - Xanh lá (Đủ ẩm)
  if (val < dryThresh) {
    // 1. ĐỎ - Đất khô (< 35%)
    gaugeWrapper.classList.add('gauge-state-dry');
    if (badgeChip) {
      badgeChip.textContent = 'Đất khô';
      badgeChip.className = 'chip chip--danger';
      badgeChip.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
      badgeChip.style.color = '#EF4444';
      badgeChip.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    }
    if (badgeText) badgeText.textContent = 'Đất khô - Cần tưới';
    if (progressArc) progressArc.style.stroke = '#EF4444';
  } else if (val >= wetThresh) {
    // 3. XANH LÁ - Đất đủ ẩm (>= 60%)
    gaugeWrapper.classList.add('gauge-state-wet');
    if (badgeChip) {
      badgeChip.textContent = 'Đủ ẩm';
      badgeChip.className = 'chip chip--success';
      badgeChip.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
      badgeChip.style.color = '#10B981';
      badgeChip.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    }
    if (badgeText) badgeText.textContent = 'Đất đủ ẩm - Tối ưu';
    if (progressArc) progressArc.style.stroke = '#10B981';
  } else {
    // 2. VÀNG - Độ ẩm trung bình (35% - 60%)
    gaugeWrapper.classList.add('gauge-state-mid');
    if (badgeChip) {
      badgeChip.textContent = 'Trung bình';
      badgeChip.className = 'chip chip--warning';
      badgeChip.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
      badgeChip.style.color = '#F59E0B';
      badgeChip.style.borderColor = 'rgba(245, 158, 11, 0.4)';
    }
    if (badgeText) badgeText.textContent = 'Độ ẩm vừa phải';
    if (progressArc) progressArc.style.stroke = '#F59E0B';
  }
}

function updateMonitoringUI() {
  const cur = document.getElementById('monitor-current');
  if (cur) cur.textContent = `${state.moisture}%`;

  const adcEl = document.getElementById('monitor-adc');
  if (adcEl) adcEl.textContent = state.adc || '--';

  const updated = document.getElementById('monitor-updated');
  if (updated && state.lastUpdate) updated.textContent = state.lastUpdate.toLocaleTimeString('vi-VN');

  // Min/Max/Avg
  if (moistureHistory.length > 0) {
    const values = moistureHistory.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const minEl = document.getElementById('monitor-min');
    const maxEl = document.getElementById('monitor-max');
    const avgEl = document.getElementById('monitor-avg');
    if (minEl) minEl.textContent = `${min}%`;
    if (maxEl) maxEl.textContent = `${max}%`;
    if (avgEl) avgEl.textContent = `${avg}%`;
  }

  // Zone marker
  const marker = document.getElementById('moisture-zone-marker');
  if (marker) marker.style.left = `${Math.min(Math.max(state.moisture, 0), 100)}%`;

  // GPIO
  const gpioSoil = document.getElementById('gpio-soil');
  if (gpioSoil) gpioSoil.textContent = `ADC: ${state.adc}`;
  const gpioRelay = document.getElementById('gpio-relay');
  if (gpioRelay) gpioRelay.textContent = state.pump ? 'HIGH (ON)' : 'LOW (OFF)';
  const gpioLed = document.getElementById('gpio-led');
  if (gpioLed) gpioLed.textContent = state.pump ? 'HIGH' : 'LOW';
}

// =====================================================================
// 10. PUMP UI
// =====================================================================
function applyPumpUI(isPumpOn) {
  const wasPumpOn = state.pump;
  state.pump = isPumpOn;

  // Overview stat
  const statPump = document.getElementById('stat-pump');
  if (statPump) {
    statPump.textContent = isPumpOn ? 'BẬT' : 'TẮT';
    statPump.style.color = isPumpOn ? 'var(--color-success)' : '';
  }
  const pumpBadge = document.getElementById('stat-pump-badge');
  if (pumpBadge) {
    pumpBadge.textContent = isPumpOn ? 'Relay ON' : 'Relay OFF';
    pumpBadge.className = isPumpOn ? 'stat-badge stat-badge--success' : 'stat-badge stat-badge--neutral';
  }

  // Pump status text
  const statusTexts = document.querySelectorAll('#pump-status-text, #ctrl-pump-text');
  statusTexts.forEach(el => {
    el.textContent = isPumpOn ? 'Đang chạy' : 'Đang tắt';
    el.style.color = isPumpOn ? 'var(--color-success)' : '';
  });

  // Pump chip
  const pumpChip = document.getElementById('ctrl-pump-status-chip');
  if (pumpChip) {
    pumpChip.textContent = isPumpOn ? 'BẬT' : 'TẮT';
    pumpChip.style.background = isPumpOn ? 'rgba(22,163,74,0.1)' : '';
    pumpChip.style.color = isPumpOn ? 'var(--color-success)' : '';
  }

  // Timer
  if (isPumpOn && !wasPumpOn) {
    pumpTodayCount++;
    pumpSeconds = 0;
    if (pumpTimer) clearInterval(pumpTimer);
    pumpTimer = setInterval(() => {
      pumpSeconds++;
      pumpTotalSeconds++;
      const runtimeEls = document.querySelectorAll('#pump-runtime, #ctrl-pump-runtime');
      const mins = String(Math.floor(pumpSeconds / 60)).padStart(2, '0');
      const secs = String(pumpSeconds % 60).padStart(2, '0');
      runtimeEls.forEach(el => el.textContent = `${mins}:${secs}`);
    }, 1000);
    addHistory('pump', 'Máy bơm BẬT', state.mode === 'AUTO' ? 'Hệ thống' : 'Người dùng');
  } else if (!isPumpOn && wasPumpOn) {
    if (pumpTimer) {
      clearInterval(pumpTimer);
      pumpTimer = null;
    }
    addHistory('pump', `Máy bơm TẮT (đã chạy ${pumpSeconds}s)`, state.mode === 'AUTO' ? 'Hệ thống' : 'Người dùng');
  }
}

// =====================================================================
// 11. MODE UI
// =====================================================================
function applyModeUI(mode) {
  state.mode = mode;
  const isAuto = mode === 'AUTO';

  // Overview stat
  const statMode = document.getElementById('stat-mode');
  if (statMode) statMode.textContent = mode;
  const modeBadge = document.getElementById('stat-mode-badge');
  if (modeBadge) {
    modeBadge.textContent = isAuto ? 'Tự động' : 'Thủ công';
    modeBadge.className = isAuto ? 'stat-badge stat-badge--success' : 'stat-badge stat-badge--warning';
  }

  // Chips
  const chips = document.querySelectorAll('#quick-mode-chip, #ctrl-mode-chip');
  chips.forEach(el => {
    el.textContent = mode;
    el.style.background = isAuto ? '' : 'rgba(217,119,6,0.1)';
    el.style.color = isAuto ? '' : 'var(--color-warning)';
  });

  // Mode description
  const ctrlDesc = document.getElementById('ctrl-mode-desc');
  if (ctrlDesc) {
    ctrlDesc.textContent = isAuto
      ? `Hệ thống tự động tưới khi độ ẩm < ${config.dryThreshold}% và dừng khi ≥ ${config.wetThreshold}%.`
      : 'Bạn có toàn quyền bật/tắt bơm qua nút điều khiển.';
  }

  // Info box
  const ctrlInfo = document.getElementById('ctrl-mode-info');
  if (ctrlInfo) {
    ctrlInfo.innerHTML = isAuto
      ? '<span>ESP32 và Node-RED tự động bật bơm khi đất khô và tắt khi đủ ẩm.</span>'
      : '<span>Hệ thống đang ở chế độ thủ công. Bạn điều khiển bơm trực tiếp.</span>';
  }

  // Segmented buttons (all pages)
  const autoButtons = document.querySelectorAll('#btn-mode-auto, #ctrl-btn-auto');
  const manualButtons = document.querySelectorAll('#btn-mode-manual, #ctrl-btn-manual');
  autoButtons.forEach(b => b.classList.toggle('active', isAuto));
  manualButtons.forEach(b => b.classList.toggle('active', !isAuto));

  // Pump button enable/disable
  const pumpOnBtns = document.querySelectorAll('#btn-pump-on, #ctrl-btn-pump-on');
  const pumpOffBtns = document.querySelectorAll('#btn-pump-off, #ctrl-btn-pump-off');
  pumpOnBtns.forEach(b => b.disabled = isAuto);
  pumpOffBtns.forEach(b => b.disabled = isAuto);

  // Auto lock notices
  const lockBanners = document.querySelectorAll('#auto-lock-banner, #ctrl-auto-lock');
  lockBanners.forEach(el => el.classList.toggle('hidden', !isAuto));
}

// =====================================================================
// 12. CONTROL COMMANDS
// =====================================================================
function setMode(newMode) {
  if (!state.mqttConnected) {
    showToast('Chưa kết nối MQTT!', 'danger');
    return;
  }
  logEvent('TX', `Gửi lệnh mode: ${newMode}`);
  mqttClient.publish(config.topicMode, newMode, { qos: 1 });
  applyModeUI(newMode);
  showToast(`Đã gửi lệnh: ${newMode}`, 'success');
  addCommandHistory('mode', newMode, 'sent');
  addHistory('mode', `Chuyển chế độ sang ${newMode}`, 'Người dùng');
}

function sendPumpCommand(action) {
  if (!state.mqttConnected) {
    showToast('Chưa kết nối MQTT!', 'danger');
    return;
  }
  if (state.mode === 'AUTO') {
    showToast('Đang ở chế độ AUTO! Chuyển sang MANUAL trước.', 'warning');
    return;
  }
  logEvent('TX', `Gửi lệnh bơm: ${action}`);
  mqttClient.publish(config.topicPump, action, { qos: 1 });
  applyPumpUI(action === 'ON');
  showToast(`Đã gửi lệnh ${action} máy bơm`, 'success');
  addCommandHistory('pump', action, 'sent');
}

function confirmEmergencyStop() {
  showConfirm(
    'Dừng khẩn cấp',
    'Xác nhận DỪNG KHẨN CẤP? Hệ thống sẽ chuyển sang MANUAL và TẮT bơm ngay lập tức.',
    () => {
      sendEmergencyStop();
    }
  );
}

function sendEmergencyStop() {
  if (!state.mqttConnected) {
    showToast('Chưa kết nối MQTT!', 'danger');
    return;
  }
  logEvent('WARN', '!!! DỪNG KHẨN CẤP (E-STOP) !!!');
  mqttClient.publish(config.topicMode, 'MANUAL', { qos: 1 });
  mqttClient.publish(config.topicPump, 'OFF', { qos: 1 });
  applyModeUI('MANUAL');
  applyPumpUI(false);
  showToast('ĐÃ DỪNG KHẨN CẤP: MANUAL + TẮT BƠM', 'danger');
  addAlert('danger', 'Dừng khẩn cấp', 'Người dùng kích hoạt E-STOP');
  addHistory('pump', 'DỪNG KHẨN CẤP (E-STOP)', 'Người dùng');
}

function addCommandHistory(type, value, status) {
  const now = new Date();
  commandHistory.unshift({
    time: now.toLocaleTimeString('vi-VN'),
    type: type === 'mode' ? 'Chế độ' : 'Máy bơm',
    value,
    status
  });
  if (commandHistory.length > 50) commandHistory.pop();
  renderCommandHistory();
}

function renderCommandHistory() {
  const tbody = document.getElementById('cmd-history-body');
  if (!tbody) return;
  if (commandHistory.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Chưa có lệnh nào được gửi</td></tr>';
    return;
  }
  tbody.innerHTML = commandHistory.slice(0, 20).map(cmd => `
    <tr>
      <td>${cmd.time}</td>
      <td>${cmd.type}</td>
      <td><strong>${cmd.value}</strong></td>
      <td>${cmd.status === 'sent' ? '✓ Đã gửi' : cmd.status}</td>
    </tr>
  `).join('');
}

// =====================================================================
// 13. CHARTS
// =====================================================================
function createChartConfig(canvasId) {
  const style = getComputedStyle(document.documentElement);
  return {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Độ ẩm đất (%)',
        data: [],
        borderColor: '#22c55e',
        borderWidth: 2,
        backgroundColor: 'rgba(34, 197, 94, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointBackgroundColor: '#22c55e',
        pointBorderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: style.getPropertyValue('--chart-text').trim(),
            font: { family: 'Inter', size: 12 },
            boxWidth: 12,
            padding: 16
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFont: { family: 'Inter' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 10,
          cornerRadius: 6
        }
      },
      scales: {
        y: {
          min: 0, max: 100,
          grid: { color: style.getPropertyValue('--chart-grid').trim() },
          ticks: {
            color: style.getPropertyValue('--chart-text').trim(),
            font: { family: 'JetBrains Mono', size: 11 },
            callback: v => `${v}%`
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: style.getPropertyValue('--chart-text').trim(),
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            font: { family: 'JetBrains Mono', size: 10 }
          }
        }
      }
    }
  };
}

function initChart() {
  const ctx = document.getElementById('moistureChart');
  if (!ctx) return;
  chartInstance = new Chart(ctx.getContext('2d'), createChartConfig('moistureChart'));
}

function initMonitorChart() {
  const ctx = document.getElementById('monitorChart');
  if (!ctx) return;
  const cfg = createChartConfig('monitorChart');
  // Add threshold lines
  cfg.data.datasets.push({
    label: `Ngưỡng khô (${config.dryThreshold}%)`,
    data: [],
    borderColor: 'rgba(220,38,38,0.4)',
    borderWidth: 1,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false
  });
  cfg.data.datasets.push({
    label: `Ngưỡng ẩm (${config.wetThreshold}%)`,
    data: [],
    borderColor: 'rgba(22,163,74,0.4)',
    borderWidth: 1,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false
  });
  monitorChartInstance = new Chart(ctx.getContext('2d'), cfg);
}

function appendChartData(val) {
  if (!chartInstance) return;
  const time = new Date().toLocaleTimeString('vi-VN');
  chartInstance.data.labels.push(time);
  chartInstance.data.datasets[0].data.push(val);
  if (chartInstance.data.labels.length > 25) {
    chartInstance.data.labels.shift();
    chartInstance.data.datasets[0].data.shift();
  }
  chartInstance.update('none');
}

// =====================================================================
// 13.5. HISTORICAL DATA ENGINE & TIME RANGE FILTER
// =====================================================================
function parsePointTimestamp(p) {
  if (!p) return Date.now();
  if (p.timestamp && typeof p.timestamp === 'number') return p.timestamp;
  if (p.time && typeof p.time === 'string') {
    const isoDate = new Date(p.time);
    if (!isNaN(isoDate.getTime()) && p.time.includes('-')) return isoDate.getTime();
    const parts = p.time.trim().split(':');
    if (parts.length >= 2) {
      const d = new Date();
      d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || 0, 10), 0);
      if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);
      return d.getTime();
    }
  }
  return Date.now();
}

function ensureMoistureHistory() {
  if (moistureHistory.length > 0) return;
  const now = Date.now();
  const baseMoisture = (state.moisture && state.moisture > 0) ? state.moisture : 48;
  const historyPoints = [];
  // Tạo dữ liệu nền 24 giờ qua (10 phút / điểm = 144 điểm)
  const totalPoints = 144;
  const stepMs = (24 * 60 * 60 * 1000) / totalPoints;

  for (let i = totalPoints; i >= 1; i--) {
    const t = now - (i * stepMs);
    const d = new Date(t);
    const hour = d.getHours();
    let val = baseMoisture;
    if (hour >= 11 && hour <= 14) val -= 7;
    else if (hour >= 6 && hour <= 8) val += 10;
    else if (hour >= 17 && hour <= 19) val += 12;
    const noise = Math.sin(i * 0.45) * 3 + Math.cos(i * 0.25) * 2;
    val = Math.round(Math.min(Math.max(val + noise, 28), 75));
    historyPoints.push({ time: t, value: val });
  }

  moistureHistory.push(...historyPoints);
}

function updateMonitorChart() {
  if (!monitorChartInstance) return;
  ensureMoistureHistory();

  const select = document.getElementById('monitor-timerange');
  const minutes = select ? parseInt(select.value, 10) : 60;
  const now = Date.now();
  const cutoffTime = now - (minutes * 60 * 1000);

  // Lọc chính xác các điểm đo nằm trong khung giờ được chọn
  let points = moistureHistory.filter(p => p.time >= cutoffTime);

  // Nếu trong khoảng lọc chưa có điểm nào, vẽ đường nằm ngang theo độ ẩm hiện tại
  if (points.length === 0) {
    const curVal = (state.moisture && state.moisture > 0) ? state.moisture : 48;
    points = [
      { time: cutoffTime, value: curVal },
      { time: now, value: curVal }
    ];
  } else if (points.length === 1) {
    points = [
      { time: cutoffTime, value: points[0].value },
      points[0]
    ];
  }

  // Giới hạn số điểm hiển thị trên biểu đồ (downsample tối đa 40 điểm để đường vẽ mượt)
  const maxDisplay = 40;
  let displayPoints = points;
  if (points.length > maxDisplay) {
    const step = Math.ceil(points.length / maxDisplay);
    displayPoints = [];
    for (let i = 0; i < points.length; i += step) {
      displayPoints.push(points[i]);
    }
    if (displayPoints[displayPoints.length - 1] !== points[points.length - 1]) {
      displayPoints.push(points[points.length - 1]);
    }
  }

  // Định dạng nhãn trục X theo khung giờ
  const labels = displayPoints.map(p => {
    const d = new Date(p.time);
    if (minutes <= 60) {
      // 30 phút hoặc 1 giờ: hiện Giờ:Phút:Giây
      return d.toLocaleTimeString('vi-VN');
    } else {
      // 6 giờ hoặc 24 giờ: hiện Giờ:Phút
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
  });

  const values = displayPoints.map(p => p.value);

  // Cập nhật biểu đồ Monitor Chart
  monitorChartInstance.data.labels = labels;
  monitorChartInstance.data.datasets[0].data = values;
  monitorChartInstance.data.datasets[1].data = values.map(() => config.dryThreshold);
  monitorChartInstance.data.datasets[2].data = values.map(() => config.wetThreshold);
  monitorChartInstance.data.datasets[1].label = `Ngưỡng khô (${config.dryThreshold}%)`;
  monitorChartInstance.data.datasets[2].label = `Ngưỡng ẩm (${config.wetThreshold}%)`;
  monitorChartInstance.update();

  // Cập nhật thống kê Min / Max / Avg riêng biệt cho khung giờ này
  if (values.length > 0) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const minEl = document.getElementById('monitor-min');
    const maxEl = document.getElementById('monitor-max');
    const avgEl = document.getElementById('monitor-avg');
    if (minEl) minEl.textContent = `${min}%`;
    if (maxEl) maxEl.textContent = `${max}%`;
    if (avgEl) avgEl.textContent = `${avg}%`;
  }
}

function appendMonitorChartData(val) {
  const now = Date.now();
  moistureHistory.push({ time: now, value: val });
  if (moistureHistory.length > 2000) moistureHistory.shift();

  // Lưu định kỳ vào localStorage
  try {
    localStorage.setItem('n03_moisture_history', JSON.stringify(moistureHistory.slice(-500)));
  } catch (e) {}

  // Nếu người dùng đang xem trang Giám sát, cập nhật biểu đồ theo khung giờ
  const activePage = document.querySelector('.page.active');
  if (activePage && activePage.id === 'page-monitoring') {
    updateMonitorChart();
  }
}

// =====================================================================
// 14. LOGGING & EXPORT
// =====================================================================
function logEvent(type, message) {
  const stream = document.getElementById('log-stream');
  if (!stream) return;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN');
  activityLogs.push({ time: now.toISOString(), type, message });

  const row = document.createElement('div');
  row.className = 'log-row';
  let tagClass = 'tag-sys';
  if (type === 'RX') tagClass = 'tag-rx';
  else if (type === 'TX') tagClass = 'tag-tx';
  else if (type === 'WARN') tagClass = 'tag-warn';
  else if (type === 'ERR') tagClass = 'tag-err';

  row.innerHTML = `
    <span class="log-time">[${timeStr}]</span>
    <span class="log-tag ${tagClass}">${type}</span>
    <span class="log-msg">${escapeHtml(message)}</span>
  `;
  stream.appendChild(row);
  stream.scrollTop = stream.scrollHeight;
  while (stream.children.length > 80) stream.removeChild(stream.firstChild);
}

function clearLogs() {
  const stream = document.getElementById('log-stream');
  if (stream) stream.innerHTML = '';
  showToast('Đã xóa log', 'info');
}

function exportLogsToCSV() {
  if (activityLogs.length === 0) { showToast('Chưa có dữ liệu!', 'warning'); return; }
  let csv = "data:text/csv;charset=utf-8,Timestamp,Type,Message\r\n";
  activityLogs.forEach(r => {
    csv += `"${r.time}","${r.type}","${r.message.replace(/"/g, '""')}"\r\n`;
  });
  downloadFile(csv, `n03_log_${new Date().toISOString().slice(0,10)}.csv`);
  showToast(`Đã xuất ${activityLogs.length} dòng`, 'success');
}

function exportHistoryCSV() {
  if (historyData.length === 0) { showToast('Chưa có dữ liệu!', 'warning'); return; }
  let csv = "data:text/csv;charset=utf-8,Timestamp,Type,Content,Source\r\n";
  historyData.forEach(r => {
    csv += `"${r.time}","${r.type}","${r.content.replace(/"/g, '""')}","${r.source}"\r\n`;
  });
  downloadFile(csv, `n03_history_${new Date().toISOString().slice(0,10)}.csv`);
  showToast(`Đã xuất ${historyData.length} bản ghi`, 'success');
}

function downloadFile(content, filename) {
  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(content));
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// =====================================================================
// 15. HISTORY SYSTEM
// =====================================================================
function addHistory(type, content, source) {
  const now = new Date();
  const entry = {
    time: now.toISOString(),
    timeDisplay: now.toLocaleString('vi-VN'),
    type,
    content,
    source
  };
  historyData.unshift(entry);
  if (historyData.length > 1000) historyData.pop();
  saveHistory();
  pushHistoryToCloud(entry);
  renderHistory();
}

function renderHistory() {
  const tbody = document.getElementById('history-body');
  if (!tbody) return;

  const filter = document.getElementById('history-filter')?.value || 'all';
  const search = (document.getElementById('history-search')?.value || '').toLowerCase();

  let filtered = historyData;
  if (filter !== 'all') filtered = filtered.filter(h => h.type === filter);
  if (search) filtered = filtered.filter(h => h.content.toLowerCase().includes(search));

  const total = filtered.length;
  const totalPages = Math.ceil(total / historyPerPage) || 1;
  if (historyPage > totalPages) historyPage = totalPages;

  const start = (historyPage - 1) * historyPerPage;
  const page = filtered.slice(start, start + historyPerPage);

  if (page.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Không có dữ liệu</td></tr>';
  } else {
    const typeLabels = { moisture: 'Độ ẩm', pump: 'Máy bơm', mode: 'Chế độ', connection: 'Kết nối', alert: 'Cảnh báo' };
    tbody.innerHTML = page.map(h => `
      <tr>
        <td>${h.timeDisplay}</td>
        <td><span class="tag tag--${h.type === 'alert' ? 'dry' : 'ok'}">${typeLabels[h.type] || h.type}</span></td>
        <td>${escapeHtml(h.content)}</td>
        <td>${h.source}</td>
      </tr>
    `).join('');
  }

  // Pagination
  const pagEl = document.getElementById('history-pagination');
  if (pagEl && totalPages > 1) {
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="btn btn-sm ${i === historyPage ? 'btn-primary' : 'btn-ghost'}" onclick="goHistoryPage(${i})">${i}</button>`;
    }
    pagEl.innerHTML = html;
  } else if (pagEl) {
    pagEl.innerHTML = '';
  }
}

function goHistoryPage(p) { historyPage = p; renderHistory(); }

// =====================================================================
// 16. ALERTS SYSTEM
// =====================================================================
function loadAlerts() {
  try {
    const raw = localStorage.getItem('n03_alerts');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        alertsData.length = 0;
        parsed.forEach(item => alertsData.push(item));
        unreadAlerts = alertsData.filter(a => !a.read).length;
      }
    }
  } catch (e) {
    console.error('Lỗi đọc n03_alerts:', e);
  }
}

function saveAlerts() {
  try {
    const toSave = alertsData.slice(0, 100);
    localStorage.setItem('n03_alerts', JSON.stringify(toSave));
    syncToCloud('alerts', toSave);
  } catch (e) {
    console.error('Lỗi lưu n03_alerts:', e);
  }
}

function addAlert(severity, title, detail, dedup = true, windowMs = 300000) { // dedup mặc định 5 phút
  // Kiểm tra trùng lặp với các alert đã có trong alertsData
  const cleanTitle = (title || '').trim().toLowerCase();
  const cleanDetail = (detail || '').trim().toLowerCase();
  const nowTs = Date.now();

  if (dedup) {
    const existing = alertsData.find(a => 
      a.severity === severity &&
      (a.title || '').trim().toLowerCase() === cleanTitle &&
      (a.detail || '').trim().toLowerCase() === cleanDetail
    );
    // Nếu cùng nội dung và xảy ra trong vòng windowMs thì không tạo cảnh báo mới
    if (existing && (nowTs - existing.id < windowMs)) {
      return;
    }
  }

  const now = new Date();
  alertsData.unshift({
    id: nowTs,
    severity,
    title,
    detail,
    time: now.toLocaleString('vi-VN'),
    read: false
  });
  unreadAlerts++;
  if (alertsData.length > 200) alertsData.pop();

  saveAlerts();
  updateAlertBadge();
  renderAlerts();
  addHistory('alert', `[${severity.toUpperCase()}] ${title}: ${detail}`, 'Hệ thống');
}

function updateAlertBadge() {
  const badge = document.getElementById('alert-count-badge');
  const statEl = document.getElementById('stat-alert-count');
  if (badge) {
    badge.textContent = unreadAlerts;
    badge.style.display = unreadAlerts > 0 ? '' : 'none';
  }
  if (statEl) statEl.textContent = unreadAlerts;
}

function renderAlerts() {
  const container = document.getElementById('alert-list');
  if (!container) return;

  const filter = document.getElementById('alert-filter')?.value || 'all';
  let filtered = alertsData;
  if (filter === 'unread') filtered = filtered.filter(a => !a.read);
  else if (filter !== 'all') filtered = filtered.filter(a => a.severity === filter);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <p>Không có cảnh báo</p>
      <span class="text-secondary">Hệ thống đang hoạt động bình thường</span>
    </div>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 50).map(a => `
    <div class="alert-item ${a.read ? '' : 'unread'}" data-id="${a.id}">
      <div class="alert-indicator alert-indicator--${a.severity}"></div>
      <div class="alert-content">
        <div class="alert-title">${escapeHtml(a.title)}</div>
        <div class="text-secondary" style="font-size:var(--text-sm)">${escapeHtml(a.detail)}</div>
        <div class="alert-time">${a.time}</div>
      </div>
      <div class="alert-actions">
        ${!a.read ? `<button class="btn btn-sm btn-ghost" onclick="markAlertRead(${a.id})">Đã đọc</button>` : ''}
      </div>
    </div>
  `).join('');
}

function markAlertRead(id) {
  const alert = alertsData.find(a => a.id === id);
  if (alert && !alert.read) {
    alert.read = true;
    unreadAlerts = Math.max(0, unreadAlerts - 1);
    saveAlerts();
    updateAlertBadge();
    renderAlerts();
  }
}

function markAllAlertsRead() {
  alertsData.forEach(a => a.read = true);
  unreadAlerts = 0;
  saveAlerts();
  updateAlertBadge();
  renderAlerts();
  showToast('Đã đánh dấu tất cả đã đọc', 'info');
}

// =====================================================================
// 17. SCHEDULE SYSTEM
// =====================================================================
let editingScheduleIdx = -1;
let scheduleCheckTimer = null;

function initScheduleListeners() {
  document.getElementById('btn-add-schedule')?.addEventListener('click', () => {
    editingScheduleIdx = -1;
    document.getElementById('schedule-form-title').textContent = 'Thêm lịch tưới mới';
    document.getElementById('schedule-form-panel').style.display = '';
  });

  document.getElementById('btn-cancel-schedule')?.addEventListener('click', () => {
    document.getElementById('schedule-form-panel').style.display = 'none';
  });

  document.getElementById('btn-save-schedule')?.addEventListener('click', saveScheduleForm);

  // Start schedule checker mỗi 5 giây để bắt chuẩn xác từng phút
  scheduleCheckTimer = setInterval(checkSchedules, 5000);
}

function saveScheduleForm() {
  const time = document.getElementById('sched-time').value;
  const duration = parseInt(document.getElementById('sched-duration').value) || 5;
  const checkMoisture = document.getElementById('sched-check-moisture').checked;
  const dayCheckboxes = document.querySelectorAll('#sched-days input[type="checkbox"]');
  const days = [];
  dayCheckboxes.forEach(cb => { if (cb.checked) days.push(parseInt(cb.value)); });

  if (!time || days.length === 0) {
    showToast('Vui lòng chọn giờ và ít nhất 1 ngày', 'warning');
    return;
  }

  const schedule = {
    id: editingScheduleIdx >= 0 ? schedulesData[editingScheduleIdx].id : Date.now(),
    time,
    duration,
    days,
    checkMoisture,
    enabled: true
  };

  if (editingScheduleIdx >= 0) {
    schedulesData[editingScheduleIdx] = schedule;
  } else {
    schedulesData.push(schedule);
  }

  saveSchedules();
  renderSchedules();
  document.getElementById('schedule-form-panel').style.display = 'none';
  showToast('Đã lưu lịch tưới', 'success');
  addHistory('mode', `Lịch tưới ${editingScheduleIdx >= 0 ? 'cập nhật' : 'mới'}: ${time}`, 'Người dùng');
}

function renderSchedules() {
  const list = document.getElementById('schedule-list');
  const empty = document.getElementById('schedule-empty');
  if (!list) return;

  if (schedulesData.length === 0) {
    list.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }

  list.style.display = '';
  if (empty) empty.style.display = 'none';

  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  list.innerHTML = schedulesData.map((s, i) => `
    <div class="schedule-item">
      <div class="schedule-info">
        <div class="schedule-time">${s.time}</div>
        <div class="schedule-days">${s.days.map(d => dayNames[d]).join(', ')}</div>
        <div class="schedule-duration">${s.duration} phút${s.checkMoisture ? ' · Kiểm tra độ ẩm' : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <label class="schedule-toggle">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="toggleSchedule(${i}, this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <button class="btn btn-sm btn-ghost" onclick="editSchedule(${i})">Sửa</button>
        <button class="btn btn-sm btn-ghost" onclick="deleteSchedule(${i})">Xóa</button>
      </div>
    </div>
  `).join('');
}

function toggleSchedule(idx, enabled) {
  schedulesData[idx].enabled = enabled;
  saveSchedules();
}

function editSchedule(idx) {
  const s = schedulesData[idx];
  editingScheduleIdx = idx;
  document.getElementById('sched-time').value = s.time;
  document.getElementById('sched-duration').value = s.duration;
  document.getElementById('sched-check-moisture').checked = s.checkMoisture;
  document.querySelectorAll('#sched-days input').forEach(cb => {
    cb.checked = s.days.includes(parseInt(cb.value));
  });
  document.getElementById('schedule-form-title').textContent = 'Chỉnh sửa lịch tưới';
  document.getElementById('schedule-form-panel').style.display = '';
}

function deleteSchedule(idx) {
  showConfirm('Xóa lịch tưới', 'Bạn có chắc muốn xóa lịch tưới này?', () => {
    schedulesData.splice(idx, 1);
    saveSchedules();
    renderSchedules();
    showToast('Đã xóa lịch tưới', 'info');
  });
}

// Trạng thái theo dõi tưới theo lịch
let activeScheduleSession = null; // { id, duration, startTime, checkMoisture }
let triggeredMinutes = new Set(); // Lưu các phút đã kích hoạt để không bị lặp lại

function checkSchedules() {
  if (!state.mqttConnected) return;
  const now = new Date();
  const currentDay = now.getDay();
  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${currentHours}:${currentMinutes}`;
  const minuteKey = `${currentDay}-${currentTime}`;

  // Reset bộ nhớ phút đã kích hoạt khi sang phút mới
  if (now.getSeconds() === 0 && triggeredMinutes.size > 20) {
    triggeredMinutes.clear();
  }

  schedulesData.forEach((s, idx) => {
    if (!s.enabled || !s.days.includes(currentDay)) return;
    if (s.time !== currentTime) return;
    
    // Nếu phút này đã kích hoạt lịch này rồi thì bỏ qua
    const runKey = `${idx}-${minuteKey}`;
    if (triggeredMinutes.has(runKey)) return;
    triggeredMinutes.add(runKey);

    // Kiểm tra nếu đất đã đủ ẩm theo cài đặt
    if (s.checkMoisture && state.moisture >= config.wetThreshold) {
      logEvent('SYS', `Lịch tưới ${s.time}: Bỏ qua vì độ ẩm đất (${state.moisture}%) >= ngưỡng ngắt (${config.wetThreshold}%)`);
      addHistory('mode', `Lịch tưới ${s.time}: Bỏ qua (đất đủ ẩm ${state.moisture}%)`, 'Hệ thống');
      showToast(`Lịch tưới ${s.time}: Đất đã đủ ẩm (${state.moisture}%), không cần tưới`, 'info');
      addAlert('info', 'Lịch tưới bỏ qua', `Độ ẩm đạt ${state.moisture}% (ngưỡng ngắt: ${config.wetThreshold}%)`);
      return;
    }

    // Bật bơm tưới theo lịch
    logEvent('SYS', `Đến giờ tưới ${s.time}: Tự động bật máy bơm (tối đa ${s.duration} phút)`);
    showToast(`Đến giờ tưới ${s.time}: Bật bơm tự động!`, 'success');
    addAlert('info', 'Lịch tưới tự động', `Đến giờ tưới ${s.time}: Máy bơm đã được BẬT`);
    addHistory('pump', `Lịch tưới ${s.time}: Tự động BẬT máy bơm`, 'Lịch trình');
    mqttClient.publish(config.topicPump, 'ON', { qos: 1 });

    // Đánh dấu phiên tưới đang hoạt động để theo dõi ngắt khi đạt ngưỡng
    activeScheduleSession = {
      scheduleIdx: idx,
      time: s.time,
      durationMinutes: s.duration,
      startTime: Date.now(),
      checkMoisture: s.checkMoisture
    };
  });
}

// =====================================================================
// 18. THRESHOLD CONFIG
// =====================================================================
function initThresholdListeners() {
  document.getElementById('btn-save-thresholds')?.addEventListener('click', saveThresholds);
  document.getElementById('btn-reset-thresholds')?.addEventListener('click', resetThresholds);
}

function saveThresholds() {
  const dry = parseInt(document.getElementById('cfg-dry-threshold').value);
  const wet = parseInt(document.getElementById('cfg-wet-threshold').value);
  const valMsg = document.getElementById('threshold-validation');

  if (dry >= wet) {
    if (valMsg) {
      valMsg.textContent = 'Lỗi: Ngưỡng bật bơm phải nhỏ hơn ngưỡng tắt bơm!';
      valMsg.style.display = '';
    }
    return;
  }
  if (dry < 0 || dry > 100 || wet < 0 || wet > 100) {
    if (valMsg) {
      valMsg.textContent = 'Lỗi: Giá trị ngưỡng phải nằm trong khoảng 0-100%';
      valMsg.style.display = '';
    }
    return;
  }

  if (valMsg) valMsg.style.display = 'none';

  config.dryThreshold = dry;
  config.wetThreshold = wet;
  config.maxPumpTime = parseInt(document.getElementById('cfg-max-pump-time').value) || 10;
  config.pumpCooldown = parseInt(document.getElementById('cfg-pump-cooldown').value) || 5;
  config.pumpDelay = parseInt(document.getElementById('cfg-pump-delay').value) || 0;
  config.timeoutSeconds = parseInt(document.getElementById('cfg-timeout').value) || 30;
  config.cmdTimeout = parseInt(document.getElementById('cfg-cmd-timeout').value) || 5;

  localStorage.setItem('n03_cfg', JSON.stringify(config));
  syncToCloud('config', {
    dryThreshold: config.dryThreshold,
    wetThreshold: config.wetThreshold,
    maxPumpTime: config.maxPumpTime,
    pumpCooldown: config.pumpCooldown,
    pumpDelay: config.pumpDelay
  });
  showToast('Đã lưu cấu hình ngưỡng', 'success');
  addHistory('mode', `Cập nhật ngưỡng: Khô <${dry}%, Ẩm >=${wet}%`, 'Người dùng');
}

function resetThresholds() {
  config.dryThreshold = DEFAULT_CONFIG.dryThreshold;
  config.wetThreshold = DEFAULT_CONFIG.wetThreshold;
  config.maxPumpTime = DEFAULT_CONFIG.maxPumpTime;
  config.pumpCooldown = DEFAULT_CONFIG.pumpCooldown;
  config.pumpDelay = DEFAULT_CONFIG.pumpDelay;
  updateThresholdInputs();
  showToast('Đã khôi phục ngưỡng mặc định', 'info');
}

// =====================================================================
// 19. OFFLINE DETECTOR
// =====================================================================
function startOfflineChecker() {
  if (offlineCheckerTimer) clearInterval(offlineCheckerTimer);
  offlineCheckerTimer = setInterval(() => {
    if (lastTelemetryTime > 0) {
      const elapsed = (Date.now() - lastTelemetryTime) / 1000;
      if (elapsed > config.timeoutSeconds && state.deviceOnline) {
        updateDeviceStatus(false);
        logEvent('WARN', `ESP32 không phản hồi (${Math.round(elapsed)}s)`);
        addAlert('warning', 'ESP32 mất tín hiệu', `Không nhận được dữ liệu trong ${Math.round(elapsed)} giây`, true);

        // Reset displayed values to indicate stale data
        const statMoisture = document.getElementById('stat-moisture');
        if (statMoisture) statMoisture.innerHTML = '--<small>%</small>';
        const moistureBadge = document.getElementById('stat-moisture-badge');
        if (moistureBadge) { moistureBadge.textContent = 'Không xác định'; moistureBadge.className = 'stat-badge stat-badge--neutral'; }
        updateMoistureGauge(null);
      }
    }
  }, 5000);
}

// =====================================================================
// 20. TOAST & CONFIRM MODAL
// =====================================================================
let recentToasts = new Map();

function showToast(msg, type = 'info', dedupWindowMs = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const key = `${type}:${msg.trim().toLowerCase()}`;
  const now = Date.now();
  if (recentToasts.has(key) && (now - recentToasts.get(key) < dedupWindowMs)) {
    return; // Tránh spam các toast thông báo giống nhau trong khoảng 3s
  }
  recentToasts.set(key, now);

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 4000);
}

let confirmCallback = null;
function showConfirm(title, message, onConfirm) {
  confirmCallback = onConfirm;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-modal').classList.add('open');
}

// =====================================================================
// 21. EVENT LISTENERS
// =====================================================================
function initEventListeners() {
  // Settings modal
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('btn-open-settings').addEventListener('click', () => settingsModal.classList.add('open'));
  document.getElementById('btn-close-settings').addEventListener('click', () => settingsModal.classList.remove('open'));

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    config.host = document.getElementById('cfg-host').value.trim();
    config.port = Number(document.getElementById('cfg-port').value);
    config.path = document.getElementById('cfg-path').value.trim();
    config.topicTelemetry = document.getElementById('cfg-topic-telemetry').value.trim();
    config.topicPump = document.getElementById('cfg-topic-pump').value.trim();
    config.topicMode = document.getElementById('cfg-topic-mode').value.trim();
    config.topicStatus = document.getElementById('cfg-topic-status').value.trim();
    config.firebaseUrl = (document.getElementById('cfg-firebase-url')?.value || '').trim();
    localStorage.setItem('n03_cfg', JSON.stringify(config));
    settingsModal.classList.remove('open');
    showToast('Đã lưu! Đang kết nối lại...', 'success');
    initFirebase();
    connectMQTT();
  });

  document.getElementById('btn-reset-settings').addEventListener('click', () => {
    config = { ...DEFAULT_CONFIG };
    localStorage.removeItem('n03_cfg');
    updateSettingsInputs();
    showToast('Đã khôi phục mặc định', 'info');
  });

  // Confirm modal
  document.getElementById('confirm-ok').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('open');
    if (confirmCallback) { confirmCallback(); confirmCallback = null; }
  });
  document.getElementById('confirm-cancel').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('open');
    confirmCallback = null;
  });
  document.getElementById('confirm-close').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('open');
    confirmCallback = null;
  });

  // Alert filters
  document.getElementById('alert-filter')?.addEventListener('change', renderAlerts);
  document.getElementById('btn-mark-all-read')?.addEventListener('click', markAllAlertsRead);

  // History filters
  document.getElementById('history-filter')?.addEventListener('change', () => { historyPage = 1; renderHistory(); });
  document.getElementById('history-search')?.addEventListener('input', () => { historyPage = 1; renderHistory(); });

  // Monitor time range filter (30m, 1h, 6h, 24h)
  const timerangeSelect = document.getElementById('monitor-timerange');
  if (timerangeSelect) {
    timerangeSelect.addEventListener('change', () => {
      updateMonitorChart();
      const txt = timerangeSelect.options[timerangeSelect.selectedIndex]?.text || '';
      showToast(`Đã chuyển khung thời gian: ${txt}`, 'info');
    });
  }

  // Update device page info
  const devBroker = document.getElementById('dev-broker');
  if (devBroker) devBroker.textContent = config.host;
  const devPort = document.getElementById('dev-port');
  if (devPort) devPort.textContent = `${config.port} (${config.port === 8884 ? 'WSS' : 'WS'})`;
}
