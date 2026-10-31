// Opens WhatsApp chat from the floating button (the app's script did this before).
// On a product page the message also carries the product, the chosen options and the
// personalization typed so far, so staff can take the order without asking again.
(function () {
  var button = document.getElementById('pushdaddy-button');
  if (!button) return;

  function text(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function productDetails() {
    var title = text(document.querySelector('.product__title h1'));
    if (!title) return '';
    var lines = ['Product: ' + title];
    document.querySelectorAll('.product-form__input').forEach(function (fieldset) {
      var checked = fieldset.querySelector('input[type="radio"]:checked');
      var legend = text(fieldset.querySelector('legend'));
      if (checked && legend) lines.push(legend + ': ' + checked.value);
    });
    document.querySelectorAll('input[data-field-name]').forEach(function (input) {
      var value = input.value.trim();
      if (!value) return;
      var label = text(document.querySelector('label[for="' + input.id + '"] .label-content')) || input.id;
      lines.push(label + ': ' + value.slice(0, 200));
    });
    var qty = document.querySelector('input[name="quantity"]');
    if (qty && Number(qty.value) > 1) lines.push('Quantity: ' + Number(qty.value));
    lines.push('Link: ' + location.origin + location.pathname);
    return lines.join('\n');
  }

  function open() {
    var href = button.getAttribute('data-href');
    if (!href || href.indexOf('https://wa.me/') !== 0) return;
    var details = productDetails();
    if (details) {
      var url = new URL(href);
      var base = url.searchParams.get('text');
      url.searchParams.set('text', base ? base + '\n\n' + details : details);
      href = url.toString();
    }
    window.open(href, '_blank', 'noopener');
  }

  button.addEventListener('click', open);
  button.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
})();
