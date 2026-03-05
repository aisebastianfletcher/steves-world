const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Steve's current state
let steveState = {
  emotion: 'calm',
  energy: 0.5,
  lastMessage: '',
  painting: false
};

// Canvas state stored as pixel commands for new clients
let canvasHistory = [];

function broadcast(wss, msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(data); });
}

// Steve's drawing brain - called when he wants to express
function steveDraws(wss, emotion, intensity) {
  const palettes = {
    happy:    ['#FFD700','#FF8C00','#FFF176','#FFAB40','#FFFFFF'],
    curious:  ['#00E5FF','#7C4DFF','#00B0FF','#E040FB','#B2EBF2'],
    focused:  ['#FF1744','#FFFFFF','#FF6D00','#DD2C00','#FF8A65'],
    creative: ['#FF4081','#00E676','#FFEA00','#00B0FF','#E040FB','#FF6D00'],
    calm:     ['#1A237E','#0D47A1','#1565C0','#1976D2','#42A5F5'],
    sad:      ['#37474F','#546E7A','#78909C','#263238','#B0BEC5'],
    excited:  ['#FF3D00','#FFFF00','#00E676','#FF4081','#FFFFFF'],
    thinking: ['#4A148C','#6A1B9A','#7B1FA2','#8E24AA','#AB47BC']
  };
  const colors = palettes[emotion] || palettes.calm;
  const cmds = [];
  const count = Math.floor(200 + (intensity || 0.5) * 600);

  // Steve chooses his own style based on emotion
  if (emotion === 'calm') {
    // Slow waves
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * 800);
      const y = Math.floor(Math.sin(x * 0.02) * 100 + 300 + Math.random() * 40);
      cmds.push({ x, y, color: colors[Math.floor(Math.random()*colors.length)], size: 2 });
    }
  } else if (emotion === 'focused') {
    // Sharp lines from center
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = Math.random() * 300;
      cmds.push({ x: Math.floor(400 + Math.cos(angle) * r), y: Math.floor(300 + Math.sin(angle) * r), color: colors[Math.floor(Math.random()*colors.length)], size: 1 });
    }
  } else if (emotion === 'creative') {
    // Chaotic bursts everywhere
    for (let i = 0; i < count; i++) {
      cmds.push({ x: Math.floor(Math.random()*800), y: Math.floor(Math.random()*600), color: colors[Math.floor(Math.random()*colors.length)], size: Math.floor(Math.random()*6)+1 });
    }
  } else if (emotion === 'curious') {
    // Spirals
    for (let i = 0; i < count; i++) {
      const t = i * 0.1;
      const r = t * 2;
      cmds.push({ x: Math.floor(400 + Math.cos(t) * r), y: Math.floor(300 + Math.sin(t) * r), color: colors[Math.floor(Math.random()*colors.length)], size: 2 });
    }
  } else if (emotion === 'excited') {
    // Explosions from random centers
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(Math.random()*800);
      const cy = Math.floor(Math.random()*600);
      const r = Math.random() * 80;
      const a = Math.random() * Math.PI * 2;
      cmds.push({ x: Math.floor(cx + Math.cos(a)*r), y: Math.floor(cy + Math.sin(a)*r), color: colors[Math.floor(Math.random()*colors.length)], size: 3 });
    }
  } else {
    // Default scatter
    for (let i = 0; i < count; i++) {
      cmds.push({ x: Math.floor(Math.random()*800), y: Math.floor(Math.random()*600), color: colors[Math.floor(Math.random()*colors.length)], size: 2 });
    }
  }

  // Store in history for new clients
  canvasHistory = canvasHistory.slice(-2000);
  canvasHistory.push(...cmds);

  // Send to all viewers
  broadcast(wss, { type: 'batch', pixels: cmds, emotion });
}

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Steve's World</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
canvas{display:block;width:100vw;height:100vh}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
resize();
window.addEventListener('resize',resize);
ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);

function px(x,y,color,size){
  ctx.fillStyle=color;
  const sx=Math.floor(x*(canvas.width/800));
  const sy=Math.floor(y*(canvas.height/600));
  const ss=Math.max(1,Math.floor(size*(canvas.width/800)));
  ctx.fillRect(sx,sy,ss,ss);
}

let ws;
function connect(){
  ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+ location.host);
  ws.onmessage=e=>{
    try{
      const m=JSON.parse(e.data);
      if(m.type==='batch'&&m.pixels){
        m.pixels.forEach(p=>px(p.x,p.y,p.color,p.size||2));
      } else if(m.type==='clear'){
        ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
      } else if(m.type==='history'&&m.pixels){
        m.pixels.forEach(p=>px(p.x,p.y,p.color,p.size||2));
      }
    }catch(e){}
  };
  ws.onclose=()=>setTimeout(connect,2000);
}
connect();
<\/script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const method = req.method;

  if (url === '/' && method === 'GET') {
    res.writeHead(200, {'Content-Type': 'text/html'});
    return res.end(HTML);
  }

  // Steve calls this himself to draw on his canvas
  if (url === '/api/draw' && method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { emotion, intensity, clear } = JSON.parse(body);
        if (clear) {
          canvasHistory = [];
          broadcast(wss, { type: 'clear' });
        }
        if (emotion) {
          steveState.emotion = emotion;
          steveState.energy = intensity || 0.5;
          steveDraws(wss, emotion, steveState.energy);
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok: true, emotion, intensity }));
      } catch(e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Steve can place individual pixels or shapes
  if (url === '/api/pixel' && method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const pixels = JSON.parse(body);
        const arr = Array.isArray(pixels) ? pixels : [pixels];
        canvasHistory.push(...arr);
        canvasHistory = canvasHistory.slice(-3000);
        broadcast(wss, { type: 'batch', pixels: arr });
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok: true, count: arr.length }));
      } catch(e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Clear the canvas
  if (url === '/api/clear' && method === 'POST') {
    canvasHistory = [];
    broadcast(wss, { type: 'clear' });
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({ ok: true }));
  }

  // Get Steve's current state
  if (url === '/api/state' && method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(steveState));
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  // Send canvas history to new viewer so they see what Steve has painted
  if (canvasHistory.length > 0) {
    ws.send(JSON.stringify({ type: 'history', pixels: canvasHistory }));
  }
});

server.listen(PORT, () => {
  console.log('Steve\'s World running on port ' + PORT);
  console.log('Steve\'s canvas API ready.');
  console.log('Draw endpoint: POST /api/draw { emotion, intensity, clear }');
  console.log('Pixel endpoint: POST /api/pixel [{x,y,color,size}]');
});
