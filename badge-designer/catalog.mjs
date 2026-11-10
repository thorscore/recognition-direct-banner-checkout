// Local review catalog. Prices read from the published regular-badge form on Nov 6.
// Fixed sizes include the owner's Nov 6 WIDTH x HEIGHT additions.
// New small size launches without a frame per the owner's latest voice confirmation.
import {DUETS_PALETTE} from './duets-palette.mjs';
export const CATALOG_VERSION='badge-family-local-review-2026-11-06.v6';
export const CORNER_RADII = Object.freeze([
  Object.freeze({ id: '1/8', inches: 1 / 8 }),
  Object.freeze({ id: '1/4', inches: 1 / 4 }),
]);
export const DEFAULT_CORNER_RADIUS = CORNER_RADII[0].id;
export const TEXT_SIZE = Object.freeze({ min: 70, default: 100, max: 130, step: 5 });
export const FIXED_SIZES=Object.freeze([
 Object.freeze({id:'1x3',label:'3 × 1 in',width:3,height:1,band:'standard',frameEligibility:'available'}),
 Object.freeze({id:'1-5x3',label:'3 × 1.5 in',width:3,height:1.5,band:'standard',frameEligibility:'available'}),
 Object.freeze({id:'2-75x1-625',label:'2.75 × 1.625 in · small',width:2.75,height:1.625,band:'standard',standardPriceOverride:true,classificationAuthority:'owner-fixed-size-2026-11-06',frameEligibility:'unavailable',initialReleaseNoFrame:true}),
 Object.freeze({id:'3x2',label:'3 × 2 in',width:3,height:2,band:'larger',frameEligibility:'unavailable'}),
 Object.freeze({id:'3-5x2',label:'3.5 × 2 in',width:3.5,height:2,band:'larger',frameEligibility:'unavailable'}),
 Object.freeze({id:'3-5x2-25',label:'3.5 × 2.25 in',width:3.5,height:2.25,band:'larger',frameEligibility:'unavailable'})
]);
export const STANDARD_COLORS=Object.freeze([
 {id:'white',name:'White',preview:'#ffffff'},
 {id:'brushed-gold',name:'Brushed Gold',preview:'#d7bf7e'},
 {id:'brushed-silver',name:'Brushed Silver',preview:'#d6d8d9'}
]);
export const DUETS_COLORS=DUETS_PALETTE;
export const PRICE_SOURCE='https://recognition-direct.com/pages/name-badges';
export const TIERS=Object.freeze([
 {min:1,unframed:800,framed:1200,magnet:225,dome:400},
 {min:10,unframed:750,framed:1150,magnet:225,dome:400},
 {min:25,unframed:700,framed:1100,magnet:225,dome:400},
 {min:50,unframed:600,framed:1000,magnet:225,dome:350},
 {min:100,unframed:550,framed:950,magnet:190,dome:350},
 {min:250,unframed:525,framed:875,magnet:190,dome:300},
 {min:500,unframed:500,framed:850,magnet:175,dome:250},
 {min:1000,unframed:450,framed:800,magnet:150,dome:250}
]);
export const FAMILIES=Object.freeze({
 standard:{label:'Standard name badges',logo:'Full-color logo',personalization:'Laser-engraved names and titles',glossIncluded:false,frames:true,substrate:null},
 duets:{label:'Full-color printed name badges',logo:'Full-color printed logo',personalization:'Full-color printed names and titles',glossIncluded:true,frames:false,substrate:null,thicknessInches:1/16}
});
