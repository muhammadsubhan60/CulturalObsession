# Customized Jewellers public-site mirror

Captured from `https://customizedjewellers.pk/` on 2026-10-30.

## Open locally

From this folder, run:

```bash
python3 -m http.server 8080 --directory site
```

Then open `http://127.0.0.1:8080/` in a browser.

## Included

- 168 public HTML pages
  - 147 product pages
  - 11 collection pages
  - 8 information pages
  - 1 blog page
  - Homepage
- 647 locally stored image, CSS, JavaScript, font, and supporting asset files
- Original sitemap and child sitemaps
- Browser-rendered source captures in `raw-pages/`
- Crawl and integrity reports
- Reusable capture/build/verification scripts

## Main files

- `site/index.html` — local homepage
- `manifest.json` — URL-to-local-file inventory
- `mirror-report.json` — download totals and failures
- `mirror-verification.json` — local-link and workbook cross-check
- `rendered-pages.json` — browser capture report
- `customizedjewellers-pk-2026-10-29.xlsx` — supplied product data sample

## Notes

- The mirror covers public storefront pages and assets. Private Shopify areas such as admin, customer accounts, orders, cart state, and checkout were not copied.
- Product forms, account actions, cart/checkout, analytics, and other server-backed features still require the live Shopify site.
- Responsive image duplicates were collapsed to their original-quality local source files.
- The supplied workbook contains 12 product rows. All 12 product pages and all 26 unique images listed there were found in the local mirror.
- The live theme references one obsolete `ellipsis.xml` file that returns HTTP 404 upstream. This is an unused legacy Mozilla CSS binding and does not affect the verified page renders.
# CulturalObsession
