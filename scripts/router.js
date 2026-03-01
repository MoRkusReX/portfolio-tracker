(function () {
  var PT = (window.PT = window.PT || {});

  PT.Router = {
    init: function (onRoute) {
      function applyRoute() {
        var hash = (location.hash || '#stocks').replace('#', '').toLowerCase();
        var mode = hash === 'crypto' ? 'crypto' : 'stocks';
        onRoute(mode);
      }
      window.addEventListener('hashchange', applyRoute);
      applyRoute();
    },
    go: function (mode) {
      location.hash = mode === 'crypto' ? '#crypto' : '#stocks';
    }
  };
})();
