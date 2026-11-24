import fs from 'node:fs/promises';
import {join} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import {NativeTumblerWorkflow,sha} from '../tumbler-private/workflow.mjs';
import {MARKER,PRODUCT,buildProductionPack} from '../tumbler-private/archive.mjs';
export const actor={role:'staff',simulation:true};
export async function fixture(root,{pickup=false}={}){
 await fs.mkdir(root,{recursive:true});
 const logo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALklEQVR4nGP4T2PAMGrBqAVDwAIxgyCaolELRi0YtWDUglELRi0YtWDUgiFiAQA5QcU9qflwHwAAAABJRU5ErkJggg==','base64'),csv=Buffer.from('Name,Title\nAlex Sample,PRIVATE TEST ONLY\nJamie Sample,PRIVATE TEST ONLY\n');
 const pack=await buildProductionPack({configurationId:'00000000-0000-4000-8000-000000000010',variantId:'67837135421736',sku:'LTM7252',color:'Black',quantity:2,unitCents:2300,personalization:'Alex Sample\nJamie Sample',artwork:new File([logo],'synthetic-logo.png',{type:'image/png'}),nameList:new File([csv],'synthetic-names.csv',{type:'text/csv'})});
 const packet={url:'https://cdn.shopify.com/s/files/1/0865/5762/2568/uploads/'+'0'.repeat(32)+'.zip'},m=pack.manifest,archive=Buffer.from(await pack.file.arrayBuffer()),originals=[{role:'logo',bytes:logo},{role:'name-list',bytes:csv}];
 const record={id:'11111111-1111-4111-8111-111111111111',cartId:m.configurationId,type:'polar-camel-order',sku:m.sku,color:m.color,quantity:m.quantity,unitCents:m.unitCents,personalizationText:m.personalization,notes:m.notes,originals};
 const cart={id:m.configurationId,items:[{orderId:record.id}]};
 const values={_rd_tumbler_preview:MARKER,_rd_preview_submission:'00000000-0000-4000-8000-000000000001',_rd_custom_cart_id:cart.id,_rd_original_pack_sha256:sha(archive),'Production originals':packet.url,'Proof Required':'Yes','Personalization Text':m.personalization,SKU:m.sku};
 const order={id:'990000000001',name:'#SIM-TUMBLER-01',test:true,financial_status:'paid',cancelled_at:null,fulfillment_status:null,refunds:[],updated_at:new Date().toISOString(),currency:'USD',subtotalCents:4600,shippingCents:pickup?0:1502,taxCents:pickup?357:0,totalCents:pickup?4957:6102,captureCents:pickup?4957:6102,totalOutstandingCents:0,totalRefundedCents:0,discountCents:0,delivery:pickup?{method:'PICK_UP',locationId:'97024180520',location:'Spring Valley Print Shop',address:'8680 Troy St., Spring Valley CA 91977'}:{method:'SHIP',service:'UPS Ground',origin:'8680 Troy St., Spring Valley CA 91977',destinationZip:'10018'},line_items:[{id:'990000000101',product_id:PRODUCT,variant_id:m.variantId,sku:m.sku,quantity:2,unitCents:2300,properties:Object.entries(values).map(([name,value])=>({name,value}))}]};
 const records=new Map([[record.id,record]]),carts=new Map([[cart.id,cart]]),orders=new Map([[order.id,order]]),archives=new Map([[packet.url,archive]]);
 let time=Date.now(),orderReadFailure=false;
 const options={executionMode:'simulation',databasePath:join(root,'simulation.sqlite'),shop:'rd-tumbler-simulation.myshopify.com',secret:'synthetic-local-webhook-key-not-a-real-secret',now:()=>time,
  readOrder:async id=>{if(orderReadFailure)throw Error('SIMULATED_ORDER_READ_UNAVAILABLE');return {simulation:true,shop:options.shop,observedAt:time,order:structuredClone(orders.get(id))};},
  readCart:async id=>carts.get(id),readRecord:async id=>records.get(id),readArchive:async url=>archives.get(url)};
 let workflow=new NativeTumblerWorkflow(options);
 const sign=(payload=order,{topic='orders/paid',id=randomUUID(),shop=options.shop}={})=>{const body=structuredClone(payload);if(body.line_items)body.line_items=body.line_items.map(({unitCents,...line})=>({...line,price:(unitCents/100).toFixed(2)}));const raw=Buffer.from(JSON.stringify(body));return {raw,headers:{'X-Shopify-Hmac-Sha256':createHmac('sha256',options.secret).update(raw).digest('base64'),'X-Shopify-Shop-Domain':shop,'X-Shopify-Webhook-Id':id,'X-Shopify-Topic':topic}};};
 return {record,records,cart,carts,order,orders,archive,archives,options,sign,get workflow(){return workflow;},async paid(){const s=sign();return workflow.process(s.headers,s.raw);},reopen(){workflow.close();workflow=new NativeTumblerWorkflow(options);return workflow;},advance(ms){time+=ms;},setReadFailure(value){orderReadFailure=value;},close(){workflow.close();}};
}
// Valid, minimal PDF bytes for policy tests. The browser rehearsal uses a real rendered PDF.
export const policyPdf=Buffer.from('%PDF-1.4\n%SYNTHETIC POLICY FIXTURE ONLY\n'+('test data '.repeat(20))+'\n%%EOF\n');
