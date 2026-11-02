export function expressOneOrderSplit(form, quantity) {
  if (form.get('express_one') !== 'yes') return null;
  const structured = form.get('express_one_split_version') === '1' || form.has('express_one_now') || form.has('express_one_held');
  if (!structured) return null;
  const count = name => {
    const raw = String(form.get(name) ?? '').trim();
    if (!/^\d+$/.test(raw)) throw new Error('Enter whole badge quantities for Express One.');
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Enter valid badge quantities for Express One.');
    return value;
  };
  const neededNow = count('express_one_now');
  const heldForLater = count('express_one_held');
  if (neededNow + heldForLater !== quantity) throw new Error('Badges needed now plus badges held for later must equal the full purchased quantity.');
  return { neededNow, heldForLater };
}
