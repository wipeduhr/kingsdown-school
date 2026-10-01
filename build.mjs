// Builds the redesigned Kingsdown School site from the crawled content in data/pages.json.
// Every page keeps its original URL. Images and documents stay on the school's own server.
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const OUT = path.join(ROOT, 'site');
const ORIGIN = 'https://www.kingsdownschool.co.uk';
const SYS = ORIGIN + '/images/sys_images/';
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));

// Pages that are dead on the current site (they render another page's template) -> live equivalent.
const REDIRECTS = {
  '/info/term-dates': '/info/term-dates-school-day',
  '/info/cohort-kds-2030': '/info/cohort-kds-2031',
  '/info/wellbeing-and-mental-health-strategy': '/info/wellbeing-and-mental-health',
  '/info/privacy-policy': '/info/policies',
};
const fixes = [];
const isJunk = p => p.path.includes('/www.') || REDIRECTS[p.path];
const pages = Object.fromEntries(Object.entries(raw).filter(([, p]) => !isJunk(p)));

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------- links ----------
function resolveHref(href, base = ORIGIN + '/', from = '') {
  if (!href) return href;
  href = href.trim();
  if (/^(mailto:|tel:|#|javascript:)/i.test(href)) return href;
  if (/^www\./i.test(href)) {
    fixes.push({ page: from, was: href, now: 'https://' + href, why: 'missing https:// so it looped back into the school site' });
    return 'https://' + href;
  }
  let u;
  try { u = new URL(href, base); } catch { return href; }
  if (!/^(www\.)?kingsdownschool\.co\.uk$/i.test(u.hostname)) return u.href;
  if (u.pathname.startsWith('/images/') || /\.[a-z0-9]{2,5}$/i.test(u.pathname)) return ORIGIN + u.pathname + u.search + u.hash;
  let p = decodeURIComponent(u.pathname).replace(/\/+$/, '') || '/';
  if (REDIRECTS[p]) {
    fixes.push({ page: from, was: p, now: REDIRECTS[p], why: 'dead page on the current site' });
    p = REDIRECTS[p];
  }
  return p + u.search + u.hash;
}
const abs = src => {
  if (!src) return src;
  if (/^(data:|https?:)/i.test(src)) return src.replace(/^http:\/\/(www\.)?kingsdownschool/i, 'https://www.kingsdownschool');
  try { return new URL(src, ORIGIN + '/').href; } catch { return src; }
};
const isExternal = h => /^https?:/i.test(h) && !h.startsWith(ORIGIN + '/images/');
const docType = h => {
  const m = (h || '').toLowerCase().match(/\.(pdf|docx?|xlsx?|pptx?|csv|zip|mp4|mp3)(\?|#|$)/);
  return m ? m[1] : null;
};
const DOC_ICON = { pdf: 'file-pdf', doc: 'file-doc', docx: 'file-doc', xls: 'file-xls', xlsx: 'file-xls', ppt: 'file-ppt', pptx: 'file-ppt', csv: 'file-xls', zip: 'file', mp4: 'play', mp3: 'play' };
const ytId = src => (src || '').match(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/|v=)([\w-]{11})/)?.[1];

// ---------- navigation (taken from the current site's menu) ----------
const $home = cheerio.load(raw['/'].mainHtml);
const NAV = [];
$home('#navbar1 .navbar-nav').first().children('li').each((_, li) => {
  const a = $home(li).children('a').first();
  const href = a.attr('href');
  NAV.push({
    label: clean(a.text()),
    href: href && href !== '#' ? resolveHref(href) : null,
    children: $home(li).find('.dropdown-item').map((_, d) => ({ text: clean($home(d).text()), href: resolveHref($home(d).attr('href')) })).get(),
  });
});

const PORTALS = [
  { text: 'School Mail', href: 'https://accounts.google.com/AccountChooser?continue=https://gmail.google.com' },
  { text: 'Student Portal', href: 'https://sites.google.com/kingsdown.school/studentportal/home' },
  { text: 'Parent Portal', href: 'https://sites.google.com/kingsdownschool.co.uk/kdsparentportal/parent-main-page' },
  { text: 'SHARP', href: 'https://kingsdown.thesharpsystem.com/' },
];
const SOCIAL = [
  { icon: 'facebook-logo', label: 'Like Kingsdown on Facebook', href: 'https://www.facebook.com/KingsdownSchoolSwindon/' },
  { icon: 'x-logo', label: 'Follow Kingsdown on X', href: 'https://twitter.com/kingsdownschool' },
  { icon: 'instagram-logo', label: 'Follow Kingsdown on Instagram', href: 'https://www.instagram.com/kingsdownschool' },
  { icon: 'envelope-simple', label: 'Email Kingsdown School', href: 'mailto:enquiries@kingsdownschool.co.uk' },
];

// ---------- news ----------
const indexPaths = Object.keys(pages)
  .filter(k => /^\/info\/kingsdown-news(\/P\d+)?$/.test(k))
  .sort((a, b) => (+(a.match(/P(\d+)/)?.[1] ?? 0)) - (+(b.match(/P(\d+)/)?.[1] ?? 0)));
const NEWS = [];
const seenNews = new Set();
for (const ip of indexPaths) {
  for (const it of pages[ip].items) {
    const p = resolveHref(it.href);
    if (seenNews.has(p)) continue;
    seenNews.add(p);
    const article = pages[p];
    let image = it.image ? abs(it.image) : null;
    if (!image && article) image = abs(cheerio.load(article.mainHtml || '')('img').first().attr('src'));
    NEWS.push({ path: p, title: article?.title || clean(it.title), date: clean(it.date || article?.date), image: image || SYS + 'KingsdownSchool_drone.webp' });
  }
}
// any article the index did not list
for (const p of Object.values(pages).filter(p => p.type === 'news' && !seenNews.has(p.path))) {
  NEWS.push({ path: p.path, title: p.title, date: clean(p.date), image: abs(cheerio.load(p.mainHtml || '')('img').first().attr('src')) || SYS + 'KingsdownSchool_drone.webp' });
}
const newsByPath = Object.fromEntries(NEWS.map((n, i) => [n.path, { ...n, i }]));

// ---------- content transformer ----------
function transform(html, from) {
  const $ = cheerio.load(`<div id="__root">${html || ''}</div>`, null, false);
  const root = $('#__root');

  root.find('script').remove();
  root.find('a[href]').each((_, a) => {
    const $a = $(a);
    const h = resolveHref($a.attr('href'), ORIGIN + from, from);
    $a.attr('href', h);
    $a.removeAttr('onclick');
    const dt = docType(h);
    if (dt && !$a.find('img').length) {
      $a.addClass('doc-link').attr('target', '_blank').attr('rel', 'noopener');
      if (!$a.find('.ph').length) $a.prepend(`<i class="ph ph-${DOC_ICON[dt]}" aria-hidden="true"></i>`);
    } else if (isExternal(h)) {
      $a.attr('target', '_blank').attr('rel', 'noopener');
      if (!$a.find('img').length && clean($a.text())) $a.addClass('ext');
    }
  });
  root.find('img').each((_, img) => {
    const $i = $(img);
    $i.attr('src', abs($i.attr('src'))).attr('loading', 'lazy').attr('decoding', 'async');
    if (!$i.closest('a').length) $i.attr('data-zoom', '');
    $i.removeAttr('width').removeAttr('height').removeAttr('style');
  });
  root.find('[style]').each((_, e) => {
    const s = $(e).attr('style');
    if (/url\(/.test(s)) $(e).attr('style', s.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (_, u) => `url('${abs(u)}')`));
  });
  root.find('source[src], video[src], audio[src]').each((_, e) => { $(e).attr('src', abs($(e).attr('src'))); });

  // Bootstrap carousels -> swipeable gallery
  root.find('.carousel').each((_, c) => {
    const imgs = $(c).find('.carousel-item img').map((_, i) => `<figure class="gallery__item"><img src="${esc(abs($(i).attr('src')))}" alt="${esc($(i).attr('alt') || '')}" loading="lazy" data-zoom></figure>`).get();
    $(c).replaceWith(`<div class="gallery" data-gallery><div class="gallery__track">${imgs.join('')}</div><div class="gallery__nav"><button type="button" class="icon-btn" data-gallery-prev aria-label="Previous photo"><i class="ph ph-caret-left"></i></button><span class="gallery__count" data-gallery-count>1 / ${imgs.length}</span><button type="button" class="icon-btn" data-gallery-next aria-label="Next photo"><i class="ph ph-caret-right"></i></button></div></div>`);
  });

  // Bootstrap accordions -> <details>
  root.find('.card').each((_, card) => {
    const $card = $(card);
    const head = $card.children('.card-header');
    const body = $card.find('.collapse').first();
    if (!head.length || !body.length) return;
    const label = head.text().trim();
    const inner = body.find('.card-body').length ? body.find('.card-body').html() : body.html();
    $card.replaceWith(`<details class="acc"><summary><span>${esc(label)}</span><i class="ph ph-plus" aria-hidden="true"></i></summary><div class="acc__body">${inner}</div></details>`);
  });

  // Bootstrap modals -> <dialog>
  root.find('.modal').each((_, m) => {
    const $m = $(m);
    const id = $m.attr('id');
    const title = $m.find('.modal-title').html() || '';
    const body = $m.find('.modal-body').html() || '';
    $m.replaceWith(`<dialog class="content-dialog" id="${esc(id)}"><div class="content-dialog__head"><h3>${title}</h3><button type="button" class="icon-btn" data-dialog-close aria-label="Close"><i class="ph ph-x"></i></button></div><div class="content-dialog__body">${body}</div></dialog>`);
  });
  root.find('[data-toggle="modal"]').each((_, b) => {
    $(b).attr('data-dialog-open', ($(b).attr('data-target') || '').replace('#', '')).removeAttr('data-toggle').removeAttr('data-target').addClass('btn btn--primary');
  });

  // video embeds -> lightweight click-to-play
  root.find('iframe').each((_, f) => {
    const $f = $(f);
    const src = $f.attr('src') || '';
    const id = ytId(src);
    if (id) {
      $f.closest('.embed-responsive, .video-container').length ? $f.closest('.embed-responsive, .video-container').replaceWith(ytFacade(id, $f.attr('title') || 'Play video')) : $f.replaceWith(ytFacade(id, $f.attr('title') || 'Play video'));
    } else {
      $f.attr('loading', 'lazy');
      if (/vimeo|lmiforall/.test(src)) $f.wrap('<div class="embed"></div>');
      else $f.wrap('<div class="embed embed--free"></div>');
    }
  });
  root.find('a[href*="youtu"]').each((_, a) => { if (!$(a).hasClass('ext')) return; $(a).addClass('video-link'); });

  root.find('.alumni a').each((_, a) => { $(a).attr('data-tilt', '').addClass('alumni-card'); });
  root.find('table').each((_, t) => { $(t).removeAttr('style').removeAttr('width').removeAttr('border'); $(t).wrap('<div class="table-wrap"></div>'); });
  root.find('p').each((_, p) => { if (!clean($(p).text()) && !$(p).find('img,iframe,video,a').length) $(p).remove(); });
  return root.html();
}

function ytFacade(id, label = 'Play video', caption = '') {
  return `<div class="yt" data-yt="${id}"><button type="button" class="yt__btn" aria-label="${esc(label)}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy"><span class="yt__play"><i class="ph-fill ph-play"></i></span></button></div>${caption ? `<p class="yt__caption">${esc(caption)}</p>` : ''}`;
}

// ---------- chrome ----------
const navMenu = (item, i) => {
  if (!item.children.length) return `<li class="nav-item"><a class="nav-link" href="${esc(item.href)}">${esc(item.label)}</a></li>`;
  const n = item.children.length;
  const cols = n > 20 ? 4 : n > 10 ? 3 : n > 5 ? 2 : 1;
  return `<li class="nav-item has-menu">
    <button class="nav-link" type="button" aria-expanded="false" aria-controls="menu-${i}">${esc(item.label)} <i class="ph ph-caret-down" aria-hidden="true"></i></button>
    <div class="mega${n <= 6 ? ' mega--drop' : ''}" id="menu-${i}">
      <div class="wrap mega__inner${n <= 2 ? ' mega__inner--compact' : ''}">
        <p class="mega__title">${esc(item.label.toLowerCase())}</p>
        <ul class="mega__links" style="--cols:${cols}">${item.children.map((c, j) => `<li style="--i:${j}"><a href="${esc(c.href)}"${isExternal(c.href) ? ' target="_blank" rel="noopener"' : ''}>${esc(c.text)}${isExternal(c.href) ? ' <i class="ph ph-arrow-up-right" aria-hidden="true"></i>' : ''}</a></li>`).join('')}</ul>
      </div>
    </div>
  </li>`;
};

const header = currentPath => `
<div class="utility">
  <div class="wrap utility__inner">
    <nav class="portal-links" aria-label="Portals">${PORTALS.map(p => `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.text)}</a>`).join('')}</nav>
  </div>
</div>
<header class="masthead">
  <div class="wrap masthead__inner">
    <a class="brand" href="/" aria-label="Kingsdown School home"><img src="${SYS}KingsdownLogo.png" alt="Kingsdown School" width="352" height="92"></a>
    <div class="masthead__tools">
      <a class="tel" href="tel:+441793822284"><i class="ph ph-phone" aria-hidden="true"></i><span>01793 822284</span></a>
      <span class="divider" aria-hidden="true"></span>
      <div class="socials">${SOCIAL.map(s => `<a href="${s.href}" aria-label="${esc(s.label)}" title="${esc(s.label)}"${s.href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}><i class="ph ph-${s.icon}"></i></a>`).join('')}</div>
      <span class="divider" aria-hidden="true"></span>
      <button class="search-trigger" type="button" data-search-open aria-label="Search the Kingsdown School website"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><span>Search</span><kbd>Ctrl K</kbd></button>
    </div>
    <button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="primary-nav"><span class="menu-toggle__bars" aria-hidden="true"><span></span><span></span></span><span class="sr-only">Menu</span></button>
  </div>
</header>
<nav class="primary-nav" id="primary-nav" aria-label="Main">
  <div class="wrap primary-nav__inner">
    <a class="mini-brand" href="/" aria-label="Kingsdown School home" tabindex="-1"><img src="${SYS}KingsdownLogo.png" alt="" width="352" height="92"></a>
    <ul class="nav-list">${NAV.map(navMenu).join('')}</ul>
    <button class="search-trigger search-trigger--mini" type="button" data-search-open aria-label="Search"><i class="ph ph-magnifying-glass"></i></button>
  </div>
  <div class="drawer-extras">
    <div class="drawer-portals">${PORTALS.map(p => `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.text)}</a>`).join('')}</div>
    <div class="drawer-contact"><a href="tel:+441793822284"><i class="ph ph-phone"></i> 01793 822284</a><div class="socials">${SOCIAL.map(s => `<a href="${s.href}" aria-label="${esc(s.label)}"><i class="ph ph-${s.icon}"></i></a>`).join('')}</div></div>
  </div>
</nav>`;

