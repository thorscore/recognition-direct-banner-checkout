import {SAMPLES,sampleCart} from './shipping/samples.mjs';
import {DESTINATIONS} from './shipping/checkout-shipping.mjs';
export const CASES=[
 {id:'normal',title:'One coroplast sign',sample:'normal-coroplast',quantity:1},
 {id:'bulk25',title:'25 coroplast signs',sample:'normal-coroplast',quantity:25},
 {id:'mixed',title:'25 signs + 5 name badges',sample:'normal-coroplast',quantity:25,badges:5},
 {id:'foam',title:'Foam board',sample:'normal-coroplast',foam:true},
 {id:'banner',title:'Banner',sample:'normal-banner'},
 {id:'badges',title:'Name badges',sample:'name-badges-small'},
 {id:'id-badges',title:'Photo ID badges',sample:'photo-id-small'},
 {id:'native',title:'Parking sign + magnetic plate',sample:'native-mixed-seattle'},
 {id:'review',title:'Shipping approval practice · Pine Valley only',sample:'normal-coroplast',reviewPractice:true},
 {id:'large48',title:'48 × 36 sign · quote only',sample:'normal-coroplast',large:true},
 {id:'oversize',title:'60 × 24 sign · pickup only',sample:'rigid-oversize'},
 {id:'pickup',title:'Troy Street pickup',sample:'troy-pickup'}
];
export const PLACES={
 springvalley:{label:'Spring Valley, CA',...DESTINATIONS.troy},
 seattle:{label:'Seattle, WA',...DESTINATIONS.seattle},
 newyork:{label:'New York, NY',...DESTINATIONS.newyork},
 raleigh:{label:'Raleigh, NC',...DESTINATIONS.northcarolina},
 pinevalley:{label:'Pine Valley, CA · remote',address1:'28804 Old Highway 80',city:'Pine Valley',provinceCode:'CA',zip:'91962',countryCode:'US',address2:''},
 pioche:{label:'Pioche, NV · remote',address1:'Sample address',city:'Pioche',provinceCode:'NV',zip:'89043',countryCode:'US',address2:''},
 wilmot:{label:'Wilmot, NH · extended',address1:'Sample address',city:'Wilmot',provinceCode:'NH',zip:'03287',countryCode:'US',address2:''},
 eastport:{label:'Eastport, ME · extended',address1:'Sample address',city:'Eastport',provinceCode:'ME',zip:'04631',countryCode:'US',address2:''}
};
export function fixture(caseId){
 const c=CASES.find(c=>c.id===caseId);if(!c)throw Object.assign(Error('Choose one of the sample carts.'),{status:400});
 const cart=sampleCart(SAMPLES.find(s=>s.id===c.sample));
 const first=cart.items[0];
 if(c.quantity){first.summary.quantity=c.quantity;first.summary.subtotal=18*c.quantity;first.draftInput.lineItems[0].quantity=c.quantity;}
 if(c.badges){const b=SAMPLES.find(s=>s.id==='name-badges-small').items()[0];b.summary.quantity=c.badges;b.summary.subtotal=10.25*c.badges;b.draftInput.lineItems[0].quantity=c.badges;cart.items.push(b);}
 if(c.foam){first.draftInput.tags=first.draftInput.tags.map(t=>t==='coroplast'?'foamcore':t);first.summary.title=first.draftInput.lineItems[0].title='Foam board · 24 × 18 in';first.draftInput.lineItems[0].customAttributes.find(a=>a.key==='Material').value='3/16" White Foamcore';}
 if(c.large){first.summary.title=first.draftInput.lineItems[0].title='Coroplast sign · 48 × 36 in';first.draftInput.lineItems[0].customAttributes.find(a=>a.key==='Product Size').value='48 in x 36 in';}
 cart.previewCase=caseId;return cart;
}
