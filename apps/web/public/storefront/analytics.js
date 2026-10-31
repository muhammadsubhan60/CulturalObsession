// Meta Pixel and Google Analytics 4, configured by data attributes on this script's tag.
// Nothing loads unless an id is set. Purchase uses the order number as its event id so the
// server-side Conversions API event and this one are counted once.
(function () {
  var tag = document.currentScript;
  if (!tag || window.coTrack) return;
  var pixel = tag.getAttribute('data-pixel');
  var ga4 = tag.getAttribute('data-ga4');

  function load(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  if (pixel) {
    var fbq = (window.fbq = function () {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    });
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    load('https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', pixel);
    fbq('track', 'PageView');
  }
  if (ga4) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga4));
    window.gtag('js', new Date());
    window.gtag('config', ga4);
  }

  var GA_NAMES = { ViewContent: 'view_item', AddToCart: 'add_to_cart', InitiateCheckout: 'begin_checkout', Purchase: 'purchase' };

  /** coTrack('Purchase', { value, ids: [...], quantity }, 'CO-100123') */
  window.coTrack = function (name, data, eventId) {
    data = data || {};
    if (pixel && window.fbq) {
      var params = { currency: 'PKR', value: data.value, content_ids: data.ids, content_type: 'product', num_items: data.quantity };
      window.fbq('track', name, params, eventId ? { eventID: eventId } : undefined);
    }
    if (ga4 && window.gtag && GA_NAMES[name]) {
      window.gtag('event', GA_NAMES[name], {
        currency: 'PKR',
        value: data.value,
        transaction_id: name === 'Purchase' ? eventId : undefined,
        items: (data.ids || []).map(function (id) {
          return { item_id: id };
        }),
      });
    }
  };

  function readJson(selector) {
    var el = document.querySelector(selector);
    try {
      return el ? JSON.parse(el.textContent) : null;
    } catch (e) {
      return null;
    }
  }

  var path = window.location.pathname;
  var product = path.indexOf('/products/') === 0 ? readJson('script[type="application/ld+json"]') : null;
  if (product && product['@type'] === 'Product') {
    var offer = (product.offers || [])[0];
    window.coTrack('ViewContent', { value: offer ? Number(offer.price) : undefined, ids: [path.split('/')[2]] });
  }
  document.addEventListener('co:add-to-cart', function (e) {
    window.coTrack('AddToCart', e.detail);
  });
  if (path === '/checkout') window.coTrack('InitiateCheckout');
  if (path.indexOf('/orders/') === 0) {
    try {
      var placed = JSON.parse(window.sessionStorage.getItem('co.purchase') || 'null');
      if (placed && path === '/orders/' + placed.orderNumber) {
        window.sessionStorage.removeItem('co.purchase');
        window.coTrack('Purchase', placed, placed.orderNumber);
      }
    } catch (e) {
      // storage unavailable: the server-side event still records the purchase
    }
  }
})();
