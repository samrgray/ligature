// Applies the saved appearance (Light or Dark) before the page paints, so it doesn't flash.
// “Auto” stores nothing and follows the system setting.
(function () {
  try {
    var t = localStorage.getItem('ligature-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* storage blocked: follow the system */
  }
})();
