/**
 * Wello Forms — posts Webflow forms to the Django backend.
 * Set window.WELLO_API_BASE in js/wello-config.js (loaded before this script).
 * B2B + GC forms: honeypot, form_loaded_at, Cloudflare Turnstile.
 */
(function () {
  var API_BASE = (window.WELLO_API_BASE || 'https://wello.aiesecus.org').replace(/\/$/, '');
  var TURNSTILE_SITE_KEY = window.WELLO_TURNSTILE_SITE_KEY || '';

  var FORM_ENDPOINTS = {
    'wf-form-Email-Form---B2B-GT': '/api/forms/b2b/',
    'wf-form-GC-Form---Attorney-or-Host-Company': '/api/forms/gc-host/',
    'wf-form-GC-Form---Candidate-with-secured-internship': '/api/forms/gc-candidate/',
    'wf-form-GC---AIESEC-Form': '/api/forms/gc-aiesec/',
    'wf-form-70th-Anniversary': '/api/forms/anniversary/',
    'wf-form-Newsletter-Footer': '/api/forms/newsletter/',
  };

  var PROTECTED_ENDPOINTS = {
    '/api/forms/b2b/': true,
    '/api/forms/gc-host/': true,
    '/api/forms/gc-candidate/': true,
    '/api/forms/gc-aiesec/': true,
  };

  var turnstileScriptPromise = null;

  function showBlock(form, kind) {
    var wrap = form.closest('.w-form') || form.parentElement;
    if (!wrap) return;
    form.style.display = 'none';
    var sel = kind === 'success' ? '.w-form-done' : '.w-form-fail';
    var block = wrap.querySelector(sel);
    if (block) {
      block.style.display = 'block';
    }
  }

  function formHasFiles(form) {
    return !!form.querySelector('input[type="file"]');
  }

  function ensureHoneypot(form) {
    if (form.querySelector('input[name="website"]')) return;
    var wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;';
    var input = document.createElement('input');
    input.type = 'text';
    input.name = 'website';
    input.id = form.id ? form.id + '-website' : 'wello-website';
    input.tabIndex = -1;
    input.autocomplete = 'off';
    wrap.appendChild(input);
    form.appendChild(wrap);
  }

  function ensureLoadedAt(form) {
    var existing = form.querySelector('input[name="form_loaded_at"]');
    if (!existing) {
      existing = document.createElement('input');
      existing.type = 'hidden';
      existing.name = 'form_loaded_at';
      form.appendChild(existing);
    }
    existing.value = String(Date.now());
  }

  function loadTurnstileScript() {
    if (!TURNSTILE_SITE_KEY) {
      return Promise.resolve();
    }
    if (window.turnstile) {
      return Promise.resolve();
    }
    if (turnstileScriptPromise) {
      return turnstileScriptPromise;
    }
    turnstileScriptPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Turnstile script failed'));
      };
      document.head.appendChild(s);
    });
    return turnstileScriptPromise;
  }

  function formIsVisible(form) {
    var pane = form.closest('.w-tab-pane');
    if (!pane) return true;
    return (
      pane.classList.contains('w--tab-active') ||
      pane.classList.contains('w--current') ||
      (pane.style && pane.style.display === 'block')
    );
  }

  function ensureTurnstile(form) {
    if (!TURNSTILE_SITE_KEY) return Promise.resolve();
    if (!formIsVisible(form)) return Promise.resolve();
    return loadTurnstileScript().then(function () {
      var host = form.querySelector('.cf-turnstile, [data-wello-turnstile]');
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-wello-turnstile', '1');
        host.style.margin = '12px 0';
        var submit = form.querySelector('[type="submit"]');
        if (submit) {
          form.insertBefore(host, submit);
        } else {
          form.appendChild(host);
        }
      }
      if (host.getAttribute('data-wello-widget') === '1') {
        return;
      }
      if (!window.turnstile || !window.turnstile.render) {
        return;
      }
      var widgetId = window.turnstile.render(host, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'light',
      });
      host.setAttribute('data-wello-widget', '1');
      form.dataset.welloTurnstileWidget = String(widgetId);
    });
  }

  function refreshProtectedTurnstiles() {
    document.querySelectorAll('form[data-wello-bound="1"]').forEach(function (form) {
      var endpoint = form.getAttribute('data-wello-endpoint') || '';
      if (!PROTECTED_ENDPOINTS[endpoint]) return;
      ensureTurnstile(form).catch(function () {});
    });
  }

  function resetTurnstile(form) {
    var widgetId = form.dataset.welloTurnstileWidget;
    if (widgetId != null && window.turnstile && window.turnstile.reset) {
      try {
        window.turnstile.reset(widgetId);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function readTurnstileToken(form) {
    var input = form.querySelector('input[name="cf-turnstile-response"]');
    if (input && input.value) return input.value;
    var widgetId = form.dataset.welloTurnstileWidget;
    if (widgetId != null && window.turnstile && window.turnstile.getResponse) {
      try {
        return window.turnstile.getResponse(widgetId) || '';
      } catch (e) {
        return '';
      }
    }
    return '';
  }

  function formToObject(form) {
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (value, key) {
      if (typeof File !== 'undefined' && value instanceof File) return;
      data[key] = value;
    });
    data.source_page = window.location.pathname || window.location.href;
    var loaded = form.querySelector('input[name="form_loaded_at"]');
    if (loaded && loaded.value) {
      data.form_loaded_at = loaded.value;
    }
    var token = readTurnstileToken(form);
    if (token) {
      data['cf-turnstile-response'] = token;
      data.turnstile_token = token;
    }
    return data;
  }

  function formToFormData(form) {
    var fd = new FormData(form);
    fd.set('source_page', window.location.pathname || window.location.href);
    var loaded = form.querySelector('input[name="form_loaded_at"]');
    if (loaded && loaded.value) {
      fd.set('form_loaded_at', loaded.value);
    }
    var token = readTurnstileToken(form);
    if (token) {
      fd.set('cf-turnstile-response', token);
      fd.set('turnstile_token', token);
    }
    return fd;
  }

  function bindForm(form) {
    if (form.dataset.welloBound === '1') return;
    var name = form.getAttribute('name') || form.id || '';
    var endpoint = form.getAttribute('data-wello-endpoint') || FORM_ENDPOINTS[name];
    if (!endpoint) return;
    form.dataset.welloBound = '1';
    form.setAttribute('method', 'post');
    form.setAttribute('action', API_BASE + endpoint);

    var protectedForm = !!PROTECTED_ENDPOINTS[endpoint];
    if (protectedForm) {
      ensureHoneypot(form);
      ensureLoadedAt(form);
      ensureTurnstile(form).catch(function () {
        /* widget optional until script loads; submit will fail server-side if needed */
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      event.stopPropagation();

      var runSubmit = function () {
      var useMultipart = formHasFiles(form);
      var submitBtn = form.querySelector('[type="submit"]');
      var waitText = submitBtn && submitBtn.getAttribute('data-wait');
      var originalValue = submitBtn ? submitBtn.value : '';
      if (submitBtn && waitText) {
        submitBtn.value = waitText;
        submitBtn.disabled = true;
      }

      var headers = { Accept: 'application/json' };
      var body;
      if (useMultipart) {
        body = formToFormData(form);
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(formToObject(form));
      }

      fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: headers,
        body: body,
      })
        .then(function (res) {
          return res.json().then(function (bodyJson) {
            return { ok: res.ok && bodyJson && bodyJson.ok, body: bodyJson };
          });
        })
        .then(function (result) {
          if (result.ok) {
            showBlock(form, 'success');
          } else {
            if (protectedForm) resetTurnstile(form);
            showBlock(form, 'error');
          }
        })
        .catch(function () {
          if (protectedForm) resetTurnstile(form);
          showBlock(form, 'error');
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.value = originalValue;
            submitBtn.disabled = false;
          }
        });
      };

      if (protectedForm) {
        ensureTurnstile(form)
          .catch(function () {})
          .then(runSubmit);
      } else {
        runSubmit();
      }
    }, true);
  }

  function init() {
    Object.keys(FORM_ENDPOINTS).forEach(function (name) {
      document.querySelectorAll('form[name="' + name + '"], form#' + name).forEach(bindForm);
    });
    document.querySelectorAll('form[data-wello-endpoint]').forEach(bindForm);
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('[data-w-tab], .w-tab-link, .gc-tab')) {
        setTimeout(refreshProtectedTurnstiles, 100);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
