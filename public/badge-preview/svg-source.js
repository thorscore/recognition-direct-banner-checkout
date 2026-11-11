const invalidSvg = 'Use a valid SVG with the logo artwork included in the file.';

// Normalize only the temporary image-preview copy. The uploaded File remains
// untouched for saved designs, orders, and original production downloads.
export function prepareSvgMarkup(source) {
  if (typeof source !== 'string' || /<!\s*ENTITY\b/i.test(source)) throw new Error(invalidSvg);
  const declarations = [...source.matchAll(/<!\s*DOCTYPE\b/gi)];
  if (!declarations.length) return source;
  if (declarations.length !== 1) throw new Error(invalidSvg);

  // CorelDRAW and Illustrator commonly include an external SVG 1.1 DTD.
  // Remove that complete declaration without fetching or resolving its URL.
  // Internal subsets and entity definitions are deliberately unsupported.
  const external = /<!DOCTYPE\s+svg\s+(?:PUBLIC\s+(?:"[^"<>\[\]]*"|'[^'<>\[\]]*')\s+(?:"[^"<>\[\]]*"|'[^'<>\[\]]*')|SYSTEM\s+(?:"[^"<>\[\]]*"|'[^'<>\[\]]*'))\s*>/.exec(source);
  if (!external || external.index !== declarations[0].index) throw new Error(invalidSvg);
  const prefix = source.slice(0, external.index);
  if (prefix.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '').trim()) throw new Error(invalidSvg);
  return prefix + source.slice(external.index + external[0].length);
}
