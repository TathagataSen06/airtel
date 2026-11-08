import { readdir, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { contentTypes } from '../src/assets.mjs';

const top = new URL('../', import.meta.url);
const fromRoot = path => new URL(path, top);

async function pack(directory, root = directory) {
  const output = {};
  for (const entry of await readdir(fromRoot(directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(output, await pack(path, root));
    else {
      const key = '/' + path.slice(root.length + 1);
      const raw = await readFile(fromRoot(path));
      const extension = extname(path);
      const compress = /\.(?:wasm|js|mjs|css|html|svg)$/.test(path) && raw.length > 1000;
      const bytes = compress ? gzipSync(raw, { level: 9 }) : raw;
      output[key] = [bytes.toString('base64'), contentTypes[extension] || 'application/octet-stream', compress ? 'gzip' : null];
    }
  }
  return output;
}

let dataset;
try {
  dataset = await readFile(fromRoot('src/official.local.mjs'), 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  dataset = await readFile(fromRoot('src/official.mjs'), 'utf8');
}
const modules = [dataset, ...await Promise.all(['domain', 'assets', 'server'].map(file =>
  readFile(fromRoot('src/' + file + '.mjs'), 'utf8')
))];
const source = modules.map(module => module.replace(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];\s*/gm, '')).join('\n');
const assets = await pack('public');
const launch = `
const embeddedAssets = ${JSON.stringify(assets)};
export default { fetch(request, env) {
  return route(request, env, (path, method) => {
    const item = embeddedAssets[path === '/' ? '/index.html' : path];
    return serveAsset(path, method, item && Uint8Array.from(atob(item[0]), c => c.charCodeAt(0)), item?.[1], item?.[2]);
  });
}};
`;
await Promise.all([mkdir(fromRoot('dist/server/'), { recursive: true }), mkdir(fromRoot('dist/.openai/'), { recursive: true })]);
await writeFile(fromRoot('dist/server/index.js'), source + launch);
try {
  await copyFile(fromRoot('.openai/hosting.json'), fromRoot('dist/.openai/hosting.json'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('Built Worker, compressed size ' + gzipSync(source + launch).length.toLocaleString() + ' bytes');
