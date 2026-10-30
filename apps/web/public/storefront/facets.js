// Collection filters and sorting for the theme's facet forms (replaces Shopify's section-rendering
// facets.js). Any change rebuilds the query string from the form and reloads the page.
(function () {
  function apply(form) {
    var params = new URLSearchParams();
    new FormData(form).forEach(function (value, key) {
      if (String(value).trim() !== '') params.append(key, String(value));
    });
    var sort = document.getElementById('SortBy');
    if (sort && !params.has('sort_by')) params.set('sort_by', sort.value);
    params.delete('page');
    window.location.assign(window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
  }
  var timer;
  document.addEventListener('change', function (event) {
    var form = event.target.closest && event.target.closest('form.facets__form, form.mobile-facets__form, #FacetSortForm');
    if (!form) return;
    clearTimeout(timer);
    timer = setTimeout(function () { apply(form); }, event.target.type === 'number' ? 600 : 0);
  });
  document.addEventListener('submit', function (event) {
    var form = event.target.closest && event.target.closest('form.facets__form, form.mobile-facets__form');
    if (!form) return;
    event.preventDefault();
    apply(form);
  });
})();
