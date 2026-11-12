import {calculateLocalPrice,LANYARD_COLORS} from './shared/model.mjs';
import {normalizePalette} from './shared/colors.mjs';
import {normalizeLayout} from './shared/layout.mjs';
import {normalizeOrientation} from './shared/card-geometry.mjs';
import {mountingGeometry} from './shared/slot-geometry.mjs';
import {fail,isId} from './auth.mjs';
const text=(value,max=100)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const paragraph=(value,max=2000)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const artwork=value=>value===null||isId(value);
export function newDocument(){return {layout:'teal-cobalt-geometric.v1',orientation:'landscape',organization:'',color:'#00cdbe',secondaryColor:'#003cce',logo:null,logoScale:100,logoCrop:{left:0,right:0,top:0,bottom:0},logoNotes:'',printSides:'front-only',backMode:'template',backText:'',backArtwork:null,attachment:'none',punch:'unpunched',lanyardColor:'blue',delivery:'ship',people:[{id:crypto.randomUUID(),firstLine:'',secondLine:'',organization:'',copies:1,photo:null,crop:{x:.5,y:.5,zoom:1}}]};}
export function checkDocument(input,{complete=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(422,'BADGE_DETAILS_INVALID');
 const allowed=Object.keys(newDocument());if(Object.keys(input).some(k=>!allowed.includes(k))||!allowed.filter(k=>k!=='orientation').every(k=>Object.hasOwn(input,k)))fail(422,'BADGE_DETAILS_INVALID');
 let palette,orientation;try{palette=normalizePalette(input);orientation=normalizeOrientation(input.orientation);normalizeLayout(input.layout);mountingGeometry(input.attachment,input.punch,input);}catch{fail(422,'BADGE_DETAILS_INVALID');}
 if(!text(input.organization,160)||!paragraph(input.logoNotes)||!paragraph(input.backText)||!artwork(input.logo)||!artwork(input.backArtwork)||!Number.isFinite(input.logoScale)||input.logoScale<25||input.logoScale>150||!['front-only','front-and-back'].includes(input.printSides)||!['template','custom','blank'].includes(input.backMode)||!['ship','troy'].includes(input.delivery)||!LANYARD_COLORS.includes(input.lanyardColor))fail(422,'BADGE_DETAILS_INVALID');
 if(!input.logoCrop||Object.keys(input.logoCrop).sort().join(',')!=='bottom,left,right,top'||Object.values(input.logoCrop).some(v=>!Number.isFinite(v)||v<0||v>.45))fail(422,'LOGO_CROP_INVALID');
 if(!Array.isArray(input.people)||input.people.length<1||input.people.length>50)fail(422,'BADGE_PEOPLE_INVALID');
 const ids=new Set();for(const p of input.people){
  if(!p||typeof p.id!=='string'||!/^[a-f0-9-]{36}$/i.test(p.id)||ids.has(p.id)||!text(p.firstLine)||!text(p.secondLine)||!text(p.organization,160)||!Number.isSafeInteger(p.copies)||p.copies<1||p.copies>50||!artwork(p.photo)||!p.crop||Object.keys(p).sort().join(',')!=='copies,crop,firstLine,id,organization,photo,secondLine'||Object.keys(p.crop).sort().join(',')!=='x,y,zoom'||!Number.isFinite(p.crop.x)||p.crop.x<0||p.crop.x>1||!Number.isFinite(p.crop.y)||p.crop.y<0||p.crop.y>1||!Number.isFinite(p.crop.zoom)||p.crop.zoom<1||p.crop.zoom>3)fail(422,'BADGE_PEOPLE_INVALID');
  ids.add(p.id);if(complete&&(!p.firstLine.trim()||!p.photo))fail(422,'NAME_AND_PHOTO_REQUIRED');
 }
 const price=calculateLocalPrice(input);if(price.status!=='priced-local-review'||price.quantity>50)fail(422,'BADGE_QUANTITY_OR_OPTIONS_INVALID');
 if(complete&&input.printSides==='front-and-back'&&(input.backMode==='blank'||(input.backMode==='template'&&!input.backText.trim())||(input.backMode==='custom'&&!input.backText.trim()&&!input.backArtwork)))fail(422,'BACK_DESIGN_REQUIRED');
 // Preserve absence in old saved documents: opening/saving an unchanged landscape
 // must not silently rewrite the document hash or supersede an approved proof.
 return {document:structuredClone({...input,...(Object.hasOwn(input,'orientation')?{orientation}:{}),...palette}),price};
}
export const documentAssets=d=>[d.logo,d.backArtwork,...d.people.map(p=>p.photo)].filter(Boolean);
export function financialSignature(d){const p=calculateLocalPrice(d);return JSON.stringify([d.printSides,d.attachment,d.punch,d.lanyardColor,d.delivery,p.quantity,p.unitCents]);}
