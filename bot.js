const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const SOURCE_JID = process.env.SOURCE_JID;
const DEST_JID = process.env.DEST_JID;
const AUTH_FOLDER = process.env.AUTH_FOLDER || './auth_info';

// Comma-separated list of any @lid identifiers WhatsApp has been seen using
// for the source contact, in addition to their normal @s.whatsapp.net JID.
// See README for why this is needed.
const KNOWN_SOURCE_LIDS = (process.env.KNOWN_SOURCE_LIDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const WINDOW_START = process.env.WINDOW_START || '22:40'; // 24h HH:MM
const WINDOW_END = process.env.WINDOW_END || '23:59';     // 24h HH:MM
const WINDOW_DAYS = (process.env.WINDOW_DAYS || '0,1,2,3,4,5') // 0=Sun ... 6=Sat, default Mon-Fri
  .split(',')
  .map((d) => parseInt(d.trim(), 10));
const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

let latestQR = null;
let connectionStatus = 'starting';
let onQRUpdateCallback = null;
let onStatusUpdateCallback = null;

function parseTimeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isWithinWindow() {
  const now = new Date();
  const istString = now.toLocaleString('en-US', { timeZone: TIMEZONE });
  const localNow = new Date(istString);

  const day = localNow.getDay();
  const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();
  const startMinutes = parseTimeToMinutes(WINDOW_START);
  const endMinutes = parseTimeToMinutes(WINDOW_END);

  return WINDOW_DAYS.includes(day) && currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

async function startBot() {
  if (!SOURCE_JID || !DEST_JID) {
    console.error('[FATAL] SOURCE_JID and DEST_JID must be set as environment variables.');
    process.exit(1);
  }

  console.log('[INIT] Watching SOURCE_JID:', SOURCE_JID);
  console.log('[INIT] Forwarding to DEST_JID:', DEST_JID);
  console.log('[INIT] Known source LIDs:', KNOWN_SOURCE_LIDS.length ? KNOWN_SOURCE_LIDS.join(', ') : '(none)');
  console.log('[INIT] Window:', WINDOW_START, '-', WINDOW_END, TIMEZONE, '| Days:', WINDOW_DAYS.join(','));

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });

  const startTime = Math.floor(Date.now() / 1000);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[QR] New QR code generated. Visit /qr on the deployed URL to scan it.');
      latestQR = qr;
      if (onQRUpdateCallback) onQRUpdateCallback(qr);
    }

    if (connection === 'open') {
      console.log('[CONNECTION] OPEN — bot connected and watching for messages.');
      latestQR = null;
      connectionStatus = 'connected';
      if (onStatusUpdateCallback) onStatusUpdateCallback('connected');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      connectionStatus = 'disconnected';
      console.log('[CONNECTION] CLOSED. Status code:', statusCode, '| Reconnecting:', shouldReconnect);
      if (onStatusUpdateCallback) onStatusUpdateCallback('disconnected');

      if (shouldReconnect) {
        setTimeout(() => startBot(), 3000);
      } else {
        console.log('[CONNECTION] Logged out remotely. Clear the AUTH_FOLDER volume and revisit /qr to relink.');
      }
    }
  });

  sock.ev.on('messages.upsert', async (upsert) => {
    if (upsert.type !== 'notify') return;

    for (const msg of upsert.messages) {
      const remoteJid = msg.key.remoteJid;

      if (!msg.message) continue;
      if (msg.key.fromMe) continue;

      const isFromSource = remoteJid === SOURCE_JID || KNOWN_SOURCE_LIDS.includes(remoteJid);
      if (!isFromSource) continue;

      const msgTimestamp = msg.messageTimestamp;
      if (msgTimestamp && msgTimestamp < startTime) {
        console.log('[SKIP] Message predates this bot session, ignoring.');
        continue;
      }

      if (!isWithinWindow()) {
        console.log('[SKIP] Outside allowed forwarding window, not forwarding.');
        continue;
      }

      console.log('[MATCH] Forwarding message from', remoteJid);
      try {
        await sock.sendMessage(DEST_JID, { forward: msg });
        console.log('[SUCCESS] Forwarded.');
      } catch (err) {
        console.error('[ERROR] Forward failed:', err.message);
      }
    }
  });

  return sock;
}

function onQRUpdate(cb) {
  onQRUpdateCallback = cb;
}

function onStatusUpdate(cb) {
  onStatusUpdateCallback = cb;
}

module.exports = {
  startBot,
  onQRUpdate,
  onStatusUpdate,
  getLatestQR: () => latestQR,
  getStatus: () => connectionStatus
};
