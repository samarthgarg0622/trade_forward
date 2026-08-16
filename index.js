require('dotenv').config();
const express = require('express');
const QRCode = require('qrcode');
const { startBot, getLatestQR, getStatus } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Optional shared-secret so random visitors can't scan your QR and hijack the link.
// Set QR_SECRET in your environment variables, then visit /qr?secret=yoursecret
const QR_SECRET = process.env.QR_SECRET;

app.get('/', (req, res) => {
  res.send(`WhatsApp forward bot. Status: ${getStatus()}`);
});

app.get('/qr', async (req, res) => {
  if (QR_SECRET && req.query.secret !== QR_SECRET) {
    return res.status(403).send('Forbidden. Add ?secret=YOUR_QR_SECRET to the URL.');
  }

  const qr = getLatestQR();
  const status = getStatus();

  if (!qr) {
    return res.send(
      `<html><body style="font-family:sans-serif;text-align:center;padding-top:40px;">
        <h2>No QR code needed right now</h2>
        <p>Status: <b>${status}</b></p>
        <p>If you just deployed, wait a few seconds and refresh.</p>
      </body></html>`
    );
  }

  try {
    const qrImage = await QRCode.toDataURL(qr);
    res.send(
      `<html><body style="font-family:sans-serif;text-align:center;padding-top:40px;">
        <h2>Scan with WhatsApp &gt; Linked Devices &gt; Link a Device</h2>
        <img src="${qrImage}" style="width:300px;height:300px;" />
        <p>This page refreshes every 5 seconds.</p>
        <script>setTimeout(() => location.reload(), 5000);</script>
      </body></html>`
    );
  } catch (err) {
    res.status(500).send('Failed to render QR: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
});

startBot().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
