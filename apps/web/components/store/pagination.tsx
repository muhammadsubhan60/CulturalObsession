import type { ReactNode } from 'react';

/**
 * Dawn's pagination snippet. Shows the first and last page, two pages either side of the current
 * one, and an ellipsis for gaps. `caret` is the theme's own arrow icon taken from the template.
 */
export function Pagination({ page, pages, hrefFor, caret }: { page: number; pages: number; hrefFor: (p: number) => string; caret: ReactNode }) {
  if (pages <= 1) return null;
  const parts: (number | 'gap')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) parts.push(p);
    else if (parts[parts.length - 1] !== 'gap') parts.push('gap');
  }
  return (
    <div className="pagination-wrapper">
      <nav className="pagination" role="navigation" aria-label="Pagination">
        <ul className="pagination__list list-unstyled" role="list">
          {page > 1 && (
            <li>
              <a href={hrefFor(page - 1)} className="pagination__item pagination__item--next pagination__item-arrow link motion-reduce" aria-label="Previous page">
                {caret}
              </a>
            </li>
          )}
          {parts.map((p, i) => (
            <li key={i}>
              {p === 'gap' ? (
                <span className="pagination__item">…</span>
              ) : p === page ? (
                <a role="link" aria-disabled="true" className="pagination__item pagination__item--current light" aria-current="page" aria-label={`Page ${p}`}>
                  {p}
                </a>
              ) : (
                <a href={hrefFor(p)} className="pagination__item link" aria-label={`Page ${p}`}>
                  {p}
                </a>
              )}
            </li>
          ))}
          {page < pages && (
            <li>
              <a href={hrefFor(page + 1)} className="pagination__item pagination__item--prev pagination__item-arrow link motion-reduce" aria-label="Next page">
                {caret}
              </a>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}

