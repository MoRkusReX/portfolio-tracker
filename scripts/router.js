// Keeps the app mode in sync with the URL hash router.
(function () {
  var PT = (window.PT = window.PT || {});

  PT.Router = {
    // Starts hash-based route listening and immediately applies the current route.
    init: function (onRoute) {
      // Normalizes the current hash into a supported mode and reports it to the caller.
      function applyRoute() {
        var hash = (location.hash || '#stocks').replace('#', '').toLowerCase();
        var mode = hash === 'crypto' ? 'crypto' : 'stocks';
        onRoute(mode);
      }
      window.addEventListener('hashchange', applyRoute);
      applyRoute();
    },
    // Navigates to the requested mode by updating the location hash.
    go: function (mode) {
      location.hash = mode === 'crypto' ? '#crypto' : '#stocks';
    }
  };
})();
