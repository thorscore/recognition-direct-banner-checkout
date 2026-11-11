export const BADGE_LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const BADGE_LOGO_MAX_PIXELS = 16_000_000;
const types = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']);
export function validateBadgeLogo(file) {
  if (!(file instanceof Blob) || !types.has(file.type) || !file.size || file.size > BADGE_LOGO_MAX_BYTES) {
    throw new Error('The saved logo cannot be previewed. Download the original artwork for review.');
  }
}
