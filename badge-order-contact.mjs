export function normalizeBadgeContact(input) {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['name', 'company', 'phone'].includes(key))) throw Error('CONTACT_DETAILS_INVALID');
  const contact = {};
  for (const [key, max] of [['name', 120], ['company', 160], ['phone', 50]]) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f\u2028\u2029]/.test(value)) throw Error('CONTACT_DETAILS_INVALID');
    contact[key] = value.trim();
  }
  if (!contact.name) throw Error('CONTACT_NAME_REQUIRED');
  if (contact.phone) {
    const parts = contact.phone.match(/^([+\d().\s-]+?)(?:\s*(?:ext\.?|x|#)\s*(\d{1,6}))?$/i);
    const digits = parts?.[1].replace(/\D/g, '') ?? '';
    if (!parts || digits.length < 7 || digits.length > 15 || (parts[1].includes('+') && (!parts[1].trim().startsWith('+') || parts[1].trim().slice(1).includes('+')))) throw Error('CONTACT_PHONE_INVALID');
  }
  return contact;
}

export function badgeContactAttributes(contact) {
  return contact ? [['Order company', contact.company], ['Order contact name', contact.name], ['Order contact phone', contact.phone]]
    .filter(([, value]) => value).map(([key, value]) => ({key, value})) : [];
}

export function badgeContactNote(contact) {
  return badgeContactAttributes(contact).map(({key, value}) => key + ': ' + value).join('\n');
}

export function badgeContactShopifyFields(contact) {
  if (!contact) return {};
  const fields = {customAttributes: badgeContactAttributes(contact)};
  const value = contact.phone;
  if (value && !/(?:ext\.?|x|#)/i.test(value)) {
    const digits = value.replace(/\D/g, '');
    const phone = value.startsWith('+') ? '+' + digits : digits.length === 10 ? '+1' + digits : digits.length === 11 && digits.startsWith('1') ? '+' + digits : '';
    if (/^\+[1-9]\d{6,14}$/.test(phone)) fields.phone = phone;
  }
  return fields;
}
