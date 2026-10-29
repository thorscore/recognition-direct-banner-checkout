import PDFDocument from 'pdfkit';
import { join } from 'node:path';
import { deliveryLabel } from './express-one-delivery.mjs';
import { propertyFields } from './express-one-store.mjs';

const statusLabels = {requested:'Awaiting staff approval',approved:'Approved',shipped:'Shipped',ready:'Ready for pickup',rejected:'Rejected',cancelled:'Cancelled'};
const timestamp = value => new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

export async function requestPdf(store,actor,id) {
  const row = store.requestRecord(actor,id);
  const doc = new PDFDocument({size:'LETTER',margin:44,bufferPages:true,info:{Title:`Express One request ${row.id}`,Author:'Recognition Direct',Subject:'Private badge production worksheet'}});
  doc.registerFont('Body',join(import.meta.dirname,'public/fonts/Lato-Regular.ttf'));
  doc.registerFont('Strong',join(import.meta.dirname,'public/fonts/Lato-Bold.ttf'));
  const chunks = [], output = new Promise((resolve,reject) => {doc.on('data',chunk => chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const left = 44, width = 524, bottom = 700;
  let y = 44;
  const textHeight = (text,size = 10,w = width,bold = false) => doc.font(bold ? 'Strong':'Body').fontSize(size).heightOfString(String(text),{width:w,lineGap:1});
  const ensure = height => {if (y+height>bottom) {doc.addPage();y=48;}};
  const line = (text,{bold = false,size = 10,color = '#20242B',gap = 4} = {}) => {
    for (const value of String(text).split(/\r\n?|\n/)) {
      const height = textHeight(value || ' ',size,width,bold);
      ensure(height+gap); doc.font(bold ? 'Strong':'Body').fontSize(size).fillColor(color).text(value || ' ',left,y,{width,lineGap:1});y+=height+gap;
    }
  };
  const section = title => {ensure(38);y+=5;doc.moveTo(left,y).lineTo(left+width,y).strokeColor('#CAD2E0').lineWidth(0.7).stroke();y+=8;line(title,{bold:true,size:11,color:'#164A8A',gap:4});};
  const fields = rows => {
    const columnWidth = 250;
    for (let index=0;index<rows.length;index+=2) {
      const pair=rows.slice(index,index+2).map(([label,value])=>`${label}: ${String(value).replace(/\s+/g,' ')}`);
      const height=Math.max(...pair.map(value=>textHeight(value,9.5,columnWidth)));
      ensure(height+5);
      pair.forEach((value,column)=>doc.font('Body').fontSize(9.5).fillColor('#20242B').text(value,left+column*274,y,{width:columnWidth,lineGap:1}));
      y+=height+5;
    }
  };
  line('RECOGNITION DIRECT',{bold:true,size:17,color:'#164A8A'});
  line('Express One | Badge production worksheet',{bold:true,size:13});
  line('Private customer information - authorized staff and account holder only',{size:9,color:'#596270'});
  section('Request');
  fields([
    ['Reference',row.id],['Account',row.company],['Requested',`${timestamp(row.created_at)} (Pacific time)`],
    ['Status',statusLabels[row.status] || row.status],['Badge style',row.title],['Requested quantity',row.quantity],
    ['Delivery',deliveryLabel(row.delivery)],['Prepaid stock reference',row.paid_order]
  ]);
  if (row.reason) line(`Staff reason: ${row.reason}`);
  section('Badge examples');
  const images = (row.profile?.images || []).filter(image => ['gold','silver'].includes(image.key));
  if (!images.length) line('No account-specific badge example is on file.');
  if (images.length) ensure(80);
  const imageTop=y;
  for (let index=0;index<images.length;index++) {
    const image = images[index], x=left+index*274;
    const buffer = store.profileImage(actor,row.account_id,image.key);
    try {doc.image(buffer,x,imageTop,{fit:[230,64]});} catch {continue;}
    doc.font('Body').fontSize(9).fillColor('#596270').text(image.key === 'gold' ? 'Gold frame & gold badge':'Silver frame & silver badge',x,imageTop+66,{width:250});
  }
  if (images.length) y=imageTop+80;
  section('Badge names and quantities');
  const groups = new Map();
  for (const name of row.names) {
    const key = JSON.stringify([name.name,name.title || '',name.finish || '']);
    if (!groups.has(key)) groups.set(key,{...name,count:0});groups.get(key).count++;
  }
  const gold = row.names.filter(name => name.finish === 'Gold').length, silver = row.names.filter(name => name.finish === 'Silver').length;
  line(`Total: ${row.quantity}${gold || silver ? ` | Gold: ${gold} | Silver: ${silver}`:''}`,{bold:true});
  const columns=[left,left+350,left+450], columnWidths=[330,80,74];
  const tableRow=(values,bold=false)=>{
    const height=Math.max(...values.map((value,index)=>textHeight(value,10,columnWidths[index],bold)))+5;
    ensure(height);
    values.forEach((value,index)=>doc.font(bold ? 'Strong':'Body').fontSize(10).fillColor('#20242B').text(value,columns[index],y,{width:columnWidths[index],lineGap:1}));
    y+=height;
  };
  tableRow(['Name / title','Finish','Quantity'],true);
  for (const name of groups.values()) {
    const values=[`${name.name}${name.title ? ` / ${name.title}`:''}`.replace(/\s+/g,' '),name.finish || '-',String(name.count)];
    const height=Math.max(...values.map((value,index)=>textHeight(value,10,columnWidths[index])))+5;
    if(y+height>bottom){ensure(height);line('Badge names and quantities (continued)',{bold:true,size:12,color:'#164A8A'});tableRow(['Name / title','Finish','Quantity'],true);}
    tableRow(values);
  }
  section('Property and contact information');
  if (Object.keys(row.details).length) fields(propertyFields.map(([key,label])=>[label,row.details[key] || 'Not provided']));
  else line('No structured property details were provided. See delivery notes below.');
  section('Delivery notes');line(row.notes || 'No additional notes.');
  if (row.shipping) {
    section('Recorded release');
    line(`Shipping charge recorded: $${(row.shipping.cents/100).toFixed(2)}`);
    line(`Tracking: ${row.shipping.tracking || 'Not recorded'}`);
    line(`Invoice reference: ${row.shipping.invoice_reference || 'Not invoiced'}`);
  }
  section('Inventory and production checks');
  line(`Original prepaid stock: ${row.original} | Current on-hand stock: ${row.remaining}`);
  line('Production checked by: ____________________    Date: ______________');
  line('Packed / dispatched by: ___________________    Date: ______________');
  const pages = doc.bufferedPageRange();
  for (let page=pages.start;page<pages.start+pages.count;page++) {
    doc.switchToPage(page);
    doc.font('Body').fontSize(7.5).fillColor('#596270').text('Worksheet only: printing does not approve, produce, charge, or ship a request.',left,719,{width,lineBreak:false});
    doc.font('Body').fontSize(8).fillColor('#596270').text(`Express One | ${row.id} | ${page+1} / ${pages.count}`,left,735,{width,lineBreak:false});
  }
  doc.end(); return output;
}
