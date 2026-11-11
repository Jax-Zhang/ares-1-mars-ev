// ARES-1 offline demo server for machines with Node.js (faster than the PowerShell fallback).
const http = require('http'), fs = require('fs'), path = require('path'), { exec } = require('child_process');
const root = path.resolve(__dirname, '..', 'site'), port = Number(process.argv[2]) || 5173;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.glb':'model/gltf-binary', '.bin':'application/octet-stream', '.txt':'text/plain', '.mjs':'text/javascript', '.wasm':'application/wasm', '.task':'application/octet-stream' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(root, p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
    fs.createReadStream(f).pipe(res);
  });
}).on('error', e => { console.log('Port ' + port + ' is busy: ' + e.message); process.exit(1); })
  .listen(port, () => { const url = `http://localhost:${port}/`; console.log('ARES-1 demo running at ' + url + '  (keep this window open; close it to stop)');
    exec(process.platform === 'win32' ? `start "" "${url}"` : (process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`)); });
