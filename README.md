# Kingsdown School redesign (preview)

A redesign of https://www.kingsdownschool.co.uk built from a full crawl of the current site. Every page keeps its original URL. Images and documents are still served from the school's own server.

## Run it

```
npm start          # build, then serve at http://localhost:4321
npm run serve      # serve the last build
npm run build      # rebuild site/ from data/pages.json
npm run crawl      # re-crawl the live site into data/pages.json (a few minutes)
npm run verify     # check every original word, link, image and video is present
```

## Where things live

| What | File |
| --- | --- |
| Page templates (header, footer, home, news, inner pages) | `build.mjs` |
| Styles, colours, animation | `src/css/site.css` (brand tokens at the top) |
| Interactions: menus, hero, 3D tilt, search, lightbox | `src/js/site.js` |
| Crawled content | `data/pages.json` |
| Broken links fixed during the rebuild | `data/link-fixes.json` |
| Content check results | `data/verify-report.json` |

## Notes for the pitch

- 312 original pages checked: 311 contain every word, link, image and video of the original. The one difference is Why Choose, where the old site repeats its intro paragraphs for mobile; the new page shows them once.
- 7 broken links on the current site are fixed: four menu/content links to dead pages (term dates, cohort 2030, wellbeing strategy, privacy policy) and partner links missing `https://`.
- The vacancies list (MyNewTerm) only runs on an https address, so the local preview shows a notice instead.
- Many uploaded photos are full camera originals (up to 5,712px wide). Resizing them on upload would make pages load much faster.
- The footer credit reads "Website Design by Ethan Angell" (set in `build.mjs`, footer section).
