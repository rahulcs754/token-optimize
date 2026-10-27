/*
 * token-optimize usage widget.
 * Shows how many tokens an AI tool can read in a project with and without token-optimize.
 *
 * Embed on any page:
 *   <script src="https://rahulcs754.github.io/token-optimize/widget.js"
 *           data-report="https://rahulcs754.github.io/token-optimize/sample-report.json"></script>
 *
 * data-report: URL of a report made with `npx github:rahulcs754/token-optimize --audit --json`.
 * The viewer can hide the widget (remembered in this browser) and load their own report file.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var reportUrl = (script && script.getAttribute('data-report')) || 'sample-report.json';
  var HIDDEN_KEY = 'token-optimize-widget-hidden';

  function store(get, value) {
    try {
      if (get) return localStorage.getItem(HIDDEN_KEY) === '1';
      if (value) localStorage.setItem(HIDDEN_KEY, '1'); else localStorage.removeItem(HIDDEN_KEY);
    } catch (e) { /* storage blocked: widget just shows every time */ }
    return false;
  }

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var css = '' +
    '.tow{--tow-bg:#ffffff;--tow-fg:#16181d;--tow-muted:#5d6470;--tow-line:#e3e6eb;--tow-bad:#d9534f;--tow-good:#1f9d63;--tow-soft:#f4f6f8;' +
    'position:fixed;right:16px;bottom:16px;z-index:2147483000;width:340px;max-width:calc(100vw - 32px);' +
    'font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--tow-fg);background:var(--tow-bg);' +
    'border:1px solid var(--tow-line);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.12);padding:14px 16px;box-sizing:border-box}' +
    '@media (prefers-color-scheme:dark){.tow{--tow-bg:#1b1e24;--tow-fg:#eef0f3;--tow-muted:#a2a9b4;--tow-line:#2f343c;--tow-bad:#ff7b72;--tow-good:#3fcf8e;--tow-soft:#242830}}' +
    '.tow *{box-sizing:border-box}' +
    '.tow-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}' +
    '.tow-title{font-weight:600;font-size:14px;margin:0}' +
    '.tow-x{border:0;background:transparent;color:var(--tow-muted);font-size:20px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}' +
    '.tow-x:hover{background:var(--tow-soft);color:var(--tow-fg)}' +
    '.tow-sub{color:var(--tow-muted);font-size:12px;margin:0 0 12px}' +
    '.tow-big{font-size:26px;font-weight:700;color:var(--tow-good);margin:0}' +
    '.tow-big small{font-size:13px;font-weight:500;color:var(--tow-muted)}' +
    '.tow-row{margin-top:10px}' +
    '.tow-lbl{display:flex;justify-content:space-between;font-size:12px;color:var(--tow-muted);margin-bottom:4px}' +
    '.tow-lbl b{color:var(--tow-fg);font-weight:600}' +
    '.tow-track{height:10px;background:var(--tow-soft);border-radius:6px;overflow:hidden}' +
    '.tow-bar{height:100%;border-radius:6px;min-width:4px}' +
    '.tow-list{list-style:none;margin:12px 0 0;padding:10px 0 0;border-top:1px solid var(--tow-line);font-size:12px}' +
    '.tow-list li{display:flex;justify-content:space-between;padding:2px 0;color:var(--tow-muted)}' +
    '.tow code{background:none;padding:0;border-radius:0;font-size:inherit}.tow-list code{color:var(--tow-fg);font-family:ui-monospace,Menlo,Consolas,monospace}' +
    '.tow-note{font-size:11px;color:var(--tow-muted);margin:10px 0 0}' +
    '.tow-actions{display:flex;gap:8px;margin-top:12px}' +
    '.tow-btn{flex:1;font:inherit;font-size:12px;padding:7px 10px;border-radius:8px;border:1px solid var(--tow-line);background:var(--tow-soft);color:var(--tow-fg);cursor:pointer;text-align:center}' +
    '.tow-btn:hover{border-color:var(--tow-muted)}' +
    '.tow-pill{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:600 13px system-ui,sans-serif;padding:9px 14px;border-radius:999px;' +
    'border:1px solid #e3e6eb;background:#ffffff;color:#16181d;box-shadow:0 6px 18px rgba(0,0,0,.12);cursor:pointer}' +
    '@media (prefers-color-scheme:dark){.tow-pill{background:#1b1e24;color:#eef0f3;border-color:#2f343c}}' +
    '.tow-err{color:var(--tow-bad);font-size:12px;margin:8px 0 0}';

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var box = document.createElement('section');
  box.className = 'tow';
  box.setAttribute('aria-label', 'Token usage with and without token-optimize');

  var pill = document.createElement('button');
  pill.className = 'tow-pill';
  pill.type = 'button';
  pill.textContent = 'Show token savings';

  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;

  function render(r, error) {
    var without = r.readable.without.tokens;
    var withIt = r.readable.with.tokens;
    var pct = without ? ((without - withIt) / without) * 100 : 0;
    var pctText = pct > 99.9 ? (Math.floor(pct * 100) / 100).toFixed(2) : pct.toFixed(1);
    var withWidth = without ? Math.max((withIt / without) * 100, 0) : 0;
    var blocked = (r.blocked || []).slice(0, 3).map(function (b) {
      return '<li><code>' + esc(b.path) + '</code><span>' + fmt(b.tokens) + ' tokens blocked</span></li>';
    }).join('');

    box.innerHTML =
      '<div class="tow-head"><p class="tow-title">Token usage: with vs without</p>' +
      '<button class="tow-x" type="button" aria-label="Hide widget" title="Hide">&times;</button></div>' +
      '<p class="tow-sub">' + esc(r.project) + '</p>' +
      '<p class="tow-big">' + pctText + '% less <small>the AI can read</small></p>' +
      '<div class="tow-row"><div class="tow-lbl"><span>Without token-optimize</span><b>' + fmt(without) + ' tokens</b></div>' +
      '<div class="tow-track"><div class="tow-bar" style="width:100%;background:var(--tow-bad)"></div></div></div>' +
      '<div class="tow-row"><div class="tow-lbl"><span>With token-optimize</span><b>' + fmt(withIt) + ' tokens</b></div>' +
      '<div class="tow-track"><div class="tow-bar" style="width:' + withWidth + '%;background:var(--tow-good)"></div></div></div>' +
      (blocked ? '<ul class="tow-list">' + blocked + '</ul>' : '') +
      '<p class="tow-note">Cost: +' + fmt(r.instructions.tokens) + ' tokens of instructions per session. ' +
      'Numbers are files the AI could open (4 characters = 1 token), measured with <code>--audit --json</code>.</p>' +
      '<div class="tow-actions"><button class="tow-btn" type="button" data-act="load">Load my report</button>' +
      '<button class="tow-btn" type="button" data-act="hide">Hide</button></div>' +
      (error ? '<p class="tow-err">' + esc(error) + '</p>' : '');
  }

  var current = null;

  function show() { if (!current) return; pill.remove(); document.body.appendChild(box); store(false, false); }
  function hide() { box.remove(); document.body.appendChild(pill); store(false, true); }

  box.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.classList.contains('tow-x') || t.getAttribute('data-act') === 'hide') hide();
    if (t.getAttribute('data-act') === 'load') fileInput.click();
  });
  pill.addEventListener('click', show);

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    file.text().then(function (text) {
      var r = JSON.parse(text);
      if (!r.readable || !r.instructions) throw new Error('bad');
      current = r;
      render(r);
    }).catch(function () {
      render(current, 'That file is not a token-optimize report. Make one with --audit --json.');
    });
    fileInput.value = '';
  });

  function start() {
    document.body.appendChild(fileInput);
    fetch(reportUrl).then(function (res) { return res.json(); }).then(function (r) {
      current = r;
      render(r);
      // Start collapsed if the viewer hid it before, or on phones where it would cover the page.
      if (store(true) || window.innerWidth < 600) document.body.appendChild(pill); else document.body.appendChild(box);
    }).catch(function () { /* no report: stay invisible rather than show a broken box */ });
  }

  // Let the host page control it too: window.tokenOptimizeWidget.show() / .hide()
  window.tokenOptimizeWidget = { show: show, hide: hide };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
