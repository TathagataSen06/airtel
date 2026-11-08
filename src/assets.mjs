export const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.wasm': 'application/wasm', '.gz': 'application/gzip', '.txt': 'text/plain; charset=utf-8'
};

export function serveAsset(path, method, content, type, encoding) {
  if (!content || !['GET', 'HEAD'].includes(method)) return new Response('Not found', { status: 404 });
  const vendor = path.startsWith('/vendor/');
  const headers = {
    'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': path.startsWith('/specimens/') ? 'private, no-store' : vendor ? 'public,max-age=86400' : 'no-cache',
    'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' blob: data:; style-src 'self'; worker-src 'self'; connect-src 'self'",
    'Referrer-Policy': 'no-referrer'
  };
  if (encoding) headers['Content-Encoding'] = encoding;
  return new Response(method === 'HEAD' ? null : content, { headers, ...(encoding ? { encodeBody: 'manual' } : {}) });
}
