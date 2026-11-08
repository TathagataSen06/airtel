import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { route } from '../src/server.mjs';
import { contentTypes, serveAsset } from '../src/assets.mjs';

const root = new URL('../', import.meta.url);
const home = new URL('.udyam/', root);
await mkdir(home, { recursive: true });
const local = new DatabaseSync(process.env.UDYAM_DB || fileURLToPath(new URL('demo.sqlite', home)));
local.exec(await readFile(new URL('drizzle/0000_cases.sql', root), 'utf8'));
const db = { prepare: sql => ({ bind: (...args) => ({
  first: async () => local.prepare(sql).get(...args),
  run: async () => ({ meta: local.prepare(sql).run(...args) })
}) }) };

async function asset(path, method) {
  if (path === '/') path = '/index.html';
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes('..') || !contentTypes[extname(path)]) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const bytes = await readFile(new URL('public' + path, root));
    return serveAsset(path === '/index.html' ? '/' : path, method, bytes, contentTypes[extname(path)]);
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function listen() {
  const position = process.argv.indexOf('--port');
  const port = Number(process.env.PORT || (position >= 0 ? process.argv[position + 1] : 4173));
  const server = createServer(async (incoming, outgoing) => {
    try {
      const protocol = incoming.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const requestUrl = protocol + '://' + (incoming.headers['x-forwarded-host'] || incoming.headers.host) + incoming.url;
      const hasBody = !['GET', 'HEAD'].includes(incoming.method);
      const chunks = [];
      if (hasBody) {
        let size = 0;
        for await (const chunk of incoming) {
          size += chunk.length;
          if (size > 24000) { outgoing.writeHead(413).end(); return; }
          chunks.push(chunk);
        }
      }
      const request = new Request(requestUrl, { method: incoming.method, headers: incoming.headers,
        ...(hasBody ? { body: Buffer.concat(chunks) } : {}) });
      const response = await route(request, { DB: db, OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_MODEL: process.env.OPENAI_MODEL }, asset);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500).end('Local demo error');
    }
  });
  server.listen(port, '0.0.0.0', () => console.log('Local: http://localhost:' + port));
}
listen();
