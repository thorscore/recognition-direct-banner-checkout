import { PortalError } from './express-one-store.mjs';

export const shopifyReadinessQuery = `query ExpressOneShippingAccess {
  shop { currencyCode }
  currentAppInstallation { accessScopes { handle } }
}`;
export const shopifyCreateMutation = `mutation ExpressOneShippingOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput!) {
  orderCreate(order: $order, options: $options) { order { id name } userErrors { field message } }
}`;
const orderFields = `id name tags cancelledAt displayFulfillmentStatus
  customAttributes { key value }
  totalPriceSet { shopMoney { amount currencyCode } }
  lineItems(first: 2) { nodes { sku quantity requiresShipping originalUnitPriceSet { shopMoney { amount currencyCode } } } pageInfo { hasNextPage endCursor } }
  fulfillments(first: 50) { status trackingInfo(first: 50) { company number } }`;
export const shopifyOrderQuery = `query ExpressOneShippingStatus($id: ID!) { order(id: $id) { ${orderFields} } }`;
export const shopifyFindQuery = `query ExpressOneShippingRecovery($query: String!) {
  orders(first: 2, query: $query) { nodes { ${orderFields} } pageInfo { hasNextPage endCursor } }
}`;

const staff = actor => { if (actor?.role !== 'staff') throw new PortalError('Staff access required.',403); };
const required = (value,max = 240) => {
  if (typeof value !== 'string' || !value.trim() || value.length>max || /[\u0000-\u001f]/.test(value)) throw new PortalError('Complete and verify the shipping address.');
  return value.trim();
};
const tagFor = id => `express-one-request-${id}`;
const sku = 'EXPRESS-ONE-PREPAID-RELEASE';

export function shippingOrderInput(request,input) {
  if (request.delivery !== 'ship' || request.status !== 'approved') throw new PortalError('Only approved shipped requests can create a Shopify shipping order.',409);
  if (input.confirmAddress !== true) throw new PortalError('Verify the delivery address before creating the shipping order.');
  const address = Object.fromEntries(['recipient','company','address1','city','provinceCode','zip','countryCode','email'].map(key => [key,required(input[key],key === 'email' ? 254:240)]));
  address.countryCode = address.countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(address.countryCode) || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address.email)) throw new PortalError('Verify the country code and contact email.');
  const address2 = input.address2 ? required(input.address2):'';
  const phone = input.phone ? required(input.phone,60):'';
  if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) throw new PortalError('Use an international phone number such as +16194650055, or leave it blank.');
  return {
    order:{currency:'USD',email:address.email,
      shippingAddress:{lastName:address.recipient,company:address.company,address1:address.address1,address2,city:address.city,provinceCode:address.provinceCode,zip:address.zip,countryCode:address.countryCode,...(phone ? {phone}:{})},
      sourceIdentifier:request.id,tags:['Express One','Prepaid release',tagFor(request.id)],
      customAttributes:[{key:'Express One request',value:request.id},{key:'Prepaid stock reference',value:request.paid_order}],
      note:`Express One PREPAID RELEASE - no new badge payment.\nRequest: ${request.id}\nAccount: ${request.company}\nBadge style: ${request.title}\nShipping is recorded separately in Express One and invoiced after this prepaid stock is depleted.\nEnter the actual package weight and dimensions before buying a label.`,
      lineItems:[{title:`Express One prepaid release - ${request.title}`,sku,quantity:request.quantity,requiresShipping:true,fulfillmentService:'manual',taxable:false,
        priceSet:{shopMoney:{amount:'0.00',currencyCode:'USD'}},properties:[{name:'Express One request',value:request.id}]}]},
    options:{inventoryBehaviour:'BYPASS',sendReceipt:false,sendFulfillmentReceipt:false}
  };
}

function verifiedOrder(order,request) {
  const item = order?.lineItems?.nodes?.[0];
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(order?.id || '') || typeof order.name !== 'string' ||
      !order.tags?.includes(tagFor(request.id)) || !order.customAttributes?.some(row => row.key === 'Express One request' && row.value === request.id) ||
      order.totalPriceSet?.shopMoney?.currencyCode !== 'USD' || Number(order.totalPriceSet.shopMoney.amount) !== 0 ||
      order.lineItems?.pageInfo?.hasNextPage !== false || order.lineItems.nodes.length !== 1 || item.sku !== sku || item.quantity !== request.quantity ||
      item.requiresShipping !== true || item.originalUnitPriceSet?.shopMoney?.currencyCode !== 'USD' || Number(item.originalUnitPriceSet.shopMoney.amount) !== 0) {
    throw new PortalError('The Shopify order no longer matches this prepaid release. Review it in Shopify before continuing.',409);
  }
  const tracking = (order.fulfillments || []).filter(row => row.status === 'SUCCESS').flatMap(row => row.trackingInfo || []).filter(row => typeof row.number === 'string' && row.number.length<=200).map(row => ({number:row.number,company:typeof row.company === 'string' ? row.company.slice(0,100):''}));
  return {id:order.id,name:order.name,status:order.cancelledAt ? 'cancelled':order.displayFulfillmentStatus === 'FULFILLED' ? 'fulfilled':order.displayFulfillmentStatus === 'PARTIALLY_FULFILLED' ? 'partial':'unfulfilled',tracking};
}

