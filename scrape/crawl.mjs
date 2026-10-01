// Crawls www.kingsdownschool.co.uk and saves every page's content to data/pages.json.
// Documents (PDF/DOCX/etc.) and images are not downloaded: the new site links to the originals.
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://www.kingsdownschool.co.uk';
const OUT = path.resolve(import.meta.dirname, '../data');
const MAX_PAGES = 900;
const FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|svg|mp4|mp3|zip|csv|txt)$/i;

fs.mkdirSync(OUT, { recursive: true });

const normalise = (href, base) => {
  try {
    const u = new URL(href, base);
    if (!/^(www\.)?kingsdownschool\.co\.uk$/i.test(u.hostname)) return null;
    if (FILE_EXT.test(u.pathname)) return null;
    if (u.pathname.startsWith('/images/') || u.pathname.startsWith('/stylesheets/')) return null;
    u.hostname = 'www.kingsdownschool.co.uk';
    u.protocol = 'https:';
    u.hash = '';
    let p = u.pathname.replace(/\/+$/, '') || '/';
    return ORIGIN + p + u.search;
  } catch { return null; }
};

const queue = [ORIGIN + '/'];
const seen = new Set(queue);
const pages = {};
const failures = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchHtml(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (site-content-audit)' }, redirect: 'follow' });
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('text/html')) return { status: r.status, skip: true, finalUrl: r.url };
      return { status: r.status, html: await r.text(), finalUrl: r.url };
    } catch (e) {
      await sleep(800 * (attempt + 1));
      if (attempt === 2) throw e;
    }
  }
}

function extract(url, html) {
  const $ = cheerio.load(html);
  const pathName = new URL(url).pathname.replace(/\/+$/, '') || '/';
  const page = { url, path: pathName, docTitle: $('title').text().trim() };

  // breadcrumb
  page.breadcrumb = $('.container-fluid.bg-gold .container').first().text().replace(/\s+/g, ' ').trim();

  // sidebar "In this section"
  const side = $('.sidenav').first();
  if (side.length) {
    page.sectionTitle = side.find('h5').first().text().trim();
    page.sectionLinks = side.find('a').map((_, a) => ({ text: $(a).text().trim(), href: $(a).attr('href') })).get();
  }

  const info = $('.container-fluid.info').first();

  if (pathName === '/') {
    page.type = 'home';
    page.mainHtml = $('body').html();
  } else if (pathName === '/choose-us') {
    page.type = 'choose-us';
    page.mainHtml = $('.container-fluid.choose-us').map((_, e) => $.html(e)).get().join('\n');
    // any other content blocks between header and footer
    page.extraHtml = $('body > div > .container-fluid').filter((_, e) => {
      const c = $(e).attr('class') || '';
      return !c.includes('bg-gold') && !c.includes('choose-us') && !(c.trim() === 'container-fluid bg-navy');
    }).map((_, e) => $.html(e)).get().join('\n');
  } else {
    // main column = the column that holds the h1
    let col = info.find('h1').first().closest('[class*="col-"]');
    if (!col.length) col = info.find('.col-12.col-md-8').first();
    if (pathName.startsWith('/news/')) page.type = 'news';
    else if (pathName === '/info/kingsdown-news' || pathName.startsWith('/info/kingsdown-news')) page.type = 'news-index';
    else if (pathName === '/vacancies') page.type = 'vacancies';
    else page.type = 'info';

    page.title = col.find('h1').first().text().replace(/\s+/g, ' ').trim();
    page.titleHtml = col.find('h1').first().html()?.trim();

    if (page.type === 'news') {
      page.date = col.find('p.date').first().text().trim();
    }

    if (page.type === 'news-index') {
      // whole listing, we rebuild it from the items
      page.items = [];
      info.find('.news a[href*="/news/"]').each((_, a) => {
        const href = $(a).attr('href');
        const h = $(a).find('h2,h5,h6').first().text().trim();
        if (!h) return;
        const wrap = $(a).closest('[class*="col-"]').parent().closest('[class*="news"]');
        const block = $(a).parent();
        const bgEl = block.find('.news-image').first();
        const bg = (bgEl.attr('style') || '').match(/url\('?([^')]+)'?\)/)?.[1];
        const date = block.find('p.date').first().text().trim();
        page.items.push({ href, title: h, image: bg, date });
      });
      page.introHtml = info.find('h1').first().nextAll('p').first().toString();
      page.paginationHtml = $.html(info.find('.pagination'));
      page.mainHtml = info.html();
    } else if (page.type === 'vacancies') {
      page.mainHtml = info.find('.col-md-8').first().html();
      page.scripts = $('script').map((_, s) => $(s).attr('src') || $(s).html()).get().filter(s => /mnt|mynewterm|vacanc/i.test(s));
    } else {
      const clone = col.clone();
      clone.find('h1').first().remove();
      if (page.type === 'news') clone.find('p.date').first().closest('.row').remove();
      page.mainHtml = clone.html()?.trim();
    }

    // right-hand sidebar images (Choose Kingsdown / Wellbeing promo buttons)
    page.promos = info.find('.sidebar').last().find('a:has(img)').map((_, a) => ({ href: $(a).attr('href'), img: $(a).find('img').attr('src'), alt: $(a).find('img').attr('alt') })).get();
  }

  page.text = (page.type === 'home' ? $('body') : info.length ? info : $('body')).text().replace(/\s+/g, ' ').trim();

  // links to follow
  const links = $('a[href]').map((_, a) => $(a).attr('href')).get();
  return { page, links };
}

let count = 0;
while (queue.length && count < MAX_PAGES) {
  const batch = queue.splice(0, 6);
  await Promise.all(batch.map(async url => {
    try {
      const res = await fetchHtml(url);
      if (res.skip) return;
      if (res.status >= 400) { failures.push({ url, status: res.status }); return; }
      const { page, links } = extract(url, res.html);
      page.status = res.status;
      if (res.finalUrl && normalise(res.finalUrl) !== url) page.redirectedTo = res.finalUrl;
      pages[page.path] = page;
      count++;
      for (const l of links) {
        const n = normalise(l, url);
        if (n && !seen.has(n)) { seen.add(n); queue.push(n); }
      }
    } catch (e) {
      failures.push({ url, error: String(e) });
    }
  }));
  process.stdout.write(`\r${count} pages, ${queue.length} queued   `);
  await sleep(150);
}

fs.writeFileSync(path.join(OUT, 'pages.json'), JSON.stringify(pages, null, 1));
fs.writeFileSync(path.join(OUT, 'failures.json'), JSON.stringify(failures, null, 1));
console.log(`\nDone: ${count} pages saved, ${failures.length} failures, ${queue.length} left in queue.`);