const footer = () => `
<footer class="site-footer">
  <div class="wrap footer__grid">
    <div class="footer__school" data-reveal>
      <h3>Kingsdown School</h3>
      <p class="footer__address"><i class="ph ph-map-pin" aria-hidden="true"></i> Hyde Road, Stratton&nbsp;St&nbsp;Margaret, Swindon&nbsp;SN2&nbsp;7SH</p>
      <p class="footer__tel">Tel: <a href="tel:+441793822284">01793 822284</a></p>
      <p class="footer__small">Please note, all calls are recorded for monitoring and training purposes.<br>If you would like a hard copy of anything on the website please contact <a href="mailto:enquiries@kingsdownschool.co.uk">enquiries@kingsdownschool.co.uk</a></p>
      <div class="socials socials--footer">${SOCIAL.map(s => `<a href="${s.href}" aria-label="${esc(s.label)}" title="${esc(s.label)}"${s.href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}><i class="ph ph-${s.icon}"></i></a>`).join('')}</div>
    </div>
    <div class="footer__trust" data-reveal>
      <p class="footer__label">Part of the</p>
      <a class="rlt-logo" href="https://riverlearningtrust.org/" target="_blank" rel="noopener" title="River Learning Trust"><img src="${SYS}RLTLogo.png" alt="River Learning Trust" width="160" height="45" loading="lazy"></a>
      <p class="footer__small">Kingsdown School is an academy which is a part of the River Learning Trust which is an exempt charitable company limited by guarantee registered in&nbsp;England and Wales with registered company number&nbsp;7966500 and its registered office is River Learning Trust, Central Office C/O Rose Hill Primary School, The Oval, Oxford, OX4&nbsp;4HF</p>
    </div>
    <div class="footer__badges" data-reveal>
      <a class="sharp-logo" href="https://kingsdown.thesharpsystem.com/" target="_blank" rel="noopener" title="The Sharp System"><img src="${SYS}KDS-Sharp_Text.png" alt="The Sharp System" width="130" height="62" loading="lazy"></a>
      <a class="coin" href="/info/ofsted-reports" title="Ofsted Good"><span class="coin__inner"><img src="${SYS}Ofsted-good-logo.png" alt="Ofsted Good" width="96" height="96" loading="lazy"></span></a>
    </div>
  </div>
  <div class="footer__bar">
    <div class="wrap footer__bar-inner">
      <small>&copy; 2026 Kingsdown School <span aria-hidden="true">|</span> <a href="/info/policies" title="Privacy Policies">Privacy Policies</a></small>
      <small>Website Design by <a href="https://github.com/wipeduhr" target="_blank" rel="noopener" title="Ethan Angell on GitHub">Ethan Angell</a></small>
    </div>
  </div>
</footer>`;

