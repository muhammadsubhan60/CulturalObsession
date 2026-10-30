import { StoreChrome } from '@/components/store/chrome';

/** Dawn's 404 template inside the theme. */
export default function NotFound() {
  return (
    <StoreChrome template="page">
      <div className="template-404 page-width page-margin center">
        <p className="caption-with-letter-spacing">404</p>
        <h1 className="h2">Page not found</h1>
        <a href="/collections/all" className="button">
          Continue shopping
        </a>
      </div>
    </StoreChrome>
  );
}
