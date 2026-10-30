// Shows the theme's own success / error message after a contact or newsletter form was posted
// (Shopify rendered these server-side from form.posted_successfully).
(function () {
  var params = new URLSearchParams(window.location.search);
  var success = '<svg aria-hidden="true" focusable="false" role="presentation" class="icon icon-success" viewBox="0 0 13 13"><path d="M6.5 12.35C9.73087 12.35 12.35 9.73086 12.35 6.5C12.35 3.26913 9.73087 0.65 6.5 0.65C3.26913 0.65 0.65 3.26913 0.65 6.5C0.65 9.73086 3.26913 12.35 6.5 12.35Z" fill="#428445" stroke="white" stroke-width="0.7"></path><path d="M5.53271 8.66357L9.25213 4.68197" stroke="white"></path><path d="M4.10645 6.7688L6.13766 8.62553" stroke="white"></path></svg>';
  var error = '<svg aria-hidden="true" focusable="false" role="presentation" class="icon icon-error" viewBox="0 0 13 13"><circle cx="6.5" cy="6.50049" r="5.5" stroke="white" stroke-width="2"></circle><circle cx="6.5" cy="6.5" r="5.5" fill="#EB001B" stroke="#EB001B" stroke-width="0.7"></circle><path d="M5.87413 3.52832L5.97439 7.57216H7.02713L7.12739 3.52832H5.87413ZM6.50076 9.66091C6.88091 9.66091 7.18169 9.37267 7.18169 9.00504C7.18169 8.63742 6.88091 8.34917 6.50076 8.34917C6.12061 8.34917 5.81982 8.63742 5.81982 9.00504C5.81982 9.37267 6.12061 9.66091 6.50076 9.66091Z" fill="white"></path></svg>';
  function show(form, html) {
    var el = document.createElement('div');
    el.innerHTML = html;
    var node = el.firstChild;
    form.insertBefore(node, form.querySelector('.contact__fields') || null);
    if (form.classList.contains('newsletter-form')) form.appendChild(node);
    node.focus();
  }
  var target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
  if (params.get('contact_posted') === 'true') {
    var c = document.getElementById('ContactForm');
    if (c) show(c, '<h2 class="form-status form-status-list form__message" tabindex="-1">' + success + " Thanks for contacting us. We'll get back to you as soon as possible.</h2>");
  }
  if (params.get('customer_posted') === 'true') {
    var n = target && target.tagName === 'FORM' ? target : document.querySelector('form.newsletter-form');
    if (n) show(n, '<h3 class="newsletter-form__message newsletter-form__message--success form__message" tabindex="-1">' + success + 'Thanks for subscribing</h3>');
  }
  var err = params.get('form_error');
  if (err) {
    var isNews = err.indexOf('customer') === 0;
    var f = isNews ? (target && target.tagName === 'FORM' ? target : document.querySelector('form.newsletter-form')) : document.getElementById('ContactForm');
    var text = err.slice(-7) === 'limited' ? 'Too many attempts. Please try again in a minute.' : 'Please enter a valid email address.';
    if (f) show(f, isNews ? '<small class="newsletter-form__message form__message" tabindex="-1">' + error + text + '</small>' : '<h2 class="form-status form-status-list form__message" role="alert" tabindex="-1">' + error + ' ' + text + '</h2>');
  }
})();
