import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { server } from '../server.mjs';

// Exercise the real HTTP request handler and file reads without a listening
// socket, which the build environment does not allow.
function request(url) {
  return new Promise(resolve => {
    let status, headers;
    server.emit('request', { url }, {
      writeHead(code, values = {}) { status = code; headers = values; return this; },
      end(body) { resolve({ status, headers, body: body?.toString() || '' }); },
    });
  });
}

test('home page returns the actual index rather than a false 403', async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.equal(response.body, await readFile(new URL('../dist/index.html', import.meta.url), 'utf8'));
  assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
});

test('all local page assets and query strings return successfully', async () => {
  for (const file of ['index.html', 'style.css', 'app.js', 'core.js', 'ai.js', 'ai-worker.js', 'errors.js', 'notes.js', 'sun.svg']) {
    const response = await request(`/${file}?v=1`);
    assert.equal(response.status, 200, file);
    assert.equal(response.body, await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8'));
  }
});

test('missing files return 404 and paths outside dist remain forbidden', async () => {
  assert.equal((await request('/missing.html')).status, 404);
  assert.equal((await request('/%2e%2e%2fpackage.json')).status, 403);
  assert.equal((await request('/%2e%2e%2fdist-other%2fprivate.txt')).status, 403);
});
