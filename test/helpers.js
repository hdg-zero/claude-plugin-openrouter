// Test helpers: a fake OpenRouter API and a JSON-RPC client for the MCP server.
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'plugins', 'openrouter', 'server', 'index.js');

// 1×1 PNG.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Starts a fake OpenRouter API. `routes` maps "METHOD /path" to a handler
 * `(req, body, res) => void`. Every request is recorded in `requests`.
 */
function startFakeApi(routes) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname.replace(/^\/api\/v1/, '');
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ method: req.method, route, query: Object.fromEntries(url.searchParams), headers: req.headers, body });
      const handler = routes[`${req.method} ${route}`];
      if (handler) return handler(req, body, res);
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `No fake route for ${req.method} ${route}` } }));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}/api/v1`, requests, close: () => server.close() }),
    ),
  );
}

const json = (res, obj, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const binary = (res, buf, type) => {
  res.writeHead(200, { 'content-type': type });
  res.end(buf);
};

/** Spawns the MCP server and returns a minimal JSON-RPC client. */
function startMcp(env) {
  const child = spawn(process.execPath, [SERVER], { env: { PATH: process.env.PATH, ...env } });
  const pending = new Map();
  let buf = '';
  let nextId = 0;
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  });
  const request = (method, params) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const callTool = async (name, args = {}) => {
    const { result } = await request('tools/call', { name, arguments: args });
    return { ...result, text: result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') };
  };
  return { request, callTool, close: () => child.kill() };
}

module.exports = { startFakeApi, startMcp, json, binary, PNG_B64 };
