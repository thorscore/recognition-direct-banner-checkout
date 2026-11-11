import {readFile} from 'node:fs/promises';

const files = new Map([
  ['/badge-production', ['public/badge-production.html', 'text/html; charset=utf-8']],
  ['/badge-production.js', ['public/badge-production.js', 'text/javascript; charset=utf-8']],
  ...['render', 'layout', 'catalog', 'duets-palette', 'logo-preview', 'logo-validation', 'svg-source', 'pdf-export'].map(name =>
    ['/badge-preview/' + name + '.js', ['public/badge-preview/' + name + '.js', 'text/javascript; charset=utf-8']]),
  ['/badge-preview/pdfjs-6-5-438.mjs', ['node_modules/pdfjs-dist/legacy/build/pdf.min.mjs', 'text/javascript; charset=utf-8']],
  ['/badge-preview/pdf-worker-6-5-438.mjs', ['node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'text/javascript; charset=utf-8']],
]);
export const BADGE_PRODUCTION_HEADERS = Object.freeze({
  'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob: data:; font-src blob:; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
});
// Only generic application assets are served here. Private order/artwork reads
// remain behind the existing owner session and verified-paid-order checks.
export async function serveBadgeProductionAsset(req, res, url, enabled) {
  const asset = files.get(url.pathname);
  if (!enabled || req.method !== 'GET' || !asset) return false;
  const data = await readFile(new URL('./' + asset[0], import.meta.url));
  res.writeHead(200, {...BADGE_PRODUCTION_HEADERS, 'Content-Type': asset[1]});
  res.end(data);
  return true;
}
