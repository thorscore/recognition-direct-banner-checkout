import {DEFAULT_COLORS,normalizePalette,readableInk} from './colors.mjs';
import {FRONT_LAYOUT,normalizeLayout} from './layout.mjs';
import {requiresSlot,punchGeometry,punchLabel} from './mounting.mjs';
export const CARD = Object.freeze({ width: 3.375, height: 2.125, photoWidth: FRONT_LAYOUT.portrait.widthInches, photoHeight: FRONT_LAYOUT.portrait.heightInches });
export const PRODUCT_SPECS=Object.freeze({widthInches:3.375,heightInches:2.125,orientation:'horizontal',material:'white PVC',thicknessInches:1/32,finish:'glossy',cornerRadiusInches:1/8});
export const UNIT_PRICES_CENTS=Object.freeze({frontOnly:1250,frontAndBack:1550,backUpgrade:300,none:0,lanyard:200,magnet:225,pin:0,strap:0,reel:400,punch:0,uploads:0});
export const validQuantity=value=>Number.isSafeInteger(value)&&value>=1;
export const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export const REFERENCE_CANVAS=Object.freeze({width:972,height:612,pixelsPerInch:288});
export function portraitWindow(){
  const w=CARD.photoWidth*REFERENCE_CANVAS.pixelsPerInch,h=CARD.photoHeight*REFERENCE_CANVAS.pixelsPerInch;
  return {x:FRONT_LAYOUT.portrait.x,y:(REFERENCE_CANVAS.height-h)/2,w,h};
}
export const backPrintingEnabled=state=>state.printSides==='front-and-back';
export function setPrintSides(state,value){
  if(!['front-only','front-and-back'].includes(value))throw new Error('Choose front only or front and back.');
  state.printSides=value;return state;
}
export function selectedBackWarnings(state){
  return backPrintingEnabled(state)&&state.backMode==='blank'?['Back printing is selected, but its design is blank. Choose a template/custom back or select front only.']:[];
}
export const LOGO_AREA=FRONT_LAYOUT.logo;
export function logoSourceRect(width,height,crop={}){
  const edge=key=>Math.max(0,Math.min(.45,Number(crop[key])||0));
  const left=edge('left'),right=edge('right'),top=edge('top'),bottom=edge('bottom');
  return {x:width*left,y:height*top,width:width*(1-left-right),height:height*(1-top-bottom)};
}
export function logoBounds(width,height,percent=100){
  if(!(width>0&&height>0))throw new Error('Invalid logo dimensions');
  const size=Math.max(25,Math.min(150,Number(percent)||100));
  const factor=Math.min(LOGO_AREA.width/width,LOGO_AREA.height/height)*size/150;
  const w=width*factor,h=height*factor;
  return {x:LOGO_AREA.x+(LOGO_AREA.width-w)/2,y:LOGO_AREA.y+(LOGO_AREA.height-h)/2,width:w,height:h};
}
export const ATTACHMENTS = Object.freeze({
  none: { label: 'No attachment', mount: 'none' },
  lanyard: { label: 'Standard ½-inch-wide lanyard', mount: 'hanging' },
  reel: { label: 'Retractable badge reel', mount: 'hanging' },
  strap: { label: 'Strap clip', mount: 'hanging' },
  magnet: { label: 'Magnetic fastener', mount: 'rear' },
  pin: { label: 'Pin fastener', mount: 'rear' }
});
export function person(id) {
  return { id, firstLine: '', secondLine: '', organization: '', copies: 1, photo: null, crop: { x: .5, y: .5, zoom: 1 } };
}
export function totalCopies(people) {
  if(!Array.isArray(people)||!people.length)return null;let sum=0;
  for(const p of people){if(!validQuantity(p?.copies)||!Number.isSafeInteger(sum+p.copies))return null;sum+=p.copies;}return sum;
}
export function cropRect(width, height, crop) {
  if (!(width > 0 && height > 0)) throw new Error('Invalid image dimensions');
  const aspect = CARD.photoWidth / CARD.photoHeight;
  const zoom = Math.max(1, Math.min(3, Number(crop.zoom) || 1));
  let w = Math.min(width, height * aspect) / zoom;
  let h = w / aspect;
  const x = Math.max(0, Math.min(1, Number(crop.x) || 0));
  const y = Math.max(0, Math.min(1, Number(crop.y) || 0));
  return { x: (width - w) * x, y: (height - h) * y, width: w, height: h };
}
export function effectiveDpi(photo, crop) {
  const rect = cropRect(photo.width, photo.height, crop);
  return Math.floor(Math.min(rect.width / CARD.photoWidth, rect.height / CARD.photoHeight));
}
export function mountingMessage(attachment, punch) {
  if(!['unpunched','punch'].includes(punch))return 'Choose a current punch preference.';
  if(!ATTACHMENTS[attachment])return 'Choose an attachment preference.';
  if(requiresSlot(attachment))return punch==='punch'?'A punched slot is required for this attachment and included at no extra charge. Slot dimensions and position will be checked in your proof.':'This attachment requires a free punched slot.';
  if(punch==='punch')return 'Punch requested — free. Shape and position require confirmation before production.';
  if(ATTACHMENTS[attachment].mount==='rear')return 'Unpunched badge selected. Rear fastener placement and back-art clearance require confirmation.';
  return 'Card remains unpunched.';
}
export function validatePeople(people) {
  const errors = [];
  const ids = new Set();
  if (!people.length) errors.push('Add at least one person.');
  for (const [i, p] of people.entries()) {
    if (!p.id || ids.has(p.id)) errors.push(`Person ${i + 1}: identity mapping is invalid.`);
    ids.add(p.id);
    if (!p.firstLine.trim()) errors.push(`Person ${i + 1}: enter a first/display line.`);
    if (!validQuantity(p.copies)) errors.push(`Person ${i + 1}: enter a valid positive whole-number quantity.`);
    if (!p.photo) errors.push(`Person ${i + 1}: add a portrait for the photo preview.`);
  }
  return errors;
}
export function canonicalDraft(state) {
  return {
    schemaVersion: 'recognition-direct.photo-id.draft.v6',
    status: 'local-review-only', productIdentity: null, orderIdentity: null,
    referenceDimensions: { ...CARD, units: 'inches', cardDimensionsOwnerConfirmed:true,portraitWindowReferenceOnly:true },
    production: { ...PRODUCT_SPECS,sides:state.printSides??'front-only',bleed:null,safeMargins:null,attachmentSku:null,punchGeometry:punchGeometry(state),punchPosition:null,punchDimensions:null },
    shared: {
      layout:normalizeLayout(state.layout), logoNotes:state.logoNotes??'', organization: state.organization, brandColors: normalizePalette(state),
      logoTransform: { sizePercent:state.logoScale??100,fit:'contain',crop:state.logoCrop&&Object.values(state.logoCrop).some(x=>x>0)?{...state.logoCrop}:'none',safeAreaReference:LOGO_AREA },
      logoSource: sourceRecord(state.logo), backPreviewMode: state.backMode,
      backPrintingEnabled:backPrintingEnabled(state),
      templateBackText:state.templateBackText??'',
      backText: state.backText, backArtworkSource: sourceRecord(state.backArtwork)
    },
    people: state.people.map(p => ({
      id: p.id, firstLine: p.firstLine, secondLine: p.secondLine,
      organizationOverride: p.organization, copies: p.copies,
      portraitSource: sourceRecord(p.photo), crop: { ...p.crop },
      orientation: 'browser-decoded-from-image', frontBackPairId: p.id
    })),
    quantity: totalCopies(state.people),
    preferences: { printSides:state.printSides??'front-only', attachment:!hasRemovedSelection(state)&&Object.hasOwn(ATTACHMENTS,state.attachment)?state.attachment:null, mounting:!hasRemovedSelection(state)&&['unpunched','punch'].includes(state.punch)&&(!requiresSlot(state.attachment)||state.punch==='punch')?state.punch:null,lanyardColor:state.attachment==='lanyard'?state.lanyardColor??'':null, confirmedSku: null, punchGeometry:punchGeometry(state) },
    deliveryPreference: state.delivery, requestedDate: state.requestedDate,
    price: calculateLocalPrice(state),
    artworkRevision: 1, proofState: 'not-ordered', checkoutEnabled: false,
    storage: 'In-memory preview only. Source assets are not uploaded or included in this record.'
  };
}
export const LANYARD_COLORS=Object.freeze(['red','orange','yellow','green','blue','purple','black','white']);
export function hasRemovedSelection(state={}){
  const removed=['holder','card-holder','card_holder'];
  const keys=[state.attachment,state.punch,state.mounting,state.preferences?.attachment,state.preferences?.mounting,...['accessories','selectedAccessories','attachments'].flatMap(key=>Array.isArray(state[key])?state[key]:[])];
  if(keys.some(x=>removed.includes(typeof x==='object'&&x?(x.key??x.kind??x.type):x)))return true;
  return [state,state.preferences,state.options,state.addOns].filter(Boolean).some(object=>removed.some(key=>object[key]!==undefined&&object[key]!==null&&object[key]!==false&&object[key]!==0&&object[key]!==''));
}
export function validateAttachmentPreferences(state){
  const errors=[];
  if(hasRemovedSelection(state))return ['This saved accessory option is no longer offered. Choose a current attachment and punch option.'];
  if(!Object.hasOwn(ATTACHMENTS,state.attachment))errors.push('Choose a current attachment.');
  if(!['unpunched','punch'].includes(state.punch))errors.push('Choose unpunched or punched.');
  if(requiresSlot(state.attachment)&&state.punch!=='punch')errors.push('This attachment requires a free punched slot.');
  if(state.attachment==='lanyard'){
    if(!LANYARD_COLORS.includes(state.lanyardColor))errors.push('Choose a lanyard color.');
  }return errors;
}
export function calculateLocalPrice(input){
  const result={status:'invalid',currency:'USD',quantity:null,unitCents:null,components:[],subtotalCents:null,total:null,taxCents:null,deliveryCents:null,checkoutEnabled:false,scope:'local-product-estimate-only',uploadsCents:0,punchCents:0,upgrades:{backPrinting:{selected:backPrintingEnabled(input||{}),unitCents:300,amountCents:null,status:'not-priced'}}};
  if(!input||typeof input!=='object'||Array.isArray(input))return {...result,errors:['Choose valid product options and quantity.']};
  const selected={...input,attachment:input.attachment??'none',punch:input.punch??'unpunched',printSides:input.printSides??'front-only'};
  const quantity=Object.hasOwn(input,'people')?totalCopies(input.people):input.quantity;
  result.quantity=validQuantity(quantity)?quantity:null;
  const errors=validateAttachmentPreferences(selected);
  if(!['front-only','front-and-back'].includes(selected.printSides))errors.push('Choose front only or front and back.');
  if(!validQuantity(quantity))errors.push('Enter a valid positive whole-number badge quantity.');
  if(errors.length)return {...result,errors};
  if(input.customDesignRequested===true||(selected.attachment==='lanyard'&&input.lanyardOption&&!['standard','standard-half-inch'].includes(input.lanyardOption)))return {...result,status:'inquiry-only',errors:[],message:'Custom design and other lanyard options need an inquiry. No automatic price is quoted.'};
  if(quantity>50)return {...result,status:'inquiry-only',errors:[],message:'For more than 50 total badges, please inquire. No automatic price is quoted.',upgrades:{backPrinting:{selected:backPrintingEnabled(selected),unitCents:null,amountCents:null,status:'inquiry-only'}}};
  const base=backPrintingEnabled(selected)?1550:1250,accessory=UNIT_PRICES_CENTS[selected.attachment];
  const components=[{key:'badge',label:backPrintingEnabled(selected)?'Front-and-back printing':'Front-only printing',quantity,unitCents:base,subtotalCents:base*quantity},{key:'attachment',label:ATTACHMENTS[selected.attachment].label,quantity,unitCents:accessory,subtotalCents:accessory*quantity},{key:'punch',label:punchLabel(selected),quantity,unitCents:0,subtotalCents:0},{key:'uploads',label:'Photo, logo and back-art uploads — no surcharge',quantity,unitCents:0,subtotalCents:0}];
  return {...result,status:'priced-local-review',quantity,unitCents:base+accessory,components,subtotalCents:(base+accessory)*quantity,errors:[],upgrades:{backPrinting:{selected:backPrintingEnabled(selected),unitCents:300,amountCents:backPrintingEnabled(selected)?300*quantity:0,status:backPrintingEnabled(selected)?'included-in-two-sided-unit-price':'not-selected'}}};
}
export function validateBulkInquiry(value){const errors=validateInquiry(value);if(!Number.isSafeInteger(Number(value?.quantity))||Number(value?.quantity)<=50)errors.quantity='Use this inquiry for more than 50 badges.';return errors;}
export function validateDesignInquiry(value){
  const normalized={date:'',...value},errors=validateInquiry(normalized);
  if(typeof normalized.timeline!=='string'||normalized.timeline.length>160)errors.timeline='Enter a timeline of up to 160 characters.';
  if(typeof normalized.notes!=='string'||!normalized.notes.trim())errors.notes='Describe the badge design you have in mind.';
  return errors;
}
function sourceRecord(source) {
  return source ? { id: source.id, type: source.type, bytes: source.bytes, width: source.width, height: source.height, status: 'local-only-not-fulfillable' } : null;
}
export function validateInquiry(value) {
  const errors = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { form: 'Invalid form data.' };
  for (const [key, max] of Object.entries({ name: 120, email: 254, company: 160, quantity: 16, date: 10, notes: 2000, website: 200 })) {
    if (typeof value[key] !== 'string' || value[key].length > max) errors[key] = 'Check this field.';
  }
  if (Object.keys(errors).length) return errors;
  if (!value.name.trim()) errors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) errors.email = 'Enter a valid email address.';
  if (!/^\d{1,16}$/.test(value.quantity) || !validQuantity(Number(value.quantity))) errors.quantity = 'Enter a valid positive whole-number quantity.';
  if (value.date && (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isFinite(Date.parse(value.date)) || new Date(value.date).toISOString().slice(0, 10) !== value.date)) errors.date = 'Enter a valid requested date.';
  if (value.website) errors.form = 'The form could not be accepted.';
  if (value.consent !== true) errors.consent = 'Confirm this local form test.';
  return errors;
}
