(function () {
  'use strict';

  const MAX_ENTRIES = 300;
  const _log = [];

  function ts() {
    return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  }

  function add(type, args) {
    const message = args.map(a => {
      if (a instanceof Error) return a.stack || a.message;
      try { return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a); }
      catch (e) { return '[unserializable]'; }
    }).join(' ');
    _log.push({ time: ts(), fullTime: Date.now(), type, message });
    if (_log.length > MAX_ENTRIES) _log.shift();
  }

  // Intercept console methods
  ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
    const orig = console[method].bind(console);
    console[method] = function (...args) {
      add(method.toUpperCase(), args);
      orig(...args);
    };
  });

  // Capture uncaught errors
  window.addEventListener('error', e => {
    add('JS_ERROR', [`${e.message}  @  ${e.filename}:${e.lineno}:${e.colno}`]);
  });

  window.addEventListener('unhandledrejection', e => {
    add('PROMISE', [String(e.reason)]);
  });

  // Log user clicks (just tag + id/class, not content)
  document.addEventListener('click', e => {
    const el = e.target;
    const id   = el.id   ? `#${el.id}`   : '';
    const cls  = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';
    add('CLICK', [`${el.tagName.toLowerCase()}${id}${cls}`]);
  }, true);

  // Log page visibility changes (tab switches, etc.)
  document.addEventListener('visibilitychange', () => {
    add('VISIBILITY', [document.visibilityState]);
  });

  add('INFO', [`Debug overlay active — ${window.location.pathname}`]);

  // ── Button ──────────────────────────────────────────────────────────────────

  function createBtn() {
    const btn = document.createElement('button');
    btn.id = 'debugCopyBtn';
    btn.innerHTML = '&#x1F41B; Copy Log';
    Object.assign(btn.style, {
      position:   'fixed',
      bottom:     '16px',
      left:       '16px',
      width:      'fit-content',
      zIndex:     '999999',
      background: 'rgba(8, 8, 20, 0.92)',
      border:     '1.5px solid rgba(251, 191, 36, 0.65)',
      color:      '#f59e0b',
      fontFamily: "'Cinzel', serif",
      fontSize:   '12px',
      fontWeight: '700',
      padding:    '9px 14px',
      cursor:     'pointer',
      opacity:    '0.6',
      transition: 'all 0.2s',
      letterSpacing: '0.04em',
    });

    // Inner border accent
    const inner = document.createElement('span');
    Object.assign(inner.style, {
      position:     'absolute',
      top: '4px', left: '4px', right: '4px', bottom: '4px',
      border:       '1px solid rgba(251, 191, 36, 0.25)',
      pointerEvents:'none',
    });
    btn.style.position = 'fixed'; // ensure relative for inner
    btn.appendChild(inner);

    btn.addEventListener('mouseenter', () => {
      btn.style.opacity = '1';
      btn.style.borderColor = 'rgba(251, 191, 36, 0.9)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.opacity = '0.6';
      btn.style.borderColor = 'rgba(251, 191, 36, 0.65)';
    });

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const cutoff = Date.now() - 60_000;
      const recent = _log.filter(entry => entry.fullTime >= cutoff);

      const lines = [
        '╔══════════════════════════════════════╗',
        '║         DEBUG LOG — LAST 60s         ║',
        '╚══════════════════════════════════════╝',
        `Page    : ${window.location.href}`,
        `Captured: ${new Date().toISOString()}`,
        `Entries : ${recent.length} of ${_log.length} total`,
        '────────────────────────────────────────',
        ...recent.map(e => `[${e.time}] [${e.type.padEnd(10)}] ${e.message}`),
        '────────────────────────────────────────',
        `Full buffer (${_log.length} entries):`,
        ..._log.map(e => `[${e.time}] [${e.type.padEnd(10)}] ${e.message}`),
      ].join('\n');

      function copied(ok) {
        btn.innerHTML = ok ? '&#x2713; Copied!' : '&#x2718; Failed';
        btn.style.borderColor = ok ? 'rgba(74,222,128,0.8)' : 'rgba(239,68,68,0.8)';
        btn.style.color       = ok ? '#4ade80'              : '#f87171';
        setTimeout(() => {
          btn.innerHTML = '&#x1F41B; Copy Log';
          btn.style.borderColor = 'rgba(251, 191, 36, 0.65)';
          btn.style.color       = '#f59e0b';
        }, 2500);
      }

      if (navigator.clipboard) {
        navigator.clipboard.writeText(lines).then(() => copied(true)).catch(() => fallback());
      } else {
        fallback();
      }

      function fallback() {
        try {
          const ta = document.createElement('textarea');
          ta.value = lines;
          ta.style.cssText = 'position:fixed;opacity:0;';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          copied(true);
        } catch (_) { copied(false); }
      }
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createBtn);
  } else {
    createBtn();
  }
})();
