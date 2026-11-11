// Representative solid colors sampled from the inspected selected reference; its gradients are not reproduced.
export const DEFAULT_COLORS=Object.freeze({color:'#00cdbe',secondaryColor:'#003cce'});
export const validBadgeColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function normalizePalette(value={}){
 const color=value.color===undefined?DEFAULT_COLORS.color:value.color,secondaryColor=value.secondaryColor===undefined?DEFAULT_COLORS.secondaryColor:value.secondaryColor;
 if(!validBadgeColor(color)||!validBadgeColor(secondaryColor))throw Error('BADGE_COLOR_INVALID');
 return {color:color.toLowerCase(),secondaryColor:secondaryColor.toLowerCase()};
}
export function relativeLuminance(hex){if(!validBadgeColor(hex))throw Error('BADGE_COLOR_INVALID');const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
export const contrastRatio=(a,b)=>{const x=relativeLuminance(a),y=relativeLuminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
export const readableInk=background=>contrastRatio('#000000',background)>=contrastRatio('#ffffff',background)?'#000000':'#ffffff';
