import {readFile} from 'node:fs/promises';
import {AWARD_CATEGORY_LINKS,AWARD_DETAIL_PAGES,awardPageUrl} from './award-pages.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const money=value=>'$'+Number(value).toFixed(2);
export async function buildAwardDetailPage(page,products){
 const category=AWARD_CATEGORY_LINKS[page.catalog];if(!category)throw new Error('Unknown award category');
 const [css,client]=await Promise.all(['css','js'].map(ext=>readFile(new URL('./public/award-pilot.'+ext,import.meta.url),'utf8')));
 const options=page.options.map(option=>{
  const product=products.find(p=>p.sku===option.sku);const price=product?.prices?.lessThanCase;
  if(!product||!Number.isFinite(price)||price<=0||!product.image)throw new Error('Missing verified award option: '+option.sku);
  return {...option,title:product.displayName||product.title,image:product.image,thumbnail:product.thumbnail||product.image,price};
 });
 if(new Set(options.map(o=>o.sku)).size!==options.length)throw new Error('Duplicate award option');
 if(page.description.length>140)throw new Error('SEO description too long: '+page.handle+' '+page.description.length);
 const url=awardPageUrl(page);const orderUrl=sku=>'https://checkout.recognition-direct.com'+category.route+'?sku='+encodeURIComponent(sku);
 const related=AWARD_DETAIL_PAGES.filter(p=>p.catalog===page.catalog&&p!==page).slice(0,2);
 const structuredData={
  '@context':'https://schema.org','@type':'ProductGroup',name:page.title,description:page.intro,url,productGroupID:'RD-'+page.handle.toUpperCase(),material:page.material,
  variesBy:['https://schema.org/size',...(new Set(options.map(o=>o.color).filter(Boolean)).size>1?['https://schema.org/color']:[])],
  hasVariant:options.map(o=>({'@type':'Product',sku:o.sku,name:o.title,description:page.title+' — '+o.label,image:o.image,size:o.size,...(o.color?{color:o.color}:{}),url:url+'?sku='+o.sku,offers:{'@type':'Offer',url:url+'?sku='+o.sku,priceCurrency:'USD',price:o.price.toFixed(2),seller:{'@type':'Organization',name:'Recognition Direct'}}})),
 };
 const body=`<style>${css}</style>
<div class="rd-award-pilot">
 <nav class="rd-pilot-crumbs" aria-label="Award categories"><a href="/pages/awards">Awards</a><span aria-hidden="true"> / </span><a href="${category.url}">${escape(category.label)}</a></nav>
 <div class="rd-pilot-hero">
  <div class="rd-pilot-visual"><img data-pilot-image src="${escape(options[0].image)}" alt="${escape(options[0].title)}" width="560" height="420" fetchpriority="high"><div class="rd-pilot-thumbs">${options.map(o=>`<a href="?sku=${o.sku}#pilot-options" data-pilot-select="${o.sku}" aria-label="View ${escape(o.label)}"><img src="${escape(o.thumbnail)}" alt="${escape(o.label)}" width="100" height="100" loading="lazy"></a>`).join('')}</div></div>
  <div><p class="rd-pilot-eyebrow">Personalized ${page.catalog==='soccer'||page.catalog==='baseball-softball'?'team trophies':'recognition awards'}</p><h2>${escape(page.heading)}</h2><p>${escape(page.intro)}</p>
   <ul class="rd-pilot-highlights">${page.highlights.map(h=>`<li>${escape(h)}</li>`).join('')}<li>Proof approval before production</li><li>Shipping or pickup in Spring Valley</li></ul>
   <div class="rd-pilot-selected"><p data-pilot-current>${escape(options[0].title)}</p><p class="rd-pilot-price" data-pilot-price>${money(options[0].price)} <span>each at quantity 1</span></p><p class="rd-pilot-small">Before tax and shipping. Quantity pricing is shown in the order form.</p><a class="rd-pilot-button" data-pilot-order href="${orderUrl(options[0].sku)}">Personalize this ${page.catalog==='plaques'?'plaque':page.catalog==='acrylic'?'award':'trophy'}</a><p class="rd-pilot-small">Enter names and wording, upload files if needed, and review the calculated price before adding to cart.</p></div>
  </div>
 </div>
 <section id="pilot-options"><h2>${escape(page.compare)}</h2><p>Prices below are per item at quantity 1, before tax and shipping. Choose an exact option to personalize. Quantity discounts are calculated in the order form.</p><div class="rd-pilot-options">${options.map(o=>`<article id="${o.sku}" class="rd-pilot-option" data-pilot-sku="${o.sku}"><h3>${escape(o.label)}</h3><p class="rd-pilot-code">Product code: ${o.sku}</p><p class="rd-pilot-price">${money(o.price)} <span>each</span></p><a class="rd-pilot-button rd-pilot-button-secondary" href="${orderUrl(o.sku)}">Personalize ${escape(o.label)}</a></article>`).join('')}</div></section>
 <section class="rd-pilot-info"><h2>Plan your personalization</h2><p>${escape(page.wording)}</p><p>Upload a CSV or TXT names file for multiple recipients. A separate upload is available for your logo or artwork. If details are coming later, explain that in the order notes.</p><p>After checkout, we send a proof for approval. Production starts after you approve the design.</p></section>
 <section class="rd-pilot-info"><h2>Shipping and local pickup</h2><p>Order for shipping across the U.S., or choose pickup at <strong>8680 Troy St., Spring Valley, CA 91977</strong>. Please wait for your ready-for-pickup notification before coming in.</p><p>Enter your event or need-by date in the form. A requested date is not a confirmed delivery date; <a href="/pages/contact">contact us</a> if timing is critical.</p></section>
 <section class="rd-pilot-info"><h2>Questions before ordering?</h2><details><summary>${escape(page.question)}</summary><p>${escape(page.answer)}</p></details><details><summary>Can each item have different wording?</summary><p>Yes. List each recipient separately and identify any shared wording. Add different sizes or colors as separate cart items. Review all spelling and wording in your proof.</p></details><details><summary>Can I compare other styles?</summary><p><a href="${category.url}">Browse ${escape(category.label.toLowerCase())}</a>, or <a href="/pages/contact">ask us for help</a> choosing an award for your event.</p>${related.length?`<ul>${related.map(p=>`<li><a href="/pages/${p.handle}">${escape(p.title)}</a></li>`).join('')}</ul>`:''}</details></section>
</div>
<script type="application/json" id="rd-award-pilot-data">${json({options,orderPath:category.route})}</script>
<script type="application/ld+json">${json(structuredData)}</script>
<script>${client}</script>`;
 return {title:page.title,handle:page.handle,body,seoTitle:page.title+' | Recognition Direct',description:page.description,options,structuredData,catalog:page.catalog,orderPath:category.route};
}
