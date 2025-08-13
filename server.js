const fs = require("fs");
const https = require("https");
const express = require("express");
const WebSocket = require("ws");
const admin = require("firebase-admin");

// Firebase Admin başlatılıyor
const serviceAccount = require("./firebase-service-account.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(express.json());

// SSL sertifikaları (Let's Encrypt veya başka sağlayıcıdan)
const privateKey = fs.readFileSync("/home/u2368924/ssl/keys/acf95_25b1f_c5f8531b1781cdc77ba1cb25a01be15b.key", "utf8");
const certificate = fs.readFileSync("/home/u2368924/ssl/certs/CloudFlare_Origin_Certificate_acf95_25b1f_2228119860_d2c97a297d6ab1f516a1fc4feca9a88d.crt", "utf8");
const server = https.createServer({ key: privateKey, cert: certificate }, app);

// WebSocket sunucusu
const wss = new WebSocket.Server({ server });
let clients = [];

wss.on("connection", (ws) => {
  clients.push(ws);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "identify") {
        ws.userId = data.userId;
        ws.role = data.role;
        ws.username = data.username;
        ws.fcmToken = data.fcmToken || null;
      }
    } catch (err) {
      console.error("Geçersiz mesaj verisi:", err);
    }
  });

  ws.on("close", () => {
    clients = clients.filter((client) => client !== ws);
  });
});

// Bildirim yayını
app.post("/broadcast", async (req, res) => {
  const { target, title, message, icon, time } = req.body;
  const payload = JSON.stringify({ target, title, message, icon, time });
  let sentCount = 0;
  let fcmCount = 0;

  for (const client of clients) {
    const isTarget = target === "0" || target === "all" || target == client.role;

    if (!isTarget) continue;

    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sentCount++;
    } else if (client.fcmToken) {
      try {
        await admin.messaging().send({
          token: client.fcmToken,
          notification: {
            title: title || "Bildirim",
            body: message || "",
          },
          data: {
            target: String(target),
            icon: icon || "",
            time: String(time || ""),
          },
        });
        fcmCount++;
      } catch (err) {
        console.error("FCM gönderilemedi:", err);
      }
    }
  }

  res.json({
    status: "OK",
    messageSent: req.body,
    socketDelivered: sentCount,
    pushDelivered: fcmCount,
  });
});

// HTTPS ve WSS 443 portunda çalışıyor
server.listen(443, () => {
  console.log("WSS sunucusu 443 portunda aktif");
});
