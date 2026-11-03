import { readFile } from 'node:fs/promises';
import {awardDetailsUrl, initialAwardSelection, AWARD_PILOT_URL} from './award-pilot.mjs';
import {AWARD_DETAIL_PAGES,awardPageUrl} from './award-pages.mjs';

const css = await readFile(new URL('./public/award-shopping.css', import.meta.url), 'utf8');
const client = await readFile(new URL('./public/award-shopping.js', import.meta.url), 'utf8');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dimension = /^(?:\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(?:["″]|inches?\b)/i;

export function awardStyleName(product) {
  let title = String(product.displayName || product.title || product.sku).trim();
  if (product.size && title.startsWith(product.size)) title = title.slice(product.size.length).trim();
  if (product.size && title.endsWith(product.size)) title = title.slice(0,-product.size.length).replace(/[\s–—-]+$/, '').trim();
  title = title.replace(/^\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?=\s)/i, '').trim();
  let match = title.match(dimension);
  if (match) {
    title = title.slice(match[0].length).trim();
    while (/^[x×]\s*/i.test(title)) {
      const rest = title.replace(/^[x×]\s*/i, '');
      match = rest.match(dimension);
      if (!match) break;
      title = rest.slice(match[0].length).trim();
    }
  }
  const color = product.optionName === 'Color' ? String(product.optionValue || '') : '';
  if (color && color !== 'Default Title' && /[a-z]/i.test(color)) {
    const literal = color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title.replace(new RegExp('(^|\\s)' + literal + '(?=\\s|$)', 'i'), '$1').trim();
  }
  return title.replace(/\s+/g, ' ').replace(/\bwith Edge\b/i, 'with colored edge') || product.title || product.sku;
}

export function groupAwardStyles(products, tierFor) {
  const groups = new Map();
  for (const product of products) {
    const title = awardStyleName(product);
    const type = product.productType || 'Trophies';
    const key = `${type.toLowerCase()}\u0000${title.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, {id: `style-${groups.size + 1}`, title, type, variants: []});
    const unitPrice = Number(tierFor(product, 1).unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error(`Invalid award price for ${product.sku}`);
    groups.get(key).variants.push({
      sku: product.sku, title: product.displayName || product.title, size: product.size || '',
      optionValue: product.optionValue === 'Default Title' ? '' : product.optionValue || '',
      image: product.image, thumbnail: product.thumbnail || product.image,
      imageAlt: product.imageAlt || product.title, description: product.description || '',
      priceAtOne: unitPrice,
      detailsUrl: awardDetailsUrl(product.sku),
    });
  }
  return [...groups.values()].map(group => ({...group, fromPrice: Math.min(...group.variants.map(p => p.priceAtOne))}));
}

export function awardShoppingPageHtml({catalog, appBaseUrl, pickupLabel, tierFor, seoTags, cartScript, selectedSku = ''}) {
  const groups = groupAwardStyles(catalog.products, tierFor);
  const initial = initialAwardSelection(groups,selectedSku);
  const first = initial.product;
  if (!first) throw new Error('No awards are configured for this catalog.');
  const types = [...new Set(groups.map(g => g.type))].sort((a,b) => a.localeCompare(b));
  const guides=AWARD_DETAIL_PAGES.filter(p=>p.catalog===catalog.id).map(p=>({title:p.title,url:awardPageUrl(p)}));
  if(catalog.id==='acrylic')guides.unshift({title:'Unite Diamond Ice Acrylic Awards',url:AWARD_PILOT_URL});
  const data = JSON.stringify({groups, catalogId: catalog.id, appBaseUrl,initialSku:first.sku,requestedSku:selectedSku,invalidSku:initial.invalid}).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(catalog.title)} | Recognition Direct</title>
<meta name="description" content="${escape(catalog.metaDescription)}">
${seoTags}<style>${css}</style></head><body>
<main class="wrap" data-award-shopping="1">
  <header class="catalog-intro"><h1>${escape(catalog.title)}</h1><p>Choose a style, select the exact size or color, and add your wording. We send a proof after checkout for your approval before production.</p></header>
  <nav class="steps" aria-label="Award ordering steps"><a href="#award-browser">1. Choose a style</a><a href="#award-options">2. Personalize</a><a href="#award-delivery">3. Delivery &amp; review</a></nav>
  <div class="layout">
    <section class="browser panel" id="award-browser" aria-labelledby="browser-heading">
      <h2 id="browser-heading">Choose your award style</h2><p class="help">Size and color choices are grouped together. Select a style to see its options.</p>
      <div class="filters"><div><label for="award_search">Search by style or SKU</label><input id="award_search" type="search" placeholder="Try diamond, star, or a product code" autocomplete="off"></div>
      <div><label for="award_type">Award type</label><select id="award_type"><option value="">All types</option>${types.map(type => `<option>${escape(type)}</option>`).join('')}</select></div></div>
      <p class="help" data-result-count role="status"></p><div class="award-grid" data-award-grid></div>
      <p hidden data-empty>No matching styles. Try a different search or choose all types.</p>
      <nav class="pagination" aria-label="Award catalog pages"><button type="button" data-previous>Previous</button><span data-page-count></span><button type="button" data-next>Next</button></nav>
      <p class="help">From prices are per item at quantity 1 for the lowest-priced option in that style. Select your option and quantity for its price. Tax and shipping are additional.</p>
      ${guides.length?`<nav class="award-detail-guides" aria-label="Award style guides"><h3>Explore these award styles</h3><p class="help">Compare sizes, colors, prices and personalization details.</p><ul>${guides.map(p=>`<li><a href="${escape(p.url)}" target="_top">${escape(p.title)}</a></li>`).join('')}</ul></nav>`:''}
    </section>
    <section class="selected" id="award-options" aria-labelledby="selected-title">
      <div class="panel selection"><a data-award-details href="${escape(first.detailsUrl)}" target="_top"${first.detailsUrl?'':' hidden'}>View this award’s sizes, colors &amp; details</a><img class="preview" data-preview src="${escape(first.image)}" alt="${escape(first.imageAlt)}"><h2 id="selected-title" tabindex="-1" data-selected-title>${escape(first.title)}</h2><p class="sku" data-selected-sku></p><details><summary>Product details</summary><p class="description" data-description></p></details></div>
      <form action="${escape(appBaseUrl)}/api/premier-award-checkout" method="post" enctype="multipart/form-data" data-award-form>
        <input type="hidden" name="catalog" value="${escape(catalog.id)}">
        <fieldset class="panel"><legend>Size, color &amp; quantity</legend><label for="award_variant">Size / color / option</label><select id="award_variant" name="sku" required></select><p class="help">Each option lists its exact product name and code.</p>
          <label for="order_quantity">Quantity of this option</label><input id="order_quantity" name="order_quantity" type="number" min="1" max="10000" step="1" value="1" required>
          <div class="estimate" aria-live="polite"><span data-price-label>Calculating price…</span><strong data-price-total>—</strong><span data-price-message>Before tax and shipping.</span></div>
          <p class="help">Quantity pricing is applied automatically to this option. Add other sizes or colors as separate cart items.</p>
        </fieldset>
        <fieldset class="panel"><legend>Personalization</legend><label for="plate_text">${escape(catalog.plateLabel || 'Personalized plate text')}</label><textarea id="plate_text" name="plate_text" maxlength="5000" placeholder="${escape(catalog.platePlaceholder || 'Type the exact wording. For different names, enter one award per line.')}" aria-describedby="wording-help"></textarea>
          <p class="help" id="wording-help">Include names, award titles and dates exactly as they should appear. For multiple recipients, list each award on its own line or upload a names file.</p>
          <label for="names_file">Names / wording file (optional)</label><input id="names_file" name="names_file" type="file" accept=".txt,.csv,text/plain,text/csv"><p class="help">CSV or TXT. Include one recipient per row and explain any shared wording.</p>
          <label for="artwork">Logo / artwork (optional)</label><input id="artwork" name="artwork" type="file" accept=".pdf,.ai,.eps,.psd,.jpg,.jpeg,.png"><p class="help">PDF, AI, EPS, PSD, JPG or PNG. If your wording or artwork is coming later, tell us in the notes.</p>
        </fieldset>
        <fieldset class="panel" id="award-delivery"><legend>Delivery &amp; contact details</legend><label for="delivery_method">Delivery</label><select id="delivery_method" name="delivery_method"><option value="ship">Ship</option><option value="pickup-spring-valley">${escape(pickupLabel)}</option></select><p class="help" data-delivery-help>Shipping is calculated in your cart. Enter the shipping address at checkout.</p>
          <div class="contact-grid"><div><label for="name">Name</label><input id="name" name="name" autocomplete="name" required></div><div><label for="company">Company / team (optional)</label><input id="company" name="company" autocomplete="organization"></div><div><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div><div><label for="phone">Phone (optional)</label><input id="phone" name="phone" type="tel" autocomplete="tel"></div><div><label for="need_by">Event / need-by date (optional)</label><input id="need_by" name="need_by" type="date"></div></div>
          <label for="notes">Layout, deadline or other notes (optional)</label><textarea id="notes" name="notes" maxlength="2500" placeholder="${escape(catalog.notesPlaceholder || 'Tell us about your event, layout or wording.')}" ></textarea><p class="help">A requested date is not a confirmed delivery date. Contact us if timing is critical.</p>
        </fieldset>
        <section class="panel review" aria-labelledby="review-heading"><h2 id="review-heading">Review your selection</h2><p data-review-option></p><p data-review-price>Calculating price…</p><p data-review-delivery></p><p class="help">After checkout, we send a proof. Production starts after you approve the design.</p><p class="error" role="alert" data-error hidden></p><button class="submit" type="submit" disabled>Add to cart</button></section>
      </form>
    </section>
  </div>
  <noscript><p>Enable JavaScript to choose an award and calculate pricing, or call <a href="tel:6194650055">(619) 465-0055</a> for help.</p></noscript>
</main><script type="application/json" id="award-shopping-data">${data}</script><script>${client}</script>${cartScript}</body></html>`;
}
