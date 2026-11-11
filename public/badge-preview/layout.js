import { CORNER_RADII, DEFAULT_CORNER_RADIUS, TEXT_SIZE } from './catalog.js';

export const PREVIEW_PIXELS_PER_INCH = 300;
const logoPadding = PREVIEW_PIXELS_PER_INCH / 16;

export function badgeCornerPixels(radius, pixelsPerInch = PREVIEW_PIXELS_PER_INCH) {
  return CORNER_RADII.find(option => option.id === radius).inches * pixelsPerInch;
}

export function layoutBoxes(width, height, layout) {
  const logoLeft = layout === 'logo-left';
  const textX = width * (logoLeft ? .37 : .055);
  const logo = logoLeft
    ? { x: logoPadding, y: logoPadding, w: textX - 2 * logoPadding, h: height - 2 * logoPadding }
    : { x: logoPadding, y: logoPadding, w: width - 2 * logoPadding, h: height * .4 - logoPadding };
  return {
    logo,
    text: { x: textX, width: width * (logoLeft ? .57 : .89) },
    lines: logoLeft
      ? [{key:'name',y:.44,max:.23,min:.10,weight:700},{key:'title',y:.65,max:.13,min:.075,weight:500},{key:'organization',y:.84,max:.105,min:.065,weight:400}]
      : [{key:'name',y:.53,max:.20,min:.09,weight:700},{key:'title',y:.72,max:.12,min:.07,weight:500},{key:'organization',y:.88,max:.10,min:.06,weight:400}],
  };
}
export function fitText(measure, text, { width, above = Infinity, below = Infinity }, max, min) {
  const fits = size => {
    const metrics = measure(text, size);
    return metrics.width <= width &&
      (metrics.actualBoundingBoxAscent ?? 0) <= above &&
      (metrics.actualBoundingBoxDescent ?? 0) <= below;
  };
  let size = max;
  while (!fits(size)) {
    if (size <= min) return { size, fits: false };
    size = Math.max(min, size - 1);
  }
  return { size, fits: true };
}
export function containImage(width, height, box, scale = 1, face) {
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  let maxScale = Math.min(box.w / width, box.h / height);
  if (face && face.radius > logoPadding) {
    // Test the corner nearest the curved edge of the inset printable area.
    const edgeX = Math.min(centerX, face.width - centerX);
    const edgeY = Math.min(centerY, face.height - centerY);
    const fits = k => Math.hypot(
      Math.max(0, face.radius - edgeX + width * k / 2),
      Math.max(0, face.radius - edgeY + height * k / 2),
    ) <= face.radius - logoPadding;
    if (!fits(maxScale)) {
      let lower = 0, upper = maxScale;
      for (let i = 0; i < 16; i++) {
        const candidate = (lower + upper) / 2;
        if (fits(candidate)) lower = candidate;
        else upper = candidate;
      }
      maxScale = lower;
    }
  }
  const k = maxScale * Math.min(1, Math.max(.25, scale));
  return { x: centerX - width * k / 2, y: centerY - height * k / 2, w: width * k, h: height * k };
}

export function badgeTextLayout(width, height, logoPosition, { hasLogo, alignment, name, title, organization, textSize = TEXT_SIZE.default }) {
  const { logo, text } = layoutBoxes(width, height, logoPosition);
  const hasTopLogo = hasLogo && logoPosition === 'logo-top';
  const area = hasLogo ? text : { x: width * .055, width: width * .89 };
  const top = hasTopLogo ? logo.y + logo.h + logoPadding : height * .07;
  const bottom = height * .93;
  const textScale = hasTopLogo ? (bottom - top) / (height * .57) : 1;
  const center = (top + bottom) / 2;
  const lines = [
    { key: 'name', value: name, weight: 700, max: .28, min: .10 },
    { key: 'title', value: title, weight: 500, max: .19, min: .075 },
    { key: 'organization', value: organization, weight: 400, max: .155, min: .065 },
  ].map(line => ({ ...line, value: line.value?.trim() ?? '' })).filter(line => line.value);
  const spacing = height * (lines.length === 3 ? .18 : .235) * textScale;
  const sizeScale = (hasTopLogo ? .82 : 1) * (lines.length === 3 ? .86 : 1) * textScale;
  const requestedScale = textSize / TEXT_SIZE.default;
  return {
    logo,
    clip: { ...area, y: top, height: bottom - top },
    x: alignment === 'center' ? area.x + area.width / 2 : area.x,
    lines: lines.map((line, i) => {
      const y = center + (i - (lines.length - 1) / 2) * spacing;
      return {
        ...line, y,
        above: (i === 0 ? y - top : spacing / 2) - 1,
        below: (i === lines.length - 1 ? bottom - y : spacing / 2) - 1,
        max: height * (lines.length === 1 ? .34 : line.max) * sizeScale * requestedScale,
        min: height * line.min * sizeScale * Math.min(1, requestedScale),
      };
    }),
  };
}

