const cheerio=require('cheerio');
const p=require('../data/pages.json');
const bad=x=>x.path.includes('www.')||(x.title==='Young Carers'&&x.path!=='/info/young-carers');
const v=Object.values(p).filter(x=>!bad(x)&&['info','news'].includes(x.type));
const tags={},classes={},iframes=new Set(),hosts={};let styles=0;
for(const x of v){const $=cheerio.load(x.mainHtml||'');$('*').each((_,e)=>{tags[e.tagName]=(tags[e.tagName]||0)+1;($(e).attr('class')||'').split(/\s+/).filter(Boolean).forEach(c=>classes[c]=(classes[c]||0)+1); if($(e).attr('style'))styles++;});
$('iframe').each((_,e)=>{iframes.add($(e).attr('src'))});
$('a[href]').each((_,a)=>{try{const h=new URL($(a).attr('href'),'https://www.kingsdownschool.co.uk').hostname;hosts[h]=(hosts[h]||0)+1}catch{}})}
console.log(JSON.stringify(tags));console.log(JSON.stringify(Object.entries(classes).sort((a,b)=>b[1]-a[1]).slice(0,70)));console.log('styles',styles);console.log([...iframes]);console.log(JSON.stringify(hosts));
