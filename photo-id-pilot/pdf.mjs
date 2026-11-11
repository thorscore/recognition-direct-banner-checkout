import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
import {CARD,REFERENCE_CANVAS,cropRect,portraitWindow,logoSourceRect,ATTACHMENTS,PRODUCT_SPECS} from './shared/model.mjs';
import {FRONT_LAYOUT,CORNER_SHAPES} from './shared/layout.mjs';
import {readableInk} from './shared/colors.mjs';
import {mountingGeometry,logoPosition} from './shared/slot-geometry.mjs';
import {fail} from './auth.mjs';
const regular=fileURLToPath(new URL('./fonts/Carlito-Regular.ttf',import.meta.url));
const bold=fileURLToPath(new URL('./fonts/Carlito-Bold.ttf',import.meta.url));
export const TRIM={width:CARD.width*72,height:CARD.height*72};
function font(doc,weight='regular'){doc.font(weight==='bold'?'BadgeBold':'Badge');}
function fit(doc,text,box,weight='bold',color=FRONT_LAYOUT.ink){
 if(!text)return; font(doc,weight);let size=box.max;doc.fontSize(size);while(size>box.min&&doc.widthOfString(text)>box.width){size-=.5;doc.fontSize(size);}if(doc.widthOfString(text)>box.width+.1)fail(422,'TEXT_DOES_NOT_FIT');
 doc.fillColor(color).text(text,box.x,box.y-size*.83,{lineBreak:false});
}
function source(doc,asset,rect,target){
 if(!asset)return;const scale=Math.min(target.width/rect.width,target.height/rect.height);
 const x=target.x+(target.width-rect.width*scale)/2,y=target.y+(target.height-rect.height*scale)/2;
 doc.save().rect(x,y,rect.width*scale,rect.height*scale).clip();
 doc.image(asset.normalized,x-rect.x*scale,y-rect.y*scale,{width:asset.width*scale,height:asset.height*scale});doc.restore();
}
function message(doc,text,x,y,width,bottom,size=28){
 if(!text)return;font(doc);doc.fontSize(size);const height=doc.heightOfString(text,{width,lineGap:5});if(y+height>bottom)fail(422,'BACK_TEXT_DOES_NOT_FIT');doc.fillColor('#172639').text(text,x,y,{width,lineGap:5,height:bottom-y});
}
export function drawCard(doc,document,person,assets,{side='front',x=0,y=0,scale=.25,guide=false}={}){
 doc.save().translate(x,y).scale(scale).roundedRect(0,0,972,612,36).clip().rect(0,0,972,612).fill('#ffffff');
 const mounting=mountingGeometry(document.attachment,document.punch);
 if(side==='front'){
  for(const shape of CORNER_SHAPES){doc.path('M '+shape.points.map(p=>p.join(' ')).join(' L ')+' Z').fill(document[shape.color]);}
  const box=portraitWindow(),portrait=assets.get(person.photo);
  if(portrait){const crop=cropRect(portrait.width,portrait.height,person.crop);source(doc,portrait,{x:crop.x,y:crop.y,width:crop.width,height:crop.height},{x:box.x,y:box.y,width:box.w,height:box.h});}
  else{doc.rect(box.x,box.y,box.w,box.h).fill('#edf2f7');font(doc);doc.fillColor('#586a80').fontSize(26).text('Add a portrait',box.x+12,box.y+box.h/2,{width:box.w-24,align:'center',height:100});}
  const logo=assets.get(document.logo);if(logo){const crop=logoSourceRect(logo.width,logo.height,document.logoCrop),bounds=logoPosition(crop.width,crop.height,document.logoScale,!!mounting.slot);source(doc,logo,crop,bounds);}
  fit(doc,person.firstLine,FRONT_LAYOUT.first);fit(doc,person.secondLine,FRONT_LAYOUT.second);
  fit(doc,person.organization||document.organization,FRONT_LAYOUT.organization,'regular');
  const rule=FRONT_LAYOUT.rule;doc.rect(rule.x,rule.y,rule.width,rule.height).fill(document.color);
 }else if(document.backMode!=='blank'){
  doc.roundedRect(40,40,892,108,18).fill(document.color);
  fit(doc,document.organization,{x:90,y:112,width:790,max:40,min:22},'bold',readableInk(document.color));
  if(document.backMode==='template'){
   fit(doc,'YOUR MESSAGE',{x:90,y:235,width:790,max:42,min:28});message(doc,document.backText,90,285,790,530,32);doc.rect(90,540,790,5).fill(document.secondaryColor);
  }else{
   const artwork=assets.get(document.backArtwork),height=artwork?(document.backText.trim()?180:350):0;
   if(artwork)source(doc,artwork,{x:0,y:0,width:artwork.width,height:artwork.height},{x:60,y:180,width:852,height});
   message(doc,document.backText,60,artwork?height+215:220,850,560);
  }
 }
 if(guide&&mounting.slot){const s=mounting.slot;doc.save().dash(5,{space:4}).lineWidth(2).strokeColor('#616b7a').roundedRect(s.x*288,s.y*288,s.width*288,s.height*288,s.height*144).stroke().restore();}
 doc.restore();
}
function create(size,title){const doc=new PDFDocument({autoFirstPage:false,compress:true,info:{Title:title,Author:'Recognition Direct',Subject:'Private Photo ID pilot. No production release.'}});doc.registerFont('Badge',regular);doc.registerFont('BadgeBold',bold);const chunks=[];const done=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});return {doc,done,page:()=>doc.addPage({size,margins:{top:0,right:0,bottom:0,left:0}})};}
export async function cardPdf(document,assets,{guide=false,title='Private Photo ID pilot artwork'}={}){
 const pdf=create([TRIM.width,TRIM.height],title);
 for(const p of document.people){pdf.page();drawCard(pdf.doc,document,p,assets,{guide});if(document.printSides==='front-and-back'){pdf.page();drawCard(pdf.doc,document,p,assets,{side:'back',guide});}}
 pdf.doc.end();return pdf.done;
}
export async function proofPdf(document,assets,{id,revision,subtotalCents}={}){
 const pdf=create('LETTER','PRIVATE PILOT — Photo ID proof '+(id??''));let doc=pdf.doc;
 for(const [index,p]of document.people.entries()){
  pdf.page();font(doc,'bold');doc.fillColor('#152946').fontSize(20).text('Recognition Direct',36,30);font(doc);doc.fontSize(11).fillColor('#8e1929').text('PRIVATE PHOTO ID PILOT — TEST ORDER — DO NOT PRODUCE',36,58);
  doc.fillColor('#253b55').text(`Proof version ${revision??'draft'} | ${id??'Preview'} | Person ${index+1} of ${document.people.length}`,36,78);
  font(doc,'bold');doc.fontSize(12).text('FRONT',36,108);drawCard(doc,document,p,assets,{x:36,y:128,guide:true});
  if(document.printSides==='front-and-back'){font(doc,'bold');doc.fillColor('#253b55').fontSize(12).text('BACK',299,108);drawCard(doc,document,p,assets,{side:'back',x:299,y:128,guide:true});}
  font(doc,'bold');doc.fillColor('#152946').fontSize(14).text('Badge and order details',36,309);
  font(doc);doc.fontSize(11);const slot=mountingGeometry(document.attachment,document.punch).slot;
  const details=[['Name / display lines',[p.firstLine,p.secondLine].filter(Boolean).join(' / ')],['Organization',p.organization||document.organization||'(none)'],['Copies of this person',String(p.copies)],['Size / material','3.375 x 2.125 in, horizontal white glossy PVC'],['Thickness / corners','1/32 in thick; 1/8 in rounded corners'],['Printed sides',document.printSides==='front-only'?'Front only':'Front and back'],['Design colors',document.color+' / '+document.secondaryColor],['Attachment',ATTACHMENTS[document.attachment].label+(document.attachment==='lanyard'?' — '+document.lanyardColor:'')],['Punch',slot?'9/16 x 1/8 in rounded slot, centered; 1/8 in top-edge gap':'Unpunched'],['Logo',document.logo?`${document.logoScale}% size; crop L/R/T/B ${Object.values(document.logoCrop).map(n=>Math.round(n*100)+'%').join(' / ')}`:'No logo'],['Photo crop',`Zoom ${p.crop.zoom.toFixed(2)}; horizontal ${Math.round(p.crop.x*100)}%; vertical ${Math.round(p.crop.y*100)}%`],['Delivery',document.delivery==='troy'?'Pickup: 8680 Troy St., Spring Valley, CA 91977':'Shipping — test checkout calculates final total'],['Badge subtotal',Number.isSafeInteger(subtotalCents)?'$'+(subtotalCents/100).toFixed(2)+' before shipping and tax':'Not checked out']];
  let y=340;for(const [label,value]of details){font(doc,'bold');doc.fillColor('#253b55').text(label,36,y,{width:155});font(doc);const h=doc.heightOfString(value,{width:355});doc.text(value,196,y,{width:355});y+=Math.max(20,h+7);}
  if(document.logoNotes){font(doc);const noteHeight=doc.heightOfString(document.logoNotes,{width:530});if(y+19+noteHeight>700){pdf.page();y=40;}font(doc,'bold');doc.text('Private layout notes',36,y);font(doc);doc.text(document.logoNotes,36,y+19,{width:530});}
  doc.fontSize(9).fillColor('#566779').text('Check every name, photo, crop, logo, color, side and attachment before approving. The dashed slot is a proof guide only. Production artwork downloads omit guides and use actual card size, with no bleed.',36,735,{width:535});
 }
 doc.end();return pdf.done;
}
