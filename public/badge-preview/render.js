import {FIXED_SIZES, STANDARD_COLORS, DUETS_COLORS} from './catalog.js';
import {PREVIEW_PIXELS_PER_INCH as PPI, badgeCornerPixels, badgeTextLayout, containImage, engravableBadgeSurface, fitBadgeText} from './layout.js';
import {badgeLogoPreview} from './logo-preview.js';
import {BADGE_LOGO_MAX_PIXELS, validateBadgeLogo} from './logo-validation.js';

// This module shares the storefront's geometry and font-fitting rules. It never
// changes the stored configuration or sends artwork to another service.
export function productionPlan(configuration, index, logo, measure) {
  const design = configuration.design;
  const size = FIXED_SIZES.find(option => option.id === design.size);
  if (!size || !['standard', 'duets'].includes(design.family) || !Number.isInteger(index) || !design.people?.[index]) {
    throw new Error('This saved badge layout is unavailable. Review the order specifications and original artwork.');
  }
  const person = design.people[index];
  const width = Math.round(size.width * PPI), height = Math.round(size.height * PPI);
  const standard = design.family === 'standard';
  const surface = standard ? engravableBadgeSurface(width, height, design.stockColor, design.frame, design.cornerRadius) : null;
  const radius = surface?.face.radius ?? badgeCornerPixels(design.cornerRadius ?? '1/8');
  const alignment = design.textAlignment ?? 'left';
  const layout = badgeTextLayout(width, height, design.layout, {
    ...person, hasLogo: Boolean(logo), alignment, organization: design.organization, textSize: design.textSize,
  });
  const logoRect = logo ? containImage(logo.width, logo.height, layout.logo, configuration.logoScale, {width, height, radius}) : null;
  const lines = fitBadgeText(layout, (value, size, weight) => measure(value, size, weight, alignment), design.textVerticalPosition, {width, height, radius, alignment})
    .map(line => ({...line, x: layout.x, fontPoints: line.size / PPI * 72}));
  return {width, height, size, standard, surface, radius, alignment, clip: layout.clip, logoRect, lines, person,
    stock: (standard ? STANDARD_COLORS : DUETS_COLORS).find(color => color.id === design.stockColor),
    warnings: lines.filter(line => !line.fits).map(line => 'The ' + line.key + ' does not fit the saved text area. Adjust it when preparing the final proof.')};
}

async function imageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.width || !image.height || image.width * image.height > BADGE_LOGO_MAX_PIXELS) throw new Error('Logo dimensions exceed the preview limit.');
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function productionLogo(saved, options) {
  if (!saved) return null;
  const blob = new Blob([Uint8Array.from(atob(saved.base64), byte => byte.charCodeAt(0))], {type: saved.type});
  validateBadgeLogo(blob);
  return imageFromBlob(await badgeLogoPreview(blob, options));
}

export async function renderProduction(canvas, configuration, index, logo, {artworkOnly = false, pixelsPerInch = PPI} = {}) {
  if (![PPI, 1200].includes(pixelsPerInch)) throw new Error('Unsupported production resolution.');
  const context = canvas.getContext('2d');
  const measure = (value, fontSize, weight, alignment) => {
    context.font = weight + ' ' + fontSize + 'px system-ui';
    context.textAlign = alignment;
    context.textBaseline = 'middle';
    return context.measureText(value);
  };
  const plan = productionPlan(configuration, index, logo, measure);
  const scale = pixelsPerInch / PPI;
  canvas.width = Math.round((artworkOnly ? plan.width : plan.surface?.width ?? plan.width) * scale);
  canvas.height = Math.round((artworkOnly ? plan.height : plan.surface?.height ?? plan.height) * scale);
  context.scale(scale, scale);
  if (plan.surface && !artworkOnly) {
    const surfaceImage = await imageFromBlob(new Blob([plan.surface.svg], {type: 'image/svg+xml'}));
    context.drawImage(surfaceImage, 0, 0);
  }
  context.save();
  if (plan.surface && !artworkOnly) context.translate(plan.surface.face.x, plan.surface.face.y);
  context.beginPath();
  context.roundRect(0, 0, plan.width, plan.height, plan.radius);
  context.clip();
  if (!plan.standard && !artworkOnly) {
    context.fillStyle = plan.stock?.preview ?? '#fff';
    context.fillRect(0, 0, plan.width, plan.height);
    if (plan.stock?.transparent) for (let y = 0; y < plan.height; y += 24) for (let x = 0; x < plan.width; x += 24) {
      context.fillStyle = ((x + y) / 24) % 2 ? '#edf0f3' : '#fff';
      context.fillRect(x, y, 24, 24);
    }
    context.strokeStyle = '#aebbd0'; context.lineWidth = 4; context.stroke();
  }
  if (logo) {
    const {x, y, w, h} = plan.logoRect;
    context.drawImage(logo, x, y, w, h);
  }
  context.save(); context.beginPath();
  context.rect(plan.clip.x, plan.clip.y, plan.clip.width, plan.clip.height); context.clip();
  context.textAlign = plan.alignment; context.textBaseline = 'middle';
  context.fillStyle = plan.standard ? '#111111' : configuration.design.textColor;
  for (const line of plan.lines) {
    context.font = line.weight + ' ' + line.size + 'px system-ui';
    context.fillText(line.value, line.x, line.y);
  }
  context.restore();
  if (configuration.design.dome && !artworkOnly) {
    const gloss = context.createLinearGradient(0, 0, plan.width, plan.height);
    gloss.addColorStop(0, '#ffffff75'); gloss.addColorStop(.45, '#ffffff00');
    context.fillStyle = gloss; context.fillRect(0, 0, plan.width, plan.height * .45);
  }
  context.restore();
  return plan;
}