const overlays = ({ ofsted = false } = {}) => `
<dialog class="search" data-search aria-label="Search the website">
  <div class="search__panel">
    <div class="search__bar">
      <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
      <input type="search" placeholder="Search pages, news, policies and documents" aria-label="Search" data-search-input autocomplete="off">
      <button type="button" class="icon-btn" data-search-close aria-label="Close search"><i class="ph ph-x"></i></button>
    </div>
    <div class="search__results" data-search-results role="listbox">
      <div class="search__hint">
        <p>Popular</p>
        <div class="chips">${['Term Dates - School Day (2026-27)|/info/term-dates-school-day', 'Uniform and Equipment|/info/uniform', 'Attendance & Absence|/info/attendance-absence', 'Admissions Guidance|/info/admissions', 'Policies|/info/policies', 'Catering|/info/catering'].map(x => { const [t, h] = x.split('|'); return `<a class="chip" href="${h}">${esc(t)}</a>`; }).join('')}</div>
      </div>
    </div>
    <div class="search__foot"><span><kbd>&uarr;</kbd><kbd>&darr;</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>
  </div>
</dialog>
<dialog class="lightbox" data-lightbox aria-label="Image viewer">
  <button type="button" class="icon-btn lightbox__close" data-lightbox-close aria-label="Close"><i class="ph ph-x"></i></button>
  <button type="button" class="icon-btn lightbox__prev" data-lightbox-prev aria-label="Previous image"><i class="ph ph-caret-left"></i></button>
  <figure><img alt="" data-lightbox-img><figcaption data-lightbox-cap></figcaption></figure>
  <button type="button" class="icon-btn lightbox__next" data-lightbox-next aria-label="Next image"><i class="ph ph-caret-right"></i></button>
</dialog>
<div class="cookie" data-cookie hidden>
  <p>We use cookies to give you the best experience on our website. If you continue without changing your cookie settings, we assume that you consent to our use of cookies on this device. You can change your cookie settings at any time but if you do, you may lose some functionality on our website. More information can be found in our <a href="/info/policies">Privacy Policy</a>.</p>
  <div class="cookie__actions"><button type="button" class="btn btn--gold" data-cookie-accept>Accept cookies</button><button type="button" class="btn btn--ghost-light" data-cookie-decline>Decline cookies</button></div>
</div>
${ofsted ? `<aside class="ofsted-pop" data-ofsted hidden aria-label="Ofsted Good">
  <button type="button" class="icon-btn ofsted-pop__close" data-ofsted-close aria-label="Close"><i class="ph ph-x"></i></button>
  <img src="${ORIGIN}/images/uploads/Y5qWLqUURRGNbBZfowXv_Ofsted-logo-lrg.jpg" alt="Ofsted" width="1280" height="720">
  <div class="ofsted-pop__body">
    <h3>Ofsted Good</h3>
    <p>We would like to thank and encourage parents and carers to take a moment to read the report which provides valuable insight into the strengths and areas for development within our school.</p>
    <a class="btn btn--primary" href="${ORIGIN}/images/documents/10344807_-_Kingsdown_School_-_145139_-_Final_PDF.pdf" target="_blank" rel="noopener"><i class="ph ph-file-pdf"></i> Read Ofsted Report March 2025</a>
  </div>
