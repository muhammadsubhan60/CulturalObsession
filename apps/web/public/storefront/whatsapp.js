// Opens WhatsApp chat from the floating button (the app's script did this before).
(function () {
  var button = document.getElementById('pushdaddy-button');
  if (!button) return;
  function open() {
    var href = button.getAttribute('data-href');
    if (href && href.indexOf('https://wa.me/') === 0) window.open(href, '_blank', 'noopener');
  }
  button.addEventListener('click', open);
  button.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
})();
