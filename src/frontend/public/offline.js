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
  // Back on its own as soon as the portal answers again (a deploy takes about a minute).
  setInterval(function () {
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (res.ok) location.reload();
      })
      .catch(function () {});
  }, 8000);
})();
