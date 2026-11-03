(() => {
  const {groups, catalogId, appBaseUrl,initialSku,requestedSku,invalidSku} = JSON.parse(document.querySelector('#award-shopping-data').textContent);
  const get = selector => document.querySelector(selector);
  const form = get('[data-award-form]');
  const grid = get('[data-award-grid]');
  const search = get('#award_search');
  const type = get('#award_type');
  const variant = get('#award_variant');
  const quantity = get('#order_quantity');
  const submit = get('button.submit');
  let selectedGroup = groups.find(g=>g.variants.some(p=>p.sku===initialSku))||groups[0];
  let selectedProduct = selectedGroup.variants.find(p=>p.sku===initialSku)||selectedGroup.variants[0];
  let needsSelection = invalidSku;
  if(requestedSku&&!invalidSku) search.value=selectedGroup.title;
  let page = 0;
  let timer;
  let request;
  let readyKey = '';
  let serial = 0;
  const money = value => '$' + Number(value).toFixed(2);
  const key = () => selectedProduct.sku + ':' + quantity.value;
  const pageSize = () => window.matchMedia('(max-width:560px)').matches ? 6 : 12;
  const validQuantity = () => quantity.validity.valid && Number.isSafeInteger(Number(quantity.value)) && Number(quantity.value) > 0;

  function sendHeight() {
    const height = Math.ceil(get('main').getBoundingClientRect().height);
    window.parent?.postMessage({type:'rd-awards-height',height}, '*');
  }
  function moveTo(selector) {
    const node = get(selector);
    node.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth',block:'start'});
    if (window.parent !== window) window.parent.postMessage({type:'rd-awards-select',offsetTop:node.offsetTop}, '*');
  }
  function filteredGroups() {
    const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return groups.filter(group => (!type.value || group.type === type.value) && terms.every(term =>
      [group.title,group.type,...group.variants.flatMap(p => [p.sku,p.title,p.optionValue,p.size])].join(' ').toLowerCase().includes(term)));
  }
  function renderCards() {
    const matches = filteredGroups();
    const size = pageSize();
    page = Math.max(0,Math.min(page,Math.ceil(matches.length / size)-1));
    grid.replaceChildren();
    for (const group of matches.slice(page*size,(page+1)*size)) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'award-card'; card.dataset.style = group.id;
      card.setAttribute('aria-pressed',String(group.id === selectedGroup.id));
      const image = document.createElement('img'); image.src = group.variants[0].thumbnail; image.alt = ''; image.loading = 'lazy';
      const title = document.createElement('strong'); title.textContent = group.title;
      const options = document.createElement('span'); options.textContent = group.variants.length === 1 ? '1 option' : group.variants.length + ' size / color options';
      const price = document.createElement('b'); price.textContent = 'From ' + money(group.fromPrice) + ' each';
      card.append(image,title,options,price);
      card.addEventListener('click',() => {
        needsSelection = false;
        selectedGroup = group;
        const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        selectedProduct = group.variants.find(p => terms.every(term => [group.title,group.type,p.sku,p.title,p.optionValue,p.size].join(' ').toLowerCase().includes(term))) || group.variants[0];
        renderVariants(); renderSelection(); renderCards();
        if (window.matchMedia('(max-width:980px)').matches) { moveTo('#award-options'); get('#selected-title').focus({preventScroll:true}); }
      });
      grid.append(card);
    }
    get('[data-result-count]').textContent = matches.length + (matches.length === 1 ? ' style' : ' styles') + (matches.length ? ' · showing ' + (page*size+1) + '–' + Math.min((page+1)*size,matches.length) : '');
    get('[data-empty]').hidden = matches.length > 0;
    get('[data-page-count]').textContent = matches.length ? 'Page ' + (page+1) + ' of ' + Math.ceil(matches.length / size) : 'No results';
    get('[data-previous]').disabled = page === 0;
    get('[data-next]').disabled = (page+1)*size >= matches.length;
    sendHeight();
  }
  function renderVariants() {
    variant.replaceChildren();
    for (const product of selectedGroup.variants) {
      const option = document.createElement('option');
      option.value = product.sku; option.textContent = product.title + ' — ' + product.sku;
      variant.append(option);
    }
    variant.value = selectedProduct.sku;
  }
  function renderSelection() {
    const preview = get('[data-preview]'); preview.src = selectedProduct.image; preview.alt = selectedProduct.imageAlt;
    get('[data-selected-title]').textContent = selectedProduct.title;
    get('[data-selected-sku]').textContent = 'Product code: ' + selectedProduct.sku;
    get('[data-description]').textContent = selectedProduct.description;
    get('[data-review-option]').textContent = selectedProduct.title + ' (' + selectedProduct.sku + ')';
    const details=get('[data-award-details]');
    details.hidden=!selectedProduct.detailsUrl;
    if(selectedProduct.detailsUrl)details.href=selectedProduct.detailsUrl;
    queuePrice(); sendHeight();
  }
  function queuePrice() {
    serial++; clearTimeout(timer); request?.abort(); readyKey = ''; submit.disabled = true;
    get('[data-error]').hidden = true;
    get('[data-price-total]').textContent = '—';
    get('[data-price-label]').textContent = validQuantity() ? 'Calculating price…' : 'Enter a whole-number quantity of 1–10,000.';
    get('[data-review-price]').textContent = validQuantity() ? 'Calculating price…' : 'Enter a valid quantity to calculate your price.';
    get('[data-price-message]').textContent = 'Before tax and shipping.';
    if(needsSelection){get('[data-price-label]').textContent='This award option was not found. Please choose a style and option.';get('[data-review-price]').textContent='Choose an award to confirm your selection.';return;}
    if (validQuantity()) timer = setTimeout(updatePrice,180);
  }
  async function updatePrice() {
    const currentKey = key(); const currentSerial = serial;
    request = new AbortController();
    try {
      const data = new FormData(); data.set('catalog',catalogId); data.set('sku',selectedProduct.sku); data.set('order_quantity',quantity.value);
      const response = await fetch(appBaseUrl + '/api/premier-award-price',{method:'POST',body:data,signal:request.signal});
      const price = await response.json();
      if (currentKey !== key() || currentSerial !== serial) return;
      if (!response.ok || price.sku !== selectedProduct.sku || !Number.isFinite(price.unitPrice) || price.unitPrice <= 0 || !Number.isFinite(price.totalPrice) || price.totalPrice <= 0 || Math.abs(price.unitPrice*Number(quantity.value)-price.totalPrice) > .011) throw new Error(price.error || 'Price is unavailable. Please try again.');
      readyKey = currentKey; submit.disabled = false;
      get('[data-price-label]').textContent = money(price.unitPrice) + ' each × ' + quantity.value;
      get('[data-price-total]').textContent = money(price.totalPrice);
      get('[data-price-message]').textContent = 'Product subtotal before tax and shipping.';
      get('[data-review-price]').textContent = quantity.value + ' × ' + money(price.unitPrice) + ' = ' + money(price.totalPrice) + ' before tax and shipping';
    } catch (error) {
      if (error.name === 'AbortError' || currentKey !== key() || currentSerial !== serial) return;
      get('[data-price-label]').textContent = 'Price could not be confirmed.';
      get('[data-review-price]').textContent = 'Price unavailable. Change the quantity to retry, or call (619) 465-0055.';
      get('[data-error]').textContent = 'We could not confirm this price. Change the quantity to retry, or call (619) 465-0055.';
      get('[data-error]').hidden = false;
    }
    sendHeight();
  }
  function delivery() {
    const pickup = form.elements.delivery_method.value !== 'ship';
    get('[data-delivery-help]').textContent = pickup ? 'Pickup at 8680 Troy St., Spring Valley, CA 91977. Please wait for your ready-for-pickup notification.' : 'Shipping is calculated in your cart. Enter the shipping address at checkout.';
    get('[data-review-delivery]').textContent = pickup ? 'Pickup: 8680 Troy St., Spring Valley, CA 91977' : 'Delivery: Ship';
    sendHeight();
  }
  document.addEventListener('submit',event => {
    if (event.target !== form) return;
    if (needsSelection || readyKey !== key() || !validQuantity() || !form.reportValidity()) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (readyKey !== key()) { get('[data-error]').textContent = 'Please wait for a confirmed price before adding to cart.'; get('[data-error]').hidden = false; }
    }
  },true);
  variant.addEventListener('change',() => {needsSelection=false;selectedProduct = selectedGroup.variants.find(p=>p.sku===variant.value); renderSelection();});
  quantity.addEventListener('input',queuePrice);
  quantity.addEventListener('change',queuePrice);
  form.elements.delivery_method.addEventListener('change',delivery);
  search.addEventListener('input',() => {page=0;renderCards();});
  type.addEventListener('change',() => {page=0;renderCards();});
  for (const [selector,change] of [['[data-previous]',-1],['[data-next]',1]]) get(selector).addEventListener('click',()=>{page+=change;renderCards();if(window.matchMedia('(max-width:980px)').matches)moveTo('#award-browser');});
  get('.steps').addEventListener('click',event=>{const link=event.target.closest('a');if(link){event.preventDefault();moveTo(link.getAttribute('href'));}});
  form.addEventListener('input',sendHeight);
  document.addEventListener('toggle',sendHeight,true);
  document.addEventListener('load',sendHeight,true);
  let previousWidth = window.innerWidth;
  window.addEventListener('resize',()=>{if(window.innerWidth !== previousWidth){previousWidth=window.innerWidth;renderCards();}});
  if ('ResizeObserver' in window) new ResizeObserver(sendHeight).observe(get('main'));
  renderVariants(); renderCards(); renderSelection(); delivery();
  if(requestedSku&&!invalidSku)requestAnimationFrame(()=>moveTo('#award-options'));
})();
