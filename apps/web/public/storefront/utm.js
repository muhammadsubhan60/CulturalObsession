// Remembers the campaign a shopper arrived from (first visit in this tab) for order attribution.
(function () {
  try {
    if (window.sessionStorage.getItem('co.attribution')) return;
    var p = new URLSearchParams(window.location.search);
    var a = {
      utmSource: p.get('utm_source') || undefined,
      utmMedium: p.get('utm_medium') || undefined,
      utmCampaign: p.get('utm_campaign') || undefined,
      utmContent: p.get('utm_content') || undefined,
      utmTerm: p.get('utm_term') || undefined,
      landingPage: (window.location.pathname + window.location.search).slice(0, 500),
    };
    window.sessionStorage.setItem('co.attribution', JSON.stringify(a));
  } catch (e) {
    // storage unavailable: attribution is best-effort
  }
})();
