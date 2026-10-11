// Offline page: English text outside Russian locales; retry when the network is back.
(function () {
  if (!/^ru\b/i.test(navigator.language || '')) {
    document.documentElement.lang = 'en';
    document.querySelectorAll('[data-en]').forEach(function (node) {
      node.textContent = node.getAttribute('data-en');
    });
  }
  document.getElementById('retry').addEventListener('click', function () {
    location.reload();
  });
  window.addEventListener('online', function () {
    location.reload();
  });
})();
