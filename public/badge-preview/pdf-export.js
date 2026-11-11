import {productionLogo, renderProduction} from './render.js';

export const ARTWORK_PPI = 1200;
const encoder = new TextEncoder();
const ascii = value => encoder.encode(value);
function concatenate(parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
async function compressed(bytes) {
  if (typeof CompressionStream !== 'function') throw new Error('PDF export requires a current browser with compression support.');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
}

// A lossless, transparent RGB image at an explicit physical size. Flattening at
// 1200 ppi retains the browser's actual system-font shapes and fitted placement;
// no printer font substitution or simulated stock/frame artwork is introduced.
export async function rgbaArtworkPdf({data, width, height, widthInches, heightInches}) {
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
      !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width * height > 16_000_000 || data.length !== width * height * 4 ||
      !Number.isFinite(widthInches) || !Number.isFinite(heightInches) || widthInches <= 0 || heightInches <= 0 ||
      Math.abs(width - widthInches * ARTWORK_PPI) > .5 || Math.abs(height - heightInches * ARTWORK_PPI) > .5) {
    throw new Error('The production image does not match its actual-size PDF dimensions.');
  }
  const pixels = width * height, rgb = new Uint8Array(pixels * 3), alpha = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2];
    alpha[i] = data[i * 4 + 3];
  }
  const [colorStream, alphaStream] = await Promise.all([compressed(rgb), compressed(alpha)]);
  const pageWidth = Number((widthInches * 72).toFixed(6)), pageHeight = Number((heightInches * 72).toFixed(6));
  const box = `0 0 ${pageWidth} ${pageHeight}`;
  const content = ascii(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Artwork Do\nQ\n`);
  const stream = (dict, bytes) => concatenate([ascii(`<< ${dict} /Length ${bytes.length} >>\nstream\n`), bytes, ascii('\nendstream')]);
  const objects = [
    ascii('<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>'),
    ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [${box}] /CropBox [${box}] /TrimBox [${box}] /Resources << /XObject << /Artwork 4 0 R >> >> /Contents 6 0 R >>`),
    stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /SMask 5 0 R`, colorStream),
    stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode`, alphaStream),
    stream('', content),
    ascii('<< /Title (Recognition Direct - Actual-size badge artwork) /Creator (Recognition Direct badge production) /Subject (1200 ppi flattened RGB artwork. No bleed, stock simulation, frame, gloss, or cut line. Print at 100 percent.) >>'),
  ];
  const parts = [ascii('%PDF-1.4\n'), new Uint8Array([37, 226, 227, 207, 211, 10])], offsets = [0];
  let offset = parts.reduce((sum, part) => sum + part.length, 0);
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    const object = concatenate([ascii(`${i + 1} 0 obj\n`), objects[i], ascii('\nendobj\n')]);
    parts.push(object); offset += object.length;
  }
  const xref = offsets.map((position, i) => i ? String(position).padStart(10, '0') + ' 00000 n \n' : '0000000000 65535 f \n').join('');
  parts.push(ascii(`xref\n0 ${offsets.length}\n${xref}trailer\n<< /Size ${offsets.length} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  return new Blob([concatenate(parts)], {type: 'application/pdf'});
}

export async function productionArtworkPdf(configuration, index, savedLogo) {
  // Re-read original artwork for the higher-resolution render, not a screenshot
  // of the 300 ppi product mockup. Original bytes remain unchanged and separate.
  const logo = await productionLogo(savedLogo, {edge: 3600});
  const canvas = document.createElement('canvas');
  const plan = await renderProduction(canvas, configuration, index, logo, {artworkOnly: true, pixelsPerInch: ARTWORK_PPI});
  if (plan.warnings.length) throw new Error(plan.warnings.join(' '));
  if (logo && !['image/svg+xml', 'application/pdf'].includes(savedLogo.type)) {
    const effectivePpi = Math.min(logo.width / (plan.logoRect.w / 300), logo.height / (plan.logoRect.h / 300));
    if (effectivePpi < 300) throw new Error(`The saved raster logo is only about ${Math.floor(effectivePpi)} ppi at this size. Use a higher-resolution original logo for print production.`);
  }
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const blob = await rgbaArtworkPdf({...pixels, data: pixels.data, width: canvas.width, height: canvas.height, widthInches: plan.size.width, heightInches: plan.size.height});
  canvas.width = canvas.height = 0;
  return blob;
}
