'use client';

import { useEffect } from 'react';

const THEME_JS = '/theme/customizedjewellers.pk/cdn/shop/t/2/assets';
// global.js first: product-modal.js extends its ModalDialog, media-gallery relies on its helpers.
const SCRIPTS = [
  '/storefront/theme-globals.js',
  `${THEME_JS}/global.js`,
  `${THEME_JS}/details-disclosure.js`,
  `${THEME_JS}/details-modal.js`,
  `${THEME_JS}/media-gallery.js`,
  `${THEME_JS}/product-modal.js`,
  `${THEME_JS}/share.js`,
  `${THEME_JS}/show-more.js`,
  '/storefront/facets.js',
  '/storefront/forms.js',
  '/storefront/whatsapp.js',
];

/**
 * Loads Dawn's custom-element scripts once React has hydrated. Running them earlier lets them
 * rewrite theme markup (slider counters, aria attributes) before hydration, which breaks it.
 * Dynamically inserted scripts with async=false still execute in insertion order.
 */
export function ThemeScripts() {
  useEffect(() => {
    if (document.documentElement.dataset.themeScripts) return;
    document.documentElement.dataset.themeScripts = '1';
    for (const src of SCRIPTS) {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      document.body.appendChild(s);
    }
  }, []);
  return null;
}
