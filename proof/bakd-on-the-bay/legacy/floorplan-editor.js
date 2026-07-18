/* Floor plan editor — point-and-click + drag-and-drop, fully to scale.
   Loads the draft from the floorplan function, lets the admin add/move/resize
   booths and edit every property, then saves the draft or publishes it live.

   Supports multi-selection (shift/ctrl-click or marquee drag), group editing
   (move several booths at once, bulk-change properties, align), and merging a
   selection into a single larger booth — handy for building sponsor blocks
   (e.g. Platinum 20×20, Gold 20×10, Silver 10×10). */
(function () {
  var ENDPOINT = '/.netlify/functions/floorplan';

  var USE_COLORS = {
    vendor: '#9FE22D', food: '#FF7A45', sponsor: '#7C5CFF', stage: '#F472B6',
    entrance: '#22D3EE', restroom: '#64748b', lounge: '#F5B942', other: '#94a3b8'
  };
  // Premium vendor booths render in gold so they stand apart from standard booths.
  var PREMIUM_COLOR = '#FFC845';
  var USE_LABELS = {
    vendor: 'Vendor', food: 'Food', sponsor: 'Sponsor', stage: 'Stage / Entertainment',
    entrance: 'Entrance', restroom: 'Restroom', lounge: 'Lounge', other: 'Other'
  };

  // A vendor booth whose tier is "premium" is a premium booth; every other vendor
  // booth is standard. Only vendor booths carry this standard/premium split.
  function isPremiumBooth(b) {
    return !!b && b.use === 'vendor' && String(b.tier || '').toLowerCase() === 'premium';
  }
  function boothColor(b) {
    return isPremiumBooth(b) ? PREMIUM_COLOR : (USE_COLORS[b.use] || USE_COLORS.other);
  }

  // Sponsor block presets — quick-add a sponsor booth at a standard tier size.
  var SPONSOR_TIERS = [
    { tier: 'platinum', label: 'Platinum', wFt: 20, hFt: 20 },
    { tier: 'gold', label: 'Gold', wFt: 20, hFt: 10 },
    { tier: 'silver', label: 'Silver', wFt: 10, hFt: 10 }
  ];

  var stage = document.getElementById('stage');
  var statusMsg = document.getElementById('statusMsg');
  var countPill = document.getElementById('countPill');
  var inspectorBody = document.getElementById('inspectorBody');
  var venueName = document.getElementById('venueName');
  var venueW = document.getElementById('venueW');
  var venueH = document.getElementById('venueH');
  var zoomIn = document.getElementById('zoom');

  var state = { venue: { name: '', widthFt: 200, heightFt: 120 }, booths: [] };
  var selection = [];      // ids of every selected booth
  var scale = 4;           // px per foot

  function setStatus(msg, isErr) {
    statusMsg.textContent = msg;
    statusMsg.style.borderColor = isErr ? '#ef4444' : 'var(--border)';
    statusMsg.style.color = isErr ? '#ffb4b4' : '';
  }

  function uid() { return 'b-' + Date.now().toString(36) + '-' + Math.round(Math.random() * 1e6).toString(36); }

  // ── Selection helpers ──
  function isSel(id) { return selection.indexOf(id) !== -1; }
  function selectedBooths() { return state.booths.filter(function (b) { return isSel(b.id); }); }
  function primary() { return state.booths.find(function (b) { return b.id === selection[0]; }) || null; }

  function setSelection(ids) {
    selection = ids.slice();
    stage.querySelectorAll('.booth').forEach(function (el) { el.classList.toggle('sel', isSel(el.dataset.id)); });
    renderInspector();
  }
  function toggleSelection(id) {
    var i = selection.indexOf(id);
    if (i === -1) selection.push(id); else selection.splice(i, 1);
    stage.querySelectorAll('.booth').forEach(function (el) { el.classList.toggle('sel', isSel(el.dataset.id)); });
    renderInspector();
  }
  function clearSelection() { setSelection([]); }

  function renderStage() {
    scale = Math.max(1, Number(zoomIn.value) || 4);
    stage.style.width = (state.venue.widthFt * scale) + 'px';
    stage.style.height = (state.venue.heightFt * scale) + 'px';
    stage.style.backgroundSize = (5 * scale) + 'px ' + (5 * scale) + 'px';
    stage.innerHTML = '';
    state.booths.forEach(function (b) { stage.appendChild(boothEl(b)); });
    countPill.textContent = state.booths.length + (state.booths.length === 1 ? ' booth' : ' booths');
    renderLegend();
  }

  function boothEl(b) {
    var el = document.createElement('div');
    el.className = 'booth status-' + b.status;
    el.dataset.id = b.id;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', (b.label ? 'Booth ' + b.label : 'Booth') + ' — ' + (USE_LABELS[b.use] || b.use) + ', ' + b.status + '. Use arrow keys to move.');
    el.style.left = (b.x * scale) + 'px';
    el.style.top = (b.y * scale) + 'px';
    el.style.width = (b.wFt * scale) + 'px';
    el.style.height = (b.hFt * scale) + 'px';
    el.style.background = boothColor(b);
    if (isSel(b.id)) el.classList.add('sel');
    var label = b.label || '';
    el.innerHTML = '<span class="lbl">' + escHtml(label) + '</span><span class="handle"></span>';
    attachDrag(el, b);
    return el;
  }

  function renderLegend() {
    var legend = document.getElementById('legend');
    var used = {};
    state.booths.forEach(function (b) { used[b.use] = true; });
    var hasStandard = state.booths.some(function (b) { return b.use === 'vendor' && !isPremiumBooth(b); });
    var hasPremium = state.booths.some(isPremiumBooth);
    var parts = [];
    Object.keys(USE_LABELS).forEach(function (k) {
      if (!used[k]) return;
      if (k === 'vendor') {
        // Standard and premium booths appear as separate keys, each in its color.
        if (hasStandard) parts.push('<span><i style="background:' + USE_COLORS.vendor + '"></i>Standard Booth</span>');
        if (hasPremium) parts.push('<span><i style="background:' + PREMIUM_COLOR + '"></i>Premium Booth</span>');
      } else {
        parts.push('<span><i style="background:' + USE_COLORS[k] + '"></i>' + USE_LABELS[k] + '</span>');
      }
    });
    legend.innerHTML = parts.join('') + '<span style="margin-left:8px">Faded = available · Dashed = reserved · Solid = sold · Shift-click or drag a box to multi-select</span>';
  }

  function escHtml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Drag to move (single or group) + resize ──
  function attachDrag(el, b) {
    var handle = el.querySelector('.handle');

    handle.addEventListener('pointerdown', function (e) {
      e.stopPropagation(); e.preventDefault();
      setSelection([b.id]);
      var startX = e.clientX, startY = e.clientY, startW = b.wFt, startH = b.hFt;
      handle.setPointerCapture(e.pointerId);
      function move(ev) {
        var dw = Math.round((ev.clientX - startX) / scale);
        var dh = Math.round((ev.clientY - startY) / scale);
        b.wFt = clamp(startW + dw, 1, 500);
        b.hFt = clamp(startH + dh, 1, 500);
        el.style.width = (b.wFt * scale) + 'px';
        el.style.height = (b.hFt * scale) + 'px';
        syncInspectorSizes(b);
      }
      function up() { handle.releasePointerCapture(e.pointerId); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });

    el.addEventListener('pointerdown', function (e) {
      if (e.target === handle) return;
      e.preventDefault();

      // Modifier-click toggles this booth in/out of the selection without moving.
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        toggleSelection(b.id);
        return;
      }
      // Plain click on a booth that is not part of the current multi-selection
      // collapses the selection to just this booth. Clicking a booth that is
      // already in the selection keeps the whole group (so you can drag it).
      if (!isSel(b.id)) setSelection([b.id]);

      var group = selectedBooths();
      var origins = group.map(function (g) { return { b: g, x: g.x, y: g.y }; });
      var startX = e.clientX, startY = e.clientY;
      el.style.cursor = 'grabbing';
      el.setPointerCapture(e.pointerId);
      function move(ev) {
        var dx = Math.round((ev.clientX - startX) / scale);
        var dy = Math.round((ev.clientY - startY) / scale);
        origins.forEach(function (o) {
          o.b.x = clamp(o.x + dx, 0, Math.max(0, state.venue.widthFt - o.b.wFt));
          o.b.y = clamp(o.y + dy, 0, Math.max(0, state.venue.heightFt - o.b.hFt));
          positionBooth(o.b);
        });
        if (group.length === 1) syncInspectorPos(group[0]);
      }
      function up() { el.releasePointerCapture(e.pointerId); el.style.cursor = 'grab'; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); }
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  function positionBooth(b) {
    var el = stage.querySelector('.booth[data-id="' + b.id + '"]');
    if (!el) return;
    el.style.left = (b.x * scale) + 'px';
    el.style.top = (b.y * scale) + 'px';
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  // ── Marquee (rubber-band) selection ──
  stage.addEventListener('pointerdown', function (e) {
    if (e.target !== stage) return;
    e.preventDefault();
    var rect = stage.getBoundingClientRect();
    var ox = e.clientX, oy = e.clientY;
    var additive = e.shiftKey || e.ctrlKey || e.metaKey;
    var box = document.createElement('div');
    box.className = 'marquee';
    stage.appendChild(box);
    var moved = false;
    stage.setPointerCapture(e.pointerId);

    function move(ev) {
      moved = true;
      var x1 = Math.min(ox, ev.clientX), y1 = Math.min(oy, ev.clientY);
      var x2 = Math.max(ox, ev.clientX), y2 = Math.max(oy, ev.clientY);
      box.style.left = (x1 - rect.left) + 'px';
      box.style.top = (y1 - rect.top) + 'px';
      box.style.width = (x2 - x1) + 'px';
      box.style.height = (y2 - y1) + 'px';
    }
    function up(ev) {
      stage.releasePointerCapture(e.pointerId);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
      box.remove();
      if (!moved) { if (!additive) clearSelection(); return; }
      // Convert the marquee rectangle to venue feet and select intersections.
      var rx1 = (Math.min(ox, ev.clientX) - rect.left) / scale;
      var ry1 = (Math.min(oy, ev.clientY) - rect.top) / scale;
      var rx2 = (Math.max(ox, ev.clientX) - rect.left) / scale;
      var ry2 = (Math.max(oy, ev.clientY) - rect.top) / scale;
      var hits = state.booths.filter(function (b) {
        return b.x < rx2 && (b.x + b.wFt) > rx1 && b.y < ry2 && (b.y + b.hFt) > ry1;
      }).map(function (b) { return b.id; });
      if (additive) {
        var merged = selection.slice();
        hits.forEach(function (id) { if (merged.indexOf(id) === -1) merged.push(id); });
        setSelection(merged);
      } else {
        setSelection(hits);
      }
      if (hits.length) setStatus(hits.length + ' booths selected.');
    }
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  });

  // ── Inspector ──
  function renderInspector() {
    var n = selection.length;
    if (n === 0) { inspectorBody.innerHTML = '<p class="empty-aside">No booth selected.</p>'; return; }
    if (n > 1) { renderGroupInspector(); return; }
    renderSingleInspector(primary());
  }

  function renderSingleInspector(b) {
    if (!b) { inspectorBody.innerHTML = '<p class="empty-aside">No booth selected.</p>'; return; }
    var useOpts = Object.keys(USE_LABELS).map(function (k) {
      return '<option value="' + k + '"' + (b.use === k ? ' selected' : '') + '>' + USE_LABELS[k] + '</option>';
    }).join('');
    var statusOpts = ['available', 'reserved', 'sold'].map(function (s) {
      return '<option value="' + s + '"' + (b.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join('');
    var tierOpts = ['', 'standard', 'premium', 'platinum', 'gold', 'silver', 'bronze'].map(function (t) {
      var lbl = t ? t.charAt(0).toUpperCase() + t.slice(1) : '— none —';
      return '<option value="' + t + '"' + ((b.tier || '') === t ? ' selected' : '') + '>' + lbl + '</option>';
    }).join('');
    inspectorBody.innerHTML =
      '<div class="field"><label>Label / Booth #</label><input id="iLabel" type="text" value="' + escHtml(b.label) + '" placeholder="A12"></div>' +
      '<div class="row2"><div class="field"><label>Width (ft)</label><input id="iW" type="number" min="1" max="500" value="' + b.wFt + '"></div>' +
      '<div class="field"><label>Depth (ft)</label><input id="iH" type="number" min="1" max="500" value="' + b.hFt + '"></div></div>' +
      '<div class="row2"><div class="field"><label>X (ft)</label><input id="iX" type="number" min="0" value="' + b.x + '"></div>' +
      '<div class="field"><label>Y (ft)</label><input id="iY" type="number" min="0" value="' + b.y + '"></div></div>' +
      '<div class="field"><label>Use</label><select id="iUse">' + useOpts + '</select></div>' +
      '<div class="field"><label>Status</label><select id="iStatus">' + statusOpts + '</select></div>' +
      '<div class="field"><label>Tier / booth class</label><select id="iTier">' + tierOpts + '</select></div>' +
      '<div class="field"><label>Price</label><input id="iPrice" type="text" value="' + escHtml(b.price) + '" placeholder="$300"></div>' +
      '<div class="field"><label>Assigned to</label><input id="iAssigned" type="text" value="' + escHtml(b.assignedTo) + '" placeholder="Business / vendor name"></div>' +
      '<div class="field"><label>Logo URL</label><input id="iLogo" type="text" value="' + escHtml(b.logoUrl || '') + '" placeholder="https://… (shown on hover)"></div>' +
      '<div class="field"><label>Notes</label><textarea id="iNotes" placeholder="Anything else…">' + escHtml(b.notes) + '</textarea></div>' +
      '<div style="display:flex; gap:8px; margin-top:6px">' +
        '<button class="btn ghost" id="dupBtn" type="button" style="flex:1">Duplicate</button>' +
        '<button class="btn warn" id="delBtn" type="button" style="flex:1">Delete</button>' +
      '</div>';

    bindInput('iLabel', function (v) { b.label = v; redrawBooth(b); });
    bindInput('iW', function (v) { b.wFt = clamp(Number(v) || 1, 1, 500); redrawBooth(b); });
    bindInput('iH', function (v) { b.hFt = clamp(Number(v) || 1, 1, 500); redrawBooth(b); });
    bindInput('iX', function (v) { b.x = clamp(Number(v) || 0, 0, 2000); redrawBooth(b); });
    bindInput('iY', function (v) { b.y = clamp(Number(v) || 0, 0, 2000); redrawBooth(b); });
    bindInput('iUse', function (v) { b.use = v; redrawBooth(b); renderLegend(); });
    bindInput('iStatus', function (v) { b.status = v; redrawBooth(b); });
    // A tier change can flip a vendor booth between standard and premium, which
    // changes its color and the legend, so redraw and refresh both.
    bindInput('iTier', function (v) { b.tier = v; redrawBooth(b); renderLegend(); });
    bindInput('iPrice', function (v) { b.price = v; });
    bindInput('iAssigned', function (v) { b.assignedTo = v; });
    bindInput('iLogo', function (v) { b.logoUrl = v; });
    bindInput('iNotes', function (v) { b.notes = v; });

    document.getElementById('dupBtn').addEventListener('click', function () { duplicateBooth(b); });
    document.getElementById('delBtn').addEventListener('click', function () { deleteBooth(b); });
  }

  // Group inspector — shown whenever more than one booth is selected.
  function renderGroupInspector() {
    var group = selectedBooths();
    var useOpts = '<option value="">— keep —</option>' + Object.keys(USE_LABELS).map(function (k) {
      return '<option value="' + k + '">' + USE_LABELS[k] + '</option>';
    }).join('');
    var statusOpts = '<option value="">— keep —</option>' + ['available', 'reserved', 'sold'].map(function (s) {
      return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join('');
    inspectorBody.innerHTML =
      '<div class="status-msg" style="margin-bottom:12px">' + group.length + ' booths selected. Drag any one to move them together.</div>' +
      '<div class="field"><label>Set use for all</label><select id="gUse">' + useOpts + '</select></div>' +
      '<div class="field"><label>Set status for all</label><select id="gStatus">' + statusOpts + '</select></div>' +
      '<div class="field"><label>Set price for all</label><input id="gPrice" type="text" placeholder="leave blank to keep"></div>' +
      '<div class="field"><label>Set tier / booth class for all</label>' +
        '<select id="gTier"><option value="">— keep —</option><option value="standard">Standard</option><option value="premium">Premium</option><option value="platinum">Platinum</option><option value="gold">Gold</option><option value="silver">Silver</option><option value="bronze">Bronze</option></select></div>' +
      '<div class="field"><label>Align</label><div class="row2" style="grid-template-columns:1fr 1fr 1fr 1fr; gap:6px">' +
        '<button class="btn ghost" id="alLeft" type="button" title="Align left">⇤</button>' +
        '<button class="btn ghost" id="alRight" type="button" title="Align right">⇥</button>' +
        '<button class="btn ghost" id="alTop" type="button" title="Align top">⤒</button>' +
        '<button class="btn ghost" id="alBottom" type="button" title="Align bottom">⤓</button>' +
      '</div></div>' +
      '<div style="display:flex; flex-direction:column; gap:8px; margin-top:10px">' +
        '<button class="btn" id="mergeBtn" type="button">Merge into one booth</button>' +
        '<button class="btn ghost" id="gDupBtn" type="button">Duplicate selection</button>' +
        '<button class="btn warn" id="gDelBtn" type="button">Delete selected</button>' +
      '</div>' +
      '<p class="hint" style="margin-top:10px">Merge replaces the selection with one booth covering the whole block — use it to build sponsor spaces like Platinum 20×20 from smaller booths.</p>';

    bindInput('gUse', function (v) { if (!v) return; group.forEach(function (b) { b.use = v; redrawBooth(b); }); renderLegend(); });
    bindInput('gStatus', function (v) { if (!v) return; group.forEach(function (b) { b.status = v; redrawBooth(b); }); });
    bindInput('gPrice', function (v) { group.forEach(function (b) { b.price = v; }); });
    bindInput('gTier', function (v) { if (!v) return; group.forEach(function (b) { b.tier = v; redrawBooth(b); }); renderLegend(); });

    document.getElementById('alLeft').addEventListener('click', function () { alignGroup('left'); });
    document.getElementById('alRight').addEventListener('click', function () { alignGroup('right'); });
    document.getElementById('alTop').addEventListener('click', function () { alignGroup('top'); });
    document.getElementById('alBottom').addEventListener('click', function () { alignGroup('bottom'); });
    document.getElementById('mergeBtn').addEventListener('click', mergeSelection);
    document.getElementById('gDupBtn').addEventListener('click', duplicateSelection);
    document.getElementById('gDelBtn').addEventListener('click', deleteSelection);
  }

  function bindInput(id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    var ev = (el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(ev, function () { fn(el.value); });
  }

  function redrawBooth(b) {
    var el = stage.querySelector('.booth[data-id="' + b.id + '"]');
    if (!el) return;
    el.className = 'booth status-' + b.status + (isSel(b.id) ? ' sel' : '');
    el.style.left = (b.x * scale) + 'px';
    el.style.top = (b.y * scale) + 'px';
    el.style.width = (b.wFt * scale) + 'px';
    el.style.height = (b.hFt * scale) + 'px';
    el.style.background = boothColor(b);
    el.querySelector('.lbl').textContent = b.label || '';
  }

  function syncInspectorPos(b) {
    var x = document.getElementById('iX'), y = document.getElementById('iY');
    if (x) x.value = b.x; if (y) y.value = b.y;
  }
  function syncInspectorSizes(b) {
    var w = document.getElementById('iW'), h = document.getElementById('iH');
    if (w) w.value = b.wFt; if (h) h.value = b.hFt;
  }

  // ── Group operations ──
  function selectionBounds(group) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    group.forEach(function (b) {
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.wFt); maxY = Math.max(maxY, b.y + b.hFt);
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function alignGroup(edge) {
    var group = selectedBooths();
    if (group.length < 2) return;
    var bnd = selectionBounds(group);
    group.forEach(function (b) {
      if (edge === 'left') b.x = bnd.minX;
      else if (edge === 'right') b.x = clamp(bnd.maxX - b.wFt, 0, state.venue.widthFt - b.wFt);
      else if (edge === 'top') b.y = bnd.minY;
      else if (edge === 'bottom') b.y = clamp(bnd.maxY - b.hFt, 0, state.venue.heightFt - b.hFt);
      redrawBooth(b);
    });
    setStatus('Aligned ' + group.length + ' booths ' + edge + '.');
  }

  // Most common use across the selection, used as the merged booth's use.
  function dominantUse(group) {
    var counts = {};
    group.forEach(function (b) { counts[b.use] = (counts[b.use] || 0) + 1; });
    var best = group[0].use, max = 0;
    Object.keys(counts).forEach(function (k) { if (counts[k] > max) { max = counts[k]; best = k; } });
    return best;
  }

  function mergeSelection() {
    var group = selectedBooths();
    if (group.length < 2) return;
    var bnd = selectionBounds(group);
    var lead = group[0];
    var merged = {
      id: uid(),
      label: lead.label || '',
      x: bnd.minX, y: bnd.minY,
      wFt: clamp(bnd.maxX - bnd.minX, 1, 500),
      hFt: clamp(bnd.maxY - bnd.minY, 1, 500),
      use: dominantUse(group),
      status: lead.status || 'available',
      tier: lead.tier || '',
      price: lead.price || '',
      assignedTo: lead.assignedTo || '',
      logoUrl: lead.logoUrl || '',
      notes: lead.notes || ''
    };
    var ids = group.map(function (b) { return b.id; });
    state.booths = state.booths.filter(function (b) { return ids.indexOf(b.id) === -1; });
    state.booths.push(merged);
    renderStage();
    setSelection([merged.id]);
    setStatus('Merged ' + group.length + ' booths into one ' + merged.wFt + '×' + merged.hFt + ' space.');
  }

  function duplicateSelection() {
    var group = selectedBooths();
    if (!group.length) return;
    var copies = group.map(function (b) {
      return Object.assign({}, b, { id: uid(), x: clamp(b.x + 4, 0, 2000), y: clamp(b.y + 4, 0, 2000) });
    });
    copies.forEach(function (c) { state.booths.push(c); });
    renderStage();
    setSelection(copies.map(function (c) { return c.id; }));
    setStatus('Duplicated ' + copies.length + ' booths.');
  }

  function deleteSelection() {
    var group = selectedBooths();
    if (!group.length) return;
    var ids = group.map(function (b) { return b.id; });
    state.booths = state.booths.filter(function (b) { return ids.indexOf(b.id) === -1; });
    clearSelection();
    renderStage();
    setStatus('Deleted ' + ids.length + ' booths.');
  }

  function addBooth(props) {
    var b = Object.assign({
      id: uid(), label: '', x: 4, y: 4, wFt: 10, hFt: 10,
      use: 'vendor', status: 'available', tier: '', price: '', assignedTo: '', logoUrl: '', notes: ''
    }, props || {});
    state.booths.push(b);
    renderStage();
    setSelection([b.id]);
    return b;
  }

  function duplicateBooth(b) {
    var copy = Object.assign({}, b, { id: uid(), x: clamp(b.x + 2, 0, 2000), y: clamp(b.y + 2, 0, 2000), label: b.label });
    state.booths.push(copy);
    renderStage();
    setSelection([copy.id]);
  }

  function deleteBooth(b) {
    state.booths = state.booths.filter(function (x) { return x.id !== b.id; });
    clearSelection();
    renderStage();
  }

  // ── Sponsor tier quick-add ──
  function addSponsorTier(tier) {
    addBooth({
      label: tier.label, wFt: tier.wFt, hFt: tier.hFt,
      use: 'sponsor', tier: tier.tier, status: 'available'
    });
    setStatus('Added a ' + tier.label + ' sponsor block (' + tier.wFt + '×' + tier.hFt + '). Drag it into place.');
  }

  // ── Quick-add a block ──
  document.getElementById('qgAddBtn').addEventListener('click', function () {
    var count = clamp(parseInt(document.getElementById('qgCount').value, 10) || 0, 1, 500);
    var cols = clamp(parseInt(document.getElementById('qgCols').value, 10) || 1, 1, 50);
    var w = clamp(parseInt(document.getElementById('qgW').value, 10) || 10, 1, 200);
    var h = clamp(parseInt(document.getElementById('qgH').value, 10) || 10, 1, 200);
    var use = document.getElementById('qgUse').value;
    var gap = 2, startX = 4, startY = 4;
    var existing = state.booths.length;
    for (var i = 0; i < count; i++) {
      var r = Math.floor(i / cols), c = i % cols;
      addBoothSilent({
        label: String(existing + i + 1),
        x: clamp(startX + c * (w + gap), 0, 2000),
        y: clamp(startY + r * (h + gap), 0, 2000),
        wFt: w, hFt: h, use: use
      });
    }
    renderStage();
    setStatus('Added ' + count + ' booths. Remember to Save or Publish.');
  });

  function addBoothSilent(props) {
    state.booths.push(Object.assign({
      id: uid(), label: '', x: 4, y: 4, wFt: 10, hFt: 10,
      use: 'vendor', status: 'available', tier: '', price: '', assignedTo: '', logoUrl: '', notes: ''
    }, props || {}));
  }

  // ── Toolbar wiring ──
  document.getElementById('addBoothBtn').addEventListener('click', function () { addBooth(); setStatus('Booth added.'); });
  venueName.addEventListener('input', function () { state.venue.name = venueName.value; });
  venueW.addEventListener('input', function () { state.venue.widthFt = clamp(Number(venueW.value) || 10, 10, 2000); renderStage(); });
  venueH.addEventListener('input', function () { state.venue.heightFt = clamp(Number(venueH.value) || 10, 10, 2000); renderStage(); });
  zoomIn.addEventListener('input', renderStage);

  // Sponsor tier preset buttons (rendered in the aside).
  var tierWrap = document.getElementById('sponsorTiers');
  if (tierWrap) {
    SPONSOR_TIERS.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'btn ghost';
      btn.type = 'button';
      btn.style.width = '100%';
      btn.textContent = '+ ' + t.label + ' (' + t.wFt + '×' + t.hFt + ')';
      btn.addEventListener('click', function () { addSponsorTier(t); });
      tierWrap.appendChild(btn);
    });
  }

  // Keyboard: Delete removes the selection, Escape clears it (ignored while
  // typing in a field). Arrow keys nudge the selected booth(s) — 1 ft per
  // press, or 10 ft with Shift — for keyboard-only positioning.
  var NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  function nudgeSelection(dxFt, dyFt) {
    var group = selectedBooths();
    if (!group.length) return false;
    group.forEach(function (b) {
      b.x = clamp(b.x + dxFt, 0, Math.max(0, state.venue.widthFt - b.wFt));
      b.y = clamp(b.y + dyFt, 0, Math.max(0, state.venue.heightFt - b.hFt));
      redrawBooth(b);
    });
    if (group.length === 1) { syncInspectorPos(group[0]); }
    return true;
  }

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // If a booth is focused, make sure it is the active selection so arrows/Delete act on it.
    if (e.target && e.target.classList && e.target.classList.contains('booth') && e.target.dataset.id && !isSel(e.target.dataset.id)) {
      setSelection([e.target.dataset.id]);
    }
    if (NUDGE[e.key]) {
      var step = e.shiftKey ? 10 : 1;
      if (nudgeSelection(NUDGE[e.key][0] * step, NUDGE[e.key][1] * step)) {
        e.preventDefault();
      }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
      e.preventDefault();
      deleteSelection();
    } else if (e.key === 'Escape') {
      clearSelection();
    }
  });

  // ── Persistence ──
  function payload() { return { venue: state.venue, booths: state.booths }; }

  document.getElementById('saveBtn').addEventListener('click', async function () {
    setStatus('Saving…');
    try {
      var res = await fetch(ENDPOINT, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStatus('Draft saved ' + new Date().toLocaleTimeString());
    } catch (err) { setStatus(err.message, true); }
  });

  document.getElementById('publishBtn').addEventListener('click', async function () {
    setStatus('Publishing…');
    try {
      var res = await fetch(ENDPOINT + '?action=publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Publish failed');
      setStatus('Published live ✓ ' + new Date().toLocaleTimeString());
    } catch (err) { setStatus(err.message, true); }
  });

  async function init() {
    try {
      var res = await fetch(ENDPOINT + '?draft=1');
      var data = await res.json().catch(function () { return {}; });
      // A blank body on a 401/403 must NOT be mistaken for an empty plan: if we
      // fell through, the editor would show "Empty plan" and any booths the admin
      // then built would overwrite the real saved draft on the next save. Surface
      // the auth failure instead so an expired session is obvious.
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setStatus('Your admin session has expired — please sign in again to edit the floor plan.', true);
          window.location.replace('/admin-login.html');
          return;
        }
        throw new Error((data && data.error) || ('Request failed (HTTP ' + res.status + ')'));
      }
      if (data && data.venue) state.venue = { name: data.venue.name || '', widthFt: data.venue.widthFt || 200, heightFt: data.venue.heightFt || 120 };
      state.booths = Array.isArray(data.booths) ? data.booths.map(normalizeBooth) : [];
      venueName.value = state.venue.name;
      venueW.value = state.venue.widthFt;
      venueH.value = state.venue.heightFt;
      renderStage();
      setStatus(state.booths.length ? 'Loaded ' + state.booths.length + ' booths.' : 'Empty plan — add booths to begin.');
    } catch (err) {
      setStatus('Could not load the plan: ' + err.message, true);
      renderStage();
    }
  }

  function normalizeBooth(b) {
    return {
      id: b.id || uid(), label: b.label || '', x: Number(b.x) || 0, y: Number(b.y) || 0,
      wFt: Number(b.wFt) || 10, hFt: Number(b.hFt) || 10, use: b.use || 'vendor',
      status: b.status || 'available', tier: b.tier || '', price: b.price || '', assignedTo: b.assignedTo || '', logoUrl: b.logoUrl || '', notes: b.notes || ''
    };
  }

  init();
})();
