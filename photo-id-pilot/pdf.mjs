import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
import {CARD,cropRect,logoSourceRect,ATTACHMENTS} from './shared/model.mjs';
import {FRONT_LAYOUT,LAYOUT_ID,layoutFor,cornerShapesFor,backLayoutFor} from './shared/layout.mjs';
import {cardGeometry} from './shared/card-geometry.mjs';
import {readableInk} from './shared/colors.mjs';
import {mountingGeometry,logoPosition} from './shared/slot-geometry.mjs';
import {fail} from './auth.mjs';
const regular=fileURLToPath(new URL('./fonts/Carlito-Regular.ttf',import.meta.url));
const bold=fileURLToPath(new URL('./fonts/Carlito-Bold.ttf',import.meta.url));
export const TRIM={width:CARD.width*72,height:CARD.height*72};
export const trimFor=document=>{const g=cardGeometry(document);return {width:g.trimWidth,height:g.trimHeight};};
function font(doc,weight='regular'){doc.font(weight==='bold'?'BadgeBold':'Badge');}
function fit(doc,text,box,weight='bold',color=FRONT_LAYOUT.ink){
 if(!text)return; font(doc,weight);let size=box.max;doc.fontSize(size);while(size>box.min&&doc.widthOfString(text)>box.width){size-=.5;doc.fontSize(size);}if(doc.widthOfString(text)>box.width+.1)fail(422,'TEXT_DOES_NOT_FIT');
 const x=box.x+(box.align==='center'?(box.width-doc.widthOfString(text))/2:0);
 doc.fillColor(color).text(text,x,box.y-size*.83,{lineBreak:false});
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
function fittedMessage(doc,text,{x,y,width,bottom,max=48,min=28}){
 if(!text)return;font(doc);
 for(let size=max;size>=min;size--){doc.fontSize(size);if(y+doc.heightOfString(text,{width,lineGap:5})<=bottom){doc.fillColor('#172639').text(text,x,y,{width,lineGap:5,height:bottom-y});return;}}
 fail(422,'BACK_TEXT_DOES_NOT_FIT');
}
export function drawCard(doc,document,person,assets,{side='front',x=0,y=0,scale=.25,guide=false}={}){
 const layout=layoutFor(document),g=layout.geometry;
 doc.save().translate(x,y).scale(scale).roundedRect(0,0,g.width,g.height,g.cornerRadius).clip().rect(0,0,g.width,g.height).fill('#ffffff');
 const mounting=mountingGeometry(document.attachment,document.punch,document);
 if(side==='front'){
  drawFrame(doc,document,layout);
  const box=layout.photo,portrait=assets.get(person.photo);
  if(portrait){const crop=cropRect(portrait.width,portrait.height,person.crop,box.w/box.h);source(doc,portrait,{x:crop.x,y:crop.y,width:crop.width,height:crop.height},{x:box.x,y:box.y,width:box.w,height:box.h});}
  else{doc.rect(box.x,box.y,box.w,box.h).fill('#edf2f7');font(doc);doc.fillColor('#586a80').fontSize(26).text('Add a portrait',box.x+12,box.y+box.h/2,{width:box.w-24,align:'center',height:100});}
  const logo=assets.get(document.logo);if(logo){const crop=logoSourceRect(logo.width,logo.height,document.logoCrop),bounds=logoPosition(crop.width,crop.height,document.logoScale,!!mounting.slot,document);source(doc,logo,crop,bounds);}
  fit(doc,person.firstLine,layout.first);fit(doc,person.secondLine,layout.second);
  fit(doc,person.organization||document.organization,layout.organization,'regular',layout.organizationOnColor?readableInk(document.secondaryColor):layout.ink);
  const rule=layout.rule;doc.rect(rule.x,rule.y,rule.width,rule.height).fill(document.color);
 }else if(document.backMode!=='blank'){
  const back=backLayoutFor(document),header=back.header;
  doc.roundedRect(header.x,header.y,header.width,header.height,header.radius).fill(document.color);
  fit(doc,document.organization,back.organization,'bold',readableInk(document.color));
  if(document.backMode==='template'){
   // Absence marks historical designs: retain the exact back layout of old approved proofs.
   const m=back.message;
   if(Object.hasOwn(document,'backHeading')){
    const heading=document.backHeading.trim();
    if(heading)fit(doc,heading,{...back.title,max:g.orientation==='portrait'?52:60,min:28});
    fittedMessage(doc,document.backText,{...m,y:heading?m.y:(g.orientation==='portrait'?280:200),max:heading?42:48});
   }else{fit(doc,'YOUR MESSAGE',back.title);message(doc,document.backText,m.x,m.y,m.width,m.bottom,m.size);}
   const r=back.rule;doc.rect(r.x,r.y,r.width,r.height).fill(document.secondaryColor);
  }else{
   const artwork=assets.get(document.backArtwork),area=back.custom,height=artwork?(document.backText.trim()?area.withTextHeight:area.aloneHeight):0;
   if(artwork)source(doc,artwork,{x:0,y:0,width:artwork.width,height:artwork.height},{x:area.x,y:area.y,width:area.width,height});
   message(doc,document.backText,area.x,artwork?area.y+height+area.textGap:area.textWithoutArtY,area.width,area.bottom);
  }
 }
 if(guide&&mounting.slot){const s=mounting.slot;doc.save().dash(5,{space:4}).lineWidth(2).strokeColor('#616b7a').roundedRect(s.x*288,s.y*288,s.width*288,s.height*288,s.height*144).stroke().restore();}
 doc.restore();
}
function drawFrame(doc,document,layout){
 const g=layout.geometry,portrait=g.orientation==='portrait';
 if(layout.id===LAYOUT_ID){for(const shape of cornerShapesFor(document))doc.path('M '+shape.points.map(p=>p.join(' ')).join(' L ')+' Z').fill(document[shape.color]);}
 else if(layout.id==='clean-header.v1'){doc.rect(0,0,g.width,portrait?84:68).fill(document.color);doc.rect(0,portrait?84:68,g.width,8).fill(document.secondaryColor);}
 else if(layout.id==='side-stripe.v1'){const stripe=portrait?52:100;doc.rect(0,0,stripe,g.height).fill(document.color);doc.rect(stripe,0,portrait?12:16,g.height).fill(document.secondaryColor);}
 else if(layout.id==='framed-id.v1'){doc.save().lineWidth(8).strokeColor(document.color).roundedRect(24,24,g.width-48,g.height-48,24).stroke().restore();doc.rect(portrait?94:420,layout.dividerY??(portrait?193:175),portrait?424:470,5).fill(document.secondaryColor);}
 else if(layout.id==='soft-panel.v1'){
  const p=layout.photo;doc.roundedRect(p.x-22,p.y-18,p.w+44,p.h+36,22).fill('#eef4f7');
  doc.rect(0,portrait?864:486,g.width,portrait?108:126).fill(document.secondaryColor);
  doc.rect(0,0,g.width,12).fill(document.color);
 }
}
function create(size,title,live=false){const doc=new PDFDocument({autoFirstPage:false,compress:true,info:{Title:title,Author:'Recognition Direct',Subject:live?'Photo ID badges. Production requires approval of the current proof.':'Private Photo ID pilot. No production release.'}});doc.registerFont('Badge',regular);doc.registerFont('BadgeBold',bold);const chunks=[];const done=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});return {doc,done,page:()=>doc.addPage({size,margins:{top:0,right:0,bottom:0,left:0}})};}
export async function cardPdf(document,assets,{guide=false,title='Private Photo ID pilot artwork',live=false}={}){
 const trim=trimFor(document),pdf=create([trim.width,trim.height],title,live);
 for(const p of document.people){pdf.page();drawCard(pdf.doc,document,p,assets,{guide});if(document.printSides==='front-and-back'){pdf.page();drawCard(pdf.doc,document,p,assets,{side:'back',guide});}}
 pdf.doc.end();return pdf.done;
}
export async function proofPdf(document,assets,{id,revision,subtotalCents,live=false}={}){
 const pdf=create('LETTER',(live?'Photo ID proof ':'PRIVATE PILOT — Photo ID proof ')+(id??''),live);let doc=pdf.doc;
 const g=cardGeometry(document),layout=layoutFor(document),trim=trimFor(document);
 const footer=()=>{font(doc);doc.fontSize(9).fillColor('#566779').text('Check every name, photo, crop, logo, color, side and attachment before approving. The dashed slot is a proof guide only. Production artwork downloads omit guides and use actual card size, with no bleed.',36,735,{width:535});};
 for(const [index,p]of document.people.entries()){
  pdf.page();font(doc,'bold');doc.fillColor('#152946').fontSize(20).text('Recognition Direct',36,30);font(doc);doc.fontSize(11).fillColor('#8e1929').text(live?'PHOTO ID BADGE PROOF — REVIEW BEFORE PRODUCTION':'PRIVATE PHOTO ID PILOT — TEST ORDER — DO NOT PRODUCE',36,58);
  doc.fillColor('#253b55').text(`Proof version ${revision??'draft'} | ${id??'Preview'} | Person ${index+1} of ${document.people.length}`,36,78);
  const left=36+(243-trim.width)/2,right=299+(243-trim.width)/2;
  font(doc,'bold');doc.fontSize(12).text('FRONT',left,108);drawCard(doc,document,p,assets,{x:left,y:128,guide:true});
  if(document.printSides==='front-and-back'){font(doc,'bold');doc.fillColor('#253b55').fontSize(12).text('BACK',right,108);drawCard(doc,document,p,assets,{side:'back',x:right,y:128,guide:true});}
  const detailsTop=128+trim.height+28;
  font(doc,'bold');doc.fillColor('#152946').fontSize(14).text('Badge and order details',36,detailsTop);
  font(doc);doc.fontSize(11);const slot=mountingGeometry(document.attachment,document.punch,document).slot;
  const details=[['Name / display lines',[p.firstLine,p.secondLine].filter(Boolean).join(' / ')],['Organization',p.organization||document.organization||'(none)'],['Copies of this person',String(p.copies)],['Size / material',`${g.widthInches} x ${g.heightInches} in, ${g.orientation==='portrait'?'portrait':'landscape'} white glossy PVC`],['Design layout',layout.label],['Thickness / corners','1/32 in thick; 1/8 in rounded corners'],['Printed sides',document.printSides==='front-only'?'Front only':'Front and back'],['Design colors',document.color+' / '+document.secondaryColor],['Attachment',ATTACHMENTS[document.attachment].label+(document.attachment==='lanyard'?' — '+document.lanyardColor:'')],['Punch',slot?'9/16 x 1/8 in rounded slot, centered; 1/8 in top-edge gap':'Unpunched'],['Logo',document.logo?`${document.logoScale}% size; crop L/R/T/B ${Object.values(document.logoCrop).map(n=>Math.round(n*100)+'%').join(' / ')}`:'No logo'],['Photo crop',`Zoom ${p.crop.zoom.toFixed(2)}; horizontal ${Math.round(p.crop.x*100)}%; vertical ${Math.round(p.crop.y*100)}%`],['Delivery',document.delivery==='troy'?'Pickup: 8680 Troy St., Spring Valley, CA 91977':live?'Shipping — see your Shopify order for the final total':'Shipping — test checkout calculates final total'],['Badge subtotal',Number.isSafeInteger(subtotalCents)?'$'+(subtotalCents/100).toFixed(2)+' before shipping and tax':'Not checked out']];
  let y=detailsTop+31;for(const [label,value]of details){font(doc);doc.fontSize(11);const h=doc.heightOfString(value,{width:355}),rowHeight=Math.max(20,h+7);if(y+rowHeight>710){footer();pdf.page();y=50;font(doc,'bold');doc.fillColor('#152946').fontSize(14).text('Badge and order details (continued)',36,y);y+=30;}font(doc,'bold');doc.fontSize(11).fillColor('#253b55').text(label,36,y,{width:155});font(doc);doc.text(value,196,y,{width:355});y+=rowHeight;}
  if(document.logoNotes){font(doc);doc.fontSize(11);const noteHeight=doc.heightOfString(document.logoNotes,{width:530});if(y+19+noteHeight>710){footer();pdf.page();y=40;}font(doc,'bold');doc.text('Private layout notes',36,y);font(doc);doc.text(document.logoNotes,36,y+19,{width:530});}
  footer();
 }
 doc.end();return pdf.done;
}