</aside>` : ''}
<a href="#top" class="to-top" data-to-top aria-label="Back to top"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="100"></circle></svg><i class="ph ph-arrow-up"></i></a>`;

const layout = ({ title, description, path: p, body, bodyClass = '', ofsted = false, section = '' }) => `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || 'Kingsdown is a mixed 11-16 Secondary School located in Stratton St Margaret, Swindon. We champion each and every student.')}">
<meta name="theme-color" content="#00396B">
<script>document.documentElement.classList.add('js')</script>
<link rel="icon" type="image/png" sizes="32x32" href="${SYS}favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="${SYS}apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/montserrat-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/vendor/phosphor/regular/style.css">
<link rel="stylesheet" href="/assets/vendor/phosphor/fill/style.css">
<link rel="stylesheet" href="/assets/css/site.css">
<script src="/assets/js/site.js" defer></script>
</head>
<body class="${bodyClass}" data-path="${esc(p)}" data-section="${esc(section)}" id="top">
<a class="skip-link" href="#main">Skip to content</a>
<div class="scroll-progress" aria-hidden="true"></div>
${header(p)}
<main id="main">
${body}
</main>
${footer()}
${overlays({ ofsted })}
</body>
</html>`;

// ---------- shared blocks ----------
const newsCard = (n, size = 'sm') => `<a class="news-card news-card--${size}" href="${esc(n.path)}" data-tilt data-reveal>
  <span class="news-card__media"><img src="${esc(n.image)}" alt="" loading="lazy" decoding="async"></span>
  <span class="news-card__body"><span class="news-card__date">${esc(n.date)}</span><span class="news-card__title">${esc(n.title)}</span></span>
  <span class="news-card__glare" aria-hidden="true"></span>
</a>`;

const rail = page => {
  const promos = (page.promos && page.promos.length ? page.promos : [
    { href: ORIGIN + '/choose-us', img: SYS + 'KingsdownSchoolButtons_3.webp', alt: 'Choose Kingsdown School' },
    { href: ORIGIN + '/info/wellbeing-and-mental-health', img: SYS + 'Wellbeing_Mental_Health.webp', alt: 'Wellbeing' },
  ]);
  return `<aside class="rail" aria-label="More from Kingsdown">
    <div class="rail__promos">${promos.map(pr => `<a class="promo" href="${esc(resolveHref(pr.href))}" data-tilt><img src="${esc(abs(pr.img))}" alt="${esc(pr.alt)}" loading="lazy"><span class="news-card__glare" aria-hidden="true"></span></a>`).join('')}</div>
    <div class="rail__news">
      <h2 class="rail__heading"><i class="ph ph-newspaper" aria-hidden="true"></i> Kingsdown <span>News</span></h2>
      ${NEWS.slice(0, 3).map(n => `<a class="rail-news" href="${esc(n.path)}"><span class="rail-news__img"><img src="${esc(n.image)}" alt="" loading="lazy"></span><span><span class="rail-news__title">${esc(n.title)}</span><span class="rail-news__date">${esc(n.date)}</span></span></a>`).join('')}
      <a class="btn btn--primary btn--block" href="/info/kingsdown-news">More news <i class="ph ph-arrow-right"></i></a>
    </div>
  </aside>`;
};

