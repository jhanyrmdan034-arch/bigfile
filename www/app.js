/* Telegram Android UI Kit — UI prototype runtime.
   Screens are rendered 1:1 from the Figma scene graph; this file only adds
   navigation, tabs, sheets, typing and back-handling on top of the static design. */
(function () {
  'use strict';

  var DESIGN_W = 412, DESIGN_H = 917;
  var cache = {};
  var loading = {};
  var stack = [];          // [{id, el}]
  var overlay = null;

  window.__SCR = function (id, payload) { cache[id] = payload; };

  /* ---------------- boot ---------------- */
  function boot() {
    var stage = document.getElementById('stage');
    var layers = document.getElementById('layers');
    var viewport = document.getElementById('viewport');

    function fit() {
      var vw = viewport.clientWidth, vh = viewport.clientHeight;
      var k = Math.min(vw / DESIGN_W, vh / DESIGN_H);
      stage.style.transform = 'scale(' + k + ')';
    }
    window.addEventListener('resize', fit);
    fit();

    // Android hardware back / back gesture
    window.__androidBack = function () {
      if (overlay) { closeOverlay(); return true; }
      if (stack.length > 1) { pop(); return true; }
      return false;
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') window.__androidBack();
    });

    open('chat-list', { transition: 'none', root: true });
  }

  /* ---------------- screen loading ---------------- */
  function load(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    if (loading[id]) return loading[id];
    loading[id] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'screens/' + id + '.js';
      s.onload = function () { resolve(cache[id]); };
      s.onerror = function () { reject(new Error('cannot load screen ' + id)); };
      document.head.appendChild(s);
    });
    return loading[id];
  }

  function makeEl(payload, id) {
    var el = document.createElement('div');
    el.className = 'screen' + (payload.kind === 'page' ? ' page' : '');
    el.dataset.screen = id;
    if (payload.kind === 'page') {
      var scroll = document.createElement('div');
      scroll.className = 'scroll';
      var canvas = document.createElement('div');
      canvas.className = 'canvas';
      canvas.style.width = payload.w + 'px';
      canvas.style.height = payload.h + 'px';
      canvas.innerHTML = payload.html;
      scroll.appendChild(canvas);
      el.appendChild(scroll);
      el.style.width = DESIGN_W + 'px';
      el.style.height = DESIGN_H + 'px';
    } else {
      el.innerHTML = payload.html;
      el.style.width = (payload.w || DESIGN_W) + 'px';
      el.style.height = (payload.h || DESIGN_H) + 'px';
    }
    return el;
  }

  /* ---------------- navigation ---------------- */
  function open(id, opts) {
    opts = opts || {};
    return load(id).then(function (payload) {
      if (!payload) return;
      var layers = document.getElementById('layers');
      var prev = stack[stack.length - 1];
      var el = makeEl(payload, id);
      if (opts.root) { stack = []; layers.innerHTML = ''; }
      el.style.zIndex = String(100 + stack.length);
      layers.appendChild(el);
      stack.push({ id: id, el: el, payload: payload });

      var t = opts.transition || 'slide';
      if (t === 'slide') el.classList.add('enter-slide');
      else if (t === 'fade') el.classList.add('enter-fade');
      else if (t === 'pop') el.classList.add('enter-pop');
      if (prev && t === 'slide') {
        prev.el.classList.add('exit-slide');
        setTimeout(function () { prev.el.classList.remove('exit-slide'); }, 300);
      }
      wire(el, id, payload);
      if (payload.kind === 'page') addPageBack(el, payload);
      return el;
    });
  }

  function pop(opts) {
    opts = opts || {};
    if (stack.length < 2) return false;
    var top = stack.pop();
    var prev = stack[stack.length - 1];
    var t = opts.transition || 'slide';
    if (t === 'fade') { top.el.classList.add('exit-fade'); prev.el.classList.add('enter-fade'); }
    else { top.el.classList.add('exit-pop'); prev.el.classList.remove('exit-slide'); }
    setTimeout(function () {
      if (top.el.parentNode) top.el.parentNode.removeChild(top.el);
      prev.el.classList.remove('enter-fade');
    }, 300);
    return true;
  }

  function switchTab(tabId, index) {
    var current = stack[stack.length - 1];
    if (current && current.id === tabId) return;
    // replace the whole stack root: tabs are roots
    stack.forEach(function (s) { if (s.el.parentNode) s.el.parentNode.removeChild(s.el); });
    stack = [];
    open(tabId, { transition: 'fade', root: true }).then(function () { });
  }

  /* ---------------- helpers ---------------- */
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function byName(root, name) { return qsa(root, '[data-n="' + name + '"]'); }

  function hotspot(parent, x, y, w, h, onClick, cls) {
    var d = document.createElement('div');
    d.className = 'hot' + (cls ? ' ' + cls : '');
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.width = w + 'px'; d.style.height = h + 'px';
    d.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ripple(d, ev);
      onClick(ev);
    });
    parent.appendChild(d);
    return d;
  }

  function ripple(host, ev) {
    var r = document.createElement('div');
    r.className = 'ripple';
    var rect = host.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    r.style.width = r.style.height = size + 'px';
    r.style.left = ((ev.clientX || rect.left) - rect.left - size / 2) + 'px';
    r.style.top = ((ev.clientY || rect.top) - rect.top - size / 2) + 'px';
    var screen = host.closest('.screen') || host;
    var sr = screen.getBoundingClientRect();
    r.style.left = ((ev.clientX || rect.left) - sr.left - size / 2) + 'px';
    r.style.top = ((ev.clientY || rect.top) - sr.top - size / 2) + 'px';
    screen.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 460);
  }

  function findByText(root, text, within) {
    var scope = within || root;
    var nodes = qsa(scope, '.t');
    for (var i = 0; i < nodes.length; i++) if (nodes[i].textContent.trim() === text) return nodes[i];
    return null;
  }

  /* map of tab index -> screen id (tab bar is drawn with placeholder labels in the kit) */
  var TABS = ['chat-list', 'contacts', 'settings', 'profile'];

  function addTabHotspots(el) {
    var tabBars = byName(el, 'TabBar').filter(function (n) { return n.classList.contains('n'); });
    var bar = tabBars[tabBars.length - 1];
    if (!bar) return;
    var top = parseFloat(bar.style.top) || 821;
    var colW = 412 / 4;
    TABS.forEach(function (id, i) {
      hotspot(el, i * colW, top + 12, colW, 60, function () {
        if (stack.length === 1 && stack[0].id === id) return;
        switchTab(id, i);
      }, 'round');
    });
  }

  function addAppBarBack(el) {
    var leads = byName(el, 'Leading icon').filter(function (n) { return n.classList.contains('n') || n.classList.contains('v'); });
    if (!leads.length) return;
    leads.forEach(function (n) {
      if (!n.classList.contains('n')) return;
      var x = parseFloat(n.style.left) || 0, y = parseFloat(n.style.top) || 0;
      var w = parseFloat(n.style.width) || 46, h = parseFloat(n.style.height) || 46;
      hotspot(el, x, y, w, h, function () { pop(); }, 'round');
    });
  }

  /* ---------------- per-screen wiring ---------------- */
  function wire(el, id, payload) {
    if (payload.kind === 'page') { wirePage(el, id, payload); return; }

    addTabHotspots(el);
    if (stack.length > 1) addAppBarBack(el);

    // FAB -> design's own bottom sheet
    byName(el, 'FAB').forEach(function (n) {
      if (!n.classList.contains('n')) return;
      var x = parseFloat(n.style.left) || 0, y = parseFloat(n.style.top) || 0;
      var w = parseFloat(n.style.width) || 46, h = parseFloat(n.style.height) || 46;
      hotspot(el, x - 4, y - 4, w + 8, h + 8, function () { openSheet('c-sheet-0'); }, 'round');
    });

    // app-bar avatar / headline -> chat info
    if (/^chat-/.test(id) && !/-info$/.test(id)) {
      var bar = byName(el, 'App Bar')[0];
      if (bar) {
        var bx = parseFloat(bar.style.left) || 0, by = parseFloat(bar.style.top) || 0;
        var bw = parseFloat(bar.style.width) || 412, bh = parseFloat(bar.style.height) || 114;
        hotspot(el, bx + 59, by + 52, 258, 46, function () {
          var target = { 'chat-personal': 'chat-personal-info', 'chat-group': 'chat-group-info', 'chat-bot': 'chat-bot-info', 'chat-bot-greeting': 'chat-bot-info' }[id];
          if (target) open(target, { transition: 'pop' });
        });
      }
      wireComposer(el, id);
    }

    // chat list rows -> open a chat
    var rows = byName(el, 'Item').filter(function (n) { return n.classList.contains('n'); });
    if (rows.length) {
      var chatTargets = ['chat-personal', 'chat-group', 'chat-bot', 'chat-personal', 'chat-group'];
      var chatScreens = ['chat-personal', 'chat-personal-info', 'chat-group', 'chat-group-info', 'chat-bot', 'chat-bot-greeting', 'chat-bot-info'];
      rows.forEach(function (n, i) {
        var x = parseFloat(n.style.left) || 0, y = parseFloat(n.style.top) || 0;
        var w = parseFloat(n.style.width) || 412, h = parseFloat(n.style.height) || 72;
        hotspot(el, x, y, w, h, function () { open(chatTargets[i % chatTargets.length]); });
      });
    }

    // app bar menu (hamburger area) -> design's own menu sheet
    if (/chat-list|contacts|settings|profile/.test(id)) {
      var lead = byName(el, 'Leading icon').filter(function (n) { return n.classList.contains('n'); })[0];
      if (lead) {
        var lx = parseFloat(lead.style.left) || 7, ly = parseFloat(lead.style.top) || 60;
        hotspot(el, lx, ly, 46, 46, function () { openSheet('c-menu-0'); }, 'round');
      }
      var trail = byName(el, 'Trailing elements').filter(function (n) { return n.classList.contains('n'); })[0];
      if (trail) {
        var tx = parseFloat(trail.style.left) || 323, ty = parseFloat(trail.style.top) || 60;
        var tw = parseFloat(trail.style.width) || 82, th = parseFloat(trail.style.height) || 46;
        hotspot(el, tx, ty, tw, th, function () { openSheet('c-menu-1'); }, 'round');
      }
    }

    // settings / profile rows -> dialogs + info screens
    if (id === 'settings' || id === 'profile' || id === 'profile-scroll') {
      var cells = byName(el, 'Cell').concat(byName(el, 'Item')).filter(function (n) { return n.classList.contains('n'); });
      cells.slice(0, 12).forEach(function (n, i) {
        var x = parseFloat(n.style.left) || 0, y = parseFloat(n.style.top) || 0;
        var w = parseFloat(n.style.width) || 412, h = parseFloat(n.style.height) || 56;
        hotspot(el, x, y, w, h, function () {
          if (i % 4 === 0) openDialog('c-dialog-0');
          else if (i % 4 === 1) openSheet('c-menu-2');
        });
      });
    }

    // generic ripple on every tappable-looking element
    qsa(el, '.n[data-n="Button"], .n[data-n="Cell"], .n[data-n="Item"], .n[data-n="Trailing action 1"], .n[data-n="Trailing action 2"]').forEach(function (n) {
      if (n.__rippled) return;
      n.__rippled = true;
      n.addEventListener('pointerdown', function (ev) { ripple(n, ev); });
    });
  }

  /* ---------------- composer (typing + sending) ---------------- */
  function wireComposer(el, id) {
    var writeBar = byName(el, 'Write bar').filter(function (n) { return n.classList.contains('n'); })[0];
    if (!writeBar) return;
    var placeholder = null;
    var cands = qsa(writeBar, '.t');
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].textContent.trim() === 'Message' && cands[i].clientWidth > 100) { placeholder = cands[i]; break; }
    }
    if (!placeholder) return;
    var original = placeholder.textContent;
    var value = '';
    var focused = false;

    // invisible input that owns the keyboard
    var input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('autocomplete', 'off');
    input.style.cssText = 'position:absolute;opacity:0;border:0;outline:0;background:transparent;color:transparent;caret-color:transparent;font-size:16px;';
    var px = parseFloat(placeholder.style.left) || 0, py = parseFloat(placeholder.style.top) || 0;
    var pw = parseFloat(placeholder.style.width) || 269, ph = parseFloat(placeholder.style.height) || 38;
    input.style.left = px + 'px';
    input.style.top = py + 'px';
    input.style.width = pw + 'px';
    input.style.height = ph + 'px';
    input.style.zIndex = '80';
    writeBar.appendChild(input);

    var caret = document.createElement('div');
    caret.className = 'caret';
    caret.style.display = 'none';
    caret.style.left = (px + 2) + 'px';
    caret.style.top = (py + 12) + 'px';
    caret.style.height = '18px';
    writeBar.appendChild(caret);

    function render() {
      if (!value) {
        placeholder.textContent = original;
        caret.style.display = focused ? 'block' : 'none';
        caret.style.left = (px + 2) + 'px';
      } else {
        placeholder.textContent = value;
        caret.style.display = focused ? 'block' : 'none';
        // place caret at end of the text using a measuring span
        var probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + getComputedStyle(placeholder).font;
        probe.textContent = value;
        writeBar.appendChild(probe);
        caret.style.left = (px + probe.offsetWidth + 1) + 'px';
        writeBar.removeChild(probe);
      }
    }

    writeBar.addEventListener('click', function (ev) {
      if (ev.target === input) return;
      input.focus();
    });
    input.addEventListener('focus', function () { focused = true; render(); });
    input.addEventListener('blur', function () { focused = false; render(); });
    input.addEventListener('input', function () { value = input.value; render(); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && value.trim()) {
        ev.preventDefault();
        sendMessage(el, value.trim());
        value = '';
        input.value = '';
        render();
      }
    });

    // send button (trailing element of the write bar) sends the message
    var sendBtns = qsa(writeBar, '[data-n="Trailing element 1"], [data-n="Trailing elements"]');
    sendBtns.forEach(function (b) {
      b.style.pointerEvents = 'auto';
      b.addEventListener('click', function () {
        if (value.trim()) {
          sendMessage(el, value.trim());
          value = ''; input.value = ''; render();
        } else {
          input.focus();
        }
      });
    });
  }

  /* appends a locally typed message, styled with a bubble component from the design kit */
  function sendMessage(el, text) {
    var content = byName(el, 'Content').filter(function (n) { return n.classList.contains('n'); })[0];
    if (!content) return;
    var wrap = document.createElement('div');
    wrap.className = 'localMsg';
    wrap.style.position = 'absolute';
    wrap.style.right = '8px';
    wrap.style.bottom = '96px';
    wrap.style.zIndex = '90';
    wrap.style.maxWidth = '300px';
    wrap.innerHTML =
      '<div style="background:#effdde;border-radius:14px 14px 4px 14px;padding:7px 11px;' +
      'font-family:Roboto;font-size:15px;line-height:21px;color:#000;box-shadow:0 1px 1px rgba(0,0,0,.08);' +
      'word-break:break-word;">' + escapeHtml(text) + '</div>';
    el.appendChild(wrap);
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------- overlays (sheets / dialogs) ---------------- */
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.innerHTML = '<div id="scrim"></div><div class="sheet"><div class="sheetInner"></div></div>' +
      '<div class="dialog"><div class="dlgInner"></div></div>';
    document.getElementById('stage').appendChild(overlay);
    overlay.addEventListener('click', function (ev) {
      if (ev.target.id === 'scrim' || ev.target.classList.contains('dialog')) closeOverlay();
    });
    return overlay;
  }

  function openSheet(componentId) {
    return load(componentId).then(function (p) {
      if (!p) return;
      var ov = ensureOverlay();
      ov.querySelector('.dialog').style.display = 'none';
      var sheet = ov.querySelector('.sheet');
      sheet.style.display = 'flex';
      var inner = ov.querySelector('.sheetInner');
      inner.style.width = (p.w || 412) + 'px';
      inner.style.height = (p.h || 200) + 'px';
      inner.innerHTML = p.html;
      wireStatic(inner, componentId, p);
      ov.classList.add('on');
    });
  }

  function openDialog(componentId) {
    return load(componentId).then(function (p) {
      if (!p) return;
      var ov = ensureOverlay();
      ov.querySelector('.sheet').style.display = 'none';
      var dlg = ov.querySelector('.dialog');
      dlg.style.display = 'flex';
      var inner = ov.querySelector('.dlgInner');
      inner.style.width = (p.w || 300) + 'px';
      inner.style.height = (p.h || 200) + 'px';
      inner.innerHTML = p.html;
      wireStatic(inner, componentId, p);
      ov.classList.add('on');
    });
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.remove('on');
    setTimeout(function () {
      if (overlay && !overlay.classList.contains('on')) {
        overlay.querySelector('.sheetInner').innerHTML = '';
        overlay.querySelector('.dlgInner').innerHTML = '';
      }
    }, 320);
  }

  function wireStatic(root, id, payload) {
    root.querySelectorAll('.n').forEach(function (n) {
      n.style.pointerEvents = 'auto';
      n.addEventListener('pointerdown', function (ev) { ripple(n, ev); });
    });
    // tapping a row in one of the design's menu sheets navigates:
    // the first menu opens the design sections index (every page of the Figma file)
    root.addEventListener('click', function (ev) {
      var t = ev.target.closest('.n');
      if (!t) return;
      var name = t.getAttribute('data-n') || '';
      if (/Menu|Item|Cell|Row/.test(name)) {
        var rows = Array.prototype.slice.call(root.querySelectorAll('.n[data-n="Item"], .n[data-n="Cell"], .n[data-n="Row"]'));
        var idx = rows.indexOf(t);
        setTimeout(function () {
          closeOverlay();
          if (idx >= 0 && window.__MANIFEST) {
            setTimeout(function () { window.__openKitIndex(window.__MANIFEST.pages); }, 160);
          }
        }, 120);
      }
    });
  }

  /* ---------------- kit gallery pages ---------------- */
  function wirePage(el, id, payload) {
    var back = document.createElement('div');
    back.style.cssText = 'position:absolute;left:10px;top:10px;width:40px;height:40px;border-radius:20px;' +
      'background:rgba(0,0,0,.55);z-index:120;display:flex;align-items:center;justify-content:center;color:#fff;font:500 20px Roboto;';
    back.textContent = '‹';
    back.addEventListener('click', function () { pop(); });
    el.appendChild(back);
  }

  /* the kit index (list of every page in the Figma file) */
  window.__openKitIndex = function (pages) {
    var ov = ensureOverlay();
    ov.querySelector('.dialog').style.display = 'none';
    var sheet = ov.querySelector('.sheet');
    sheet.style.display = 'flex';
    var inner = ov.querySelector('.sheetInner');
    inner.style.width = '412px';
    inner.style.height = '560px';
    inner.style.background = '#fff';
    inner.style.borderRadius = '24px 24px 0 0';
    inner.style.overflow = 'auto';
    var html = '<div style="padding:18px 20px 8px;font:500 20px Roboto;color:#000">Design sections</div>';
    pages.forEach(function (p, i) {
      html += '<div data-page="' + p.id + '" style="display:flex;align-items:center;justify-content:space-between;' +
        'padding:13px 20px;font:400 16px Roboto;color:#000;border-top:1px solid #ececec">' +
        '<span>' + p.name + '</span><span style="color:#9aa6b2;font-size:13px">' + p.w + '×' + p.h + '</span></div>';
    });
    html += '<div style="height:12px"></div>';
    inner.innerHTML = html;
    inner.querySelectorAll('[data-page]').forEach(function (row) {
      row.addEventListener('click', function () {
        closeOverlay();
        setTimeout(function () { open(row.dataset.page, { transition: 'pop' }); }, 140);
      });
    });
    ov.classList.add('on');
  };

  /* preview hook: render a single screen (used by the screenshot tooling) */
  window.__previewScreen = function (id) {
    return load(id).then(function (payload) {
      var layers = document.getElementById('layers');
      layers.innerHTML = '';
      var el = makeEl(payload, id);
      el.style.zIndex = '100';
      layers.appendChild(el);
      var stage = document.getElementById('stage');
      var isPage = payload.kind === 'page';
      if (isPage) {
        var k = Math.min(1, 412 / payload.w, 917 / payload.h);
        stage.style.width = payload.w + 'px';
        stage.style.height = payload.h + 'px';
        stage.style.transform = 'scale(' + k + ')';
        stage.style.transformOrigin = '0 0';
      } else {
        stage.style.width = (payload.w || 412) + 'px';
        stage.style.height = (payload.h || 917) + 'px';
        stage.style.transform = 'scale(1)';
        stage.style.transformOrigin = '0 0';
        el.style.width = (payload.w || 412) + 'px';
        el.style.height = (payload.h || 917) + 'px';
      }
      wire(el, id, payload);
      return { id: id, w: payload.w, h: payload.h, kind: payload.kind };
    });
  };

  window.__boot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
