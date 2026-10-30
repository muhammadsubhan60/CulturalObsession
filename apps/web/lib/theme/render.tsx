import 'server-only';
import parse, { domToReact, Element, type DOMNode, type HTMLReactParserOptions } from 'html-react-parser';
import type { ReactNode } from 'react';

/** Return a node to swap in, null to remove the element, or undefined to keep the theme markup as-is. */
export type Replacer = (el: Element, render: (nodes: DOMNode[]) => ReactNode) => ReactNode | undefined;

/**
 * Renders trusted theme markup (our own files, never user input) as React elements — no
 * dangerouslySetInnerHTML — letting callers replace the data-driven nodes.
 */
export function renderTheme(html: string, replace?: Replacer): ReactNode {
  // Forms that posted to Shopify's /contact#<id> now post to ours; the hash never reaches the
  // server, so carry the form id along to show its success message in the right form.
  html = html.replace(/(<form method="post" action="\/contact#([A-Za-z0-9_-]+)"[^>]*>)/g, '$1<input type="hidden" name="form_id" value="$2">');
  const options: HTMLReactParserOptions = {
    replace(node) {
      if (!(node instanceof Element) || !replace) return undefined;
      const out = replace(node, (nodes) => domToReact(nodes, options));
      if (out === undefined) return undefined;
      // html-react-parser treats null as "no replacement" and keeps the element; an empty fragment removes it.
      return (out === null ? <></> : out) as ReturnType<NonNullable<HTMLReactParserOptions['replace']>>;
    },
  };
  return parse(html, options);
}

export const hasClass = (el: Element, cls: string) => (el.attribs.class ?? '').split(/\s+/).includes(cls);
export const idStarts = (el: Element, prefix: string) => (el.attribs.id ?? '').startsWith(prefix);

/** Recursively finds the first element matching a predicate. */
export function findElement(nodes: DOMNode[], test: (el: Element) => boolean): Element | null {
  for (const n of nodes) {
    if (n instanceof Element) {
      if (test(n)) return n;
      const inner = findElement(n.children as DOMNode[], test);
      if (inner) return inner;
    }
  }
  return null;
}
