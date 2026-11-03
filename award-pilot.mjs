import { readFile } from 'node:fs/promises';

export const AWARD_PILOT_HANDLE = 'unite-diamond-ice-acrylic-awards';
export const AWARD_PILOT_URL = `https://recognition-direct.com/pages/${AWARD_PILOT_HANDLE}`;
export const AWARD_PILOT_OPTIONS = [
  {sku:'UNT10BK',height:7,color:'Black'},
  {sku:'UNT10BU',height:7,color:'Blue'},
  {sku:'UNT11BK',height:8,color:'Black'},
  {sku:'UNT11BU',height:8,color:'Blue'},
];

export function awardDetailsUrl(sku) {
  return AWARD_PILOT_OPTIONS.some(p=>p.sku===sku) ? AWARD_PILOT_URL : '';
}

export function initialAwardSelection(groups, sku = '') {
  const group = groups.find(g=>g.variants.some(p=>p.sku===sku));
  if (sku && !group) return {group:groups[0],product:groups[0]?.variants[0],invalid:true};
  return {group:group||groups[0],product:group?.variants.find(p=>p.sku===sku)||groups[0]?.variants[0],invalid:false};
}

const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => '$'+Number(value).toFixed(2);

export async function buildAwardPilotPage(products) {
  const css = await readFile(new URL('./public/award-pilot.css',import.meta.url),'utf8');
  const client = await readFile(new URL('./public/award-pilot.js',import.meta.url),'utf8');
  const options = AWARD_PILOT_OPTIONS.map(option=>{
    const product=products.find(p=>p.sku===option.sku);
    const price=product?.prices?.lessThanCase;
    if(!product||!Number.isFinite(price)||price<=0||!product.image)throw new Error('Missing verified pilot option: '+option.sku);
    return {...option,title:product.displayName||product.title,image:product.image,thumbnail:product.thumbnail||product.image,price};
  });
  const title='Unite Diamond Ice Acrylic Awards';
  const description='Personalize Unite Diamond Ice acrylic awards in two sizes with black or blue bases. View prices and approve a proof before production.';
  const orderUrl=sku=>'https://checkout.recognition-direct.com/acrylic-awards?sku='+encodeURIComponent(sku);
  const structuredData={
    '@context':'https://schema.org','@type':'ProductGroup',name:title,
    description:'Personalized acrylic recognition awards in two heights with a black or blue base.',
    url:AWARD_PILOT_URL,productGroupID:'RD-UNITE-DIAMOND-ICE',material:'Acrylic',
    variesBy:['https://schema.org/size','https://schema.org/color'],
    hasVariant:options.map(o=>({'@type':'Product',sku:o.sku,name:o.title,description:`${o.height}-inch Unite Diamond Ice acrylic award with a ${o.color.toLowerCase()} base.`,image:o.image,size:o.height+' inches',color:o.color,url:AWARD_PILOT_URL+'?sku='+o.sku,offers:{'@type':'Offer',url:AWARD_PILOT_URL+'?sku='+o.sku,priceCurrency:'USD',price:o.price.toFixed(2),seller:{'@type':'Organization',name:'Recognition Direct'}}})),
  };
  const body=`<style>${css}</style>
<div class="rd-award-pilot">
  <nav class="rd-pilot-crumbs" aria-label="Award categories"><a href="/pages/awards">Awards</a><span aria-hidden="true"> / </span><a href="/pages/acrylic-awards">Acrylic awards</a></nav>
  <div class="rd-pilot-hero">
    <div class="rd-pilot-visual"><img data-pilot-image src="${escape(options[0].image)}" alt="${escape(options[0].title)}" width="560" height="420" fetchpriority="high"><div class="rd-pilot-thumbs">${options.map(o=>`<a href="?sku=${o.sku}#pilot-options" data-pilot-select="${o.sku}" aria-label="View ${escape(o.title)}"><img src="${escape(o.thumbnail)}" alt="${escape(o.height+'-inch, '+o.color.toLowerCase()+' base')}" width="100" height="100" loading="lazy"></a>`).join('')}</div></div>
    <div><p class="rd-pilot-eyebrow">Personalized recognition awards</p><h2>A clear award with a distinctive base</h2><p>Recognize an employee, thank a sponsor, or celebrate an achievement with a Unite Diamond Ice acrylic award. Choose a 7-inch or 8-inch height with a black or blue base, then add names, dates, an award title, and logo details for proofing.</p>
      <ul class="rd-pilot-highlights"><li>Two heights and two base colors</li><li>½-inch-thick acrylic</li><li>Wording and logo details reviewed before production</li><li>Shipping or pickup in Spring Valley</li></ul>
      <div class="rd-pilot-selected"><p data-pilot-current>${escape(options[0].title)}</p><p class="rd-pilot-price" data-pilot-price>${money(options[0].price)} <span>each at quantity 1</span></p><p class="rd-pilot-small">Before tax and shipping. Quantity pricing is shown in the order form.</p><a class="rd-pilot-button" data-pilot-order href="${orderUrl(options[0].sku)}">Personalize this award</a><p class="rd-pilot-small">You’ll enter names, upload files if needed, and review the calculated price before adding to cart.</p></div>
    </div>
  </div>
  <section id="pilot-options"><h2>Compare sizes and base colors</h2><p>These are prices per award at quantity 1. Select an option to personalize it. Quantity discounts are calculated for each exact option in the order form.</p>
    <div class="rd-pilot-options">${options.map(o=>`<article id="${o.sku}" class="rd-pilot-option" data-pilot-sku="${o.sku}"><h3>${o.height}-inch · ${o.color} base</h3><p class="rd-pilot-code">Product code: ${o.sku}</p><p class="rd-pilot-price">${money(o.price)} <span>each</span></p><a class="rd-pilot-button rd-pilot-button-secondary" href="${orderUrl(o.sku)}">Personalize ${o.height}-inch ${o.color.toLowerCase()}</a></article>`).join('')}</div>
  </section>
  <section class="rd-pilot-info"><h2>Make the wording yours</h2><p>Use the personalization field for names, award titles, dates, and exact spelling. For a group order, enter each recipient on a separate line or upload a CSV or TXT names file. A separate upload is available for your logo or artwork.</p><p>If details are coming later, explain that in the order notes. After checkout, we send a proof for approval before production.</p></section>
  <section class="rd-pilot-info"><h2>Shipping and local pickup</h2><p>Order for shipping across the U.S., or choose pickup at <strong>8680 Troy St., Spring Valley, CA 91977</strong>. Please wait for your ready-for-pickup notification before coming in.</p><p>Enter your event or need-by date in the form. A requested date is not a confirmed delivery date; <a href="/pages/contact">contact us</a> if timing is critical.</p></section>
  <section class="rd-pilot-info"><h2>Questions before ordering?</h2><details><summary>Can each award have a different name?</summary><p>Yes. Include one recipient per line or upload your names file, and explain any shared wording in the notes. Add different award sizes or base colors as separate cart items.</p></details><details><summary>Will I see a proof?</summary><p>Yes. We send a proof after checkout for your review. Production starts after you approve the design.</p></details><details><summary>Can I compare other acrylic awards?</summary><p><a href="/pages/acrylic-awards">Browse all acrylic award styles</a>, or <a href="/pages/contact">ask us for help</a> choosing an award for your event.</p></details></section>
</div>
<script type="application/json" id="rd-award-pilot-data">${JSON.stringify(options).replace(/</g,'\\u003c')}</script>
<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g,'\\u003c')}</script>
<script>${client}</script>`;
  return {title,handle:AWARD_PILOT_HANDLE,body,seoTitle:title+' | Recognition Direct',description,options,structuredData};
}
