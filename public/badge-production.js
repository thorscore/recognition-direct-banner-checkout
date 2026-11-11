import {productionLogo, renderProduction} from './badge-preview/render.js';

const element = id => document.getElementById(id);
const status = element('status');
const id = location.hash.slice(1);
const emailForm = element('email-form');
const codeForm = element('code-form');
let challenge, session, download, configuration, previewLogo;
let renderVersion = 0;

const inches = value => (value / 300).toFixed(3) + ' in';
function placements(plan) {
  const rows = [plan.logoRect ? `Logo: ${inches(plan.logoRect.w)} wide × ${inches(plan.logoRect.h)} high; left ${inches(plan.logoRect.x)}, top ${inches(plan.logoRect.y)}.` : 'Logo: none saved.'];
  for (const line of plan.lines) rows.push(`${line.key === 'organization' ? 'Organization' : line.key === 'name' ? 'Name' : 'Title'}: “${line.value}” — ${line.fontPoints.toFixed(2)} pt, weight ${line.weight}; ${plan.alignment} anchor ${inches(line.x)}, vertical center ${inches(line.y)}.`);
  element('preview-placement').replaceChildren(...rows.map(text => {
    const item = document.createElement('li'); item.textContent = text; return item;
  }));
}
async function showPreview() {
  const version = ++renderVersion;
  const selected = Number(element('badge-person').value);
  element('download-layout').disabled = true;
  element('preview-status').textContent = 'Rendering saved layout…';
  try {
    // Render offscreen so a slow vector image cannot overwrite a newer selection.
    const canvas = document.createElement('canvas');
    const plan = await renderProduction(canvas, configuration, selected, previewLogo);
    if (version !== renderVersion) return;
    const visible = element('badge-canvas');
    visible.width = canvas.width; visible.height = canvas.height;
    visible.getContext('2d').drawImage(canvas, 0, 0);
    visible.setAttribute('aria-label', `Saved badge layout for ${plan.person.name || 'unnamed badge'}, ${plan.size.width} by ${plan.size.height} inches`);
    element('canvas-wrap').hidden = false;
    element('preview-dimensions').textContent = `${plan.size.width} × ${plan.size.height} in badge face · ${plan.stock?.name ?? 'Saved stock'} · ${plan.person.copies} ${plan.person.copies === 1 ? 'copy' : 'copies'}`;
    element('preview-warning').textContent = plan.warnings.join(' ');
    placements(plan);
    element('preview-status').textContent = 'Saved customer layout';
    element('download-layout').disabled = false;
  } catch (error) {
    if (version !== renderVersion) return;
    element('canvas-wrap').hidden = true;
    element('preview-status').textContent = error.message;
    element('preview-placement').replaceChildren();
  }
}

