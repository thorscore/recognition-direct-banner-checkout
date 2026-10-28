(() => {
  const $ = selector => document.querySelector(selector);
  let state, requestKey, releaseProfile;
  const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
  const date = value => new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const statuses = {requested:'Awaiting approval',approved:'Approved',shipped:'Shipped',ready:'Ready for pickup',rejected:'Rejected',cancelled:'Cancelled'};
  function el(tag,attrs = {},...children) {
    const node = document.createElement(tag);
    for (const [key,value] of Object.entries(attrs)) if (value !== undefined && value !== null) node.setAttribute(key,String(value));
    for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child instanceof Node ? child:document.createTextNode(String(child)));
    return node;
  }
  function button(label,action,secondary = true) {
    const node = el('button',{type:'button',class:secondary ? 'secondary':''},label);
    node.addEventListener('click',async () => { node.disabled = true; try { await action(); } catch (error) { showError(error.message); } finally { node.disabled = false; } });
    return node;
  }
  function showError(message) { $('#error').textContent = message; $('#error').hidden = false; }
  function notice(message) { $('#notice').textContent = message; $('#notice').hidden = false; }
  async function api(path,body) {
    const response = await fetch(`/express-one/${path}`,{method:body ? 'POST':'GET',credentials:'same-origin',headers:body ? {'Content-Type':'application/json','X-CSRF-Token':state.csrf}:{},body:body ? JSON.stringify(body):undefined});
    const result = await response.json();
    if (!response.ok) { if (response.status === 401) location.assign('/express-one'); throw new Error(result.error || 'Request could not be completed.'); }
    return result;
  }
  function table(target,headers,rows) {
    if (!rows.length) { $(target).replaceChildren(el('p',{class:'empty'},'No records yet.')); return; }
    const tbody = el('tbody');
    for (const row of rows) tbody.append(el('tr',{},row.map((cell,index) => el('td',{'data-label':headers[index]},cell))));
    $(target).replaceChildren(el('div',{class:'table-wrap'},el('table',{},el('thead',{},el('tr',{},headers.map(title => el('th',{scope:'col'},title)))),tbody)));
  }
  function switchView(id) {
    for (const view of ['inventory','requests','shipping']) { $(`#${view}`).hidden = view !== id; $(`#tab-${view}`).setAttribute('aria-selected',String(view === id)); $(`#tab-${view}`).tabIndex = view === id ? 0:-1; }
    $('#page-title').textContent = {inventory:'Badge inventory',requests:'Release requests',shipping:'Shipping & invoices'}[id];
  }
  function pill(status) { return el('span',{class:`status ${status}`},statuses[status] || status); }
  function renderProfile() {
    const profile = state.role === 'customer' ? state.accounts[0]?.orderProfile:null;
    const section = $('#order-profile'); section.hidden = !profile; section.replaceChildren();
    if (!profile) return;
    const logo = profile.images?.find(image => image.key === 'logo');
    if (logo) section.append(el('img',{class:'property-logo',src:logo.url,alt:'Property company logo',width:240,height:40}));
    section.append(el('h2',{},profile.title),el('p',{},profile.description),el('p',{},'First names only. Gold and silver quantities are recorded separately.'),el('p',{},el('a',{href:`mailto:${profile.supportEmail}`},profile.supportEmail),' | ',el('a',{href:`tel:${profile.supportPhone.replace(/[^+\d]/g,'')}`},profile.supportPhone)));
    const examples = el('div',{class:'badge-examples'});
    for (const image of profile.images || []) if (image.key !== 'logo') examples.append(el('figure',{},el('img',{src:image.url,alt:`${image.key === 'gold' ? 'Gold':'Silver'} domed badge example`,width:324,height:90}),el('figcaption',{},image.key === 'gold' ? 'Gold frame & gold badge':'Silver frame & silver badge')));
    section.append(examples);
  }
  function render() {
    const staff = state.role === 'staff';
    $('#switch-view').hidden = !state.canSwitchView;
    $('#switch-view').textContent = staff ? 'View as customer':'Back to staff';
    $('#account-name').textContent = staff ? 'Recognition Direct / Staff':state.accounts[0]?.company || 'Express One';
    $('#staff-alerts').hidden = !staff;
    if (staff) {
      const pending = state.alerts.counts.filter(row => ['pending','sending'].includes(row.status)).reduce((sum,row) => sum+row.count,0);
      const problems = state.alerts.counts.filter(row => ['failed','uncertain'].includes(row.status)).reduce((sum,row) => sum+row.count,0);
      const connection = state.alerts.enabled ? `Connected to ${state.alerts.recipient}.`:'Email sender not connected. Requests are saved in this queue.';
      $('#alert-status').textContent = `${connection}${pending ? ` ${pending} pending.`:''}${problems ? ` ${problems} need checking.`:''}`;
      $('#test-email').disabled = !state.alerts.enabled;
      $('#test-email').title = state.alerts.enabled ? 'Send one test to the staff inbox':'Connect the sender securely in Render first';
    }
    renderProfile();
    $('#add-stock').hidden = !staff; $('#record-invoice').hidden = !staff;
    $('#metric-stock').textContent = state.stock.reduce((sum,row) => sum+row.remaining,0);
    $('#metric-reserved').textContent = state.stock.reduce((sum,row) => sum+row.reserved,0);
    $('#metric-shipping').textContent = money(state.totals.uninvoicedShippingCents);
    table('#inventory-table',['Badge style','Prepaid','On hand','Reserved','Available',''],state.stock.map(row => {
      const image = state.accounts.find(account => account.id === row.account_id)?.orderProfile?.images?.find(image => image.key === 'silver');
      const style = el('div',{class:'badge-style'},el('img',{src:image?.url || '/assets/name-badges/1x3-white-no-frame.png',alt:image ? 'Silver domed badge example':'Sample name badge',width:'136',height:'46'}),el('div',{},el('strong',{},row.title),el('small',{},staff ? row.company:`Order ${row.paid_order}`)));
      return [style,row.original,row.remaining,row.reserved,el('strong',{class:row.available < 10 ? 'low':''},row.available),staff ? el('small',{},row.available === 0 ? 'No available stock':''):button('Request badges',() => openRelease(row),false)];
    }));
    for (const button of $('#inventory-table').querySelectorAll('button')) {
      const index = [...$('#inventory-table').querySelectorAll('button')].indexOf(button);
      if (state.stock[index]?.available === 0) button.disabled = true;
    }
    table('#request-table',['Requested','Badge style','Names','Quantity','Status',...(staff ? ['Email alert']:[]),'Actions'],state.requests.map(row => {
      const names = el('details',{},el('summary',{},`${row.names.length} badge${row.names.length === 1 ? '':'s'}`),el('ul',{},row.names.map(item => el('li',{},item.name,item.finish ? ` / ${item.finish}`:'',item.title ? ` / ${item.title}`:''))),el('p',{},row.delivery === 'ship' ? 'Ship':row.delivery === 'pickup-la-mesa' ? 'La Mesa pickup':'Pine Valley pickup'),row.notes ? el('p',{},row.notes):null);
      if (row.details?.propertyName) {
        const profile = state.accounts.find(account => account.id === row.account_id)?.orderProfile;
        names.append(el('dl',{class:'request-property'},(profile?.fields || []).flatMap(field => [el('dt',{},field.label),el('dd',{},row.details[field.name])])));
      }
      const actions = el('div',{class:'row-actions'});
      if (staff && row.status === 'requested') actions.append(button('Approve',async () => { await api('api/request-action',{id:row.id,action:'approve'}); await refresh(); notice('Request approved.'); },false));
      if (staff && ['requested','approved'].includes(row.status)) actions.append(button('Reject',() => openReview(row,'reject')));
      if (staff && row.status === 'approved') actions.append(button(row.delivery === 'ship' ? 'Mark shipped':'Mark ready',() => openReview(row,'fulfill'),false));
      if (!staff && row.status === 'requested') actions.append(button('Cancel request',async () => { await api('api/request-action',{id:row.id,action:'cancel'}); await refresh(); notice('Request cancelled.'); }));
      const alert = staff ? state.alerts.requests.find(item => item.requestId === row.id):null;
      const alertCell = el('div',{},({pending:'Pending',sending:'Sending',sent:'Accepted by mail server',failed:'Failed',uncertain:'Check inbox before retrying',skipped:'No longer awaiting approval'})[alert?.status] || 'No alert queued');
      if (staff && alert?.status === 'failed' && state.alerts.enabled) alertCell.append(button('Retry alert',async () => {await api('api/retry-alert',{id:row.id});await refresh();notice('Email alert queued for retry.');}));
      return [date(row.created_at),el('div',{},el('strong',{},row.title),staff ? el('small',{},row.company):null),names,row.quantity,el('div',{},pill(row.status),row.reason ? el('small',{},row.reason):null),...(staff ? [alertCell]:[]),actions];
    }));
    table('#shipping-table',['Date','Customer','Shipping charge','Tracking','Invoice'],state.shipping.map(row => [date(row.created_at),state.accounts.find(a => a.id === row.account_id)?.company || '',money(row.cents),row.tracking || '-',row.cents === 0 ? 'No shipping charge':row.invoice_id ? state.invoices.find(i => i.id === row.invoice_id)?.reference || 'Recorded':row.remaining === 0 ? 'Ready to invoice':'Accruing']));
    table('#invoice-table',['Date','Reference','Recorded amount'],state.invoices.map(row => [date(row.created_at),row.reference,money(row.amount_cents)]));
    $('#record-invoice').disabled = !state.invoiceReady.length;
  }
  async function refresh() { state = await api('api/state'); $('#error').hidden = true; render(); }
  function openRelease(stock) {
    const form = $('#release-form'); form.reset(); form.querySelector('.form-error').textContent = '';
    form.elements.stockId.value = stock.id; $('#release-style').textContent = `${stock.title} / ${stock.available} available`;
    releaseProfile = state.accounts.find(account => account.id === stock.account_id)?.orderProfile;
    $('#standard-names').hidden = Boolean(releaseProfile);
    $('#property-names').hidden = !releaseProfile; $('#property-fields').hidden = !releaseProfile;
    $('#release-dialog').classList.toggle('property-order',Boolean(releaseProfile));
    $('#names-file').accept = releaseProfile ? '.csv':'.txt,.csv';
    $('#names-file-label').textContent = releaseProfile ? 'Or upload CSV (Name, Finish; one row per badge)':'Names file (TXT or CSV)';
    $('#delivery-notes-label').textContent = releaseProfile ? 'Additional delivery notes (optional)':'Shipping address / pickup notes';
    $('#badge-rows').replaceChildren(); $('#property-inputs').replaceChildren();
    if (releaseProfile) {
      addNameRow();
      for (const field of releaseProfile.fields) {
        const input = el('input',{id:`property-${field.name}`,name:`property-${field.name}`,maxlength:field.max,required:'',type:field.name === 'email' ? 'email':field.name === 'phone' ? 'tel':'text'});
        $('#property-inputs').append(el('div',{},el('label',{for:input.id},field.label),input));
      }
    }
    requestKey = crypto.randomUUID(); $('#release-dialog').showModal();
  }
  function updateBadgeTotal() {
    let count = 0;
    for (const input of $('#badge-rows').querySelectorAll('input[type=number]')) count += Number(input.value) || 0;
    $('#badge-total').textContent = `${count} badge${count === 1 ? '':'s'}`;
  }
  function addNameRow() {
    const id = crypto.randomUUID(), row = el('div',{class:'badge-name-row'});
    for (const [key,label] of [['firstName','First name only'],['gold','Gold quantity'],['silver','Silver quantity']]) {
      const input = el('input',{id:`${key}-${id}`,'data-field':key,type:key === 'firstName' ? 'text':'number',...(key === 'firstName' ? {maxlength:80}:{min:0,max:500,step:1,value:0})});
      input.addEventListener('input',updateBadgeTotal);
      row.append(el('div',{},el('label',{for:input.id},label),input));
    }
    const remove = button('Remove',() => {row.remove();updateBadgeTotal();});
    remove.setAttribute('aria-label','Remove badge name row'); row.append(remove);
    $('#badge-rows').append(row); updateBadgeTotal();
  }
  function openReview(row,action) {
    const form = $('#review-form'); form.reset(); form.querySelector('.form-error').textContent = '';
    form.elements.id.value = row.id; form.elements.action.value = action;
    $('#review-title').textContent = action === 'reject' ? 'Reject request':row.delivery === 'ship' ? 'Mark badges shipped':'Mark badges ready for pickup';
    $('#review-submit').textContent = action === 'reject' ? 'Reject request':row.delivery === 'ship' ? 'Mark shipped':'Mark ready';
    $('#reason-fields').hidden = action !== 'reject'; form.elements.reason.required = action === 'reject';
    $('#shipping-fields').hidden = action !== 'fulfill' || row.delivery !== 'ship';
    form.elements.shippingCost.required = action === 'fulfill' && row.delivery === 'ship';
    form.elements.shippingCost.value = row.delivery === 'ship' ? '':'0';
    $('#review-dialog').showModal();
  }
  async function submitForm(form,operation,success) {
    const submit = form.querySelector('[type=submit]'); submit.disabled = true; form.querySelector('.form-error').textContent = '';
    try { await operation(); form.closest('dialog').close(); await refresh(); notice(success); }
    catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { submit.disabled = false; }
  }
  document.querySelectorAll('[data-close]').forEach(node => node.addEventListener('click',() => node.closest('dialog').close()));
  document.querySelectorAll('[role=tab]').forEach((node,index,nodes) => {
    node.addEventListener('click',() => switchView(node.getAttribute('aria-controls')));
    node.addEventListener('keydown',event => { const offset = event.key === 'ArrowRight' ? 1:event.key === 'ArrowLeft' ? -1:0; if (offset) { event.preventDefault(); const target = nodes[(index+offset+nodes.length)%nodes.length]; target.click(); target.focus(); } });
  });
  $('#release-form').addEventListener('submit',event => {
    event.preventDefault(); const form = event.currentTarget;
    submitForm(form,async () => {
      const data = new FormData(form), file = data.get('namesFile');
      const body = {stockId:data.get('stockId'),delivery:data.get('delivery'),notes:data.get('notes'),requestKey};
      if (releaseProfile) body.details = Object.fromEntries(releaseProfile.fields.map(field => [field.name,data.get(`property-${field.name}`)]));
      if (file?.size) {
        if (file.size > 65536) throw new Error('Names files must be smaller than 64 KB.');
        body.namesFile = await file.text(); body.fileType = file.name.toLowerCase().endsWith('.csv') ? 'csv':file.name.toLowerCase().endsWith('.txt') ? 'txt':'';
        if (String(data.get('names')).trim()) throw new Error('Use either the names field or a names file.');
        if (releaseProfile && [...$('#badge-rows').querySelectorAll('input')].some(input => input.type === 'text' ? input.value.trim():Number(input.value))) throw new Error('Use either badge rows or a CSV file.');
      } else if (releaseProfile) {
        body.names = [];
        for (const row of $('#badge-rows').children) {
          const name = row.querySelector('[data-field=firstName]').value.trim();
          const gold = Number(row.querySelector('[data-field=gold]').value),silver = Number(row.querySelector('[data-field=silver]').value);
          if (!name && !gold && !silver) continue;
          if (!name || !Number.isSafeInteger(gold) || !Number.isSafeInteger(silver) || gold < 0 || silver < 0 || gold+silver < 1 || body.names.length+gold+silver > 500) throw new Error('Add a first name and valid gold/silver quantities (up to 500 badges).');
          for (const [finish,quantity] of [['Gold',gold],['Silver',silver]]) for (let index=0;index<quantity;index++) body.names.push({name,title:'',finish});
        }
      } else body.names = String(data.get('names')).split(/\r?\n/).filter(line => line.trim()).map(name => ({name,title:''}));
      await api('api/requests',body);
    },'Request received for staff approval.');
  });
  $('#add-name-row').addEventListener('click',addNameRow);
  $('#review-form').addEventListener('submit',event => { event.preventDefault(); const form = event.currentTarget; submitForm(form,() => api('api/request-action',Object.fromEntries(new FormData(form))),'Request updated.'); });
  $('#add-stock').addEventListener('click',() => {
    const form = $('#stock-form'); form.reset(); form.querySelector('.form-error').textContent = '';
    $('#stock-account').replaceChildren(state.accounts.map(row => el('option',{value:row.id},row.company))); $('#stock-dialog').showModal();
  });
  $('#stock-form').addEventListener('submit',event => { event.preventDefault(); const form = event.currentTarget; submitForm(form,() => { const data = new FormData(form); return api('api/stock',{...Object.fromEntries(data),quantity:Number(data.get('quantity')),paymentVerified:data.get('paymentVerified') === 'on'}); },'Prepaid stock added.'); });
  $('#record-invoice').addEventListener('click',() => {
    const form = $('#invoice-form'); form.reset(); form.querySelector('.form-error').textContent = '';
    $('#invoice-account').replaceChildren(state.invoiceReady.map(row => el('option',{value:row.accountId},`${row.company} / ${money(row.cents)}`))); $('#invoice-dialog').showModal();
  });
  $('#invoice-form').addEventListener('submit',event => { event.preventDefault(); const form = event.currentTarget; submitForm(form,() => api('api/invoices',Object.fromEntries(new FormData(form))),'Existing shipping invoice recorded.'); });
  $('#sign-out').addEventListener('click',async () => { try { await api('sign-out',{}); location.assign('/express-one'); } catch (error) { showError(error.message); } });
  $('#switch-view').addEventListener('click',async () => {
    try { await api('api/view',{view:state.role === 'staff' ? 'customer':'staff'}); await refresh(); notice(state.role === 'staff' ? 'Staff view.':'Your own customer test account.'); }
    catch (error) { showError(error.message); }
  });
  $('#test-email').addEventListener('click',async () => {
    const button = $('#test-email'); button.disabled = true;
    try { const result = await api('api/test-email',{}); notice(`Test accepted by the email server for ${result.recipient}. Please confirm it arrives in the inbox.`); }
    catch (error) { showError(error.message); }
    finally { button.disabled = false; }
  });
  refresh().then(() => { if (location.hash === '#requests') switchView('requests'); }).catch(error => showError(error.message));
  setInterval(() => { if (state?.role === 'staff' && document.visibilityState === 'visible' && !document.querySelector('dialog[open],details[open]')) refresh().catch(error => showError(error.message)); },30000);
})();
