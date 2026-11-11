const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4173;
const root = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/consultation') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const submission = JSON.parse(body || '{}');
        if (!submission.name || !submission.email || !submission.phone) {
          sendJson(res, 400, { ok: false, message: 'Please complete the required fields.' });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          message: `Thanks, ${submission.name.split(' ')[0]}. Your design consult request is on its way.`
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: 'We could not read that request.' });
      }
    });
    return;
  }

  const requestedPath = decodeURIComponent(req.url.split('?')[0]);
  const routeMap = {
    '/': '/login.html',
    '/login': '/login.html',
    '/dashboard': '/index.html'
  };
  const safePath = routeMap[requestedPath] || requestedPath;
  const filePath = path.join(root, safePath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Auravix Bath Studio is running at http://localhost:${PORT}`);
});
