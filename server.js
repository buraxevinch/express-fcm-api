require('dotenv').config();
const express = require("express");
const WebSocket = require("ws");
const admin = require("firebase-admin");

// Firebase Admin başlatılıyor
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(express.json());

// HTTP sunucusu
const server = require("http").createServer(app);

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

// Render kendi PORT değişkenini kullanır
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WSS sunucusu ${PORT} portunda aktif`);
});
