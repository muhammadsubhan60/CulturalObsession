import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import stylesheets from '@/theme/stylesheets.json';

/** Storefront templates captured from the locked theme (see scripts/theme/extract.py). */
export type TemplateName = keyof typeof stylesheets;

const ROOT = path.join(process.cwd(), 'theme/sections');
const cache = new Map<string, string>();

/** Section markup by template and section name, e.g. ('home', 'slideshow') or ('product', 'main'). */
export function sectionHtml(template: TemplateName, name: string): string {
  const key = `${template}/${name}`;
  const hit = cache.get(key);
  if (hit !== undefined && process.env.NODE_ENV === 'production') return hit;
  const file = fs.readdirSync(path.join(ROOT, template)).find((f) => f.replace(/^\d+-/, '').replace(/\.html$/, '') === name);
  if (!file) throw new Error(`Theme section not found: ${key}`);
  const html = fs.readFileSync(path.join(ROOT, template, file), 'utf8');
  cache.set(key, html);
  return html;
}

/** Every theme stylesheet, base.css first, de-duplicated across templates. */
export const THEME_STYLESHEETS: string[] = Array.from(new Set(Object.values(stylesheets).flat()));
