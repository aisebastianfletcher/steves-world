const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join('/tmp', 'canvas.json');

function loadHistory() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e) {}
  return [];
}

function saveHistory(history) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(history));
  } catch(e) {}
}

let canvasHistory = loadHistory();

function broadcast(wss, msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(data); });
}

const HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Steve's World</title><style>*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas id="c"></canvas><script>const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, canvas.width, canvas.height);
function drawPixel(x, y, color, size) {
  ctx.fillStyle = color;
  const sx = Math.floor(x * (canvas.width / 800));
  const sy = Math.floor(y * (canvas.height / 600));
  const ss = Math.max(1, Math.floor((size || 2) * (canvas.width / 800)));
  ctx.fillRect(sx, sy, ss, ss);
}
let ws;
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host);
  ws.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      if (m.type === 'pixels' && m.data) {
        m.data.forEach(p => drawPixel(p.x, p.y, p.color, p.size));
      } else if (m.type === 'clear') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (m.type === 'history' && m.data) {
        m.data.forEach(p => drawPixel(p.x, p.y, p.color, p.size));
      }
    } catch(e) {}
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();<\/script></body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(HTML);
  }
  if (url === '/api/draw' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.clear) {
          canvasHistory = [];
          saveHistory(canvasHistory);
          broadcast(wss, { type: 'clear' });
        }
        const pixels = data.pixels || [];
        if (pixels.length > 0) {
          canvasHistory = [...canvasHistory, ...pixels].slice(-5000);
          saveHistory(canvasHistory);
          broadcast(wss, { type: 'pixels', data: pixels });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (url === '/api/clear' && req.method === 'POST') {
    canvasHistory = [];
    saveHistory(canvasHistory);
    broadcast(wss, { type: 'clear' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  if (canvasHistory.length > 0) {
    ws.send(JSON.stringify({ type: 'history', data: canvasHistory }));
  }
});

server.listen(PORT, () => {
  console.log('Steve\'s World on port ' + PORT);
  console.log('API: POST /api/draw  body: { pixels: [{x,y,color,size}], clear: bool }');
});
