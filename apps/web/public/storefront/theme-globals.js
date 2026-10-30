// Strings and routes the Dawn theme scripts read from window (moved out of an inline <script> for CSP).
window.shopUrl = window.location.origin;
window.routes = {
  cart_add_url: '/cart/add',
  cart_change_url: '/cart/change',
  cart_update_url: '/cart/update',
  cart_url: '/cart',
  predictive_search_url: '/search/suggest',
};
window.cartStrings = {
  error: 'There was an error while updating your cart. Please try again.',
  quantityError: 'You can only add [quantity] of this item to your cart.',
};
window.variantStrings = { addToCart: 'Shop Now', soldOut: 'Sold out', unavailable: 'Unavailable' };
window.accessibilityStrings = {
  imageAvailable: 'Image [index] is now available in gallery view',
  shareSuccess: 'Link copied to clipboard',
  pauseSlideshow: 'Pause slideshow',
  playSlideshow: 'Play slideshow',
};
