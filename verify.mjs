// Checks the rebuilt site against the crawl of the current site:
// 1. every word, link and image in each original page's content is on the new page
// 2. every internal link in the new site resolves to a built page
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const SITE = path.join(ROOT, 'site');
const ORIGIN = 'https://www.kingsdownschool.co.uk';
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));
const REDIRECTS = { '/info/term-dates': 1, '/info/cohort-kds-2030': 1, '/info/wellbeing-and-mental-health-strategy': 1, '/info/privacy-policy': 1 };

const fileFor = p => p === '/' ? path.join(SITE, 'index.html') : path.join(SITE, ...p.split('/').filter(Boolean), 'index.html');
const words = t => (t.toLowerCase().normalize('NFKD').match(/[a-z0-9]+/g) || []);
const bag = arr => arr.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
const normUrl = h => {
  if (!h) return null;
  h = h.trim();
  if (/^(mailto:|tel:)/i.test(h)) return h.toLowerCase().replace(/\.$/, '');
  if (h.startsWith('#') || /^javascript:/i.test(h)) return null;
  if (/^www\./i.test(h)) h = 'https://' + h;
  try {
    const u = new URL(h, ORIGIN + '/');
    if (/kingsdownschool\.co\.uk$/i.test(u.hostname) && !u.pathname.startsWith('/images/') && !/\.[a-z0-9]{2,5}$/i.test(u.pathname)) return (decodeURIComponent(u.pathname).replace(/\/+$/, '') || '/').toLowerCase();
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch { return h.toLowerCase(); }
};
const imgSrcs = $ => {
  const out = new Set();
  $('img[src]').each((_, i) => out.add(normUrl($(i).attr('src'))));
  $('[style*="url("]').each((_, e) => { const m = ($(e).attr('style') || '').match(/url\(\s*['"]?([^'")]+)/); if (m) out.add(normUrl(m[1])); });
  return out;
};
const ytIds = html => new Set([...(html || '').matchAll(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/|i\.ytimg\.com\/vi\/|v=)([\w-]{11})/g)].map(m => m[1]));

const report = { pages: 0, perfect: 0, issues: [] };
for (const p of Object.values(raw)) {
  if (p.path.includes('/www.') || REDIRECTS[p.path]) continue;
  if (!['info', 'news', 'choose-us', 'home'].includes(p.type)) continue;
  const f = fileFor(p.path);
  if (!fs.existsSync(f)) { report.issues.push({ page: p.path, problem: 'page missing' }); continue; }
  report.pages++;
  const $new = cheerio.load(fs.readFileSync(f, 'utf8').replace(/</g, ' <'));
  $new('script, style').remove();
  let origHtml = p.mainHtml || '';
  let $orig;
  if (p.type === 'home') {
    $orig = cheerio.load(origHtml);
    // content blocks of the homepage only (menus, cookie script and footer are rebuilt from the same data)
    const keep = ['.announcement', '#header-slider', '.modal-body', '.container-fluid.bg-royalblue'].map(s => $orig(s).html() || '').join(' ');
    const whyChoose = $orig('a[href*="choose-us"]').first().closest('.row').parent().html() || '';
    origHtml = keep + whyChoose;
  }
  $orig = cheerio.load(`<div>${origHtml.replace(/</g, ' <')}</div>`);
  $orig('script, style').remove();
  const title = p.type === 'choose-us' ? '' : (p.title || '');
  const want = bag(words(title + ' ' + (p.date || '') + ' ' + $orig.text()));
  const have = bag(words($new('body').text() + ' ' + $new('img').map((_, i) => $new(i).attr('alt')).get().join(' ') + ' ' + $new('[aria-label]').map((_, i) => $new(i).attr('aria-label')).get().join(' ')));
  const missingWords = [];
  let total = 0, found = 0;
  for (const [w, n] of want) { total += n; const h = Math.min(n, have.get(w) || 0); found += h; if (h < n) missingWords.push(`${w}${n - h > 1 ? ' x' + (n - h) : ''}`); }
  const wantLinks = new Set($orig('a[href]').map((_, a) => normUrl($orig(a).attr('href'))).get().filter(Boolean));
  const haveLinks = new Set($new('a[href]').map((_, a) => normUrl($new(a).attr('href'))).get().filter(Boolean));
  const missingLinks = [...wantLinks].filter(l => !haveLinks.has(l) && !haveLinks.has(l.replace(/^www\./, '')) && !/^\/info\/(www\.|term-dates$|cohort-kds-2030|wellbeing-and-mental-health-strategy|privacy-policy)/.test(l) && !/^www\./.test(l));
  const wantImgs = imgSrcs($orig), haveImgs = imgSrcs($new);
  const missingImgs = [...wantImgs].filter(s => s && !haveImgs.has(s));
  const wantYt = ytIds(origHtml), haveYt = ytIds($new.html());
  const missingYt = [...wantYt].filter(id => !haveYt.has(id));
  const coverage = total ? found / total : 1;
  if (coverage < 1 || missingLinks.length || missingImgs.length || missingYt.length) {
    report.issues.push({ page: p.path, coverage: +(coverage * 100).toFixed(2), missingWords: missingWords.slice(0, 25), missingLinks, missingImgs, missingYt });
  } else report.perfect++;
}

// internal link check across the whole built site
const builtPaths = new Set();
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const fp = path.join(d, f.name); if (f.isDirectory()) walk(fp); else if (f.name === 'index.html') builtPaths.add(('/' + path.relative(SITE, path.dirname(fp)).split(path.sep).join('/')).replace(/\/$/, '') || '/'); } };
walk(SITE);
const lower = new Set([...builtPaths].map(p => p.toLowerCase()));
const broken = new Map();
for (const p of builtPaths) {
  const $ = cheerio.load(fs.readFileSync(fileFor(p), 'utf8'));
  $('a[href^="/"]').each((_, a) => {
    const h = $(a).attr('href').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    if (h.startsWith('/assets/')) return;
    if (!lower.has(h.toLowerCase())) broken.set(h, (broken.get(h) || []).concat(p).slice(0, 3));
  });
}

const summary = {
  pagesChecked: report.pages,
  pagesWithEverything: report.perfect,
  pagesWithDifferences: report.issues.length,
  brokenInternalLinks: [...broken].map(([href, from]) => ({ href, from })),
};
fs.writeFileSync(path.join(ROOT, 'data/verify-report.json'), JSON.stringify({ summary, issues: report.issues }, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const i of report.issues.slice(0, 40)) console.log(JSON.stringify(i));
