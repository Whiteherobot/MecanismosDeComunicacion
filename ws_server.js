// ws_server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Set();

wss.on("connection", (ws) => {
  console.log("[WS Server] Nuevo operador conectado");
  clients.add(ws);

  ws.on("close", () => {
    console.log("[WS Server] Operador desconectado");
    clients.delete(ws);
  });
});

// Endpoint para recibir alertas desde MON Processor
app.post("/alert", (req, res) => {
  const alerta = req.body;
  console.log("[WS Server] Alerta recibida para difundir:", alerta);

  const data = JSON.stringify(alerta);
  // Broadcast a todos los clientes conectados
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }

  res.status(200).send("Alert broadcasted");
});

const PORT = 9000;
server.listen(PORT, () => {
  console.log(`[WS Server] WebSocket y HTTP escuchando en ws://localhost:${PORT}`);
});
