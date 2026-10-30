// Dawn's cart count bubble on the header cart icon, fed by the browser cart (localStorage).
(function () {
  var KEY = 'co.cart.v1';
  function count() {
    try {
      var lines = JSON.parse(window.localStorage.getItem(KEY) || '[]');
      return Array.isArray(lines) ? lines.reduce(function (n, l) { return n + (l && l.quantity > 0 ? l.quantity : 0); }, 0) : 0;
    } catch (e) {
      return 0;
    }
  }
  function render() {
    var icon = document.getElementById('cart-icon-bubble');
    if (!icon) return;
    var old = icon.querySelector('.cart-count-bubble');
    if (old) old.remove();
    var n = count();
    if (n < 1) return;
    var bubble = document.createElement('div');
    bubble.className = 'cart-count-bubble';
    var visible = document.createElement('span');
    visible.setAttribute('aria-hidden', 'true');
    visible.textContent = n < 100 ? String(n) : '99+';
    var hidden = document.createElement('span');
    hidden.className = 'visually-hidden';
    hidden.textContent = n + (n === 1 ? ' item' : ' items');
    bubble.appendChild(visible);
    bubble.appendChild(hidden);
    icon.appendChild(bubble);
  }
  render();
  window.addEventListener('co:cart', render);
  window.addEventListener('storage', function (e) { if (e.key === KEY) render(); });
})();