export class ExpressOneShopify {
  constructor(store,{graphql,shop,enabled = false,preview = false} = {}) {
    this.store = store; this.graphql = graphql;
    this.enabled = enabled && !preview && typeof graphql === 'function' && /^[a-z0-9][a-z0-9-]*$/i.test(shop || '');
    this.shop = shop;
    this.store.db.prepare("UPDATE shopify_releases SET state='uncertain',error_category='interrupted' WHERE state='creating'").run();
  }
  status(actor) {
    staff(actor); return {enabled:this.enabled};
  }
  async readiness(actor) {
    staff(actor);
    if (!this.enabled) throw new PortalError('Shopify shipping integration is not enabled by staff yet.',409);
    let data;
    try { data = await this.graphql(shopifyReadinessQuery,{}); }
    catch { throw new PortalError('Shopify access could not be verified. Review the integration permissions.',502); }
    const scopes = data.currentAppInstallation?.accessScopes?.map(row => row.handle) || [];
    if (!scopes.includes('write_orders') || !scopes.some(value => ['read_orders','write_orders'].includes(value))) throw new PortalError('The checkout integration needs approved Shopify order access before creating shipping orders.',409);
    if (data.shop?.currencyCode !== 'USD') throw new PortalError('Review the store currency before enabling prepaid shipping orders.',409);
    return {ready:true};
  }
  url(orderId) {
    return /^gid:\/\/shopify\/Order\/\d+$/.test(orderId || '') ? `https://admin.shopify.com/store/${this.shop}/orders/${orderId.split('/').pop()}`:null;
  }
  async create(actor,input) {
    staff(actor);
    const request = this.store.requestRecord(actor,input.id), existing = this.store.shopifyRelease(actor,input.id);
    if (existing?.state === 'linked') return {duplicate:true,release:existing};
    const variables = shippingOrderInput(request,input);
    await this.readiness(actor);
    const claim = this.store.claimShopifyRelease(actor,request.id);
    if (claim.duplicate) return {duplicate:true,release:claim.prior};
    let data;
    try { data = await this.graphql(shopifyCreateMutation,variables); }
    catch { this.store.failShopifyRelease(actor,request.id,true); throw new PortalError('The order result is uncertain. Use Check Shopify order; do not create another order.',409); }
    if (!data?.orderCreate?.order && data?.orderCreate?.userErrors?.length) {
      this.store.failShopifyRelease(actor,request.id,false);
      throw new PortalError('Shopify rejected the order details. Verify the address and integration access before trying again.',422);
    }
    if (!/^gid:\/\/shopify\/Order\/\d+$/.test(data?.orderCreate?.order?.id || '')) {
      this.store.failShopifyRelease(actor,request.id,true); throw new PortalError('Check Shopify order before trying again.',409);
    }
    try {
      const order = data.orderCreate.order;
      const release = this.store.saveShopifyRelease(actor,request.id,{id:order.id,name:order.name,status:'unfulfilled',tracking:[]});
      return {duplicate:false,release};
    } catch { this.store.failShopifyRelease(actor,request.id,true); throw new PortalError('Shopify may have created the order. Use Check Shopify order before continuing.',409); }
  }
  async refresh(actor,id) {
    staff(actor); await this.readiness(actor);
    const request = this.store.requestRecord(actor,id), prior = this.store.shopifyRelease(actor,id);
    if (!prior) throw new PortalError('No Shopify order attempt exists for this request.',404);
    let order;
    try {
      if (prior.order_id) order = (await this.graphql(shopifyOrderQuery,{id:prior.order_id})).order;
      else {
        const results = (await this.graphql(shopifyFindQuery,{query:`tag:${tagFor(id)}`})).orders;
        if (results?.nodes?.length !== 1 || results.pageInfo?.hasNextPage !== false) throw new PortalError('No single matching order was found. Do not retry creation; staff must reconcile the Shopify attempt.',409);
        order = results.nodes[0];
      }
    } catch (error) { if (error instanceof PortalError) throw error; throw new PortalError('Shopify status could not be read. No inventory was changed.',502); }
    return this.store.saveShopifyRelease(actor,id,verifiedOrder(order,request));
  }
  async fulfill(actor,input) {
    staff(actor);
    if (input.dispatchConfirmed !== true) throw new PortalError('Confirm the package was handed to the carrier before recording shipment.');
    const release = await this.refresh(actor,input.id);
    if (release.order_status !== 'fulfilled' || !release.tracking.length) throw new PortalError('Shopify must show the complete, uncancelled shipment with tracking first.',409);
    const tracking = [...new Set(release.tracking.map(row => row.number))].join(', ');
    if (tracking.length>200) throw new PortalError('Review the multiple tracking numbers with staff before recording this release.',409);
    return this.store.changeRequest(actor,{...input,action:'fulfill',shopifyVerified:true,tracking});
  }
}
