'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js':   'application/javascript',   '.png': 'image/png',
  '.jpg':  'image/jpeg',               '.gif': 'image/gif',
  '.svg':  'image/svg+xml',            '.ico': 'image/x-icon'
};

const httpServer = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(__dirname + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server: httpServer });
const rooms = new Map();

const uid6   = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const isOpen = ws => ws.readyState === WebSocket.OPEN;
const send   = (ws, o) => isOpen(ws) && ws.send(JSON.stringify(o));
const bcast  = (room, o) => room.clients.forEach(ws => send(ws, o));
const bcastX = (room, skip, o) => room.clients.forEach(ws => ws !== skip && send(ws, o));

wss.on('connection', ws => {
  ws.on('message', raw => { try { handle(ws, JSON.parse(raw)); } catch {} });
  ws.on('close', () => {
    const room = rooms.get(ws._room);
    if (!room) return;
    room.clients.delete(ws);
    if (room.clients.size === 0) { rooms.delete(ws._room); return; }
    bcast(room, { type: 'PLAYER_LEFT', pid: ws._pid });
    if (ws === room.hostWs) { bcast(room, { type: 'HOST_LEFT' }); rooms.delete(ws._room); }
  });
});

function handle(ws, msg) {
  switch (msg.type) {

    case 'CREATE_ROOM': {
      const code = uid6();
      rooms.set(code, {
        clients: new Set([ws]),
        hostWs: ws,
        maxPlayers: Math.min(6, Math.max(2, +msg.playerCount || 2))
      });
      Object.assign(ws, { _room: code, _pid: 0, _name: msg.name || 'Player 1' });
      send(ws, { type: 'ROOM_CREATED', roomCode: code, pid: 0 });
      break;
    }

    case 'JOIN_ROOM': {
      const room = rooms.get(msg.roomCode);
      if (!room)                               { send(ws, { type: 'ERR', msg: 'Room not found' }); return; }
      if (room.clients.size >= room.maxPlayers) { send(ws, { type: 'ERR', msg: 'Room is full' });   return; }
      const pid = room.clients.size;
      room.clients.add(ws);
      Object.assign(ws, { _room: msg.roomCode, _pid: pid, _name: msg.name || `Player ${pid + 1}` });
      send(ws, { type: 'JOIN_OK', pid, roomCode: msg.roomCode });
      const players = [...room.clients].map(w => ({ pid: w._pid, name: w._name }));
      bcast(room, { type: 'PLAYER_LIST', players });
      if (room.clients.size >= room.maxPlayers) bcast(room, { type: 'ROOM_FULL' });
      break;
    }

    case 'START_GAME': {
      const room = rooms.get(ws._room);
      if (room?.hostWs === ws) bcast(room, { type: 'START_GAME', configs: msg.configs });
      break;
    }

    case 'STATE': {
      const room = rooms.get(ws._room);
      if (room?.hostWs === ws) bcastX(room, ws, { type: 'STATE', gs: msg.gs });
      break;
    }

    case 'TIMER': {
      const room = rooms.get(ws._room);
      if (room?.hostWs === ws) bcastX(room, ws, { type: 'TIMER', secs: msg.secs });
      break;
    }

    case 'ACTION': {
      const room = rooms.get(ws._room);
      if (room) send(room.hostWs, { type: 'ACTION', pid: ws._pid, action: msg.action, data: msg.data });
      break;
    }
  }
}

httpServer.listen(PORT, () => {
  console.log(`\n🥷  Ultimate Ninja server`);
  console.log(`   Local  → http://localhost:${PORT}`);
  console.log(`   Online → run: ngrok http ${PORT}  then share the HTTPS URL\n`);
});
