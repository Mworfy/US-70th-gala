/**
 * Wello API — set once here for production.
 * Local dev (Live Server + Django on :8000) is detected automatically.
 */
(function () {
  var PRODUCTION_API = 'https://wello.aiesecus.org';
  var LOCAL_API = 'http://127.0.0.1:8000';

  if (!window.WELLO_TURNSTILE_SITE_KEY) {
    window.WELLO_TURNSTILE_SITE_KEY = '0x4AAAAAAFAB_2pH71eqUTgp';
  }

  if (window.WELLO_API_BASE) {
    return;
  }

  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    window.WELLO_API_BASE = LOCAL_API;
  } else {
    window.WELLO_API_BASE = PRODUCTION_API;
  }
})();
