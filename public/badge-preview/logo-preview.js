import { BADGE_LOGO_MAX_PIXELS, validateBadgeLogo } from './logo-validation.js';

const svgNamespace = 'http://www.w3.org/2000/svg';
const cssUnits = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16 };
const badSvg = 'Use a valid SVG with the logo artwork included in the file.';
let pdfRenderer;

function rasterSize(width, height, edge) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The logo has an invalid page size.');
  }
  const scale = edge / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function previewCanvas({ width, height }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasImage(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The logo preview could not be rendered.'));
    }, 'image/png');
  });
}

function svgLength(raw) {
  const match = raw?.trim().match(/^([\d.]+(?:e[+-]?\d+)?)(px|in|cm|mm|pt|pc)?$/i);
  if (!match) return null;
  const length = Number(match[1]) * cssUnits[(match[2] ?? 'px').toLowerCase()];
  return Number.isFinite(length) && length > 0 ? length : null;
}

async function svgPreview(file, edge) {
  const markup = await file.text();
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(markup)) throw new Error(badSvg);
  const xml = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = xml.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== svgNamespace || xml.querySelector('parsererror')) throw new Error(badSvg);
  const viewBox = root.getAttribute('viewBox');
  const box = viewBox?.trim().split(/[\s,]+/).map(Number);
  if (viewBox != null && (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0)) throw new Error(badSvg);
  const width = svgLength(root.getAttribute('width')) ?? box?.[2] ?? 300;
  const height = svgLength(root.getAttribute('height')) ?? box?.[3] ?? 150;
  const size = rasterSize(width, height, edge);
  if (!viewBox) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.setAttribute('width', String(size.width));
  root.setAttribute('height', String(size.height));
  const bytes = new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(bytes);
  try {
    // Load as an isolated image. Never insert user SVG elements into the page.
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = previewCanvas(size);
    canvas.getContext('2d').drawImage(image, 0, 0, size.width, size.height);
    return await canvasImage(canvas);
  } catch {
    throw new Error(badSvg);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadPdfRenderer() {
  pdfRenderer ??= import('./pdfjs-6-5-438.mjs').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf-worker-6-5-438.mjs', import.meta.url).href;
    return pdfjs;
  }).catch(() => {
    pdfRenderer = undefined;
    throw new Error('The PDF preview could not load. Try again, or use an SVG or PNG.');
  });
  return pdfRenderer;
}

async function pdfPreview(file, edge) {
  const data = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(data.subarray(0, 1024));
  if (!/%PDF-\d\.\d/.test(header)) {
    if (/\.ai$/i.test(file.name ?? '')) {
      throw new Error('Save the Illustrator file with PDF compatibility enabled, or export it as PDF or SVG.');
    }
    throw new Error('Use a valid, unlocked PDF with the logo on page one.');
  }
  const pdfjs = await loadPdfRenderer();
  const loading = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    enableXfa: false,
    useWasm: false,
    useSystemFonts: true,
    maxImageSize: BADGE_LOGO_MAX_PIXELS,
    verbosity: 0,
  });
  try {
    const pdf = await loading.promise;
    const page = await pdf.getPage(1);
    const original = page.getViewport({ scale: 1 });
    const size = rasterSize(original.width, original.height, edge);
    const viewport = page.getViewport({ scale: edge / Math.max(original.width, original.height) });
    const canvas = previewCanvas(size);
    // The default PDF.js canvas context is opaque and turns transparent areas black.
    const canvasContext = canvas.getContext('2d', { alpha: true });
    await page.render({
      canvas: null, canvasContext, viewport,
      annotationMode: pdfjs.AnnotationMode.DISABLE,
      background: 'rgba(0,0,0,0)',
    }).promise;
    return await canvasImage(canvas);
  } catch {
    throw new Error('Use a valid, unlocked PDF with the logo on page one.');
  } finally {
    await loading.destroy().catch(() => {});
  }
}

export async function badgeLogoPreview(file, {edge = 1600} = {}) {
  validateBadgeLogo(file);
  if (!Number.isInteger(edge) || edge < 1600 || edge > 3600) throw new Error('Invalid logo rendering resolution.');
  if (file.type === 'image/svg+xml') return svgPreview(file, edge);
  if (file.type === 'application/pdf') return pdfPreview(file, edge);
  return file;
}
