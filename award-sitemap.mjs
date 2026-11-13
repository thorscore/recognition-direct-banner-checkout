import {AWARD_DETAIL_PAGES,awardPageUrl} from './award-pages.mjs';
import {AWARD_PILOT_URL} from './award-pilot.mjs';

export const AWARD_SITEMAP_PATH='/awards-sitemap.xml';
export const AWARD_SITEMAP_URLS=Object.freeze([AWARD_PILOT_URL,...AWARD_DETAIL_PAGES.map(awardPageUrl)]);
export const BADGE_SITEMAP_PATH='/badges-sitemap.xml';
export const BADGE_SITEMAP_URLS=Object.freeze([
 'https://recognition-direct.com/pages/express-one-name-badges',
 'https://recognition-direct.com/pages/employee-badge-ordering-guide',
]);
const xmlEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

export function awardSitemapXml(){
 const urls=[...new Set(AWARD_SITEMAP_URLS)];
 for(const value of urls){const url=new URL(value);if(url.origin!=='https://recognition-direct.com'||!/^\/pages\/[a-z0-9-]+$/.test(url.pathname)||url.search||url.hash)throw new Error('Invalid published award URL');}
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(url=>'  <url><loc>'+xmlEscape(url)+'</loc></url>').join('\n')+'\n</urlset>\n';
}

export function serveAwardSitemap(req,res,url){
 const generate=url.pathname===AWARD_SITEMAP_PATH?awardSitemapXml:url.pathname===BADGE_SITEMAP_PATH?badgeSitemapXml:null;
 if(!generate||!['GET','HEAD'].includes(req.method))return false;
 const xml=generate();
 res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8','Content-Length':Buffer.byteLength(xml),'Cache-Control':'public, max-age=300'});
 res.end(req.method==='HEAD'?undefined:xml);
 return true;
}

export function badgeSitemapXml(){
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+BADGE_SITEMAP_URLS.map(url=>'  <url><loc>'+xmlEscape(url)+'</loc></url>').join('\n')+'\n</urlset>\n';
}
