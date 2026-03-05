const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');

const PORT = 3001;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

/**
 * SERVER LOGIC & REST API
 */
const server = http.createServer((req, res) => {
    const { method, url } = req;

    // 1. Serve Frontend
    if (url === '/' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getHTML());
    } 
    
    // 2. GET /api/files
    else if (url === '/api/files' && method === 'GET') {
        fs.readdir(__dirname, (err, files) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files || []));
        });
    }

    // 3. POST /api/exec
    else if (url === '/api/exec' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { command } = JSON.parse(body);
            exec(command, (error, stdout, stderr) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ output: stdout || stderr || error.message }));
            });
        });
    }

    // 4. POST /api/canvas/save
    else if (url === '/api/canvas/save' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            fs.writeFileSync(path.join(DATA_DIR, 'canvas.txt'), body);
            res.writeHead(200);
            res.end('Saved');
        });
    }

    // 5. GET /api/canvas/load
    else if (url === '/api/canvas/load' && method === 'GET') {
        const filePath = path.join(DATA_DIR, 'canvas.txt');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            res.writeHead(200);
            res.end(data);
        } else {
            res.writeHead(404);
            res.end('No save found');
        }
    }

    // 6. POST /api/emotion
    else if (url === '/api/emotion' && method === 'POST') {
        res.writeHead(200);
        res.end('Emotion Registered');
    }

    else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

/**
 * WEBSOCKET LOGIC
 */
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        // Broadcast draw events to all other clients
        if (data.type === 'draw') {
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === 1) {
                    client.send(JSON.stringify(data));
                }
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`STEVE'S WORLD active at http://localhost:${PORT}`);
});

/**
 * FRONTEND HTML/JS
 */
function getHTML() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>STEVE'S WORLD</title>
    <style>
        body { margin: 0; background: #0a0a0a; color: #ff4444; font-family: 'Courier New', monospace; height: 100vh; display: flex; flex-direction: column; }
        header { padding: 10px 20px; border-bottom: 2px solid #ff4444; font-size: 24px; font-weight: bold; letter-spacing: 2px; }
        main { display: flex; flex: 1; overflow: hidden; }
        #left-panel { width: 280px; border-right: 2px solid #ff4444; display: flex; flex-direction: column; padding: 10px; box-sizing: border-box; }
        #right-panel { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
        
        .section-label { font-size: 12px; margin-bottom: 5px; color: #880000; text-transform: uppercase; }
        #terminal-out { flex: 1; background: #000; border: 1px solid #440000; overflow-y: auto; padding: 5px; font-size: 12px; margin-bottom: 10px; white-space: pre-wrap; }
        .input-group { display: flex; gap: 5px; }
        input { background: #111; border: 1px solid #ff4444; color: #ff4444; flex: 1; padding: 5px; }
        button { background: #ff4444; color: #000; border: none; padding: 5px 10px; cursor: pointer; font-weight: bold; }
        button:hover { background: #ffaaaa; }
        
        #file-list { margin-top: 20px; border: 1px solid #440000; height: 150px; overflow-y: auto; padding: 5px; font-size: 12px; }
        
        canvas { background: #000; border: 2px solid #ff4444; cursor: crosshair; }
        .controls { margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .emotion-group { margin-top: 20px; border-top: 1px solid #440000; padding-top: 15px; display: flex; gap: 8px; }
        .btn-emotion { background: #000; color: #ff4444; border: 1px solid #ff4444; }
        .btn-emotion:hover { background: #ff4444; color: #000; }
    </style>
</head>
<body>
    <header>STEVE'S WORLD</header>
    <main>
        <div id="left-panel">
            <div class="section-label">Terminal</div>
            <div id="terminal-out">Initializing System...</div>
            <div class="input-group">
                <input type="text" id="cmd-input" placeholder="Enter command...">
                <button onclick="runCommand()">RUN</button>
            </div>
            
            <div class="section-label" style="margin-top:20px">Files</div>
            <div id="file-list"></div>
        </div>
        
        <div id="right-panel">
            <canvas id="worldCanvas" width="600" height="420"></canvas>
            <div class="controls">
                <button onclick="clearCanvas()">CLEAR</button>
                <button onclick="addNoise()">NOISE</button>
                <button onclick="saveCanvas()">SAVE</button>
                <button onclick="loadCanvas()">LOAD</button>
            </div>
            <div class="emotion-group">
                <button class="btn-emotion" onclick="emotion('HAPPY')">HAPPY</button>
                <button class="btn-emotion" onclick="emotion('CURIOUS')">CURIOUS</button>
                <button class="btn-emotion" onclick="emotion('FOCUSED')">FOCUSED</button>
                <button class="btn-emotion" onclick="emotion('CREATIVE')">CREATIVE</button>
                <button class="btn-emotion" onclick="emotion('CALM')">CALM</button>
            </div>
        </div>
    </main>

    <script>
        const canvas = document.getElementById('worldCanvas');
        const ctx = canvas.getContext('2d');
        const terminal = document.getElementById('terminal-out');
        const ws = new WebSocket('ws://' + location.host);
        let drawing = false;

        // --- Canvas Logic ---
        function clearCanvas() {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        clearCanvas();

        function addNoise() {
            for(let i=0; i<500; i++) {
                ctx.fillStyle = \`hsl(\${Math.random()*360}, 100%, 50%)\`;
                ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 2, 2);
            }
        }

        canvas.onmousedown = () => drawing = true;
        canvas.onmouseup = () => drawing = false;
        canvas.onmousemove = (e) => {
            if(!drawing) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            drawPoint(x, y, '#ff4444', true);
        };

        function drawPoint(x, y, color, emit) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 4, 4);
            if(emit) ws.send(JSON.stringify({ type: 'draw', x, y, color }));
        }

        ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if(data.type === 'draw') drawPoint(data.x, data.y, data.color, false);
        };

        // --- API Calls ---
        async function runCommand() {
            const cmd = document.getElementById('cmd-input').value;
            const res = await fetch('/api/exec', {
                method: 'POST',
                body: JSON.stringify({ command: cmd })
            });
            const data = await res.json();
            terminal.innerText += '\\n> ' + cmd + '\\n' + data.output;
            terminal.scrollTop = terminal.scrollHeight;
            refreshFiles();
        }

        async function refreshFiles() {
            const res = await fetch('/api/files');
            const files = await res.json();
            document.getElementById('file-list').innerHTML = files.join('<br>');
        }

        async function saveCanvas() {
            const data = canvas.toDataURL();
            await fetch('/api/canvas/save', { method: 'POST', body: data });
            alert('Canvas state saved to data/canvas.txt');
        }

        async function loadCanvas() {
            const res = await fetch('/api/canvas/load');
            if(res.ok) {
                const data = await res.text();
                const img = new Image();
                img.onload = () => ctx.drawImage(img, 0, 0);
                img.src = data;
            }
        }

        function emotion(type) {
            fetch('/api/emotion', { method: 'POST', body: JSON.stringify({type}) });
            addNoise(); // Visual feedback
            terminal.innerText += \`\\n[EMOTION] Steve feels \${type}\`;
            terminal.scrollTop = terminal.scrollHeight;
        }

        refreshFiles();
    </script>
</body>
</html>
    `;
}