// drop CMS template glitches such as "{title}" that leak into some sidebars on the current site
const cleanSectionLinks = page => (page.sectionLinks || []).filter(l => !/[{}]/.test(l.text + l.href));
const sectionNav = page => {
  const links = cleanSectionLinks(page).map(l => ({ text: l.text, href: resolveHref(l.href) }));
  if (!links.length) return '';
  return `<aside class="section-nav" aria-label="${esc(page.sectionTitle || 'In this section')}">
    <details class="section-nav__box" open>
      <summary><span>${esc(page.sectionTitle || 'In this section')}</span><i class="ph ph-caret-down" aria-hidden="true"></i></summary>
      <ul>${links.map(l => `<li><a href="${esc(l.href)}"${l.href.toLowerCase() === page.path.toLowerCase() ? ' aria-current="page"' : ''}>${esc(l.text)}</a></li>`).join('')}</ul>
    </details>
  </aside>`;
};

// The page's section: the menu named in the old breadcrumb if it really holds the page, else the first menu that does.
const sectionFor = page => {
  if (page.type === 'news' || page.type === 'news-index') return NAV.find(n => n.href === '/info/kingsdown-news');
  if (page.path?.startsWith('/alumni/')) return NAV.find(n => n.children.some(c => c.href === '/info/alumni'));
  const bc = clean(page.breadcrumb).replace(/^Home\s*/, '').toLowerCase();
  const containing = NAV.filter(n => n.children.some(c => c.href.toLowerCase() === (page.path || '').toLowerCase()));
  const fromCrumb = NAV.find(n => bc.startsWith(n.label.toLowerCase()));
  if (fromCrumb && (containing.includes(fromCrumb) || !containing.length)) return fromCrumb;
  return containing[0] || fromCrumb || null;
};