const metalFaces = {
  'brushed-gold': ['#d8c0a3', '#ceb598', '#e3cbb0', '#c5ab90', '#e3c9ac'],
  'brushed-silver': ['#c7c9cb', '#b7b9bc', '#cfd0d2', '#bfc0c3', '#d2d3d5'],
};

const frameFinishes = {
  gold: {
    edge: '#5e421e', seat: '#573a19', glint: '#f9e7bb',
    rim: ['#b88a50', '#fff0ce', '#d8ac68', '#b28348', '#fae0ad', '#9b6a32', '#65431f'],
    bevel: ['#785022', '#e2b776', '#ffedc7', '#c59149', '#e7c28a', '#976733', '#e1b779'],
  },
  silver: {
    edge: '#4b4947', seat: '#3d3c3b', glint: '#f6f5f4',
    rim: ['#b7b7b9', '#fafafa', '#b1b1b4', '#8a8988', '#eeeded', '#929195', '#656361'],
    bevel: ['#6b6a69', '#d6d6d8', '#fafafa', '#9a999b', '#e2e1e3', '#777678', '#c5c4c5'],
  },
};

function gradient(id, colors, x2 = '100%', y2 = '100%') {
  return `<linearGradient id="${id}" x2="${x2}" y2="${y2}">${colors.map((color, i) =>
    `<stop offset="${i / (colors.length - 1)}" stop-color="${color}"/>`).join('')}</linearGradient>`;
}

function brushedGrain({ x, y, width, height }, scale) {
  let seed = 83115;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const marks = [];
  for (let row = scale; row < height; row += scale * 1.5) {
    const light = next() >= .42;
    const start = next() * width * .23;
    const length = width * (.55 + next() * .45);
    marks.push(`<path d="M${(x + start).toFixed(2)} ${(y + row).toFixed(2)}h${length.toFixed(2)}" stroke="${light ? '#fff' : '#3e3329'}" stroke-opacity="${(.03 + next() * .10).toFixed(3)}" stroke-width="${(scale * (.7 + next())).toFixed(2)}"/>`);
  }
  return marks.join('');
}

// The stock dimensions describe the printable face. The optional rim sits
// around it, following the rounded, stepped profile in the product photos.
export function engravableBadgeSurface(faceWidth, faceHeight, stockColor, frame, cornerRadius = DEFAULT_CORNER_RADIUS) {
  const scale = faceWidth / 900;
  const finish = Object.hasOwn(frameFinishes, frame) ? frameFinishes[frame] : null;
  const insetX = finish ? Math.round(29 * scale) : 0;
  const insetY = finish ? Math.round((faceHeight / faceWidth > .4 ? 31 : 24) * scale) : 0;
  const width = faceWidth + 2 * insetX;
  const height = faceHeight + 2 * insetY;
  const face = { x: insetX, y: insetY, width: faceWidth, height: faceHeight,
    radius: finish ? 24 * scale : badgeCornerPixels(cornerRadius) };
  const rect = (x, y, w, h, radius, fill, extra = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" ${extra}/>`;
  const body = (p, color, extra) => rect(insetX * p, insetY * p, width - 2 * insetX * p, height - 2 * insetY * p,
    (35 - 11 * p) * scale, color, extra);
  const faceRect = (fill, extra) => rect(face.x, face.y, face.width, face.height, face.radius, fill, extra);
  const metal = Object.hasOwn(metalFaces, stockColor) ? metalFaces[stockColor] : null;
  const defs = `<defs>${finish ? gradient('rim', finish.rim, '62%', '100%') + gradient('bevel', finish.bevel, '100%', '67%') : ''}${metal ? gradient('stock', metal, '100%', '8%') : ''}<clipPath id="face">${faceRect('#fff')}</clipPath></defs>`;
  const rim = finish ? body(0, finish.edge) + body(.07, 'url(#rim)') + body(.30, 'url(#bevel)') +
    body(.59, finish.glint) + body(.68, 'url(#rim)') + body(.80, finish.seat) + body(.94, finish.glint) : '';
  const faceMarkup = faceRect(metal ? 'url(#stock)' : '#fdfdfd');
  const grain = metal ? `<g clip-path="url(#face)">${brushedGrain(face, scale)}</g>` : '';
  const edge = faceRect('none', `stroke="${finish ? finish.seat : metal ? '#77736d' : '#b9bcc1'}" stroke-width="${scale * 2.3}" clip-path="url(#face)"`);
  return { width, height, face, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}${rim}${faceMarkup}${grain}${edge}</svg>` };
}
