const serverInput = document.getElementById('serverInput');
const checkBtn = document.getElementById('checkBtn');
const result = document.getElementById('result');
const infoGrid = document.getElementById('infoGrid');
const statusBar = document.getElementById('statusBar');
const serverTitle = document.getElementById('serverTitle');
const serverSubtitle = document.getElementById('serverSubtitle');
const serverIcon = document.getElementById('serverIcon');
const motdBlock = document.getElementById('motdBlock');
const motdText = document.getElementById('motdText');

function setStatus(message, type = 'ok') {
  statusBar.textContent = message;
  statusBar.classList.remove('hidden', 'ok', 'error', 'loading');
  statusBar.classList.add(type);
}

function hideStatus() {
  statusBar.classList.add('hidden');
}

function parseServerInput(raw) {
  const text = raw.trim();
  if (!text) throw new Error('Please enter a server address.');

  if (text.includes('://')) {
    throw new Error('Please enter only host[:port], without http:// or https://');
  }

  const parts = text.split(':');
  if (parts.length > 2) {
    throw new Error('Invalid address format. Use host or host:port');
  }

  const host = parts[0]?.trim();
  const port = parts[1] ? Number(parts[1]) : undefined;

  if (!host) throw new Error('Host is missing.');
  if (parts[1] && (!Number.isInteger(port) || port <= 0 || port > 65535)) {
    throw new Error('Port must be a number between 1 and 65535.');
  }

  return { host, port };
}

function stripMinecraftFormatting(text = '') {
  return text.replace(/§[0-9a-fk-or]/gi, '').trim();
}

function buildMotd(description) {
  if (!description) return '';
  if (typeof description === 'string') return stripMinecraftFormatting(description);

  if (Array.isArray(description?.extra)) {
    const joined = description.extra.map((x) => (typeof x === 'string' ? x : x?.text || '')).join('');
    return stripMinecraftFormatting(joined || description.text || '');
  }

  return stripMinecraftFormatting(description.text || '');
}

function toLatencyMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed.replace(/ms$/i, '').trim());
    if (Number.isFinite(num) && num >= 0) return Math.round(num);
  }
  return null;
}

function extractLatency(payload) {
  const candidates = [
    payload?.debug?.ping,
    payload?.latency,
    payload?.ping,
    payload?.roundTripLatency,
    payload?.responseTime,
  ];

  for (const candidate of candidates) {
    const parsed = toLatencyMs(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
}

function normalizeData(payload, requestedHost, requestedPort) {
  const online = payload?.online ?? false;
  const playersOnline = payload?.players?.online ?? null;
  const playersMax = payload?.players?.max ?? null;

  const motd = payload?.motd?.clean?.join('\n') || payload?.motd?.raw?.join('\n') || buildMotd(payload?.description);

  return {
    online,
    host: payload?.host || requestedHost,
    ip: payload?.ip || payload?.srv_record || null,
    port: payload?.port || requestedPort || null,
    version: payload?.version || payload?.version?.name || null,
    protocol: payload?.protocol?.version || payload?.version?.protocol || null,
    playersOnline,
    playersMax,
    motd,
    favicon: payload?.icon || payload?.favicon || null,
    software: payload?.software || null,
    map: payload?.map || null,
    gamemode: payload?.gamemode || null,
    plugins: Array.isArray(payload?.plugins?.names) ? payload.plugins.names : payload?.plugins || null,
    mods: Array.isArray(payload?.mods?.names) ? payload.mods.names : payload?.mods || null,
    eulaBlocked: payload?.eula_blocked ?? false,
    latency: extractLatency(payload),
  };
}

function addInfoItem(label, value) {
  if (value === null || value === undefined || value === '') return;
  const item = document.createElement('div');
  item.className = 'info-item';

  const l = document.createElement('span');
  l.className = 'label';
  l.textContent = label;

  const v = document.createElement('span');
  v.className = 'value';
  v.textContent = Array.isArray(value) ? value.join(', ') : String(value);

  item.append(l, v);
  infoGrid.appendChild(item);
}

function renderServerInfo(data) {
  infoGrid.innerHTML = '';

  serverTitle.textContent = data.host ? `Server: ${data.host}` : 'Server Info';
  serverSubtitle.textContent = data.online ? 'Server is online' : 'Server is offline';

  if (data.favicon && typeof data.favicon === 'string' && data.favicon.startsWith('data:image')) {
    serverIcon.src = data.favicon;
    serverIcon.classList.remove('hidden');
  } else {
    serverIcon.classList.add('hidden');
  }

  addInfoItem('Status', data.online ? 'Online' : 'Offline');
  addInfoItem('IP / Host', data.ip || data.host);
  addInfoItem('Port', data.port);
  addInfoItem('Version', data.version);
  addInfoItem('Protocol', data.protocol);
  addInfoItem('Players', data.playersOnline !== null && data.playersMax !== null ? `${data.playersOnline}/${data.playersMax}` : null);
  addInfoItem('Latency', data.latency !== null ? `${data.latency} ms` : null);
  addInfoItem('Software', data.software);
  addInfoItem('Game Mode', data.gamemode);
  addInfoItem('Map', data.map);
  addInfoItem('Plugins', data.plugins);
  addInfoItem('Mods', data.mods);
  addInfoItem('EULA Blocked', data.eulaBlocked ? 'Yes' : null);

  if (data.motd) {
    motdText.textContent = data.motd;
    motdBlock.classList.remove('hidden');
  } else {
    motdBlock.classList.add('hidden');
  }

  result.classList.remove('hidden');
}

async function fetchServerInfo(host, port) {
  const address = port ? `${host}:${port}` : host;
  const endpoint = `https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`;
  const response = await fetch(endpoint, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response.json();
}

async function checkServer() {
  try {
    const { host, port } = parseServerInput(serverInput.value);
    checkBtn.disabled = true;
    setStatus('Checking server...', 'loading');

    const payload = await fetchServerInfo(host, port);
    const data = normalizeData(payload, host, port);

    renderServerInfo(data);

    if (data.online) {
      setStatus(`Success: ${data.host} is online.`, 'ok');
    } else {
      setStatus(`Server ${data.host} appears offline or unreachable.`, 'error');
    }
  } catch (error) {
    result.classList.add('hidden');
    setStatus(error.message || 'Unexpected error while checking server.', 'error');
  } finally {
    checkBtn.disabled = false;
  }
}

checkBtn.addEventListener('click', checkServer);

serverInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    checkServer();
  }
});

hideStatus();