const crumbsFor = page => {
  const trail = [{ text: 'Home', href: '/' }];
  const sec = sectionFor(page);
  if (page.type === 'news') trail.push({ text: 'Kingsdown News', href: '/info/kingsdown-news' });
  else if (page.path?.startsWith('/alumni/')) trail.push({ text: 'Alumni', href: '/info/alumni' });
  else if (sec && page.type !== 'news-index') trail.push({ text: sec.label, href: sec.href || null });
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${trail.map(c => `<li>${c.href ? `<a href="${esc(c.href)}">${esc(c.text)}</a>` : `<span>${esc(c.text)}</span>`}</li>`).join('')}<li><span aria-current="page">${esc(page.title)}</span></li></ol></nav>`;
};

const pageHero = (page, extra = '') => `<section class="page-hero">
  <div class="page-hero__bg" aria-hidden="true"><span></span><span></span><span></span></div>
  <div class="wrap page-hero__inner">
    ${crumbsFor(page)}
    <h1 class="page-hero__title">${esc(page.title)}</h1>
    ${extra}
  </div>
</section>`;

// ---------- page builders ----------
const searchDocs = [];
const written = new Set();
function write(p, html) {
  const file = p === '/' ? path.join(OUT, 'index.html') : path.join(OUT, ...p.split('/').filter(Boolean), 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  written.add(p);
}
const textOf = html => clean(cheerio.load(`<div>${html || ''}</div>`).text());
const describe = html => { const t = textOf(html); return t.length > 155 ? t.slice(0, 152).replace(/\s+\S*$/, '') + '...' : t; };

function buildInfo(page) {
  const content = transform(page.mainHtml, page.path);
  const isNews = page.type === 'news';
  const n = newsByPath[page.path];
  let extra = '';
  if (isNews) {
    const share = encodeURIComponent(ORIGIN + page.path);
    extra = `<div class="page-hero__meta"><span class="page-hero__date"><i class="ph ph-calendar-blank" aria-hidden="true"></i> ${esc(page.date)}</span>
      <span class="share"><a href="https://www.facebook.com/sharer/sharer.php?u=${share}" target="_blank" rel="noopener" aria-label="Share on Facebook" title="Share on Facebook"><i class="ph ph-facebook-logo"></i></a><a href="https://twitter.com/share?url=${share}" target="_blank" rel="noopener" aria-label="Share on X" title="Share on X"><i class="ph ph-x-logo"></i></a><button type="button" data-copy-link aria-label="Copy link" title="Copy link"><i class="ph ph-link"></i></button></span></div>`;
  }
  let pager = '';
  if (isNews && n) {
    const newer = NEWS[n.i - 1], older = NEWS[n.i + 1];
    pager = `<nav class="article-pager" aria-label="More stories">
      ${newer ? `<a class="article-pager__link" href="${esc(newer.path)}"><span class="article-pager__dir"><i class="ph ph-arrow-left"></i> Newer story</span><span class="article-pager__title">${esc(newer.title)}</span></a>` : '<span></span>'}
      ${older ? `<a class="article-pager__link article-pager__link--next" href="${esc(older.path)}"><span class="article-pager__dir">Older story <i class="ph ph-arrow-right"></i></span><span class="article-pager__title">${esc(older.title)}</span></a>` : '<span></span>'}
    </nav>`;
  }
  const body = `${pageHero(page, extra)}
  <div class="wrap page-grid${cleanSectionLinks(page).length ? '' : ' page-grid--no-nav'}">
    ${sectionNav(page)}
    <article class="prose" data-prose>${content}${pager}</article>
    ${rail(page)}
  </div>`;
  const sec = sectionFor(page)?.label || '';
  write(page.path, layout({ title: `${page.title} | Kingsdown School`, description: describe(content), path: page.path, body, bodyClass: `page page--${page.type}`, section: sec }));
  searchDocs.push({ t: page.title, u: page.path, s: isNews ? 'News' : page.path.startsWith('/alumni/') ? 'Alumni' : (sec || 'Kingsdown School'), d: isNews ? clean(page.date) : '', i: isNews ? n?.image : undefined, x: textOf(content).slice(0, 6000) });
}

const PER = 15;
function buildNewsIndex() {
  const intro = 'Keeping parents / carers, students, friends, staff and family members up to date with trips, visits and school activities.';
  const total = Math.ceil(NEWS.length / PER);
  for (const base of ['/info/kingsdown-news', '/info/kingsdown-news/school-trips']) {
    for (let pg = 0; pg < total; pg++) {
      const p = pg === 0 ? base : `${base}/P${pg * PER}`;
      const items = NEWS.slice(pg * PER, pg * PER + PER);
      const pages_ = Array.from({ length: total }, (_, i) => i);
      const pagination = `<nav class="pagination" aria-label="News pages">
        ${pg > 0 ? `<a class="pagination__step" href="${pg - 1 === 0 ? base : `${base}/P${(pg - 1) * PER}`}"><i class="ph ph-caret-left"></i> Newer</a>` : ''}
        <ol>${pages_.map(i => `<li><a href="${i === 0 ? base : `${base}/P${i * PER}`}"${i === pg ? ' aria-current="page"' : ''}>${i + 1}</a></li>`).join('')}</ol>
        ${pg < total - 1 ? `<a class="pagination__step" href="${base}/P${(pg + 1) * PER}">Older <i class="ph ph-caret-right"></i></a>` : ''}
      </nav>`;
      const page = { title: 'Kingsdown News', type: 'news-index', breadcrumb: 'Home Kingsdown News', path: p };
      const body = `${pageHero(page, `<p class="page-hero__lead">${intro}</p>`)}
      <div class="wrap news-index">
        <div class="news-tools" data-reveal>
          <label class="news-filter"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><span class="sr-only">Search all news</span><input type="search" placeholder="Search all ${NEWS.length} news stories" data-news-filter></label>
          <p class="news-tools__count">Page ${pg + 1} of ${total}</p>
        </div>
        <div class="news-results" data-news-results hidden></div>
        <div class="news-grid${pg === 0 ? ' news-grid--lead' : ''}" data-news-grid>${items.map((n, i) => newsCard(n, pg === 0 && i === 0 ? 'lg' : 'sm')).join('')}</div>
        ${pagination}
      </div>`;
      write(p, layout({ title: pg === 0 ? 'Kingsdown News | Kingsdown School' : `Kingsdown News, page ${pg + 1} | Kingsdown School`, description: intro, path: p, body, bodyClass: 'page page--news-index', section: 'News' }));
    }
  }
  searchDocs.push({ t: 'Kingsdown News', u: '/info/kingsdown-news', s: 'News', d: '', x: intro });
}

const BEATS = [
  { name: 'pride', color: '#00A9C7', lines: ['I am proud of who I am and our school.', 'I take advantage of every opportunity.'] },
  { name: 'ambition', color: '#8CC63F', lines: ['I expect the best from myself.', 'I have ambitious aspirations for my future.'] },
  { name: 'stretch', color: '#F7931E', lines: ['I really want to learn and will stretch myself to achieve what I didn’t think possible.'] },
  { name: 'challenge', color: '#D0BA1E', lines: ['I am curious, determined and resilient.', 'Set me a challenge and I will always rise to it.'] },
  { name: 'respect', color: '#C8213F', lines: ['I am kind. I care about others and my surroundings.', 'I encourage and expect others to do the same.'] },
  { name: 'responsibility', color: '#8E50A0', lines: ['We are all part of something special and I am not going to let us down.', 'My attendance really matters.'] },
];
const beats = () => `<section class="beats" aria-labelledby="beats-title">
  <h2 class="sr-only" id="beats-title">The Kingsdown Beats</h2>
  <div class="beats__row">${BEATS.map((b, i) => `<div class="beat" style="--beat:${b.color};--i:${i}" data-tilt data-depth>
    <div class="beat__stripes" aria-hidden="true"><span></span><span></span></div>
    <h3 class="beat__name">${b.name}</h3>
    ${b.lines.map(l => `<p>${esc(l)}</p>`).join('')}
  </div>`).join('')}</div>
</section>`;

const whyChooseBanner = () => `<a class="why-banner" href="/choose-us">
  <span class="wrap why-banner__inner">
    <span class="why-banner__text"><span class="why-banner__title">Why Choose <span>Kingsdown School?</span></span><span class="why-banner__sub">Find out more about our open events for Year 6 students and their families</span></span>
    <span class="why-banner__arrows" aria-hidden="true"><i class="ph ph-caret-right"></i><i class="ph ph-caret-right"></i><i class="ph ph-caret-right"></i></span>
  </span>
</a>`;

function buildHome() {
  const slides = $home('#header-slider .carousel-item').map((_, s) => ({ img: abs($home(s).find('img').first().attr('src')), title: clean($home(s).find('h2').text()) })).get();
  const alts = ['Aerial view of Kingsdown School', 'A student working in the engineering workshop', 'A student learning in a Kingsdown classroom'];
  const ann = $home('.announcement').first();
  const annTitle = clean(ann.find('h3').text());
  const annBody = transform(ann.find('span').first().html() || ann.find('p').first().toString(), '/');
  const welcome = $home('h2:contains("Welcome to Kingsdown")').first().closest('.row');
  const welcomeParas = welcome.find('p').map((_, p) => `<p>${$home(p).html()}</p>`).get().join('');
  const latest = NEWS.slice(0, 5);

  const body = `<h1 class="sr-only">Kingsdown School</h1>
${whyChooseBanner()}
<section class="hero" data-hero aria-roledescription="carousel" aria-label="Kingsdown School highlights">
  <div class="hero__stage" data-hero-stage>
    ${slides.map((s, i) => `<div class="hero__slide${i === 0 ? ' is-active' : ''}" data-slide role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}"${i === 0 ? '' : ' aria-hidden="true"'}>
      <div class="hero__media"><img src="${esc(s.img)}" alt="${esc(alts[i] || '')}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} width="1920" height="750"></div>
      <div class="wrap hero__caption">
        <h2 class="hero__title">${s.title.split(' ').map((w, j) => `<span class="word" style="--w:${j}"><span>${esc(w)}</span></span>`).join(' ')}</h2>
        <a class="coin coin--hero" href="/info/ofsted-reports" title="Ofsted Good"><span class="coin__inner"><img src="${SYS}Ofsted-good-logo.png" alt="Ofsted Good" width="100" height="100"></span></a>
      </div>
    </div>`).join('')}
  </div>
  <div class="wrap hero__controls">
    <button type="button" class="icon-btn icon-btn--glass" data-hero-prev aria-label="Previous slide"><i class="ph ph-caret-left"></i></button>
    <div class="hero__dots">${slides.map((s, i) => `<button type="button" class="hero__dot${i === 0 ? ' is-active' : ''}" data-hero-dot="${i}" aria-label="Show slide ${i + 1}: ${esc(s.title)}"><span></span></button>`).join('')}</div>
    <button type="button" class="icon-btn icon-btn--glass" data-hero-next aria-label="Next slide"><i class="ph ph-caret-right"></i></button>
    <button type="button" class="icon-btn icon-btn--glass" data-hero-pause aria-label="Pause slideshow"><i class="ph ph-pause"></i></button>
  </div>
</section>
<section class="announce" aria-labelledby="announce-title">
  <div class="wrap announce__inner" data-reveal>
    <span class="announce__icon" aria-hidden="true"><i class="ph-fill ph-info"></i></span>
    <div><h2 class="announce__title" id="announce-title">${esc(annTitle)}</h2><div class="announce__body">${annBody}</div></div>
  </div>
</section>
<section class="home-news" aria-labelledby="news-title">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <h2 id="news-title"><i class="ph ph-newspaper" aria-hidden="true"></i> Kingsdown <span>News</span></h2>
      <a class="btn btn--primary" href="/info/kingsdown-news">More news <i class="ph ph-arrow-right"></i></a>
    </div>
    <div class="news-bento">${latest.map((n, i) => newsCard(n, i === 0 ? 'lg' : 'sm')).join('')}</div>
  </div>
</section>
<section class="welcome" aria-labelledby="welcome-title">
  <div class="welcome__bg" aria-hidden="true"></div>
  <div class="wrap welcome__grid">
    <div class="welcome__text" data-reveal>
      <h2 id="welcome-title">Welcome to Kingsdown</h2>
      ${welcomeParas}
      <a class="btn btn--light" href="/info/about-us">Read more <i class="ph ph-arrow-right"></i></a>
    </div>
    <div class="welcome__video tilt-in">${ytFacade('56aORQv8Ie0', 'Play video: We champion each and every student')}</div>
  </div>
</section>
${beats()}`;
  write('/', layout({ title: 'Kingsdown School | We champion each and every student', path: '/', body, bodyClass: 'home', ofsted: true }));
  searchDocs.push({ t: 'Home', u: '/', s: 'Kingsdown School', d: '', x: textOf(welcomeParas) + ' ' + annTitle + ' ' + textOf(annBody) });
}

function buildChooseUs() {
  const $c = cheerio.load(raw['/choose-us'].mainHtml);
  const lead = $c('.sidebar p.large').first().html();
  const desk = $c('.sidebar .d-md-block').first();
  const paras = desk.find('p').map((_, p) => $c(p)).get();
  const bodyParas = paras.filter(p => !p.hasClass('large')).map(p => `<p>${p.html()}</p>`).join('');
  const tour = paras.find(p => p.hasClass('large'));
  const tourText = tour ? clean(tour.text().replace(/head@kingsdownschool\.co\.uk/, '')) : 'To arrange a tour with the Headteacher, email';
  const mainCap = clean($c('.col-lg-8 h6.caption').first().text());
  const tiles = $c('.row').last().children('[class*="col-"]').map((_, col) => {
    const $col = $c(col);
    const cap = clean($col.find('h6').text());
    const ifr = $col.find('iframe').attr('src');
    const vid = $col.find('video source').attr('src');
    const img = $col.find('img').attr('src');
    const href = $col.find('a').attr('href');
    if (ifr) return { kind: 'yt', id: ytId(ifr), cap };
    if (vid) return { kind: 'mp4', src: abs(vid), cap };
    return { kind: 'img', img: abs(img), href: resolveHref(href), alt: $col.find('img').attr('alt'), cap };
  }).get();
  const tileHtml = tiles.map((t, i) => {
    if (t.kind === 'yt') return `<figure class="cu-tile" data-reveal style="--i:${i}">${ytFacade(t.id, 'Play video: ' + t.cap)}<figcaption>${esc(t.cap)}</figcaption></figure>`;
    if (t.kind === 'mp4') return `<figure class="cu-tile" data-reveal style="--i:${i}"><div class="cu-tile__media"><video controls preload="metadata" src="${esc(t.src)}">Your browser does not support the video tag.</video></div><figcaption>${esc(t.cap)}</figcaption></figure>`;
    return `<figure class="cu-tile" data-reveal style="--i:${i}"><a class="cu-tile__media cu-tile__media--link" href="${esc(t.href)}" data-tilt><img src="${esc(t.img)}" alt="${esc(t.alt)}" loading="lazy"><span class="news-card__glare" aria-hidden="true"></span></a><figcaption><a href="${esc(t.href)}">${esc(t.cap)}</a></figcaption></figure>`;
  }).join('');
  const page = { title: 'Why Choose Kingsdown School?', breadcrumb: 'Home Choose Us', path: '/choose-us', type: 'choose-us' };
  const body = `<section class="choose">
    <div class="page-hero__bg" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><span aria-current="page">Choose Us</span></li></ol></nav>
      <h1 class="choose__title">Why Choose<br><span>Kingsdown School?</span></h1>
      <div class="choose__grid">
        <div class="choose__intro" data-reveal>
          <p class="choose__lead">${lead}</p>
          ${bodyParas}
          <p class="choose__tour">${esc(tourText)} <a href="mailto:head@kingsdownschool.co.uk?subject=Headteacher Tour Booking">head@kingsdownschool.co.uk</a></p>
        </div>
        <figure class="choose__feature tilt-in">${ytFacade('56aORQv8Ie0', 'Play video: ' + mainCap)}<figcaption>${esc(mainCap)}</figcaption></figure>
      </div>
      <div class="cu-grid">${tileHtml}</div>
    </div>
  </section>
  ${beats()}`;
  write('/choose-us', layout({ title: 'Why Choose Kingsdown School? | Kingsdown School', description: textOf(lead), path: '/choose-us', body, bodyClass: 'page page--choose', section: 'Admissions' }));
  searchDocs.push({ t: 'Why Choose Kingsdown School?', u: '/choose-us', s: 'Admissions', d: '', x: textOf(lead + bodyParas) + ' ' + tiles.map(t => t.cap).join(' ') });
}

function buildVacancies() {
  const page = { title: 'Vacancies', breadcrumb: 'Home Vacancies', path: '/vacancies', type: 'vacancies' };
  const body = `${pageHero(page)}
  <div class="wrap page-grid page-grid--no-nav">
    <article class="prose prose--wide">
      <div id="mnt-parent-container" class="vacancies-widget"><div class="skeleton-list" aria-label="Loading vacancies"><span></span><span></span><span></span></div></div>
      <p class="vacancies-note">Vacancies are listed through MyNewTerm. You can also train to teach with <a class="ext" href="https://ott-scitt.org.uk/" target="_blank" rel="noopener">Teacher Training</a>.</p>
    </article>
    ${rail({})}
  </div>
  <script>
    (function(){
      var box=document.getElementById('mnt-parent-container');
      // MyNewTerm only serves https sites, so the local preview shows a notice instead
      if(location.protocol!=='https:'){box.innerHTML='<div class="preview-note"><i class="ph ph-info"></i><div><strong>Live vacancies appear here.</strong><p>The vacancy list comes from MyNewTerm, which only runs on the school\\'s secure https:// address, so it cannot load in this local preview.</p><a class="btn btn--primary" href="https://www.kingsdownschool.co.uk/vacancies" target="_blank" rel="noopener">View current vacancies <i class="ph ph-arrow-up-right"></i></a></div></div>';return;}
      var s=document.createElement('script');s.src='https://api.mynewterm.com/assets/v1/dist/js/school_vacancies.js?v='+Date.now();s.onload=function(){try{mntSchoolVacancies('565BBBAE-FF30-43BA-A2B9-09C2535AF6B6',1)}catch(e){}};document.body.appendChild(s);
    })();
  </script>`;
  write('/vacancies', layout({ title: 'Vacancies | Kingsdown School', path: '/vacancies', body, bodyClass: 'page page--vacancies', section: 'Join Us' }));
  searchDocs.push({ t: 'Vacancies', u: '/vacancies', s: 'Join Us', d: '', x: 'Vacancies jobs careers working at Kingsdown School' });
}

function buildRedirects() {
  for (const [from, to] of Object.entries(REDIRECTS)) {
    write(from, `<!doctype html><meta charset="utf-8"><title>Moved</title><meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${to}"><a href="${to}">This page has moved</a>`);
  }
}

