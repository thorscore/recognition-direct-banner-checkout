import PDFDocument from 'pdfkit';
import {parse} from 'csv-parse/sync';
export async function sampleProof(job,record){
 if(!job.simulation)throw Error('STAFF_PREPARED_PDF_REQUIRED');
 const doc=new PDFDocument({size:'LETTER',margin:42,info:{Title:'Recognition Direct private test proof',Author:'Recognition Direct'}}),chunks=[];
 const done=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.fillColor('#14315b').font('Helvetica-Bold').fontSize(23).text('Recognition Direct');doc.font('Helvetica').fillColor('#50617b').fontSize(11).text('PRIVATE TUMBLER PROOF - SIMULATED PAYMENT',42,77);
 doc.roundedRect(42,105,528,44,5).fill('#fff2cf');doc.fillColor('#765100').fontSize(11).text('TEST ONLY - DO NOT PRODUCE',56,116);doc.fontSize(9).text('Placement illustration only. Not actual size or a production template.',56,132);
 doc.fillColor('#172b45').font('Helvetica-Bold').fontSize(16).text(`${job.orderName} | ${job.design.color} | Qty ${job.design.quantity}`,42,171);doc.font('Helvetica').fontSize(11).text(`20 oz Polar Camel | SKU ${job.design.sku}`,42,198);
 let names=[];const csv=record.originals.find(f=>f.role==='name-list');if(csv)try{names=parse(csv.bytes,{columns:true,skip_empty_lines:true}).map(r=>r.Name||r.name).filter(Boolean);}catch{}
 if(!names.length)names=job.design.personalization.split('\n').filter(Boolean).slice(0,4);
 const logo=record.originals.find(f=>f.role==='logo');
 for(let i=0;i<Math.min(job.design.quantity,4);i++){
  const columns=job.design.quantity===1?1:2,x=columns===1?208:75+(i%2)*252,y=243+Math.floor(i/2)*145,w=columns===1?195:195,h=job.design.quantity>2?125:230;
  doc.roundedRect(x,y,w,h,12).fillAndStroke('#edf1f6','#91a1b8');doc.roundedRect(x+7,y-7,w-14,18,6).fill('#283849');
  if(logo)try{doc.image(logo.bytes,x+76,y+25,{fit:[44,44],align:'center'});}catch{doc.fillColor('#516782').fontSize(9).text('Original vector retained',x+23,y+30,{width:149,align:'center'});}
  doc.fillColor('#17304d').font('Helvetica-Bold').fontSize(15).text(names[i]||names[0]||'Sample name',x+18,y+77,{width:159,align:'center'});
 }
 doc.fillColor('#17304d').font('Helvetica-Bold').fontSize(12).text('Saved instructions',42,557);doc.font('Helvetica').fontSize(9).text(job.design.personalization,42,579,{width:528,height:64});
 doc.font('Helvetica-Bold').fontSize(11).text('Delivery',42,653);doc.font('Helvetica').fontSize(10).text(job.delivery.method==='PICK_UP'?'FREE pickup: 8680 Troy St., Spring Valley CA 91977':`UPS Ground from Spring Valley. Shipping $${(job.shippingCents/100).toFixed(2)}.`,42,672);
 doc.fontSize(9).fillColor('#617089').text('The original logo and name file stay unchanged. Approving this private proof records a test acknowledgement only; production remains blocked.',42,714,{width:528});doc.end();return done;
}