const messages = {
  CODE_INVALID: 'That code is invalid or expired. Reload the page and request a fresh code.',
  CODE_RATE_LIMIT: 'Please wait before requesting another code.',
  ORDER_OWNER_REQUIRED: 'Sign in with the Recognition Direct business email to access this order.',
  ORDER_NOT_FOUND: 'This badge order is unavailable.',
  ORDER_PAYMENT_PENDING: 'This order is awaiting a verified Shopify payment. Check the order again after payment.',
};
async function request(action, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers['X-Badge-Session'] = session;
  const response = await fetch('/api/badge-design-account/' + action, {
    method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(messages[data.error] ?? 'The badge order could not be opened. Try again.');
  return data;
}

async function showOrder() {
  element('sign-out').hidden = false;
  const order = await request('production', { id });
  const { size, color, logo } = order;
  configuration = order.configuration;
  const design = configuration.design;
  const details = [
    ['Badge style', design.family === 'standard' ? 'Engravable' : 'Full-color printed'],
    ['Size', size], ['Stock color', color], ['Frame', design.frame],
    ['Corners', design.frame !== 'none' ? 'Set by frame' : (design.cornerRadius ?? '1/8') + ' in'],
    ['Finish', design.dome ? 'Epoxy dome' : design.family === 'duets' ? 'Gloss clear coat' : 'Standard'],
    ['Fastener', design.fastener], ['Total badges', design.quantity],
    ['Badge names now', configuration.namedQuantity], ['Hold for later', configuration.heldForLater],
    ['Organization', design.organization], ['Text color', design.family === 'standard' ? 'Black (#111111)' : design.textColor],
    ['Text alignment', design.textAlignment ?? 'left'], ['Text size', (design.textSize ?? 100) + '%'],
    ['Logo position', logo ? design.layout.replace('logo-', 'Logo ') : 'No logo'], ['Logo size', logo ? Math.round(configuration.logoScale * 100) + '%' : '—'],
    ['Delivery', design.delivery === 'troy' ? 'Troy Street pickup' : 'Ship'],
    ['Proof email', configuration.email], ['Layout notes', design.notes],
  ];
  element('order-details').replaceChildren(...details.flatMap(([name, value]) => {
    const term = document.createElement('dt'), description = document.createElement('dd');
    term.textContent = name;
    description.textContent = value === '' ? '—' : value;
    return [term, description];
  }));
  element('order-names').textContent = design.people.map(person =>
    `${person.copies} × ${person.name}${person.title ? ' — ' + person.title : ''}`).join('\n');
  if (logo) {
    const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };
    const artwork = element('artwork');
    download = URL.createObjectURL(new Blob([Uint8Array.from(atob(logo.base64), byte => byte.charCodeAt(0))],
      { type: 'application/octet-stream' }));
    artwork.href = download;
    artwork.download = 'badge-artwork.' + extensions[logo.type];
    artwork.hidden = false;
  }
  const orderId = /^gid:\/\/shopify\/Order\/(\d+)$/.exec(order.shopifyOrder)?.[1];
  if (orderId) {
    element('shopify-order').href = 'https://admin.shopify.com/store/f375fe-2d/orders/' + orderId;
    element('shopify-order').hidden = false;
  }
  element('order').hidden = false;
  status.textContent = 'Payment verified. Prepare and send the proof before production.';
  element('badge-person').replaceChildren(...design.people.map((person, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${index + 1}. ${person.name || 'Unnamed badge'}${person.title ? ' — ' + person.title : ''} (${person.copies} ×)`;
    return option;
  }));
  try {
    previewLogo = await productionLogo(logo);
    element('badge-person').disabled = false;
    await showPreview();
  } catch (error) {
    // Do not silently omit an unreadable logo from a production image.
    element('preview-status').textContent = error.message + ' The original artwork and specifications remain available.';
  }
}

element('badge-person').addEventListener('change', () => { if (configuration) showPreview(); });
element('download-layout').addEventListener('click', () => {
  if (element('download-layout').disabled) return;
  element('badge-canvas').toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'badge-layout-' + id.slice(0, 8) + '-' + (Number(element('badge-person').value) + 1) + '.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, 'image/png');
});

function run(form, action) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    try { await action(); }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}
run(emailForm, async () => {
  challenge = (await request('code', { email: element('email').value })).challenge;
  emailForm.hidden = true;
  codeForm.hidden = false;
  element('code').focus();
  status.textContent = 'Check your inbox for the eight-digit sign-in code.';
});
run(codeForm, async () => {
  session = (await request('verify', { challenge, code: element('code').value })).session;
  element('code').value = '';
  codeForm.hidden = true;
  await showOrder();
});
element('sign-out').addEventListener('click', async () => {
  try { await request('sign-out'); location.reload(); }
  catch (error) { status.textContent = error.message; }
});
addEventListener('pagehide', () => { if (download) URL.revokeObjectURL(download); });
addEventListener('hashchange', () => location.reload());
if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) {
  status.textContent = 'Open the badge order link from its Shopify order note.';
} else {
  try {
    session = (await request('session')).session;
    if (session) await showOrder();
    else { emailForm.hidden = false; status.textContent = ''; }
  } catch (error) { status.textContent = error.message; }
}
