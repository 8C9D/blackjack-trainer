import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `tools/serve-dist.mjs` is the server the E2E gate runs the production bundle
 * on, and nothing tested it (N3). That matters most for B1: a malformed
 * percent-escape used to throw `URIError` out of an async handler, which Node
 * treats as an unhandled rejection and ends the process on — so one bad request
 * killed the gate's server and every test after it failed as a connection
 * error, pointing nowhere near the cause. Round 1 fixed that and verified it by
 * hand once; nothing has held the line since.
 *
 * The server runs as a **subprocess** here, because the property under test is
 * that the process is still alive afterwards. An in-process import cannot
 * observe that at all.
 *
 * It runs against a copy of the real script in a throwaway tree rather than
 * against `dist/`. The script derives its root from its own location
 * (`new URL('../dist/blackjack-trainer/browser', import.meta.url)`), so a copy
 * at `<tmp>/tools/` serves `<tmp>/dist/...`. That keeps this spec independent of
 * whether a build has run — CI runs the unit gate before the build.
 *
 * Plain JavaScript, not TypeScript, because `@types/node` is not a dependency
 * and adding one needs the network. A `.spec.ts` here fails to compile on
 * `Cannot find name 'process'` before it runs a line. `tools/` is plain Node
 * anyway; see the ledger's M1.
 */

const SHELL = '<!doctype html><title>shell</title><app-root></app-root>';
const SCRIPT = 'console.log("app");';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function request(port, path) {
  return new Promise((resolve, reject) => {
    // `path` goes through untouched: these tests send deliberately malformed
    // URLs, which any URL-building helper would normalise away.
    const req = get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          body,
          contentType: String(res.headers['content-type'] ?? ''),
        }),
      );
    });
    req.on('error', reject);
  });
}

describe('tools/serve-dist.mjs', () => {
  let server;
  let port;

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'serve-dist-spec-'));
    const browser = join(root, 'dist', 'blackjack-trainer', 'browser');
    mkdirSync(join(root, 'tools'), { recursive: true });
    mkdirSync(join(browser, 'cards'), { recursive: true });
    copyFileSync(
      join(process.cwd(), 'tools', 'serve-dist.mjs'),
      join(root, 'tools', 'serve-dist.mjs'),
    );
    writeFileSync(join(browser, 'index.html'), SHELL);
    writeFileSync(join(browser, 'app.js'), SCRIPT);
    writeFileSync(join(browser, 'cards', 'ace.svg'), '<svg/>');
    // Outside the served root, so the traversal cases have something real to
    // reach for. If `normalize()` ever stops collapsing `..`, they find it.
    writeFileSync(join(root, 'secret.txt'), 'do not serve me');

    port = await freePort();
    server = spawn('node', ['tools/serve-dist.mjs'], {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 10_000);
      server.stdout.on('data', (chunk) => {
        if (String(chunk).includes('serving')) {
          clearTimeout(timer);
          resolve();
        }
      });
      server.on('exit', (code) => reject(new Error(`server exited at startup with code ${code}`)));
    });
  }, 20_000);

  afterAll(() => {
    server?.kill();
  });

  it('404s a malformed percent-escape instead of dying on it (B1)', async () => {
    const malformed = await request(port, '/%.js');
    expect(malformed.status).toBe(404);

    // The finding itself. Before the fix the URIError escaped an async handler,
    // Node ended the process, and every request after this one returned nothing.
    expect(server.exitCode, 'the server process died on a malformed request URL').toBeNull();
    const after = await request(port, '/app.js');
    expect(after.status, 'the server stopped answering after a malformed request').toBe(200);
  });

  it('404s an encoded path traversal rather than serving outside the root', async () => {
    for (const path of ['/%2e%2e/secret.txt', '/%2e%2e/%2e%2e/secret.txt', '/../secret.txt']) {
      const response = await request(port, path);
      expect(response.status, `${path} escaped the served root`).toBe(404);
      expect(response.body).not.toContain('do not serve me');
    }
  });

  it('serves the shell for an extensionless route so client-side routing works', async () => {
    const response = await request(port, '/drill/basic-strategy');
    expect(response.status).toBe(200);
    expect(response.contentType).toBe('text/html; charset=utf-8');
    expect(response.body).toBe(SHELL);
  });

  it('404s a missing asset rather than falling back to the shell', async () => {
    // A shell served under an asset's URL is how a missing chunk becomes a blank
    // page instead of a loud failure.
    const response = await request(port, '/chunk-does-not-exist.js');
    expect(response.status).toBe(404);
    expect(response.body).not.toContain('app-root');
  });

  it('serves a real asset with its content type', async () => {
    const script = await request(port, '/app.js');
    expect(script.status).toBe(200);
    expect(script.contentType).toBe('text/javascript; charset=utf-8');
    expect(script.body).toBe(SCRIPT);

    const svg = await request(port, '/cards/ace.svg');
    expect(svg.status).toBe(200);
    expect(svg.contentType).toBe('image/svg+xml');
  });
});
