#!/usr/bin/env python3
"""Extract the locked storefront theme from the static mirror into apps/web.

Usage: python3 -I scripts/theme/extract.py <mirror-site-dir> <repo-root>

Writes:
  apps/web/public/theme/head.css        inline theme styles from <head> (fonts, CSS variables)
  apps/web/theme/stylesheets.json       ordered theme stylesheet URLs per page type
  apps/web/theme/sections/<page>/<n>.html  section markup without scripts/trackers
  apps/web/public/theme/...             every theme asset the above reference (CSS, JS, fonts, images)

The markup is never edited by hand — rerun this script instead, so the theme stays identical.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

MIRROR = Path(sys.argv[1]).resolve()
REPO = Path(sys.argv[2]).resolve()
WEB = REPO / "apps/web"
OUT_SECTIONS = WEB / "theme/sections"
OUT_PUBLIC = WEB / "public/theme"
# Theme files the mirror never downloaded (e.g. Archivo bold/italic), fetched from Shopify's font CDN.
EXTRA = REPO / "scripts/theme/extra-assets"


def source_of(rel: str) -> Path | None:
    for root in (MIRROR / "assets", EXTRA):
        if (root / rel).is_file():
            return root / rel
    return None

# One representative mirror page per storefront template.
PAGES = {
    "home": "index.html",
    "product": "products/customize-name-cufflinks.html",
    "collection": "collections/necklace.html",
    "page": "pages/about-us.html",
    "blog": "blogs/news.html",
}

# Third-party apps and trackers that do not belong on our storefront.
DROP_HREF = re.compile(r"fonts\.googleapis|pwhatsapp1(19ba1|04)|font-awesome", re.I)
THEME_ASSET_DIRS = ("customizedjewellers.pk/cdn/shop/t/2/assets/", "customizedjewellers.pk/cdn/fonts/")
THEME_JS = "customizedjewellers.pk/cdn/shop/t/2/assets/"
# Dawn's own UI behaviour (no Shopify endpoints). Cart, product form, search and facets are ours.
KEEP_JS = ["global.js", "details-disclosure.js", "details-modal.js", "media-gallery.js", "product-modal.js", "share.js", "show-more.js"]

copied: set[str] = set()


def asset_rel(url: str) -> str | None:
    """'../assets/x/y.css?v=1' -> 'x/y.css' when the file exists in the mirror."""
    m = re.match(r"^(?:\.\./)*assets/([^?#\"')\s]+)", url)
    if not m:
        return None
    rel = m.group(1)
    return rel if source_of(rel) else None


def public_url(rel: str) -> str:
    copied.add(rel)
    return "/theme/" + rel


def rewrite_urls(text: str, page_dir: str = "") -> str:
    def attr(m: re.Match) -> str:
        rel = asset_rel(m.group(2))
        return f"{m.group(1)}{public_url(rel)}" if rel else m.group(0)

    def srcset(m: re.Match) -> str:
        parts = []
        for item in m.group(2).split(","):
            bits = item.strip().split()
            if not bits:
                continue
            rel = asset_rel(bits[0])
            bits[0] = public_url(rel) if rel else bits[0]
            parts.append(" ".join(bits))
        return f'{m.group(1)}{", ".join(parts)}"'

    text = re.sub(r'((?:srcset|data-srcset)=")([^"]*)"', srcset, text)
    text = re.sub(r'((?:src|href|data-src)=")([^"]+)', attr, text)
    text = re.sub(r'(url\(["\']?)((?:\.\./)*assets/[^"\')]+)', attr, text)
    # Internal links: products/x.html -> /products/x, index.html -> /
    text = re.sub(r'href="(?:\.\./)*index\.html"', 'href="/"', text)
    text = re.sub(
        r'href="(?:\.\./)*((?:products|collections|pages|blogs)/[^"#?]+?)\.html([#?][^"]*)?"',
        lambda m: f'href="/{m.group(1)}{m.group(2) or ""}"',
        text,
    )
    # Bare sibling links on a nested page, e.g. href="customize-name-cufflinks.html" on /products/*
    if page_dir:
        text = re.sub(
            r'href="([a-z0-9][a-z0-9-]*)\.html([#?][^"]*)?"',
            lambda m: f'href="/{page_dir}/{m.group(1)}{m.group(2) or ""}"',
            text,
        )
    return text


def strip_noise(html: str) -> str:
    html = re.sub(r"<script\b.*?</script>", "", html, flags=re.S | re.I)
    html = re.sub(r"<noscript\b.*?</noscript>", "", html, flags=re.S | re.I)
    html = re.sub(r"<link\b[^>]*>", "", html, flags=re.I)  # stylesheets are hoisted into <head>
    html = re.sub(r"\son\w+=\"[^\"]*\"", "", html)  # inline handlers (CSP)
    return html


def sections_of(doc: str) -> list[tuple[str, str]]:
    body = doc[doc.find("<body") : doc.rfind("</body>")]
    ids = list(re.finditer(r'<(div|section) id="shopify-section-([^"]+)"', body))
    out = []
    for i, m in enumerate(ids):
        end = ids[i + 1].start() if i + 1 < len(ids) else len(body)
        chunk = body[m.start() : end]
        # Trim trailing wrapper closings that belong to <main>/<body> rather than the section.
        depth, pos, tag_re = 0, 0, re.compile(r"<(/?)(div|section)\b[^>]*>", re.I)
        for t in tag_re.finditer(chunk):
            depth += -1 if t.group(1) else 1
            if depth == 0:
                pos = t.end()
                break
        name = m.group(2).split("__")[-1]
        out.append((name, chunk[:pos]))
    return out


def stylesheets(doc: str) -> list[str]:
    hrefs = []
    for m in re.finditer(r'<link\b[^>]*rel="stylesheet"[^>]*>|<link\b[^>]*href="[^"]+\.css[^"]*"[^>]*>', doc, re.I):
        href = re.search(r'href="([^"]+)"', m.group(0))
        if not href or DROP_HREF.search(href.group(1)):
            continue
        rel = asset_rel(href.group(1))
        if rel and rel.endswith(".css") and rel.startswith(THEME_ASSET_DIRS) or (rel and "whatsappchat" in rel):
            url = public_url(rel)
            if url not in hrefs:
                hrefs.append(url)
    return hrefs


def main() -> None:
    if OUT_SECTIONS.exists():
        shutil.rmtree(OUT_SECTIONS)
    OUT_SECTIONS.mkdir(parents=True)
    sheets: dict[str, list[str]] = {}
    head_css = None

    for page, path in PAGES.items():
        doc = (MIRROR / path).read_text(encoding="utf-8")
        sheets[page] = stylesheets(doc)
        if head_css is None:
            head = doc[: doc.find("</head>")]
            styles = re.findall(r'<style data-shopify="">(.*?)</style>|<style id="cultural-obsession-brand">(.*?)</style>', head, re.S)
            head_css = rewrite_urls("\n".join(a or b for a, b in styles))
            # Legacy .woff fallbacks were never mirrored; keep only the woff2 sources that exist.
            head_css = re.sub(r',\s*url\("(?:\.\./)*assets/[^"]+"\)\s*format\("woff"\)', "", head_css)
        (OUT_SECTIONS / page).mkdir()
        for i, (name, html) in enumerate(sections_of(doc)):
            target = OUT_SECTIONS / page / f"{i:02d}-{name}.html"
            page_dir = str(Path(path).parent) if "/" in path else ""
            target.write_text(rewrite_urls(strip_noise(html), page_dir).strip() + "\n", encoding="utf-8")

    (OUT_PUBLIC).mkdir(parents=True, exist_ok=True)
    (OUT_PUBLIC / "head.css").write_text(head_css or "", encoding="utf-8")
    for name in KEEP_JS:
        public_url(THEME_JS + name)
    (WEB / "theme/stylesheets.json").write_text(json.dumps(sheets, indent=2) + "\n", encoding="utf-8")

    # Copy referenced assets, plus fonts/images referenced from copied CSS.
    queue = sorted(copied)
    seen: set[str] = set()
    while queue:
        rel = queue.pop()
        if rel in seen:
            continue
        seen.add(rel)
        src, dst = source_of(rel), OUT_PUBLIC / rel
        if src is None:  # e.g. the obsolete ellipsis.xml that 404s upstream too
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        if rel.endswith(".css"):
            css = src.read_text(encoding="utf-8", errors="replace")
            for u in re.findall(r"url\(['\"]?([^'\")]+)", css):
                if u.startswith(("data:", "http", "#")):
                    continue
                cand = (src.parent / u.split("?")[0]).resolve()
                try:
                    queue.append(str(cand.relative_to((MIRROR / "assets").resolve())))
                except ValueError:
                    pass
    print(f"sections: {sum(1 for _ in OUT_SECTIONS.rglob('*.html'))}, assets: {len(seen)}")


if __name__ == "__main__":
    main()
