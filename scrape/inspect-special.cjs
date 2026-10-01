const cheerio=require('cheerio');
const p=require('../data/pages.json');
const bad=x=>x.path.includes('www.')||(x.title==='Young Carers'&&x.path!=='/info/young-carers');
for (const x of Object.values(p).filter(x=>!bad(x)&&['info','news'].includes(x.type))) {
  const $=cheerio.load(x.mainHtml||'');
  const f=[]; 
  if($('.carousel').length) f.push('carousel');
  if($('.collapse').length) f.push('collapse');
  if($('.modal').length) f.push('modal');
  if($('script').length) f.push('script:'+$('script').html().slice(0,200).replace(/\s+/g,' '));
  if($('style').length) f.push('style:'+$('style').html().slice(0,300).replace(/\s+/g,' '));
  if($('video,audio').length) f.push('media');
  if($('button').length) f.push('button');
  if($('iframe').length) f.push('iframe');
  if($('form').length) f.push('form');
  if(f.length) console.log(x.path, f.join(' | '));
}
const c=cheerio.load(p['/info/governors'].mainHtml); console.log(p['/info/governors'].mainHtml.slice(0,1500));
