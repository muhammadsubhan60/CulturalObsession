#!/usr/bin/env python3
"""Build data/catalogue.json from the storefront mirror (the Shopify store itself is offline).

Usage: python3 -I scripts/catalogue/extract.py <mirror-root> <repo-root>

<mirror-root> contains site/ (rewritten pages + assets) and raw-pages/ (browser-rendered originals).
Images are referenced by their path under site/assets/; the importer uploads them to storage.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

MIRROR = Path(sys.argv[1]).resolve()
REPO = Path(sys.argv[2]).resolve()
SITE, RAW = MIRROR / "site", MIRROR / "raw-pages"


def text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def asset_path(src: str) -> str | None:
    """Local mirror path for a rewritten ('../assets/...') or original ('//customizedjewellers.pk/...') URL."""
    m = re.match(r"^(?:\.\./)*assets/([^?#\"\s]+)", src) or re.match(r"^(?:https?:)?//(customizedjewellers\.pk/[^?#\"\s]+)", src)
    return m.group(1) if m and (SITE / "assets" / m.group(1)).is_file() else None


def card_images() -> dict[str, str]:
    """Each product's featured image as shown on listing cards (product pages lead with the variant's)."""
    out: dict[str, str] = {}
    pages = [SITE / "index.html", *sorted((SITE / "collections").glob("*.html"))]
    for page in pages:
        doc = page.read_text(encoding="utf-8")
        for card in re.findall(r'<div class="card-wrapper.*?</h3>', doc, re.S):
            href = re.search(r'href="(?:\.\./)*products/([a-z0-9-]+)\.html', card)
            img = re.search(r'<img [^>]*src="([^"]+)"', card)
            if href and img and href.group(1) not in out:
                path = asset_path(img.group(1))
                if path:
                    out[href.group(1)] = path
    return out


CARD_IMAGES: dict[str, str] = {}


def product(handle: str) -> dict:
    site = (SITE / "products" / f"{handle}.html").read_text(encoding="utf-8")
    raw = (RAW / "products" / f"{handle}.html").read_text(encoding="utf-8")

    info = site[site.find("product__info-container") :]
    title = text(re.search(r"<h1>(.*?)</h1>", info, re.S).group(1))
    desc = re.search(r'<div class="product__description rte quick-add-hidden">(.*?)</div>\s*(?:<div|<details|<noscript|</div>)', site, re.S)
    description = desc.group(1).strip() if desc else ""

    variants_json = re.search(r"<variant-(?:radios|selects)[^>]*>.*?<script type=\"application/json\">(.*?)</script>", site, re.S)
    meta = json.loads(re.search(r"var meta = (\{.*?\});\s", raw, re.S).group(1))["product"]
    options = [text(o) for o in re.findall(r'<legend class="form__label">(.*?)</legend>', site, re.S)]
    if variants_json:
        data = json.loads(variants_json.group(1))
        variants = [
            {
                "mirrorId": v["id"],
                "title": v["title"],
                "options": dict(zip(options, v["options"])) if options else {},
                "pricePaisa": v["price"],
                "compareAtPricePaisa": v.get("compare_at_price") or None,
                "available": v.get("available", True),
                "weightGrams": v.get("weight") or None,
                "featuredMediaId": (v.get("featured_media") or {}).get("id"),
            }
            for v in data
        ]
    else:  # single-variant products have no picker; prices come from analytics meta + price markup
        compare = re.search(r'<div class="price__sale">.*?<s class="price-item price-item--regular">\s*Rs\.([\d,]+\.\d\d)', site, re.S)
        v = meta["variants"][0]
        variants = [
            {
                "mirrorId": v["id"],
                "title": "Default",
                "options": {},
                "pricePaisa": v["price"],
                "compareAtPricePaisa": int(round(float(compare.group(1).replace(",", "")) * 100)) if compare else None,
                "available": "price--sold-out" not in site[: site.find("product-form")],
                "weightGrams": None,
                "featuredMediaId": None,
            }
        ]
    for v in variants:
        if v["compareAtPricePaisa"] is not None and v["compareAtPricePaisa"] <= v["pricePaisa"]:
            v["compareAtPricePaisa"] = None

    images, seen = [], set()
    for li in re.finditer(r'<li\b(?=[^>]*class="product__media-item)[^>]*data-media-id="[^"]*-(\d+)"[^>]*>(.*?)</li>', site, re.S):
        img = re.search(r'<img [^>]*src="([^"]+)"[^>]*>', li.group(2))
        if not img:
            continue
        tag = img.group(0)
        path = asset_path(img.group(1))
        if not path or path in seen:
            continue
        seen.add(path)
        w, h, alt = (re.search(rf'{a}="([^"]*)"', tag) for a in ("width", "height", "alt"))
        images.append(
            {
                "mediaId": int(li.group(1)),
                "file": path,
                "width": int(w.group(1)) if w else None,
                "height": int(h.group(1)) if h else None,
                "alt": html.unescape(alt.group(1)) if alt and alt.group(1) else None,
            }
        )

    featured = CARD_IMAGES.get(handle)
    if featured:
        images.sort(key=lambda i: 0 if i["file"] == featured else 1)

    fields = []
    # Globo options render client-side; fall back to the browser-rendered capture when the page lacks them.
    gpo_doc = site if "gpo-label" in site else raw
    for m in re.finditer(r'<label for="([^"]+)" class="gpo-label( required)?">\s*<span class="label-content">([^<]+)</span>', gpo_doc):
        inp = re.search(rf'<input type="(\w+)"[^>]*id="{re.escape(m.group(1))}"[^>]*>', gpo_doc)
        fields.append({"key": m.group(1), "label": html.unescape(m.group(3)).strip(), "required": bool(m.group(2)), "fieldType": inp.group(1) if inp else "text"})

    return {
        "handle": handle,
        "title": html.unescape(title),
        "descriptionHtml": description,
        "options": options,
        "variants": variants,
        "images": images,
        "personalization": fields,
    }


def collection(handle: str) -> dict:
    s = (SITE / "collections" / f"{handle}.html").read_text(encoding="utf-8")
    title = text(re.search(r'<h1 class="collection-hero__title">(.*?)</h1>', s, re.S).group(1)).replace("Collection:", "").strip()
    desc = re.search(r'<div class="collection-hero__description rte">(.*?)</div>', s, re.S)
    grid = s[s.find('id="product-grid"') :]
    handles = list(dict.fromkeys(re.findall(r'href="(?:\.\./)*products/([a-z0-9-]+)\.html', grid)))
    return {"handle": handle, "title": title, "descriptionHtml": desc.group(1).strip() if desc else "", "products": handles}


def home_featured() -> dict[str, list[str]]:
    s = (SITE / "index.html").read_text(encoding="utf-8")
    out = {}
    for sec in re.finditer(r'<section id="shopify-section-template--\d+__[0-9a-f-]{36}".*?</section>', s, re.S):
        view_all = re.search(r'href="collections/([a-z0-9-]+)\.html" class="button"', sec.group(0))
        if view_all:
            out[view_all.group(1)] = list(dict.fromkeys(re.findall(r'href="products/([a-z0-9-]+)\.html', sec.group(0))))
    return out


# Only the first page of each collection was captured. Products that appear in none of them are
# placed by title keyword (first match wins) so the storefront menu shows them; staff can adjust.
KEYWORD_COLLECTIONS = [
    (r"shawl", "winter-jents-shawls"),
    (r"coat[ -]?pin", "coat-pin"),
    (r"cuff(?!-?bangle)|stud|mooch|mouch", "cufflinks"),
    (r"earring|tops", "earrings"),
    (r"bangle|karra|kara\b", "bangles"),
    (r"bracelet", "bracelets"),
    (r"\bring", "rings"),
    (r"necklace|pendant|locket|chain", "necklace"),
    (r"eidi|envelop|tray|batch|card", "customize-jewelry"),
]


def place_orphans(collections: list[dict], products: list[dict]) -> int:
    by_handle = {c["handle"]: c for c in collections}
    placed = 0
    for p in products:
        if any(p["handle"] in c["products"] for c in collections):
            continue
        for pattern, handle in KEYWORD_COLLECTIONS:
            if re.search(pattern, p["title"], re.I) and handle in by_handle:
                by_handle[handle]["products"].append(p["handle"])
                p["placedByKeyword"] = handle
                placed += 1
                break
    return placed


def main() -> None:
    CARD_IMAGES.update(card_images())
    menu_order = list(dict.fromkeys(re.findall(r'<a href="collections/([a-z0-9-]+)\.html" class="header__menu-item', (SITE / "index.html").read_text(encoding="utf-8"))))
    collections = [collection(p.stem) for p in sorted((SITE / "collections").glob("*.html")) if p.stem != "all"]
    featured = home_featured()
    for c in collections:  # pages beyond the first were never captured; the homepage lists more
        for h in featured.get(c["handle"], []):
            if h not in c["products"]:
                c["products"].append(h)
        c["sortOrder"] = menu_order.index(c["handle"]) if c["handle"] in menu_order else 100
    all_order = collection("all")["products"]
    handles = sorted(p.stem for p in (SITE / "products").glob("*.html"))
    handles.sort(key=lambda h: all_order.index(h) if h in all_order else len(all_order))
    products = [product(h) for h in handles]
    placed = place_orphans(collections, products)
    out = {"source": "customizedjewellers-mirror 2026-10-30", "collections": collections, "products": products, "homeFeatured": featured}
    target = REPO / "data/catalogue.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    pers = sum(1 for p in products if p["personalization"])
    print(f"placed by keyword={placed}, still without a collection={sum(1 for p in products if not any(p['handle'] in c['products'] for c in collections))}")
    print(f"collections={len(collections)} products={len(products)} variants={sum(len(p['variants']) for p in products)} images={sum(len(p['images']) for p in products)} personalized={pers}")


if __name__ == "__main__":
    main()
