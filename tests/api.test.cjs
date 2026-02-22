const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const net = require('node:net');

const ROOT = path.resolve(__dirname, '..');
const API_ENTRY = path.join(ROOT, 'api', 'index.js');
let port = null;
let baseUrl = null;

let serverProcess = null;
let serverLogs = '';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const info = server.address();
      server.close(() => resolve(info.port));
    });
    server.on('error', reject);
  });
}

function startServer() {
  serverLogs = '';
  serverProcess = spawn(process.execPath, [API_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      RECODA_TEST_BYPASS_AUTH: '1',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });
  serverProcess.stderr.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });
}

async function waitForServer(timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch (_err) {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`API test server did not become ready in time. Logs:\n${serverLogs}`);
}

async function stopServer() {
  if (!serverProcess) return;
  const proc = serverProcess;
  serverProcess = null;
  proc.kill('SIGTERM');
  await new Promise((resolve) => {
    proc.on('exit', () => resolve());
    setTimeout(() => resolve(), 1500);
  });
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, options);
}

test.before(async () => {
  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  startServer();
  await waitForServer();
});

test.after(async () => {
  await stopServer();
  await fs.rm(path.join(ROOT, 'recordings', 'test-user'), { recursive: true, force: true });
});

test('GET /api/health returns ok payload', async () => {
  const res = await request('/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.timestamp, 'string');
});

test('POST /api/waitlist rejects invalid emails', async () => {
  const res = await request('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' })
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Valid email required/i);
});

test('POST /api/recordings/sync rejects oversized payload', async () => {
  const localRecordings = Array.from({ length: 2001 }, (_, i) => ({
    filename: `rec-${i}.webm`
  }));

  const res = await request('/api/recordings/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-user-id': 'test-user' },
    body: JSON.stringify({ localRecordings })
  });

  assert.equal(res.status, 413);
  const body = await res.json();
  assert.match(body.error, /Too many recordings/i);
});

test('POST /api/upload/sign rejects path-like filenames', async () => {
  const res = await request('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-user-id': 'test-user' },
    body: JSON.stringify({ filename: '../escape.webm' })
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid filename/i);
});

test('POST /api/recordings rejects invalid metadata', async () => {
  const res = await request('/api/recordings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-user-id': 'test-user' },
    body: JSON.stringify({
      filename: 'clip.webm',
      duration: -1,
      size: 10,
      mime_type: 'video/webm'
    })
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid recording metadata/i);
});

test('POST /api/local/save rejects unsupported upload type', async () => {
  const form = new FormData();
  form.append('file', new Blob(['fake'], { type: 'text/plain' }), 'note.txt');
  form.append('filename', 'note.txt');
  form.append('duration', '1');
  form.append('mime', 'text/plain');
  form.append('ts', new Date().toISOString());

  const res = await request('/api/local/save', {
    method: 'POST',
    headers: { 'x-test-user-id': 'test-user' },
    body: form
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Unsupported file type/i);
});

test('GET /api/local/file/:filename rejects invalid filename', async () => {
  const res = await request('/api/local/file/..%2Fpasswd', {
    headers: { 'x-test-user-id': 'test-user' }
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid filename/i);
});
