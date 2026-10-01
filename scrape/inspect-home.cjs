const cheerio=require('cheerio');
const p=require('../data/pages.json');
const a=p['/info/kingsdown-news'].items.map(i=>i.href), all=new Set(), trips=new Set();
for (const k in p){ if(p[k].type!=='news-index') continue; for(const i of p[k].items){ (k.includes('school-trips')?trips:all).add(i.href) } }
console.log('all news', all.size, 'trips', trips.size, 'same?', [...trips].every(x=>all.has(x)) && trips.size===all.size);
const news=Object.values(p).filter(x=>x.type==='news'); console.log('news pages', news.length);
const $=cheerio.load(p['/'].mainHtml);
console.log('ANNOUNCE', $('.announcement').html()?.replace(/\s+/g,' '));
console.log('CHOOSE BANNER', $('a[href*="choose-us"]').first().closest('.container-fluid').html()?.replace(/\s+/g,' ').slice(0,1500));
console.log('NEWS HOME', $('h2:contains("Kingsdown"), h3:contains("Kingsdown")').first().closest('.container').html()?.replace(/\s+/g,' ').slice(0,800));
console.log('FOOTER', $('.container-fluid.bg-navy').last().html()?.replace(/\s+/g,' '));
console.log('META', $('meta[name=description]').attr('content'));