function build404() {
  const body = `<section class="page-hero"><div class="page-hero__bg" aria-hidden="true"><span></span><span></span><span></span></div><div class="wrap page-hero__inner"><h1 class="page-hero__title">Page not found</h1><p class="page-hero__lead">Sorry, we could not find that page. Try searching, or head back to the homepage.</p></div></section>
  <div class="wrap notfound"><button class="btn btn--primary" type="button" data-search-open><i class="ph ph-magnifying-glass"></i> Search the website</button> <a class="btn btn--ghost" href="/">Go to the homepage</a></div>`;
  fs.writeFileSync(path.join(OUT, '404.html'), layout({ title: 'Page not found | Kingsdown School', path: '/404', body, bodyClass: 'page' }));
}

// ---------- assets ----------
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, f.name), b = path.join(to, f.name);
    if (f.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}
function copyAssets() {
  copyDir(path.join(ROOT, 'src'), path.join(OUT, 'assets'));
  const fontDir = path.join(ROOT, 'node_modules/@fontsource-variable/montserrat/files');
  fs.mkdirSync(path.join(OUT, 'assets/fonts'), { recursive: true });
  for (const f of ['montserrat-latin-wght-normal.woff2', 'montserrat-latin-wght-italic.woff2', 'montserrat-latin-ext-wght-normal.woff2']) fs.copyFileSync(path.join(fontDir, f), path.join(OUT, 'assets/fonts', f));
  for (const w of ['regular', 'fill']) {
    const d = path.join(ROOT, 'node_modules/@phosphor-icons/web/src', w);
    const t = path.join(OUT, 'assets/vendor/phosphor', w);
    fs.mkdirSync(t, { recursive: true });
    for (const f of fs.readdirSync(d)) if (/\.(css|woff2)$/.test(f)) fs.copyFileSync(path.join(d, f), path.join(t, f));
    // only ship woff2
    const css = path.join(t, 'style.css');
    fs.writeFileSync(css, fs.readFileSync(css, 'utf8').replace(/src:[^;]+;/, m => 'src: url("./' + (w === 'regular' ? 'Phosphor' : 'Phosphor-Fill') + '.woff2") format("woff2");'));
  }
}

// ---------- run ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyAssets();
buildHome();
buildChooseUs();
buildVacancies();
buildNewsIndex();
for (const p of Object.values(pages)) if (p.type === 'info' || p.type === 'news') buildInfo(p);
buildRedirects();
build404();
fs.writeFileSync(path.join(OUT, 'search-index.json'), JSON.stringify(searchDocs));
const uniqFixes = [...new Map(fixes.filter(f => f.page).map(f => [f.page + f.was, f])).values()];
fs.writeFileSync(path.join(ROOT, 'data/link-fixes.json'), JSON.stringify(uniqFixes, null, 1));
console.log(`Built ${written.size} pages, ${searchDocs.length} searchable, ${NEWS.length} news stories, ${uniqFixes.length} broken links fixed.`);
