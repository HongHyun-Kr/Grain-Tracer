(() => {
'use strict';
const $ = id => id && /[\s\[.#]/.test(id) ? document.querySelector(id) : document.getElementById(id);
const $$ = s => [...document.querySelectorAll(s)];
const tick = () => new Promise(r => setTimeout(r, 0));
const C = { gb: '#ffb000', s: ['#2a78d6', '#e0601f', '#1a9f70', '#c98500', '#d55181', '#2f7d2f', '#6a5acd', '#c83c3b'] };
const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

// ---------------- state ----------------
const S = {
  name: '', W0: 0, H0: 0, gray: null, base: null, nmpx: 1.98, sample: false, gt: null, tk: null,
  roi: null, p: { mode: 'line', pol: 'dark', f: 2, sigma: 2.4, L: 30, hi: 0.5, lo: 0.18, h: 4, merge: 0.15, minSeg: 160 },
  minEcd: 80, edge: true, cmap: 'turbo', destripe: true, xmax: null, ymax: null, brush: 5, bins: 20, hmode: 'n', view: 'overlay', tool: 'pan',
  edits: [], redo: [], c: {}, res: null, dirty: true, cmode: 'bar', scaleLine: null, mergeA: null, node: 'image', wtab: 'graphics', lastMs: 0,
  label: '', cmpOn: true, ci: 0, scaleInfo: '', barlen: 2, uid: 0, color: null,
};
const T = { s: 1, ox: 0, oy: 0 };
// user preferences kept between sessions (this browser / this Mac)
const PREFS = (() => { const d = { axes: false, exp: { w: 1600, h: 1000, font: 1, fmt: 'png', q: 0.92, scale: 1 } }; try { const v = JSON.parse(localStorage.getItem('graintracer.prefs') || 'null'); if (v) { Object.assign(d, v); d.exp = { ...{ w: 1600, h: 1000, font: 1, fmt: 'png', q: 0.92, scale: 1 }, ...(v.exp || {}) }; } } catch (e) { } return d; })();
function savePrefs() { try { localStorage.setItem('graintracer.prefs', JSON.stringify(PREFS)); } catch (e) { } }
// plot design (shared by all plots): per-plot axis ranges (null = automatic), legend visibility and position
const PLOT = { ax: {}, legend: { hidden: false, off: null } };

// ---------------- multi-image project ----------------
// Each opened image is a document; the active one is mirrored into S (plus the overlay buffers and view transform).
const PER = ['name', 'label', 'W0', 'H0', 'gray', 'base', 'nmpx', 'sample', 'gt', 'tk', 'roi', 'p', 'edits', 'redo', 'c', 'res', 'dirty', 'lastMs', 'scaleLine', 'mergeA', 'minEcd', 'gtInfo', 'cmpOn', 'ci', 'scaleInfo', 'barlen', 'uid', 'color', 'init', 'band', 'bar', 'cand', 'manual', 'srcL'];
const docs = []; let cur = -1;
function snap() { const d = {}; PER.forEach(k => d[k] = S[k]); d.ov = { ovB, ovG, ovR, ovS, colors }; d.T = { ...T }; return d; }
function saveDoc() { if (cur >= 0 && docs[cur]) Object.assign(docs[cur], snap()); }
function blankDoc() { Object.assign(S, { name: '', label: '', W0: 0, H0: 0, gray: null, base: null, sample: false, gt: null, tk: null, roi: null, edits: [], redo: [], c: {}, res: null, dirty: true, lastMs: 0, scaleLine: null, mergeA: null, cmpOn: true, ci: 0, scaleInfo: '', uid: 0, color: null }); ovB = ovG = ovR = ovS = colors = null; }
function nextColor() { const used = new Set(docs.map(d => d.ci)); for (let i = 0; i < 8; i++) if (!used.has(i)) return i; return docs.length % 8; }
function activate(i) {
  if (i === cur && S.gray) return;
  if (running) return toast('Cannot switch samples while processing.', 1);
  saveDoc(); cur = i; const d = docs[i];
  PER.forEach(k => S[k] = d[k]); ({ ovB, ovG, ovR, ovS, colors } = d.ov); Object.assign(T, d.T);
  $('empty').hidden = true; $('nmpx').value = S.nmpx.toFixed(3); $('barlen').value = $('rbBar').value = (+S.barlen || 2).toFixed(2);
  $('scaleinfo').textContent = S.scaleInfo; syncApply(); $('ttl').textContent = `${S.name} — Grain Tracer`;
  syncDetectUI(); syncImageUI(); syncRoiUI(); renderEdits(); renderImgProps();
  if (S.dirty) markDirty(); else clearDirty();
  if (S.c.lab) stats(); else { renderKpis(); $('cbar').hidden = true; render(); updateDatabar(); drawHist(); }
  resize(); renderTree(); renderCmp(); resetBaseline(); syncUndo();
  setStatus(S.res ? `${S.name} — ${S.res.sm.n} grains` : `${S.name} — press Process`);
}
function removeImage(i) {
  if (running) return toast('Cannot close images while processing.', 1);
  saveDoc(); const d = docs.splice(i, 1)[0]; log(`Closed ${d.name}`); HIST.u = HIST.u.filter(e => e.uid !== d.uid); HIST.r = HIST.r.filter(e => e.uid !== d.uid);
  if (!docs.length) { showEmpty(); return; }
  const target = i < cur ? cur - 1 : Math.min(cur, docs.length - 1); cur = -1; activate(Math.max(0, target));
}
function showEmpty() { cur = -1; blankDoc(); $('empty').hidden = false; $('ttl').textContent = 'Untitled — Grain Tracer'; $('cbar').hidden = true; $('scaleinfo').textContent = '';
  renderKpis(); renderImgProps(); renderEdits(); syncImageUI(); render(); updateDatabar(); drawHist(); renderTree(); renderCmp(); selectNode('image'); syncUndo(); setStatus('Ready'); }
function syncImageUI() { syncMinUI(); $('imgName').value = S.label || ''; { const n = PTS.filter(p => isOn(S, p)).length; $('cmpOn').checked = n > 0; $('cmpOn').indeterminate = n > 0 && n < PTS.length; } $('imgName').disabled = $('cmpOn').disabled = !S.gray; }
const setScaleInfo = t => { S.scaleInfo = t; $('scaleinfo').textContent = t; };
// defaults in nm (tuned at 1.98 nm/px, Hitachi x25k), converted to px for the loaded image
const DEF = { mode: 'line', pol: 'dark', sigma_nm: 4.75, L_nm: 60, hi: 0.5, lo: 0.18, h_nm: 8, merge: 0.15, minSeg_nm2: 627 };
const autoF = () => { const f = Math.round(4 / S.nmpx); return Math.max(1, Math.min(4, f, S.W0 * S.H0 > 6e6 ? 4 : 2)); };
const r1 = v => Math.round(v * 10) / 10;
const fmtP = { sigma: v => v.toFixed(1) + ' px', L: v => v ? v + ' px' : 'off', hi: v => v.toFixed(2), lo: v => v.toFixed(2), h: v => v.toFixed(1) + ' px', merge: v => v ? v.toFixed(2) : 'off' };
function applyAuto(keepMode) { const k = S.nmpx, mode = keepMode ? S.p.mode : DEF.mode;
  if (mode === 'contrast') {
    const f = Math.max(1, Math.min(4, Math.round(S.W0 / 900))), u = S.W0 / 873;
    Object.assign(S.p, { mode, pol: 'bright', hi: 0.4, lo: 0.15, merge: 0.12, sigma: Math.min(8, r1(2.5 * u / 0.2) * 0.2), L: Math.min(80, 2 * Math.round(15 * u / 2)), h: Math.min(20, Math.round(4 * u * 2) / 2), minSeg: 40 * u * u, f });
  } else {
    Object.assign(S.p, { mode, pol: DEF.pol, hi: DEF.hi, lo: DEF.lo, merge: DEF.merge,
      sigma: Math.max(1, r1(DEF.sigma_nm / k / 0.2) * 0.2), L: Math.min(80, 2 * Math.round(DEF.L_nm / k / 2)), h: Math.max(0.5, Math.round(DEF.h_nm / k * 2) / 2), minSeg: DEF.minSeg_nm2 / (k * k) });
    S.p.f = autoF(); }
  syncDetectUI(); }
// Boundary type and line tone from the image itself. Measured on the working image with the line-mode defaults:
// ridge strength of dark and of bright lines (98th percentile of the valley response over the pixel noise) and the spread of
// regional tone. Calibrated on the demo styles and on real SEM images (dark crack lines with bright halos stay "dark").
function detectType(quiet) { if (!S.gray) return null; const keep = S.p.mode; S.p.mode = 'line'; applyAuto(true); const f = S.p.f, sg = S.p.sigma / f;
  const ds = GB.downsample(S.gray, S.W0, S.H0, f), W = ds.W; // central crop of the ROI (≤ 720 px square) keeps this under a second
  const rx0 = Math.floor(S.roi.x0 / f), ry0 = Math.floor(S.roi.y0 / f), rw = Math.floor(S.roi.x1 / f) - rx0, rh = Math.floor(S.roi.y1 / f) - ry0;
  const w = Math.min(rw, 720), h = Math.min(rh, 720), cx = rx0 + ((rw - w) >> 1), cy = ry0 + ((rh - h) >> 1), im = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im[y * w + x] = ds.img[(y + cy) * W + x + cx];
  const x0 = 6, y0 = 6, x1 = w - 6, y1 = h - 6;
  const q = (A, p) => { const v = new Float32Array(Math.max(1, (x1 - x0) * (y1 - y0))); let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v[n++] = A[y * w + x]; const s = v.subarray(0, n).sort(); return n ? s[Math.min(n - 1, Math.floor(p * n))] : 0; };
  const G1 = GB.gauss(im, w, h, 1), hp = new Float32Array(w * h); for (let i = 0; i < w * h; i++) hp[i] = Math.abs(im[i] - G1[i]);
  const sn = Math.max(0.5, q(hp, 0.5) * 1.78);
  const d = q(GB.valley(im, w, h, [sg, sg * 1.67], 'dark', Math.max(0.6, sg)), 0.98) / sn, b = q(GB.valley(im, w, h, [sg, sg * 1.67], 'bright', Math.max(0.6, sg)), 0.98) / sn;
  const Gb = GB.gauss(im, w, h, Math.max(4, 6 * sg)), tone = (q(Gb, 0.9) - q(Gb, 0.1)) / sn;
  const mode = Math.max(d, b) < 0.7 && tone > 2 ? 'contrast' : 'line', pol = mode === 'contrast' ? 'bright' : b > 2.4 * d ? 'bright' : 'dark';
  S.p.mode = mode; applyAuto(true); if (mode === 'line') S.p.pol = pol; syncDetectUI(); S.autoType = { mode, pol, d, b, tone };
  const txt = mode === 'contrast' ? 'Contrast (tone steps between grains)' : `Line, ${pol} line`;
  if (!quiet) log(`Boundary type: ${txt} — detected automatically (dark ${d.toFixed(2)}, bright ${b.toFixed(2)}, tone ${tone.toFixed(1)}). Change it under Grain Boundary Detection if it looks wrong.`);
  if (keep !== mode || quiet === false) markDirty(); return S.autoType; }
function syncDetectUI() {
  $('mode').value = $('rbMode').value = S.p.mode; $('destripeRow').hidden = S.p.mode !== 'contrast'; $('pol').value = S.p.pol; $('fres').value = S.p.f;
  Object.keys(fmtP).forEach(id => { $(id).value = S.p[id]; $(id + 'O').textContent = fmtP[id](S.p[id]); }); }
function markDirty() { S.dirty = true; renderTree(); if (S.res) setStatus('Parameters changed — Process to update'); $('rbProc').querySelector('span').innerHTML = 'Process<span class="dirty-dot"></span>'; }
function clearDirty() { S.dirty = false; $('rbProc').querySelector('span').textContent = 'Process'; }

// ---------------- messages / status ----------------
const now = () => new Date().toTimeString().slice(0, 8);
function log(msg, warn) { const d = document.createElement('div'); d.innerHTML = `<span class="t">${now()}</span>`; const s = document.createElement('span'); s.textContent = msg; if (warn) s.className = 'w'; d.appendChild(s); $('log').appendChild(d); $('log').parentNode.scrollTop = 1e9; }
let stT = null;
function setStatus(t, busy) { const e = $('status'); e.textContent = t; e.className = 'msg' + (busy ? ' busy' : ''); }
function toast(m, warn) { log(m, warn); setStatus(m); clearTimeout(stT); stT = setTimeout(() => setStatus(S.res ? `Ready — ${S.res.sm.n} grains · ${S.lastMs.toFixed(2)} s` : 'Ready'), 4000); }
const STAGES = ['Boundary signal', 'Line filter', 'Segmentation', 'Statistics'];
function progress(i, done) { const p = $('prog'); if (!p.children.length) p.innerHTML = STAGES.map(s => `<div class="pr"><span>${s}</span><div class="bar"><i></i></div><span>–</span></div>`).join('');
  [...p.children].forEach((r, k) => { const v = k < i || (k === i && done) ? 100 : 0; r.querySelector('i').style.width = v + '%'; r.lastElementChild.textContent = k < i || (k === i && done) ? 'Done' : k === i ? 'Running' : '–'; }); }

// ---------------- tree ----------------
const COLL = new Set(); let uidN = 0;
const NODES = () => {
  saveDoc();
  const imgs = docs.map((d, i) => ({ id: 'doc', idx: i, key: 'doc' + d.uid, icon: 'i-file', label: tagOf(d), active: i === cur, badge: d.res ? `${d.res.sm.n} grains` : 'not processed', dirty: d.dirty && !!d.res,
    kids: [
      { id: 'image', idx: i, icon: 'i-ruler', label: 'Scale', badge: d.nmpx.toFixed(3) + ' nm/px' },
      { id: 'roi', idx: i, icon: 'i-roi', label: 'ROI' },
      { id: 'detect', idx: i, icon: 'i-detect', label: 'Grain Boundary Detection', badge: d.p.mode === 'contrast' ? 'Contrast' : 'Line', dirty: d.dirty },
      { id: 'edits', idx: i, icon: 'i-edit', label: 'Manual Edits', badge: d.edits.length ? String(d.edits.length) : '' },
    ] }));
  const nRes = docs.filter(d => d.res).length;
  return [
    { id: 'images', key: 'images', icon: 'i-open', label: 'Samples', badge: docs.length ? String(docs.length) : '', off: !docs.length, kids: imgs.length ? imgs : [{ id: 'image', icon: 'i-file', label: 'No sample', off: true }] },
    { id: 'stats', key: 'results', icon: 'i-results', label: 'Results', off: !nRes, kids: [
      { id: 'stats', icon: 'i-table', label: 'Grain Statistics', badge: nRes > 1 ? `${nRes} data sets` : S.res ? S.res.sm.n + ' grains' : '' },
      { id: 'hist', icon: 'i-hist', label: 'ECD Distribution' },
      { id: 'cdf', icon: 'i-cdf', label: 'Cumulative' },
      { id: 'shape', icon: 'i-shape', label: 'Grain Shape' },
      { id: 'export', icon: 'i-export', label: 'Export' },
    ] },
  ];
};
const TITLES = { image: 'Image', roi: 'Region of Interest', detect: 'Grain Boundary Detection', edits: 'Manual Edits', stats: 'Grain Statistics', hist: 'ECD Distribution', cdf: 'Cumulative', shape: 'Grain Shape', export: 'Export' };
const TW = open => `<svg width="8" height="8" viewBox="0 0 8 8"><path d="${open ? 'M1 2l3 3 3-3' : 'M2 1l3 3-3 3'}" fill="none" stroke="#666" stroke-width="1.3"/></svg>`;
function renderTree() {
  const li = (n, depth, top) => {
    const open = n.kids && !COLL.has(n.key), sel = !top && n.id !== 'doc' && S.node === n.id && (n.idx === undefined || n.idx === cur);
    const doc = n.id === 'doc';
    return `<li><div class="tn${n.off ? ' off' : ''}${n.active ? ' act' : ''}" data-node="${n.id}"${n.idx !== undefined ? ` data-idx="${n.idx}"` : ''}${top ? ' data-top="1"' : ''}${doc ? ' draggable="true"' : ''} style="padding-left:${6 + depth * 16}px" aria-selected="${sel}">
      <span class="tw"${n.kids ? ` data-key="${n.key}"` : ''}>${n.kids ? TW(open) : ''}</span>
      <svg class="i"><use href="#${n.icon}"/></svg><span class="tl"><span class="${doc ? 'nm' : ''}"${doc ? ' title="Click to rename"' : ''}>${esc(n.label)}</span>${n.dirty ? '<span class="dirty-dot" title="Needs Process"></span>' : ''}</span>${n.badge ? `<span class="tb">${esc(n.badge)}</span>` : ''}${doc ? `<button class="xbtn tx" data-close="${n.idx}" title="Close image">✕</button>` : ''}</div>
      ${open ? `<ul>${n.kids.map(k => li(k, depth + 1)).join('')}</ul>` : ''}</li>`; };
  $('tree').innerHTML = NODES().map(n => li(n, 0, true)).join(''); renderTabs();
}
function setAllCollapsed(on) { COLL.clear(); if (on) docs.forEach(d => COLL.add('doc' + d.uid)); renderTree(); }
$('tree').addEventListener('click', e => {
  const tw = e.target.closest('[data-key]'); if (tw) { const k = tw.dataset.key; COLL.has(k) ? COLL.delete(k) : COLL.add(k); renderTree(); return; }
  const x = e.target.closest('[data-close]'); if (x) { e.stopPropagation(); closeImage(+x.dataset.close); return; }
  const t = e.target.closest('.tn'); if (!t) return;
  if (t.dataset.node === 'doc') { const i = +t.dataset.idx; if (e.target.closest('.nm')) { startRename(i); return; } activate(i); selectNode('image'); return; }
  if (t.dataset.top && t.dataset.node === 'images') { if (!docs.length) $('file').click(); return; }
  if (t.dataset.idx !== undefined && +t.dataset.idx !== cur) activate(+t.dataset.idx);
  selectNode(t.dataset.node);
});
$('tree').addEventListener('dblclick', e => { if (e.target.closest('.nm, [data-key], [data-close]')) return; const t = e.target.closest('.tn'); if (!t) return;
  const tw = t.querySelector('[data-key]'); if (tw) { const k = tw.dataset.key; COLL.has(k) ? COLL.delete(k) : COLL.add(k); renderTree(); } });
// rename in place
function startRename(i) {
  if (i !== cur) activate(i); if (cur !== i) return; if (S.node !== 'image') selectNode('image');
  const el = $('tree').querySelector(`.tn[data-node="doc"][data-idx="${i}"] .nm`); if (!el) return;
  const row = el.closest('.tn'), d = docs[i]; row.draggable = false; row.classList.add('renaming'); el.contentEditable = 'true'; el.classList.add('editing'); el.spellcheck = false; el.focus();
  const rg = document.createRange(); rg.selectNodeContents(el); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg);
  let done = false;
  const fin = ok => { if (done) return; done = true; const v = el.textContent.replace(/\s+/g, ' ').trim();
    if (ok && v && v !== tagOf(d)) { d.label = v; if (i === cur) { S.label = v; syncImageUI(); } log(`Renamed to "${v}"`); }
    renderTree(); renderCmp(); };
  el.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); fin(true); } else if (ev.key === 'Escape') { ev.preventDefault(); fin(false); } };
  el.onblur = () => fin(true);
}
// drag to reorder images
let dragI = -1, dropAt = -1;
const dropLine = () => { let l = $('dropLine'); if (!l) { l = document.createElement('div'); l.id = 'dropLine'; l.className = 'dropline'; $('tree').parentNode.appendChild(l); } return l; };
const clearDrop = () => { dropAt = -1; const l = $('dropLine'); if (l) l.hidden = true; };
$('tree').addEventListener('dragstart', e => { const t = e.target.closest && e.target.closest('.tn[data-node="doc"]'); if (!t) return;
  dragI = +t.dataset.idx; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tagOf(docs[dragI])); t.classList.add('dragging'); });
// the drop position comes from the image blocks (row + its children), so the gap above Results is a valid target
$('tree').parentNode.addEventListener('dragover', e => { if (dragI < 0) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  const blocks = $$('#tree .tn[data-node="doc"]').map(t => t.parentNode.getBoundingClientRect()); if (!blocks.length) return;
  let k = blocks.findIndex(r => e.clientY < r.top + r.height / 2); if (k < 0) k = blocks.length; dropAt = k;
  const host = $('tree').parentNode, hr = host.getBoundingClientRect(), y = (k < blocks.length ? blocks[k].top : blocks[blocks.length - 1].bottom) - hr.top + host.scrollTop;
  const l = dropLine(); l.hidden = false; l.style.top = (y - 1) + 'px'; });
$('tree').parentNode.addEventListener('dragleave', e => { if (!$('tree').parentNode.contains(e.relatedTarget)) { const l = $('dropLine'); if (l) l.hidden = true; } });
$('tree').parentNode.addEventListener('drop', e => { if (dragI < 0) return; e.preventDefault(); if (dropAt >= 0) moveDoc(dragI, dropAt); clearDrop(); dragI = -1; });
$('tree').addEventListener('dragend', () => { clearDrop(); dragI = -1; $$('#tree .dragging').forEach(n => n.classList.remove('dragging')); });
function moveDoc(from, to) {
  if (to === from || to === from + 1) return; saveDoc(); const act = docs[cur], d = docs.splice(from, 1)[0];
  docs.splice(to > from ? to - 1 : to, 0, d); cur = docs.indexOf(act); log(`Moved "${tagOf(d)}" to position ${docs.indexOf(d) + 1}`); renderTree(); renderCmp();
}
const RES_NODES = ['stats', 'hist', 'cdf', 'shape'];
const GFX_NODES = ['image', 'roi', 'detect', 'edits'];
// ---------------- dialogs ----------------
// in-page modal (browser alert/confirm are blocked where the page is embedded)
function dialog({ title, body, ok = 'OK', cancel = 'Cancel', danger = false, wide = false, onOpen, alt }) {
  return new Promise(res => { const back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = `<div class="dlg${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="dlg-h">${esc(title)}</div><div class="dlg-b">${body}</div><div class="dlg-f">${alt ? `<button class="btn alt" data-alt="1">${alt.icon ? `<svg class="i"><use href="#${alt.icon}"/></svg>` : ''}${esc(alt.label)}</button>` : ''}${cancel ? `<button class="btn" data-r="0">${esc(cancel)}</button>` : ''}<button class="btn ${danger ? 'danger' : 'go'}" data-r="1">${esc(ok)}</button></div></div>`;
    document.body.appendChild(back); const dlg = back.firstChild, done = v => { removeEventListener('keydown', key, true); back.remove(); res(v ? dlg : null); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === 'Enter' && !e.target.matches('textarea')) { e.preventDefault(); e.stopPropagation(); done(true); } };
    addEventListener('keydown', key, true); back.addEventListener('pointerdown', e => { if (e.target === back) done(false); });
    dlg.querySelectorAll('[data-r]').forEach(b => b.onclick = () => done(b.dataset.r === '1')); if (alt) dlg.querySelector('[data-alt]').onclick = () => { if (alt.run(dlg) !== false) done(false); }; if (onOpen) onOpen(dlg);
    (dlg.querySelector('input,select') || dlg.querySelector('[data-r="1"]')).focus(); }); }
async function closeImage(i = cur) { if (i < 0 || !docs[i]) return; const d = i === cur ? S : docs[i]; if (running) return toast('Cannot close images while processing.', 1);
  const ok = await dialog({ title: 'Close Image', body: `<p>Close <b>${esc(tagOf(d))}</b>?</p><p class="note">Its results, manual edits and undo history are removed. The image file itself is not changed.</p>`, ok: 'Close Image', danger: true });
  if (ok) removeImage(i); }
async function closeAll() { if (!docs.length) return toast('No samples are open.', 1); if (running) return toast('Cannot close images while processing.', 1);
  const n = docs.length, list = docs.slice(0, 6).map(d => `<li>${esc(tagOf(d))}</li>`).join('') + (n > 6 ? `<li>… and ${n - 6} more</li>` : '');
  const ok = await dialog({ title: 'Close All Samples', body: `<p>Close all <b>${n}</b> sample${n > 1 ? 's' : ''}?</p><ul class="dlist">${list}</ul><p class="note">All results, manual edits and undo history are removed and cannot be restored. The image files themselves are not changed.</p>`, ok: 'Close All', danger: true });
  if (!ok) return; docs.length = 0; HIST.u = []; HIST.r = []; log(`Closed all samples (${n})`); showEmpty(); }
// Reset: back to the state right after the image was opened (scale as detected, default ROI and parameters, no edits, no results); undoable
async function resetImage() {
  if (!S.gray) return toast('Open an image first.', 1); if (running) return;
  const ok = await dialog({ title: 'Reset Image', body: `<p>Reset <b>${esc(tagOf(S))}</b> to the state right after it was opened?</p><p class="note">Scale, ROI and detection parameters go back to their defaults; manual edits and results are cleared. You can undo this.</p>`, ok: 'Reset Image', danger: true });
  if (!ok) return;
  const before = stateSnap(), eb = S.edits.slice();
  const i0 = S.init || {}; if (i0.nmpx) { S.nmpx = i0.nmpx; S.tk = i0.tk; S.bar = i0.bar; S.band = i0.band; S.barlen = i0.barlen; S.srcL = i0.srcL; setScaleInfo(i0.scaleInfo || ''); }
  $('nmpx').value = S.nmpx.toFixed(3); $('barlen').value = $('rbBar').value = (+S.barlen || 2).toFixed(2);
  S.roi = autoRoi(); applyAuto(false); S.edits = []; S.c = {}; S.res = null; ovB = ovG = ovR = ovS = null; colors = null; S.scaleLine = null; S.mergeA = null; hoverId = 0; live = null;
  S.cand = null; S.manual = null; syncApply(); $('cbar').hidden = true;
  markDirty(); syncRoiUI(); renderEdits(); renderKpis(); renderImgProps(); render(); updateDatabar(); saveDoc(); selectNode('image'); renderCmp();
  const after = stateSnap(); pushHist({ kind: 'reset', label: 'Reset image', before, after, eb, ea: [] }); baseline = after;
  log(`Reset "${tagOf(S)}" to the state before Process`); setStatus('Image reset — press Process'); }
function setRibbon(r) { $$('.rtab').forEach(x => x.setAttribute('aria-selected', x.dataset.r === r)); $$('.rpage').forEach(p => p.hidden = p.dataset.r !== r); }
const curRibbon = () => ($$('.rtab').find(x => x.getAttribute('aria-selected') === 'true') || {}).dataset?.r;
function selectNode(id) {
  if (GFX_NODES.includes(id) && cur >= 0) { COLL.delete('images'); COLL.delete('doc' + S.uid); }
  if (RES_NODES.includes(id) || id === 'export') { COLL.delete('results'); if (curRibbon() !== 'results') setRibbon('results'); }
  else if (id === 'edits') setRibbon('edit');
  else if (curRibbon() === 'results') setRibbon('home');
  S.node = id; const fn = id; $$('.sform').forEach(f => f.hidden = f.dataset.node !== fn); $('setSub').textContent = TITLES[id] || id;
  if (PTYPE[id]) S.ptype = PTYPE[id];
  renderTree(); $$('.bbtn[data-node], #rtool [data-node]').forEach(b => b.setAttribute('aria-pressed', b.dataset.node === id));
  const sel = $('tree').querySelector('.tn[aria-selected="true"]'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  if (RES_NODES.includes(id)) setWtab('res');
  else if (['image', 'roi', 'detect', 'edits'].includes(id)) setWtab('graphics');
  if (id === 'roi') syncRoiUI(); if (id === 'edits') renderEdits();
}
$$('[data-node]').forEach(b => { if (b.matches('.sbtn, .bbtn, #rtool .qbtn')) b.onclick = () => selectNode(b.dataset.node); });

// ---------------- ribbon / window tabs ----------------
$$('.rtab').forEach(b => b.onclick = () => { $$('.rtab').forEach(x => x.setAttribute('aria-selected', x === b)); $$('.rpage').forEach(p => p.hidden = p.dataset.r !== b.dataset.r); });
// one browser-style tab per open image above the Graphics view; Result stays at the right
function renderTabs() { const el = $('itabs'); if (!el) return; saveDoc(); $('gfxTab').hidden = docs.length > 0;
  el.innerHTML = docs.map((d, i) => `<div class="itab${i === cur && S.wtab === 'graphics' ? ' on' : ''}" data-ti="${i}" draggable="true" title="${esc(d.name)}"><span class="dot" style="background:${colorOf(d)}"></span><span class="nm2">${esc(tagOf(d))}</span><button class="x" data-tx="${i}" title="Close image">✕</button></div>`).join(''); }
$('itabs').addEventListener('click', e => { const x = e.target.closest('[data-tx]'); if (x) { e.stopPropagation(); closeImage(+x.dataset.tx); return; }
  const t = e.target.closest('[data-ti]'); if (!t) return; const i = +t.dataset.ti; if (i !== cur) activate(i); setWtab('graphics'); if (!GFX_NODES.includes(S.node)) selectNode('image'); });
$('itabs').addEventListener('auxclick', e => { const t = e.target.closest('[data-ti]'); if (t && e.button === 1) closeImage(+t.dataset.ti); });
let tabDrag = -1;
$('itabs').addEventListener('dragstart', e => { const t = e.target.closest('[data-ti]'); if (!t) return; tabDrag = +t.dataset.ti; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'tab'); });
$('itabs').addEventListener('dragover', e => { if (tabDrag < 0) return; const t = e.target.closest('[data-ti]'); $$('.itab').forEach(x => x.classList.remove('drop-l', 'drop-r')); if (!t) return; e.preventDefault(); const r = t.getBoundingClientRect(); t.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-l' : 'drop-r'); });
$('itabs').addEventListener('drop', e => { if (tabDrag < 0) return; e.preventDefault(); const t = e.target.closest('[data-ti]'); if (t) { const r = t.getBoundingClientRect(); moveDoc(tabDrag, +t.dataset.ti + (e.clientX < r.left + r.width / 2 ? 0 : 1)); } tabDrag = -1; });
$('itabs').addEventListener('dragend', () => { tabDrag = -1; $$('.itab').forEach(x => x.classList.remove('drop-l', 'drop-r')); });
function setWtab(t) { S.wtab = t; $$('.wtab[data-wtab]').forEach(b => b.setAttribute('aria-selected', b.dataset.wtab === t)); $$('.itab').forEach(b => b.classList.toggle('on', t === 'graphics' && +b.dataset.ti === cur));
  $('stage').hidden = t !== 'graphics'; $('histWrap').hidden = t !== 'res'; $('gtool').hidden = t !== 'graphics'; $('rtool').hidden = t !== 'res'; layoutRes();
  if (t === 'graphics') resize(); else drawRes(); }
$$('.wtab[data-wtab]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.wtab; setWtab(t); if (t === 'res' && !RES_NODES.includes(S.node)) selectNode('stats'); if (t === 'graphics' && !GFX_NODES.includes(S.node)) selectNode('image'); }));
$$('[data-mtab]').forEach(b => b.onclick = () => { $$('[data-mtab]').forEach(x => x.setAttribute('aria-selected', x === b)); $('log').hidden = b.dataset.mtab !== 'msg'; $('prog').hidden = b.dataset.mtab !== 'prog'; $('tblWrap').hidden = b.dataset.mtab !== 'tbl'; if (b.dataset.mtab === 'tbl') renderTable(); });

// splitters
$$('.split').forEach(sp => sp.addEventListener('pointerdown', e => { e.preventDefault(); sp.setPointerCapture(e.pointerId);
  const key = sp.dataset.split, root = key === 'bh' ? $('work').querySelector('.right') : $('work'), st = getComputedStyle(root), start = parseFloat(st.getPropertyValue('--' + key)) || { tw: 300, sw: 330, bh: 170 }[key], x0 = e.clientX, y0 = e.clientY;
  const mv = ev => { let v = key === 'bh' ? start - (ev.clientY - y0) : start + (ev.clientX - x0); v = Math.max(key === 'bh' ? 80 : 180, Math.min(key === 'bh' ? 500 : 560, v)); root.style.setProperty('--' + key, v + 'px'); };
  const up = () => { sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); resize(); drawRes(); };
  sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up); }));

// ---------------- layout (pane visibility) ----------------
const LAYOUT = { set: true, msg: true };
function applyLayout() {
  const w = $('work'), r = w.querySelector('.right');
  $('setPane').hidden = $('setSplit').hidden = !LAYOUT.set;
  $('msgPane').hidden = $('msgSplit').hidden = !LAYOUT.msg;
  if (LAYOUT.set) w.style.removeProperty('--cols'); else w.style.setProperty('--cols', 'var(--tw, 300px) 5px minmax(0, 1fr)');
  if (LAYOUT.msg) r.style.removeProperty('--rows'); else r.style.setProperty('--rows', 'minmax(0, 1fr)');
  $$('[data-pane]').forEach(b => b.setAttribute('aria-pressed', LAYOUT[b.dataset.pane]));
  resize(); if (S.gray) fit(); drawRes();
}
function togglePane(k) { LAYOUT[k] = !LAYOUT[k]; applyLayout(); }
function resetLayout() {
  const w = $('work'); ['--tw', '--sw'].forEach(v => w.style.removeProperty(v)); w.querySelector('.right').style.removeProperty('--bh');
  LAYOUT.set = LAYOUT.msg = true; applyLayout(); log('Layout reset');
}
$$('[data-pane]').forEach(b => b.onclick = () => togglePane(b.dataset.pane));

// ---------------- image loading ----------------
function setImage(gray, W, H, name, nmpx, sample, gt) {
  saveDoc(); S.p = { ...S.p }; S.label = name.replace(/\.[^.]+$/, ''); S.cmpOn = true; S.minEcd = 80; S.ci = nextColor(); S.uid = ++uidN; S.color = null; S.lastMs = 0; S.barlen = parseFloat($('barlen').value) || 2;
  S.gray = gray; S.W0 = W; S.H0 = H; S.name = name; S.sample = !!sample; S.gt = gt || null;
  S.edits = []; S.redo = []; S.c = {}; S.res = null; ovB = ovG = ovR = ovS = null; S.scaleLine = null; S.mergeA = null; S.cand = null; S.manual = null;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d'), id = cx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = gray[i]; id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = v; id.data[4 * i + 3] = 255; }
  cx.putImageData(id, 0, 0); S.base = cv; $('empty').hidden = true; $('cbar').hidden = true;
  findScale();
  S.roi = autoRoi();
  if (nmpx) S.nmpx = nmpx; else scaleFromDetect(false);
  $('nmpx').value = S.nmpx.toFixed(3); applyAuto(true);
  if (nmpx) setScaleInfo('Pixel size taken from Hitachi .txt.');
  S.init = { nmpx: S.nmpx, tk: S.tk, bar: S.bar, band: S.band, srcL: S.srcL, scaleInfo: S.scaleInfo, barlen: S.barlen };
  docs.push(snap()); cur = docs.length - 1; resetBaseline();
  syncImageUI(); $('ttl').textContent = `${name} — Grain Tracer`;
  log(`Opened ${name} (${W}×${H} px)`); log(nmpx ? `Scale: PixelSize ${nmpx} nm (.txt)` : 'Scale: ' + S.scaleInfo, !nmpx && !S.tk && !S.bar); if (S.band) log(`Info panel detected below y = ${S.band.top}; ROI set above it`);
  if (!nmpx) flashScale();
  detectType(); saveDoc(); resetBaseline();
  $('prog').innerHTML = '';
  fit(); saveDoc(); markDirty(); setStatus('Image loaded — press Process'); renderKpis(); renderImgProps(); syncRoiUI(); renderEdits(); updateDatabar(); selectNode('image'); drawHist(); renderCmp();
}
function autoRoi() { let y1 = S.H0; if (S.band) y1 = Math.min(y1, S.band.top - 2); if (S.tk) y1 = Math.min(y1, S.tk.yTop - 8); return { x0: 0, y0: 0, x1: S.W0, y1: Math.max(10, y1) }; }
// scale: Hitachi dotted ticks first, otherwise a scale-bar line (its length in µm is the Bar value)
function findScale() { S.band = detectBand(); S.tk = S.band && S.band.bg > 150 ? null : detectTicks(false, S.band ? { x0: 0, x1: S.W0, y0: Math.max(0, S.band.top - 2), y1: S.H0 } : null); // a light info panel is not a Hitachi bar; on a panel, ticks must lie on it
  S.bar = S.tk ? null : detectBarLine(S.band) || (S.band ? null : detectBarLine(null, { x0: 0, x1: S.W0, y0: 0, y1: Math.floor(S.H0 * 0.2) })); return S.tk || S.bar; } // no panel: bottom first, then the top strip
function scaleFromDetect(logIt) { const len = +S.barlen || parseFloat($('barlen').value) || 2; S.manual = null; S.srcL = S.tk ? S.tk.sp * 10 : S.bar ? S.bar.L : null;
  if (S.tk) { S.nmpx = len * 100 / S.tk.sp; setScaleInfo(`Detected ${S.tk.n} ticks (${S.tk.div} divisions) · spacing ${S.tk.sp.toFixed(1)} px × 10 = ${len} µm → ${S.nmpx.toFixed(3)} nm/px`); }
  else if (S.bar) { S.nmpx = len * 1000 / S.bar.L; setScaleInfo(`Scale bar line ${S.bar.L} px = ${len} µm → ${S.nmpx.toFixed(3)} nm/px. Set Bar to the value printed on the image.`); }
  else { setScaleInfo('No scale bar found. Enter the pixel size or draw a Scale Line.'); return false; }
  $('nmpx').value = S.nmpx.toFixed(3); if (logIt) log('Scale: ' + S.scaleInfo); return true; }
// three ways to set the scale; each one only proposes (S.cand, shown on the image), Apply Scale commits it
//   Auto Detect: whole image · Find in Box: inside a box the user drags · Trace Bar: a line the user draws
const candL = c => c.kind === 'ticks' ? c.tk.sp * 10 : c.kind === 'line' ? c.bar.L : c.L;
$('scpop').addEventListener('pointerdown', e => { if (e.target.closest('input,button')) return; e.preventDefault(); e.stopPropagation(); const el = $('scpop'); el.setPointerCapture(e.pointerId);
  const o = popOff ? [...popOff] : [0, 0], x0 = e.clientX, y0 = e.clientY; el.classList.add('dragging');
  const mv = ev => { popOff = [o[0] + ev.clientX - x0, o[1] + ev.clientY - y0]; placePop(); };
  const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.classList.remove('dragging'); };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });
$('popBar').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') applyScale(true); if (e.key === 'Escape') cancelScale(); });
$('popBar').addEventListener('input', () => { const v = parseFloat($('popBar').value); if (v > 0) { S.barlen = v; $('rbBar').value = $('barlen').value = v; if (flashT) render(); } });
const candText = c => c.kind === 'ticks' ? `${c.tk.n} ticks (${c.tk.div} div.)` : c.kind === 'line' ? `scale bar ${c.bar.L} px` : `drawn line ${c.L.toFixed(1)} px`;
function syncApply() { $$('[data-act="applyScale"]').forEach(b => b.disabled = !S.cand); }
function propose(c, how) { c.quiet = how !== 'Auto Detect' && how !== 'Pending'; if (how === 'Pending' && S.cand) c.quiet = S.cand.quiet; popOff = null; S.cand = c; S.scaleLine = null; syncApply(); const len = +S.barlen || 2; $('popBar').value = len.toFixed(2);
  setScaleInfo(`${how}: ${candText(c)} = ${len} µm → ${(len * 1000 / candL(c)).toFixed(3)} nm/px. Set Bar to the printed value, then Apply Scale.`);
  setStatus(`${how}: ${candText(c)} — check Bar and click Apply Scale`); if (S.wtab !== 'graphics') setWtab('graphics'); flashScale(); }
function autoDetect() { if (!S.gray) return toast('Open an image first.', 1); clearCand(); const band = S.band || detectBand();
  const tk = band && band.bg > 150 ? null : detectTicks(false, band ? { x0: 0, x1: S.W0, y0: Math.max(0, band.top - 2), y1: S.H0 } : null), bar = tk ? null : detectBarLine(band) || (band ? null : detectBarLine(null, { x0: 0, x1: S.W0, y0: 0, y1: Math.floor(S.H0 * 0.2) }));
  if (tk || bar) { S.cand = tk ? { kind: 'ticks', tk } : { kind: 'line', bar }; applyScale(false, 'Auto Detect'); }
  else toast('Auto Detect found no scale bar. Use Find in Box (drag a box around the bar) or Trace Bar.', 1); selectNode('image'); }
function regionDetect(r) { const reg = { x0: Math.max(0, Math.round(r.x0)), y0: Math.max(0, Math.round(r.y0)), x1: Math.min(S.W0, Math.round(r.x1)), y1: Math.min(S.H0, Math.round(r.y1)) };
  if (reg.x1 - reg.x0 < 8 || reg.y1 - reg.y0 < 4) return; const tk = detectTicks(false, reg), bar = tk ? null : detectBarLine(null, reg);
  if (tk) propose({ kind: 'ticks', tk, box: reg }, 'Find in Box'); else if (bar) propose({ kind: 'line', bar, box: reg }, 'Find in Box');
  else { toast('No scale bar inside the box. Drag a box closer around the bar, or use Trace Bar.', 1); render(); return; } setTool('pan'); }
function applyScale(fromPop, how) { const c = S.cand; if (!c) return; const len = (fromPop === true ? parseFloat($('popBar').value) : parseFloat($('rbBar').value)) || +S.barlen || 2; S.barlen = len; $('barlen').value = $('rbBar').value = len;
  S.tk = c.kind === 'ticks' ? c.tk : null; S.bar = c.kind === 'line' ? c.bar : null; S.manual = c.kind === 'manual' ? { pts: c.pts, L: c.L } : null;
  S.srcL = candL(c); S.nmpx = len * 1000 / S.srcL; $('nmpx').value = S.nmpx.toFixed(3); S.cand = null; S.scaleLine = null; syncApply();
  setScaleInfo(`${candText(c)} = ${len} µm → ${S.nmpx.toFixed(3)} nm/px`); log(`Scale (${how || 'applied'}): ` + S.scaleInfo); stats(); renderImgProps(); updateDatabar(); renderTree(); renderEdits(); commit(how ? how + ' scale' : 'Scale'); flashScale(); }
function clearCand() { S.cand = null; S.scaleLine = null; flashT = 0; cancelAnimationFrame(flashRaf); popOff = null; syncApply(); render(); }
function cancelScale() { if (!S.cand) return; S.cand = null; S.scaleLine = null; flashT = 0; syncApply(); render(); setStatus('Scale proposal discarded'); }
// small Apply box next to the proposal (bottom-right of the box / line / bar), follows pan and zoom
// anchor = top-right of the proposal; the box sits above it so the unit text under a scale bar stays visible
function candAnchor(c) { if (c.box) return [c.box.x1, c.box.y0];
  if (c.kind === 'ticks') return [c.tk.xs[c.tk.xs.length - 1] + 4, c.tk.yTop - 4];
  if (c.kind === 'line') return [c.bar.x1, c.bar.y - c.bar.th]; const [p, q] = c.pts; return [Math.max(p[0], q[0]), Math.min(p[1], q[1])]; }
let popOff = null;
function candRect(c) { // image-space rectangle of the proposal itself
  if (c.kind === 'ticks') { const k = c.tk; return { x0: k.xs[0] - 4, x1: k.xs[k.xs.length - 1] + 4, y0: k.yTop - 2, y1: k.yTop + (k.h || 8) + 2 }; }
  if (c.kind === 'line') { const b = c.bar; return { x0: b.x0, x1: b.x1, y0: b.y - b.th, y1: b.y + b.th }; }
  const [p, q] = c.pts; return { x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) }; }
function placePop() { const el = $('scpop'); if (!el) return; if (!S.cand || !S.cand.quiet || !S.base || S.wtab !== 'graphics') { el.hidden = true; return; } // Auto Detect is applied at once
  el.hidden = false; const r = stage.getBoundingClientRect(), pw = el.offsetWidth, ph = el.offsetHeight, c = S.cand, a = candRect(c), L = a.x1 - a.x0;
  // keep clear of the bar, its label (usually just below or above it) and the box the user dragged
  const k = { x0: a.x0 - 0.15 * L, x1: a.x1 + 0.15 * L, y0: a.y0 - Math.max(0.35 * L, 40 / T.s), y1: a.y1 + Math.max(0.35 * L, 40 / T.s) };
  if (c.box) { k.x0 = Math.min(k.x0, c.box.x0); k.x1 = Math.max(k.x1, c.box.x1); k.y0 = Math.min(k.y0, c.box.y0); k.y1 = Math.max(k.y1, c.box.y1); }
  const sx = v => T.ox + v * T.s, sy = v => T.oy + v * T.s, m = 10, X0 = sx(k.x0), X1 = sx(k.x1), Y0 = sy(k.y0), Y1 = sy(k.y1), cxm = (X0 + X1) / 2 - pw / 2;
  const opts = [[X1 - pw, Y0 - ph - m], [cxm, Y0 - ph - m], [X1 + m, (Y0 + Y1) / 2 - ph / 2], [X0 - pw - m, (Y0 + Y1) / 2 - ph / 2], [cxm, Y1 + m], [X1 - pw, Y1 + m]];
  const fits = ([x, y]) => x >= 4 && y >= 4 && x + pw <= r.width - 4 && y + ph <= r.height - 4;
  let [x, y] = opts.find(fits) || opts[0];
  if (popOff) { x += popOff[0]; y += popOff[1]; }
  x = Math.max(4, Math.min(r.width - pw - 4, x)); y = Math.max(4, Math.min(r.height - ph - 4, y)); el.style.left = x + 'px'; el.style.top = y + 'px'; }
// brief on-image marker of what was detected (ticks or bar line), fading out
let flashT = 0, flashRaf = 0;
function flashScale() { if (!S.cand && !S.tk && !S.bar && !S.manual) return; flashT = performance.now(); cancelAnimationFrame(flashRaf); const step = () => { render(); if (performance.now() - flashT < 3200) flashRaf = requestAnimationFrame(step); else render(); }; step(); }
function drawScaleFlash(lw) {
  const c = S.cand || (S.tk ? { kind: 'ticks', tk: S.tk } : S.bar ? { kind: 'line', bar: S.bar } : S.manual ? { kind: 'manual', ...S.manual } : null);
  const keep = !!(S.cand && S.cand.quiet); // Find in Box / Trace Bar: the found bar stays marked until Apply or ✕
  const t = performance.now() - flashT; if (!c || (!keep && (!flashT || t > 3200))) return; const a = keep || t < 2400 ? 1 : 1 - (t - 2400) / 800;
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ff1f9f'; ctx.fillStyle = '#ff1f9f'; ctx.lineWidth = 1.3 * lw;
  ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = 3 * lw * T.s * (devicePixelRatio || 1); // thin line with a soft white halo: visible on dark and bright areas
  let x0, x1, yb;
  if (c.kind === 'ticks') { const k = c.tk, h = k.h || 8; k.xs.forEach((x, i) => { ctx.setLineDash(k.hit && !k.hit[i] ? [2 * lw, 2 * lw] : []); ctx.strokeRect(x - 3 * lw, k.yTop - 2 * lw, 6 * lw, h + 4 * lw); }); ctx.setLineDash([]); x0 = k.xs[0]; x1 = k.xs[k.xs.length - 1]; yb = k.yTop - 8 * lw; }
  if (c.kind === 'ticks') {} else if (c.kind === 'manual') { const [p, q] = c.pts; ctx.lineWidth = 2 * lw; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); x0 = Math.min(p[0], q[0]); x1 = Math.max(p[0], q[0]); yb = Math.min(p[1], q[1]) - 8 * lw; }
  else { const b = c.bar; ctx.save(); ctx.shadowBlur = 0; ctx.globalAlpha = 0.85 * a; ctx.lineWidth = Math.max(3 * lw, b.th + 2 * lw); ctx.beginPath(); ctx.moveTo(b.x0, b.y); ctx.lineTo(b.x1, b.y); ctx.stroke(); ctx.restore(); x0 = b.x0; x1 = b.x1; yb = b.y - b.th / 2 - 8 * lw; }
  ctx.globalAlpha = a; ctx.lineWidth = 1.3 * lw; ctx.beginPath(); ctx.moveTo(x0, yb + 4 * lw); ctx.lineTo(x0, yb); ctx.lineTo(x1, yb); ctx.lineTo(x1, yb + 4 * lw); ctx.stroke();
  if (c.quiet) { ctx.restore(); return; } // Find in Box / Trace Bar: the label appears once Apply confirms it
  const len = +S.barlen || 2, txt = `${candText(c)} = ${len.toFixed(2)} µm → ${(len * 1000 / candL(c)).toFixed(3)} nm/px`;
  ctx.font = `500 ${12 * lw}px ${FONT}`; const tw = ctx.measureText(txt).width, tx = Math.max(4 * lw, Math.min(S.W0 - tw - 12 * lw, (x0 + x1) / 2 - tw / 2)), ty = yb - 26 * lw;
  ctx.shadowBlur = 0; ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(tx - 6 * lw, ty, tw + 12 * lw, 20 * lw);
  ctx.fillStyle = '#c4007a'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(txt, tx, ty + 10 * lw); ctx.restore(); }

async function loadFiles(files) {
  files = [...files]; if (!files.length) return;
  if (running) return toast('Cannot add images while processing.', 1);
  const stemOf = n => n.replace(/\.[^.]+$/, '').toLowerCase();
  const txts = files.filter(f => /\.txt$/i.test(f.name)), imgs = files.filter(f => !/\.txt$/i.test(f.name));
  const pix = {};
  for (const t of txts) { const m = (await t.text()).match(/PixelSize\s*=\s*([\d.]+)/i); if (m) pix[stemOf(t.name)] = parseFloat(m[1]); }
  if (!imgs.length) { const v = Object.values(pix)[0]; if (v && S.gray) { S.nmpx = v; $('nmpx').value = v.toFixed(3); setScaleInfo('Pixel size taken from Hitachi .txt.'); stats(); renderImgProps(); renderTree(); } else toast('This .txt file has no PixelSize entry.', 1); return; }
  for (const img of imgs) {
    setStatus('Reading ' + img.name + '…', true); await tick();
    try {
      const buf = await img.arrayBuffer(); let W, H, rgba;
      if (/\.tiff?$/i.test(img.name)) {
        if (typeof UTIF === 'undefined') throw new Error('TIFF decoder failed to load.');
        const ifds = UTIF.decode(buf); UTIF.decodeImage(buf, ifds[0]); rgba = UTIF.toRGBA8(ifds[0]); W = ifds[0].width; H = ifds[0].height;
      } else {
        const bmp = await createImageBitmap(new Blob([buf]));
        W = bmp.width; H = bmp.height; const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0); rgba = cx.getImageData(0, 0, W, H).data;
      }
      const g = new Uint8ClampedArray(W * H);
      for (let i = 0; i < W * H; i++) g[i] = Math.round(0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]);
      const nm = pix[stemOf(img.name)] || (imgs.length === 1 && txts.length === 1 ? Object.values(pix)[0] : null);
      setImage(g, W, H, img.name, nm || null, false);
    } catch (e) { toast(`${img.name}: ${e.message || 'Could not read the image.'}`, 1); }
  }
  if (imgs.length > 1) log(`${imgs.length} images added — use Process All to run them together.`);
}
// native shell hook (macOS app: Finder "Open With" / dock drop)
window.__gtOpen = list => loadFiles(list.map(({ name, b64 }) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], name); }));
const NATIVE = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.save);

// Hitachi-style dotted scale: equally spaced short white ticks in the bottom band
function detectTicks(verbose, reg) {
  const W = S.W0, H = S.H0, g = S.gray; if (!g) return null;
  const y0 = reg ? reg.y0 : Math.floor(H * 0.75), yE = reg ? reg.y1 : H, xA = reg ? reg.x0 : 0, xB = reg ? reg.x1 : W, minRun = Math.max(5, Math.round(H / 250)), maxH = Math.max(12, H / 50);
  // tick brightness from the search area (compressed or rescaled images rarely keep pure white)
  const hb = new Uint32Array(256); let nb = 0; for (let y = y0; y < yE; y += 2) for (let x = xA; x < xB; x += 2) { hb[g[y * W + x]]++; nb++; }
  let acc = 0, v99 = 255; for (let v = 255; v >= 0; v--) { acc += hb[v]; if (acc >= nb * 0.004) { v99 = v; break; } }
  const TB = v99 >= 250 ? 240 : Math.max(185, v99 - 20);
  const runs = [];
  for (let x = xA; x < xB; x++) { let st = -1;
    for (let y = y0; y <= yE; y++) { const on = y < yE && g[y * W + x] >= TB;
      if (on && st < 0) st = y; else if (!on && st >= 0) { const L = y - st; if (L >= minRun && L <= maxH) runs.push([x, st, L]); st = -1; } } }
  const cand = [];
  for (const [x, y, L] of runs) { const k = cand.find(c => x - c.b <= 1 && x > c.b - 1 && Math.abs(c.ys[0] - y) <= 2);
    if (k) { k.b = x; k.ys.push(y); k.hs.push(L); } else cand.push({ a: x, b: x, ys: [y], hs: [L] }); }
  const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
  const lum = (x, y) => { let v = 0, n = 0; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < W && y >= 0 && y < H) { v += g[y * W + xx]; n++; } } return n ? v / n : 255; };
  const dark = (x, y) => { let v = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < W && yy >= 0 && yy < H) { v += g[yy * W + xx]; n++; } } return n && v / n < 215; }; // tick must stand out from what is beside it (image content may run under an overlay bar)
  const c = cand.filter(k => k.b - k.a <= Math.max(8, W / 300)).map(k => ({ x: (k.a + k.b) / 2, y: med(k.ys), h: med(k.hs), a: k.a, b: k.b }))
    .filter(t => { const ym = Math.round(t.y + t.h / 2), d = Math.max(2, Math.round((t.b - t.a) / 2) + 2), xm = Math.round(t.x); return dark(t.a - d, ym) && dark(t.b + d, ym) && lum(xm, t.y - 3) < 160 && lum(xm, t.y + t.h + 2) < 160; }); // a free-standing dash (ruler ticks attached to a frame line are not Hitachi ticks) // Hitachi ticks are white dashes on the black data bar
  let best = null;
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
    const sp = c[j].x - c[i].x; if (sp < Math.max(4, W / 80 * (reg ? 0.5 : 1)) || sp > W / 8) continue;
    const same = (p, q) => Math.abs(p.y - q.y) <= 3 && Math.abs(p.h - q.h) <= 3;
    if (!same(c[i], c[j])) continue;
    const chain = [c[i], c[j]]; let last = c[j];
    for (let k = j + 1; k < c.length; k++) { if (!same(c[k], c[i])) continue; const d = c[k].x - last.x, m = Math.round(d / sp);
      if (m >= 1 && m <= 3 && Math.abs(d - m * sp) <= 2.5) { chain.push(c[k]); last = c[k]; } else if (d > 3 * sp + 3) break; }
    // mostly nothing between dashes (letters are joined by strokes); checked per tick interval, so a tick hidden under a bright
    // grain boundary or particle, or a stray bright spot in one gap, does not reject the whole bar
    let gT = 0, gD = 0; for (let q = 1; q < chain.length; q++) { const a = chain[q - 1], t = chain[q], m = Math.max(1, Math.round((t.x - a.x) / sp));
      for (let u = 0; u < m; u++) { const xm = Math.round(a.x + (u + 0.5) * (t.x - a.x) / m); gT++; if ([1, 0.5, 0].filter(f => lum(xm, Math.round(t.y + 1 + (t.h - 3) * f)) < 160).length >= 2) gD++; } }
    const gapsDark = gD >= 0.6 * gT;
    const cover = Math.round((last.x - c[i].x) / sp); if (gapsDark && chain.length >= 4 && cover >= 6 && (!best || chain.length > best.chain.length)) best = { chain, sp };
  }
  if (!best) { if (verbose) toast('No scale ticks found. Use Scale Line to mark the bar length.', 1); return null; }
  const ch = best.chain, span = ch[ch.length - 1].x - ch[0].x, k = Math.round(span / best.sp), sp = span / k;
  const len = parseFloat($('barlen').value) || 2;
  // fill in ticks hidden by bright image content, then extend toward the 11 ticks of a 10-division bar where the image shows one
  const yT = Math.min(...ch.map(t => t.y)), hT = med(ch.map(t => t.h)), seen = x => { for (let dx = -2; dx <= 2; dx++) { const xx = Math.round(x + dx); if (xx < 0 || xx >= W) continue; let n = 0; for (let y = yT; y < yT + hT && y < H; y++) if (g[y * W + xx] >= TB - 10) n++; if (n >= hT * 0.6) return true; } return false; };
  let first = ch[0].x, kk = k;
  while (kk < 10) { if (first - sp > 0 && seen(first - sp)) { first -= sp; kk++; } else if (first + (kk + 1) * sp < W && seen(first + (kk + 1) * sp)) kk++; else break; }
  const xs = Array.from({ length: kk + 1 }, (_, i) => first + i * sp), hit = xs.map(x => ch.some(t => Math.abs(t.x - x) <= 3) || seen(x));
  return { n: kk + 1, div: kk, sp, nmpx: (len * 1000 / 10) / sp, yTop: yT, xs, hit, h: hT };
}

// ---------------- info band and scale bar (non-Hitachi layouts) ----------------
// Info band: a block of rows at the bottom dominated by one flat tone (black, gray or white panel with text),
// sitting directly under rows of ordinary, textured image content.
function detectBand() {
  const W = S.W0, H = S.H0, g = S.gray; if (!g) return null;
  const yMin = Math.floor(H * 0.55), flat = new Float32Array(H), mode = new Uint8Array(H), hist = new Uint32Array(256);
  for (let y = Math.floor(H * 0.4); y < H; y++) { hist.fill(0); const o = y * W; for (let x = 0; x < W; x++) hist[g[o + x]]++;
    let m = 0; for (let v = 1; v < 256; v++) if (hist[v] > hist[m]) m = v; let c = 0; for (let v = Math.max(0, m - 4); v <= Math.min(255, m + 4); v++) c += hist[v]; flat[y] = c / W; mode[y] = m; }
  const maxGap = Math.max(3, Math.round(H * 0.012)); let top = H, gap = 0;
  for (let y = H - 1; y >= yMin; y--) { if (flat[y] >= 0.35) { top = y; gap = 0; } else if (++gap > maxGap) break; }
  if (H - top < Math.max(8, H * 0.025) || top <= yMin + 2) return null;
  let above = 0, n = 0; for (let y = Math.max(0, top - 30); y < top - 3; y++) { above += flat[y]; n++; }
  if (!n || above / n > 0.3) return null; // the content right above must be textured, otherwise this is not a panel
  const ms = Array.from(mode.subarray(top, Math.min(H, top + 24))).sort((p, q) => p - q), bg = ms[ms.length >> 1]; let fm = 0; // panel tone from its upper rows
  for (let y = top; y < H; y++) fm += flat[y];
  if (fm / (H - top) < 0.5) return null; // a panel is mostly flat tone, row after row
  return { top, bg };
}
// Scale bar line: an isolated, thin, straight horizontal stroke (bright on dark or dark on bright), possibly broken by its own label.
// Edges of filled boxes are rejected (ink on one side), table borders are rejected (a few irregular separators run into them),
// and ruler-type bars (many evenly spaced ticks on the stroke) are accepted. reg limits the search to a rectangle.
function detectBarLine(band, reg) {
  const W = S.W0, H = S.H0, g = S.gray; if (!g) return null;
  const R = reg || { x0: 0, x1: W, y0: band ? band.top : Math.floor(H * 0.7), y1: H }, rw = R.x1 - R.x0;
  const maxT = Math.max(10, Math.round(H / 60)), minL = Math.max(12, rw * (reg ? 0.08 : 0.04)), best = [];
  let bgv = band && !reg ? band.bg : null;
  if (reg) { const hb = new Uint32Array(256); let n = 0; for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) { hb[g[y * W + x]]++; n++; } // tone of the box, if it is mostly one tone
    let m = 0; for (let k = 1; k < 256; k++) if (hb[k] > hb[m]) m = k; let c = 0; for (let k = Math.max(0, m - 6); k <= Math.min(255, m + 6); k++) c += hb[k]; if (c / n > 0.35) bgv = m; }
  for (const bright of [true, false]) {
    if (bgv != null && (bright ? bgv > 215 : bgv < 110)) continue; // on a panel the bar contrasts with the panel tone
    const thr = bgv == null ? (bright ? 200 : 60) : bright ? (bgv < 130 ? Math.max(120, bgv + 90) : Math.min(245, bgv + 35)) : Math.max(10, bgv - 90), ink = v => bright ? v >= thr : v <= thr;
    const segs = [];
    for (let y = R.y0; y < R.y1; y++) { let st = -1; const o = y * W;
      for (let x = R.x0; x <= R.x1; x++) { const on = x < R.x1 && ink(g[o + x]); if (on && st < 0) st = x; else if (!on && st >= 0) { if (x - st >= Math.max(6, rw * 0.015)) segs.push({ y, a: st, b: x - 1 }); st = -1; } } }
    const strokes = [];
    for (const sg of segs) { const k = strokes.find(t => sg.y - t.y1 <= 1 && Math.abs(sg.a - t.a) <= 3 && Math.abs(sg.b - t.b) <= 3);
      if (k) k.y1 = sg.y; else strokes.push({ a: sg.a, b: sg.b, y0: sg.y, y1: sg.y }); }
    const ok = strokes.filter(t => t.y1 - t.y0 + 1 <= maxT).sort((p, q) => p.y0 - q.y0 || p.a - q.a);
    const lines = [];
    const label = (a, b, y) => { let c = 0; for (let x = a; x <= b; x++) { let f = false; for (let dy = -8; dy <= 8 && !f; dy++) { const yy = y + dy; if (yy >= 0 && yy < H && ink(g[yy * W + x])) f = true; } if (f) c++; } return c / Math.max(1, b - a + 1); };
    for (const t of ok) { const k = lines.find(l => Math.abs(l.y0 - t.y0) <= 2 && t.a > l.b && t.a - l.b <= 1.5 * Math.min(l.b - l.a, t.b - t.a) && label(l.b + 1, t.a - 1, l.y0) > 0.25); // gap must hold the label
      if (k) { k.b = t.b; k.parts.push([t.a, t.b]); k.y1 = Math.max(k.y1, t.y1); } else lines.push({ ...t, parts: [[t.a, t.b]] }); }
    for (const l of lines) { const L = l.b - l.a + 1; if (L < minL || L > rw * (reg ? 0.99 : 0.85) || L > W * 0.7) continue;
      const th = l.y1 - l.y0 + 1, off = 2 + Math.ceil(th / 2);
      const side = yy => { if (yy < 0 || yy >= H) return 0; let c = 0, n = 0; for (const [a, b] of l.parts) for (let x = a; x <= b; x++) { n++; if (ink(g[yy * W + x])) c++; } return c / n; };
      const sd = Math.max(side(l.y0 - off), side(l.y1 + off)); if (sd > 0.35) continue; // a box edge, not a line
      const mean = yy => { if (yy < 0 || yy >= H) return null; let v = 0, n = 0; for (const [a, b] of l.parts) for (let x = a; x <= b; x++) { v += g[yy * W + x]; n++; } return v / n; };
      const mu = mean(l.y0 - off - 1), md = mean(l.y1 + off + 1); if (mu != null && md != null && Math.abs(mu - md) > 45) continue; // same background on both sides (box borders have image on one side)
      const endInk = [l.a - 3, l.a - 2, l.b + 2, l.b + 3].filter(x => x >= 0 && x < W && ink(g[Math.round((l.y0 + l.y1) / 2) * W + x])).length;
      const xs = [];
      for (const [a, b] of l.parts) for (let x = a + 3; x <= b - 3; x++) { let up = 0, dn = 0;
        for (let d = 1; d < 80 && l.y0 - d >= 0 && ink(g[(l.y0 - d) * W + x]); d++) up++;
        for (let d = 1; d < 80 && l.y1 + d < H && ink(g[(l.y1 + d) * W + x]); d++) dn++;
        if (Math.max(up, dn) >= Math.max(5, 2 * th)) { xs.push(x); x += 2; } }
      let ruler = false;
      if (xs.length >= 5) { const d = xs.slice(1).map((v, i) => v - xs[i]), m = d.reduce((p, q) => p + q, 0) / d.length, sd = Math.sqrt(d.reduce((p, q) => p + (q - m) ** 2, 0) / d.length); ruler = sd / m < 0.2; }
      if (xs.length >= 2 && !ruler) continue; // table grid
      best.push({ x0: l.a, x1: l.b + 1, y: Math.round((l.y0 + l.y1) / 2), th, L, bright, ruler, score: L * (l.parts.length > 1 || ruler ? 1.2 : 1) * Math.max(0.1, 1 - 2.5 * sd) * (endInk ? 0.6 : 1) });
    }
  }
  best.sort((p, q) => q.score - p.score);
  return best[0] || null;
}
// ---------------- synthetic sample (known ground truth) ----------------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// demo samples: varied grain shapes, contrast types and scale-bar styles, each with known ground truth
const DEMOS = [
  { name: 'hitachi', desc: 'equiaxed grains with dark boundary lines, Hitachi dotted scale (2 µm)', seed: 20251113, W: 2048, H: 1536, nmpx: 2.48, cell: 150, bar: 'hitachi', len: 2 },
  { name: 'fei', desc: 'contrast-type grains (tone steps between grains), FEI-style info bar (2 µm) — Contrast mode', seed: 7177, W: 1600, H: 1300, nmpx: 3, cell: 125, style: 'contrast', bar: 'fei', len: 2, mode: 'contrast' },
  { name: 'tescan', desc: 'grains elongated along a rolling direction, TESCAN-style panel with a ruler (1 µm)', seed: 31337, W: 1800, H: 1650, nmpx: 4, cell: 105, aniso: [1.8, 0.55], bar: 'tescan', len: 1 },
  { name: 'optical', desc: 'bimodal grain size (coarse and fine regions), scale bar in an inset box (1 µm)', seed: 4242, W: 1600, H: 1200, nmpx: 3, cell: 95, bimodal: true, bar: 'inset', len: 1 },
  { name: 'overlay', desc: 'coarse grains with bright boundaries, scale bar overlaid at the top left (500 nm)', seed: 9001, W: 1800, H: 1400, nmpx: 1.2, cell: 230, style: 'bright', pol: 'bright', bar: 'overlay', len: 0.5 },
];
function makeSample(v) {
  v = v || DEMOS[0]; const W = v.W, H = v.H, nmpx = v.nmpx, R = rng(v.seed), cell = v.cell, [as, aa] = v.aniso || [1, 0], ca = Math.cos(aa), sa = Math.sin(aa);
  const toU = (x, y) => [(x * ca + y * sa) / as, -x * sa + y * ca]; // grain space: stretched along angle aa
  const cs = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => toU(x, y)), u0 = Math.min(...cs.map(c => c[0])), v0 = Math.min(...cs.map(c => c[1])), U = Math.max(...cs.map(c => c[0])) - u0, V = Math.max(...cs.map(c => c[1])) - v0;
  const seeds = [];
  for (let gy = -1; gy <= Math.ceil(V / cell); gy++) for (let gx = -1; gx <= Math.ceil(U / cell); gx++) {
    if (v.bimodal) { const coarse = Math.sin(gx * 0.55) + Math.cos(gy * 0.7) > 0.4; if (coarse ? R() < 0.62 : false) continue;
      const n = coarse ? 1 : 3; for (let k = 0; k < n; k++) seeds.push([(gx + 0.5 + (R() - 0.5) * 0.95) * cell, (gy + 0.5 + (R() - 0.5) * 0.95) * cell]); continue; }
    if (R() < 0.18) continue;
    const n = R() < 0.3 ? 2 : 1;
    for (let k = 0; k < n; k++) seeds.push([(gx + 0.5 + (R() - 0.5) * 0.9) * cell, (gy + 0.5 + (R() - 0.5) * 0.9) * cell]);
  }
  const gw = Math.ceil(U / cell) + 3, gh = Math.ceil(V / cell) + 3, buckets = Array.from({ length: gw * gh }, () => []);
  seeds.forEach((s, i) => { const bx = Math.floor(s[0] / cell) + 1, by = Math.floor(s[1] / cell) + 1; if (bx >= 0 && by >= 0 && bx < gw && by < gh) buckets[by * gw + bx].push(i); });
  const waves = Array.from({ length: 4 }, () => [R() * 0.02 + 0.006, R() * 0.02 + 0.006, R() * 6.28, 7 + R() * 7]);
  const warp = (x, y, o) => { let d = 0; for (const [a, b, ph, A] of waves) d += A * Math.sin(a * x + b * y + ph + o); return d; };
  const lab = new Int32Array(W * H), rad = v.bimodal ? 3 : 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let [wx, wy] = toU(x + warp(x, y, 0), y + warp(y, x, 1.7)); wx -= u0; wy -= v0; const bx = Math.floor(wx / cell) + 1, by = Math.floor(wy / cell) + 1;
    let bd = 1e18, bi = 0;
    for (let j = by - rad; j <= by + rad; j++) for (let i = bx - rad; i <= bx + rad; i++) { if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
      for (const k of buckets[j * gw + i]) { const dx = seeds[k][0] - wx, dy = seeds[k][1] - wy, d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = k + 1; } } }
    lab[y * W + x] = bi;
  }
  const bnd = new Uint8Array(W * H);
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const p = y * W + x; if (lab[p] !== lab[p + 1] || lab[p] !== lab[p + W]) bnd[p] = 1; }
  const D = GB.edt(bnd, W, H);
  const off = new Float32Array(seeds.length + 1), glow = new Float32Array(seeds.length + 1);
  for (let i = 0; i <= seeds.length; i++) { off[i] = (R() - 0.5) * 10; glow[i] = R() < 0.5 ? R() * 50 : R() * 12; }
  const tone = v.style === 'contrast' ? Float32Array.from(off, () => (R() - 0.5) * 120) : null;
  const img = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x, d = D[p], l = lab[p];
    const st = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(x * 0.011 + Math.sin(y * 0.007) * 3));
    if (v.style === 'contrast') img[p] = 118 + tone[l] - 30 * Math.exp(-d * d / 2) + 3 * Math.sin(2 * Math.PI * y / 90);
    else if (v.style === 'bright') img[p] = 92 + off[l] + 78 * st * Math.exp(-d * d / (2 * 1.7 * 1.7)) + (d > 2 ? glow[l] * 0.4 * Math.exp(-(d - 2) / 5) : 0);
    else img[p] = 96 + off[l] + 4 * Math.sin(2 * Math.PI * x / 140) - 62 * st * Math.exp(-d * d / (2 * 1.25 * 1.25)) + (d > 1.6 ? glow[l] * Math.exp(-(d - 1.6) / 4) : 0); }
  const nSpot = Math.round(420 * W * H / (2048 * 1536) * (v.style === 'contrast' ? 0.3 : 1));
  for (let k = 0; k < nSpot; k++) { const cx = R() * W, cy = R() * H, s = 4 + R() * 5, A = 25 + R() * 40, r = Math.ceil(3 * s);
    for (let y = Math.max(0, cy - r | 0); y < Math.min(H, cy + r); y++) for (let x = Math.max(0, cx - r | 0); x < Math.min(W, cx + r); x++) img[y * W + x] += A * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s)); }
  for (let k = 0; k < Math.round(45 * W * H / (2048 * 1536)); k++) { const cx = R() * W, cy = R() * H, th = R() * Math.PI, len = 25 + R() * 55;
    for (let t = -len / 2; t <= len / 2; t += 0.5) { const x = Math.round(cx + t * Math.cos(th)), y = Math.round(cy + t * Math.sin(th)); if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue; img[y * W + x] -= 18; img[y * W + x + 1] -= 9; } }
  const g = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i += 2) { const u = R() || 1e-9, vv = R(), m = Math.sqrt(-2 * Math.log(u)); g[i] = img[i] + 21 * m * Math.cos(6.2832 * vv); if (i + 1 < W * H) g[i + 1] = img[i + 1] + 21 * m * Math.sin(6.2832 * vv); }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'), id = cx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = g[i]; id.data[4 * i + 3] = 255; }
  cx.putImageData(id, 0, 0);
  const Lpx = v.len * 1000 / nmpx, lbl = v.len < 1 ? `${Math.round(v.len * 1000)} nm` : `${v.len} µm`; let yb = H;
  cx.textBaseline = 'top';
  if (v.bar === 'hitachi') {
    const sp = 200 / nmpx, x0 = Math.round(W * 0.535), ty = H - 95;
    cx.fillStyle = '#fff';
    for (let k = 0; k <= 10; k++) cx.fillRect(Math.round(x0 + k * sp) - 1, ty, 3, 14);
    cx.font = '600 50px Arial, sans-serif';
    cx.fillText('10.0kV 6.0mm x25.0k SE(U)', 55, H - 70); cx.fillText('2.00um', Math.round(x0 + 10 * sp) - 210, H - 70); yb = ty - 8;
  } else if (v.bar === 'fei') { // black info bar: parameter table on the left, scale line with its label in the middle on the right
    const bh = 110, t0 = H - bh, cw = Math.round(W * 0.075); yb = t0 - 2; cx.fillStyle = '#000'; cx.fillRect(0, t0, W, bh);
    cx.fillStyle = '#fff'; cx.fillRect(0, t0, W, 2); cx.font = '30px Arial, sans-serif';
    ['Mag', 'HV', 'WD', 'Det', 'Spot'].forEach((h, k) => { cx.fillRect(k * cw + cw - 2, t0, 2, bh); cx.fillText(h, k * cw + 10, t0 + 12); cx.fillText(['5000x', '20 kV', '10.1', 'SSD', '4.0'][k], k * cw + 10, t0 + 62); });
    cx.fillRect(0, t0 + 54, cw * 5, 2);
    const xA = Math.round(W * 0.45), ly = t0 + 40; cx.font = '600 34px Arial, sans-serif'; const tw = cx.measureText(lbl).width + 24, xm = xA + Lpx / 2;
    cx.fillRect(xA, ly, xm - tw / 2 - xA, 3); cx.fillRect(xm + tw / 2, ly, xA + Lpx - xm - tw / 2, 3); cx.fillRect(xA, ly - 10, 3, 23); cx.fillRect(xA + Lpx - 3, ly - 10, 3, 23);
    cx.fillText(lbl, xm - tw / 2 + 12, ly - 15);
  } else if (v.bar === 'tescan') { // gray panel in table cells; the scale is a ruler box with ticks, its value below
    const bh = 160, t0 = H - bh, rh = bh / 2; yb = t0 - 2; cx.fillStyle = '#5c5c5c'; cx.fillRect(0, t0, W, bh);
    cx.fillStyle = '#d8d8d8'; cx.fillRect(0, t0, W, 2); cx.fillRect(0, t0 + rh, W, 2); [0.25, 0.5].forEach(f => cx.fillRect(Math.round(W * f), t0, 2, bh));
    cx.fillStyle = '#fff'; cx.font = '600 32px Arial, sans-serif'; cx.fillText('SEM HV: 15.0 kV', 30, t0 + 22); cx.fillText('View field: ' + (W * nmpx / 1000).toFixed(1) + ' µm', 30, t0 + rh + 22);
    cx.fillText('WD: 9.85 mm', W * 0.25 + 30, t0 + 22); cx.fillText('Det: SE', W * 0.25 + 30, t0 + rh + 22); cx.fillText('VEGA3 TESCAN', W - 280, t0 + 22);
    const xR = Math.round(W * 0.5 + 40), yR = t0 + 18, hR = 40; cx.fillStyle = '#fff';
    cx.fillRect(xR, yR, Lpx, 2); cx.fillRect(xR, yR + hR, Lpx, 2); cx.fillRect(xR, yR, 2, hR); cx.fillRect(xR + Lpx - 2, yR, 2, hR + 2);
    for (let k = 1; k < 10; k++) cx.fillRect(Math.round(xR + k * Lpx / 10), yR, 2, 16);
    cx.fillText(lbl, xR, t0 + rh + 22);
  } else if (v.bar === 'inset') { // white box in the lower right corner with a black bar and its label
    const bw = Lpx + 80, bh = 110, bx = W - bw - 30, by = H - bh - 30; cx.fillStyle = '#fff'; cx.fillRect(bx, by, bw, bh); cx.strokeStyle = '#333'; cx.lineWidth = 2; cx.strokeRect(bx, by, bw, bh);
    cx.fillStyle = '#000'; cx.fillRect(bx + 40, by + 28, Lpx, 6); cx.font = '34px Arial, sans-serif'; const tw = cx.measureText(lbl).width; cx.fillText(lbl, bx + bw / 2 - tw / 2, by + 52);
  } else if (v.bar === 'overlay') { // thick white bar drawn over the image at the top left
    cx.fillStyle = '#fff'; cx.fillRect(70, 60, Lpx, 12); cx.font = '600 56px Arial, sans-serif'; const tw = cx.measureText(lbl).width; cx.fillText(lbl, 70 + Lpx / 2 - tw / 2, 88);
  }
  const d2 = cx.getImageData(0, 0, W, H).data; const out = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) out[i] = d2[4 * i];
  const px = nmpx / 1000;
  let max = 0; for (let i = 0; i < lab.length; i++) if (lab[i] > max) max = lab[i];
  const gtG = GB.grains(lab, max, W, H, px, { x0: 0, y0: 0, x1: W, y1: yb });
  return { g: out, W, H, nmpx, gt: gtG, lab, yb };
}

// ---------------- pipeline ----------------
let running = false, pending = null;
async function run(from) {
  if (!S.gray) return toast('Open an image first.', 1);
  if (running) { pending = pending === 'A' || from === 'A' ? 'A' : 'B'; return; }
  running = true; const t0 = performance.now();
  try {
    const p = S.p, f = p.f, c = S.c;
    const keyA = [f, p.mode, S.destripe, p.pol, p.sigma, p.L].join('|');
    if (from === 'A' || c.keyA !== keyA) {
      setStatus('Computing boundary signal…', true); progress(0); await tick();
      const ds = GB.downsample(S.gray, S.W0, S.H0, f); c.img = ds.img; c.w = ds.W; c.h = ds.H;
      const sg = p.sigma / f; let R;
      if (p.mode === 'contrast') {
        const w = c.w, h = c.h, im = Float32Array.from(c.img);
        if (S.destripe) { // remove horizontal scan-line offsets (row mean minus its local vertical trend)
          const rm = new Float32Array(h); for (let y = 0; y < h; y++) { let a = 0; for (let x = 0; x < w; x++) a += im[y * w + x]; rm[y] = a / w; }
          for (let y = 0; y < h; y++) { let a = 0, n = 0; for (let k = -12; k <= 12; k++) { const yy = y + k; if (yy < 0 || yy >= h) continue; a += rm[yy]; n++; } const d = rm[y] - a / n; for (let x = 0; x < w; x++) im[y * w + x] -= d; } }
        const G = GB.gauss(im, w, h, sg), E = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const q = y * w + x;
          const gx = (G[q - w + 1] + 2 * G[q + 1] + G[q + w + 1]) - (G[q - w - 1] + 2 * G[q - 1] + G[q + w - 1]);
          const gy = (G[q + w - 1] + 2 * G[q + w] + G[q + w + 1]) - (G[q - w - 1] + 2 * G[q - w] + G[q - w + 1]);
          E[q] = Math.hypot(gx, gy); }
        R = GB.normalize(E, null, 0.995); for (let i = 0; i < R.length; i++) R[i] = Math.sqrt(R[i]); // compress: a small tone step between similar grains is still a boundary
        const V = GB.normalize(GB.valley(im, w, h, [sg * 0.6, sg], p.pol, Math.max(0.6, sg * 0.6)), null, 0.995);
        for (let i = 0; i < R.length; i++) R[i] = Math.max(R[i], 0.7 * V[i]);
      } else R = GB.valley(c.img, c.w, c.h, [sg, sg * 1.67], p.pol, Math.max(0.6, sg));
      progress(1); setStatus('Line filter…', true); await tick();
      const Lw = Math.round(p.L / f); if (Lw >= 3) R = GB.lineFilter(R, c.w, c.h, Lw | 1, 12);
      c.R = R; c.keyA = keyA;
    }
    progress(2); setStatus('Segmentation…', true); await tick();
    const w = c.w, h = c.h, N = w * h;
    const rr = { x0: Math.max(0, Math.floor(S.roi.x0 / f)), y0: Math.max(0, Math.floor(S.roi.y0 / f)), x1: Math.min(w, Math.ceil(S.roi.x1 / f)), y1: Math.min(h, Math.ceil(S.roi.y1 / f)) };
    const roi = new Uint8Array(N); for (let y = rr.y0; y < rr.y1; y++) roi.fill(1, y * w + rr.x0, y * w + rr.x1);
    const Rn = GB.normalize(c.R, roi, 0.995);
    const forced = new Int8Array(N);
    for (const e of S.edits) if (e.t === 'draw' || e.t === 'erase') rasterStroke(e, f, w, h, forced, e.t === 'draw' ? 1 : -1);
    for (let i = 0; i < N; i++) { if (forced[i] > 0) Rn[i] = 1; else if (forced[i] < 0) Rn[i] = 0; }
    const B = GB.removeSmall(GB.hysteresis(Rn, w, h, p.lo, p.hi, roi), w, h, Math.max(4, Math.round(p.minSeg / (f * f))));
    for (let i = 0; i < N; i++) if (forced[i] > 0 && roi[i]) B[i] = 1;
    const D = GB.edt(B, w, h);
    const kk = 1.98 / S.nmpx, cu = S.W0 / 873; const m = GB.markers(D, w, h, p.h / f, p.mode === 'contrast' ? Math.max(1.5, 4 * cu / f) : Math.max(1.5, 3 * kk / f), roi);
    const lab = m.lab; let next = m.n + 1; const protect = new Set();
    const putSeed = (px, py) => { const x = Math.round(px / f), y = Math.round(py / f), r = 2;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h || !roi[yy * w + xx] || B[yy * w + xx] || dx * dx + dy * dy > r * r) continue; lab[yy * w + xx] = next; }
      protect.add(next); next++; };
    for (const e of S.edits) {
      if (e.t === 'seed') putSeed(e.x, e.y);
    }
    const dcap = p.mode === 'contrast' ? Math.max(4, 20 * cu / f) : Math.max(4, 30 * kk / f), relief = new Float32Array(N);
    for (let i = 0; i < N; i++) relief[i] = Math.min(1, 0.5 * Rn[i] + 0.5 * (1 - Math.min(D[i], dcap) / dcap));
    GB.watershed(relief, lab, w, h, roi);
    GB.mergeWeak(lab, GB.maxFilter(Rn, w, h), w, h, p.merge, protect);
    // manual edits on the labels, applied in the order they were made
    const at = (px, py) => { const X = Math.round(px / f), Y = Math.round(py / f); return X >= 0 && Y >= 0 && X < w && Y < h ? lab[Y * w + X] : 0; };
    const join = (a, b) => { if (a && b && a !== b) for (let i = 0; i < N; i++) if (lab[i] === b) lab[i] = a; };
    for (const e of S.edits) {
      if (e.t === 'merge') join(at(e.a[0], e.a[1]), at(e.b[0], e.b[1]));
      // Erase GB: grains whose shared boundary lies under the stroke are joined (the two dominant labels under each brush step)
      else if (e.t === 'erase') { const rr2 = Math.max(1, e.r / f), pts = e.pts.map(q => [q[0] / f, q[1] / f]), samp = [];
        for (let k = 0; k < pts.length; k++) { const [ax, ay] = pts[Math.max(0, k - 1)], [bx, by] = pts[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.7)); for (let t = k ? 1 : 0; t <= n; t++) samp.push([ax + (bx - ax) * t / n, ay + (by - ay) * t / n]); }
        for (const [cx, cy] of samp) { const cnt = new Map(); let tot = 0;
          for (let y = Math.floor(cy - rr2); y <= Math.ceil(cy + rr2); y++) for (let x = Math.floor(cx - rr2); x <= Math.ceil(cx + rr2); x++) { if (x < 0 || y < 0 || x >= w || y >= h || (x - cx) ** 2 + (y - cy) ** 2 > rr2 * rr2) continue; const l = lab[y * w + x]; if (!l) continue; cnt.set(l, (cnt.get(l) || 0) + 1); tot++; }
          const top = [...cnt].sort((p, q) => q[1] - p[1]); if (top.length > 1 && top[1][1] >= 0.15 * tot) join(top[0][0], top[1][0]); } }
      // Split: two seeds on either side of the cut; the grain is re-flooded on the boundary signal, biased toward the cut line,
      // so the new boundary follows a faint boundary in the image where there is one
      else if (e.t === 'split') { const [a, b] = e.pts, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const la = at(mx, my); if (!la) continue;
        const seedAt = sg => { for (let o = Math.max(0.3 * L, 4 * f); o >= 2 * f; o *= 0.8) { const X = Math.round((mx + sg * nx * o) / f), Y = Math.round((my + sg * ny * o) / f); if (X >= 0 && Y >= 0 && X < w && Y < h && lab[Y * w + X] === la) return Y * w + X; } return -1; };
        const s1 = seedAt(1), s2 = seedAt(-1); if (s1 < 0 || s2 < 0) continue;
        const sig = Math.max(3, 0.12 * L / f), lv = 256, Q = Array.from({ length: lv }, () => []), nl = next++, own = new Uint8Array(N), lx = mx / f, ly = my / f, half = L / f / 2 + sig;
        const prio = i => { const x = i % w, y = (i / w) | 0, dx = x + .5 - lx, dy = y + .5 - ly, dn = dx * nx + dy * ny, dt = Math.abs(dx * ux + dy * uy), near = dt < half ? Math.exp(-(dn * dn) / (2 * sig * sig)) : 0;
          return Math.min(lv - 1, Math.round((0.6 * Rn[i] + 0.4 * near) * (lv - 1))); };
        own[s1] = 1; own[s2] = 2; Q[prio(s1)].push(s1); Q[prio(s2)].push(s2);
        for (let q = 0; q < lv; q++) { const B2 = Q[q]; while (B2.length) { const i = B2.pop(), x = i % w, o = own[i];
          for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) { if (j < 0 || j >= N || own[j] || lab[j] !== la) continue; own[j] = o; const pj = Math.max(q, prio(j)); Q[pj].push(j); if (pj === q) continue; } } }
        for (let i = 0; i < N; i++) if (own[i] === 2) lab[i] = nl; }
    }
    const n = GB.relabel(lab, N);
    c.Rn = Rn; c.lab = lab; c.n = n; c.rr = rr;
    progress(3); await tick();
    buildOverlay(); clearDirty(); stats(); progress(3, true);
    S.lastMs = (performance.now() - t0) / 1000;
    setStatus(`Ready — ${S.res.sm.n} grains · ${S.lastMs.toFixed(2)} s`);
    log(`${S.name}: processed in ${S.lastMs.toFixed(2)} s — ${S.res.sm.n} grains included (${S.res.all.length} segmented), mean ECD ${(S.res.sm.mean * 1000).toFixed(0)} nm`);
    const qf = qualityFlags(S); if (qf.length) log(`Reliability check: ${qf.join('; ')}. ` + (qf.some(q => /small|line length/.test(q)) ? 'Automatic settings were validated for grains about 75 px or more across — use a higher magnification, or set Working resolution 1× and shorten Line length and Smoothing, then check for merged grains.' : 'Measure more fields (or a larger ROI) for a tighter mean.'), 1);
    saveDoc(); renderTree(); renderCmp();
  } catch (e) { console.error(e); setStatus('Error'); toast('Processing failed: ' + e.message, 1); }
  running = false;
  if (pending) { const q = pending; pending = null; run(q); }
}
function rasterStroke(e, f, w, h, out, v) {
  const r = Math.max(0.6, e.r / f), pts = e.pts.map(q => [q[0] / f, q[1] / f]);
  const dot = (cx, cy) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue; if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out[y * w + x] = v; } };
  if (pts.length === 1) dot(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 0.5));
    for (let k = 0; k <= n; k++) dot(ax + (bx - ax) * k / n, ay + (by - ay) * k / n); }
}

// ---------------- statistics ----------------
const quant = (a, q) => { if (!a.length) return NaN; const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
function summarize(list) {
  const e = list.map(g => g.ecd).sort((a, b) => a - b), n = e.length;
  if (!n) return { n: 0, sorted: [] };
  const mean = e.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(e.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const At = list.reduce((a, g) => a + g.area, 0), aw = list.reduce((a, g) => a + g.ecd * g.area, 0) / At;
  const df = Math.max(1, n - 1), ci = (1.96 + 2.37 / df + 2.8 / (df * df)) * sd / Math.sqrt(n); // 95 % CI half-width of the mean (t approximation)
  return { n, mean, sd, ci, ra: ci / mean * 100, d10: quant(e, .1), d50: quant(e, .5), d90: quant(e, .9), aw, ar: list.reduce((a, g) => a + g.ar, 0) / n, sorted: e };
}
// reliability flags, from the validation study: accuracy drops for grains under ~75 px across, when the line filter is long
// against the grains, and the mean is uncertain with few grains (%RA > 10 %)
function qualityFlags(d) { const r = d.res; if (!r || !r.sm.n) return []; const sm = r.sm, d50px = sm.d50 * 1000 / d.nmpx, out = [];
  if (sm.n >= 10 && d50px < 75) out.push(`small grains (D50 ≈ ${Math.round(d50px)} px)`);
  else if (sm.n >= 10 && d.p.L > 0.33 * d50px) out.push('line length long for these grains');
  if (sm.n < 50) out.push(`few grains (N = ${sm.n})`); else if (sm.ra > 10) out.push(`%RA ${sm.ra.toFixed(1)} % > 10 %`);
  return out; }
function computeRes(d) {
  const c = d.c, px = d.nmpx * d.p.f / 1000;
  const all = GB.grains(c.lab, c.n, c.w, c.h, px, c.rr);
  const minE = (d.minEcd ?? 80) / 1000;
  all.forEach(g => g.inc = (!S.edge || !g.edge) && g.ecd >= minE);
  const inc = all.filter(g => g.inc), sm = summarize(inc), it = GB.intercept(c.lab, c.w, c.h, c.rr, px, Math.max(2, Math.round(8 / d.p.f)));
  return { all, inc, sm, it, px, byId: new Map(all.map(g => [g.id, g])) };
}
function allStats() { docs.forEach((d, i) => { if (i !== cur && d.c && d.c.lab) d.res = computeRes(d); }); stats(); renderCmp(); }
function stats() {
  const c = S.c; if (!c.lab) return;
  const minE = S.minEcd / 1000;
  S.res = computeRes(S); const sm = S.res.sm; saveDoc();
  const defRoi = S.roi && (() => { const r = autoRoi(); return r.x0 === S.roi.x0 && r.y0 === S.roi.y0 && r.x1 === S.roi.x1 && r.y1 === S.roi.y1; })();
  S.gtInfo = null; // demo samples: compare with the known grain map (default ROI only)
  if (S.gt && S.sample && defRoi) { const gi = S.gt.filter(g => (!S.edge || !g.edge) && g.ecd >= minE), gs = summarize(gi); S.gtInfo = { n: gs.n, mean: gs.mean, err: sm.n ? (sm.mean / gs.mean - 1) * 100 : NaN }; }
  saveDoc();
  $('cbar').hidden = S.view !== 'size';
  renderKpis(); drawOverlayColors(); render(); updateDatabar(); renderTree(); if (S.wtab === 'res') drawRes(); if (!$('tblWrap').hidden) renderTable();
}
const nm = v => isFinite(v) ? (v * 1000).toFixed(0) : '–';
// Grain Statistics: one table of every sample on the Result canvas, above the box plot (or table / plot only)
let SVIEW = 'both'; try { SVIEW = localStorage.getItem('graintracer.sview') || 'both'; } catch (e) { }
function renderKpis() { if (S.wtab === 'res') drawRes(); }
function statTableHTML() { saveDoc(); const rows = docs.map((d, i) => ({ d, i })), t = 'box';
  if (!rows.length) return '<h4>Grain statistics</h4><div class="tnote">Open and process images to see their statistics here.</div>';
  const anyGt = rows.some(o => o.d.gtInfo), f3 = v => isFinite(v) ? v.toFixed(3) : '–', f2 = v => isFinite(v) ? v.toFixed(2) : '–';
  const head = ['Sample', 'N', 'Mean ECD', 'SD', '95% CI (±)', '%RA', 'D10', 'D50', 'D90', 'Area-wt ECD', 'Lx', 'Ly', 'Lx / Ly', 'Mean AR', 'Min ECD', 'Reliability check'].concat(anyGt ? ['Error vs truth'] : []);
  const unit = ['', '', 'nm', 'nm', 'nm', '%', 'nm', 'nm', 'nm', 'nm', 'nm', 'nm', '', '', 'nm', ''].concat(anyGt ? ['%'] : []);
  const body = rows.map(({ d }) => { const r = d.res, sw = `<span class="sw" style="background:${colorOf(d)}"></span>${esc(tagOf(d))}`;
    if (!r || !r.sm.n) return `<tr class="off"><td>${sw}</td><td colspan="${head.length - 1}" style="text-align:left">${r ? 'no grains included' : 'not processed'}</td></tr>`;
    const sm = r.sm, it = r.it, q = qualityFlags(d), g = d.gtInfo;
    return `<tr${isOn(d, t) ? '' : ' class="off"'}><td>${sw}</td><td>${sm.n}</td><td>${nm(sm.mean)}</td><td>${nm(sm.sd)}</td><td>${nm(sm.ci)}</td><td${sm.ra > 10 ? ' class="warn"' : ''}>${isFinite(sm.ra) ? sm.ra.toFixed(1) : '–'}</td><td>${nm(sm.d10)}</td><td>${nm(sm.d50)}</td><td>${nm(sm.d90)}</td><td>${nm(sm.aw)}</td><td>${nm(it.Lx)}</td><td>${nm(it.Ly)}</td><td>${f3(it.Lx / it.Ly)}</td><td>${f2(sm.ar)}</td><td>${d.minEcd ?? 80}</td><td style="text-align:left" class="${q.length ? 'warn' : 'ok'}">${q.length ? esc(q.join('; ')) : 'OK'}</td>${anyGt ? `<td>${g && isFinite(g.err) ? (g.err > 0 ? '+' : '') + g.err.toFixed(1) : '–'}</td>` : ''}</tr>`; }).join('');
  return `<h4>Grain statistics <button type="button" class="hbtn" data-help-btn="stats" title="Help" style="margin-left:6px;vertical-align:1px">?</button></h4><table><tr>${head.map((h, k) => `<th>${h}${unit[k] ? ` <span style="font-weight:400">(${unit[k]})</span>` : ''}</th>`).join('')}</tr>${body}</table>
    <div class="tnote">ECD = equivalent circle diameter. Lx, Ly = mean linear intercept along x and y. Gray rows are hidden in the box plot.${anyGt ? ' Error vs truth: demo samples only (default ROI).' : ''}</div>`; }
function layoutRes() { const res = S.wtab === 'res', st = res && curPT() === 'box', tb = $('resTbl'), hw = $('histWrap');
  $$('[data-sview]').forEach(b => { b.hidden = !st; if (b.dataset.sview) b.setAttribute('aria-pressed', b.dataset.sview === SVIEW); });
  tb.hidden = !st || SVIEW === 'plot'; tb.classList.toggle('full', st && SVIEW === 'table'); if (!tb.hidden) tb.innerHTML = statTableHTML();
  hw.hidden = !res || (st && SVIEW === 'table'); hw.style.top = !tb.hidden && SVIEW === 'both' ? tb.offsetHeight + 'px' : '0'; }
function setSview(v) { SVIEW = v; try { localStorage.setItem('graintracer.sview', v); } catch (e) { } drawRes(); }

function renderImgProps() {
  const rows = S.gray ? [['File', S.name], ['Size', `${S.W0} × ${S.H0} px`], ['Pixel size', `${S.nmpx.toFixed(3)} nm`], ['Field of view', `${(S.W0 * S.nmpx / 1000).toFixed(2)} × ${(S.H0 * S.nmpx / 1000).toFixed(2)} µm`], ['Scale source', S.tk ? `${S.tk.n} ticks (auto)` : S.bar ? `scale bar line, ${S.bar.L} px (auto)` : 'manual']] : [['File', '–']];
  $('imgProps').innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td class="n">${esc(String(v))}</td></tr>`).join('');
  $('rbPx').textContent = S.gray ? `${S.nmpx.toFixed(3)} nm/px` : '– nm/px'; $('rbBar').value = $('barlen').value;
}
function renderTable() {
  if (!S.res) { $('dtab').innerHTML = '<tr><td style="text-align:left;border:0;padding:8px 10px;color:#888">Grains are listed here after Process.</td></tr>'; return; }
  const f = S.p.f;
  $('dtab').innerHTML = `<tr><th>ID</th><th>ECD (nm)</th><th>Area (µm²)</th><th>Major (nm)</th><th>Minor (nm)</th><th>AR</th><th>Angle (°)</th><th>x (px)</th><th>y (px)</th><th>Edge</th><th>Included</th></tr>` +
    S.res.all.map(g => `<tr${g.inc ? '' : ' class="ex"'}><td>${g.id}</td><td>${(g.ecd * 1000).toFixed(1)}</td><td>${g.area.toFixed(5)}</td><td>${(g.major * 1000).toFixed(1)}</td><td>${(g.minor * 1000).toFixed(1)}</td><td>${g.ar.toFixed(2)}</td><td>${g.angle.toFixed(1)}</td><td>${(g.cx * f).toFixed(0)}</td><td>${(g.cy * f).toFixed(0)}</td><td>${g.edge ? 'yes' : ''}</td><td>${g.inc ? 'yes' : 'no'}</td></tr>`).join('');
}

// ---------------- overlay buffers ----------------
let ovB = null, ovG = null, ovR = null, ovS = null, colors = null;
function buildOverlay() {
  const c = S.c, w = c.w, h = c.h, lab = c.lab;
  const mk = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
  ovB = mk(); ovR = mk(); ovG = mk();
  const gbc = hex(C.gb), b = ovB.getContext('2d').createImageData(w, h), r = ovR.getContext('2d').createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x, l = lab[p];
    const isB = l && ((x < w - 1 && lab[p + 1] !== l && lab[p + 1]) || (y < h - 1 && lab[p + w] !== l && lab[p + w]));
    if (isB) { b.data[4 * p] = gbc[0]; b.data[4 * p + 1] = gbc[1]; b.data[4 * p + 2] = gbc[2]; b.data[4 * p + 3] = 255; }
    const v = c.Rn[p] * 255; r.data[4 * p] = r.data[4 * p + 1] = r.data[4 * p + 2] = v; r.data[4 * p + 3] = 255; }
  ovB.getContext('2d').putImageData(b, 0, 0); ovR.getContext('2d').putImageData(r, 0, 0);
  const R = rng(7); colors = new Uint8Array((c.n + 1) * 3);
  for (let i = 1; i <= c.n; i++) { const hh = R() * 360, s = 0.55 + R() * 0.35, l = 0.45 + R() * 0.2; const [rr, gg, bb] = hsl(hh, s, l); colors.set([rr, gg, bb], i * 3); }
}
const CMAPS = {
  turbo: t => [0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943)))),
               0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604)))),
               0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))))],
  jet: t => [1.5 - Math.abs(4 * t - 3), 1.5 - Math.abs(4 * t - 2), 1.5 - Math.abs(4 * t - 1)],
  plasma: t => { const K = [[0.0587, 0.0233, 0.5433], [2.1765, 0.2384, 0.7540], [-2.6895, -7.4559, 3.1108], [6.1303, 42.3462, -28.5189], [-11.1074, -82.6663, 60.1398], [10.0231, 71.4136, -54.0722], [-3.6587, -22.9315, 18.1919]];
    return [0, 1, 2].map(k => { let v = K[6][k]; for (let i = 5; i >= 0; i--) v = v * t + K[i][k]; return v; }); },
  viridis: t => { const K = [[0.2777, 0.0054, 0.3341], [0.1051, 1.4046, 1.3846], [-0.3309, 0.2148, 0.0951], [-4.6342, -5.7991, -19.3324], [6.2283, 14.1799, 56.6906], [4.7764, -13.7451, -65.3530], [-5.4355, 4.6459, 26.3124]];
    return [0, 1, 2].map(k => { let v = K[6][k]; for (let i = 5; i >= 0; i--) v = v * t + K[i][k]; return v; }); },
};
function cmap(t) { t = Math.min(1, Math.max(0, t)); return (CMAPS[S.cmap] || CMAPS.turbo)(t).map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)); }
// colour range: D2–D98 of included grains (10 nm steps); x-axis maximum caps the top when set
function sizeRange() { if (!S.res || S.res.sm.n < 2) return [0, 1]; const e = S.res.sm.sorted;
  let lo = Math.floor(quant(e, 0.02) * 100) / 100, hi = Math.ceil(quant(e, 0.98) * 100) / 100; if (axCap()) hi = Math.min(hi, axCap()); if (hi - lo < 0.01) hi = lo + 0.01; return [lo, hi]; }
function drawSizeMap() {
  if (!S.res || !S.c.lab) return; const c = S.c, w = c.w, h = c.h, lab = c.lab, [lo, hi] = sizeRange();
  if (!ovS || ovS.width !== w || ovS.height !== h) { ovS = document.createElement('canvas'); ovS.width = w; ovS.height = h; }
  const col = new Uint8Array((c.n + 1) * 4);
  S.res.all.forEach(g => { if (g.inc) { const [r, gg, b] = cmap((g.ecd - lo) / (hi - lo)); col.set([r, gg, b, 255], g.id * 4); } else col.set([150, 150, 150, 255], g.id * 4); });
  const im = ovS.getContext('2d').createImageData(w, h);
  for (let p = 0; p < w * h; p++) { const l = lab[p]; if (!l) continue; const q = 4 * l; im.data[4 * p] = col[q]; im.data[4 * p + 1] = col[q + 1]; im.data[4 * p + 2] = col[q + 2]; im.data[4 * p + 3] = 255; }
  ovS.getContext('2d').putImageData(im, 0, 0);
  // vertical legend (high value on top)
  const cb = $('cbarC'), cx = cb.getContext('2d'); for (let y = 0; y < cb.height; y++) { const [r, gg, b] = cmap(1 - y / (cb.height - 1)); cx.fillStyle = `rgb(${r},${gg},${b})`; cx.fillRect(0, y, 1, 1); }
  const st = niceStep((hi - lo) * 1000, 5), t0 = Math.ceil(lo * 1000 / st) * st; let html = '';
  for (let v = t0; v <= hi * 1000 + 1e-6; v += st) html += `<span class="tk" style="top:${(1 - (v / 1000 - lo) / (hi - lo)) * 100}%">${Math.round(v)}</span>`;
  $('cbl').innerHTML = html;
  $('rangeInfo').textContent = `Color range: ${Math.round(lo * 1000)}–${Math.round(hi * 1000)} nm (D2–D98 of included grains${axCap() ? ', capped by the histogram x maximum' : ''}). Gray grains are excluded from statistics.`;
}
function drawOverlayColors() { drawSizeMap();
  if (!ovG || !S.res) return; const c = S.c, w = c.w, h = c.h, lab = c.lab, inc = new Uint8Array(c.n + 1);
  S.res.all.forEach(g => inc[g.id] = g.inc ? 1 : 0);
  const im = ovG.getContext('2d').createImageData(w, h);
  for (let p = 0; p < w * h; p++) { const l = lab[p]; if (!l) continue;
    if (inc[l]) { im.data[4 * p] = colors[3 * l]; im.data[4 * p + 1] = colors[3 * l + 1]; im.data[4 * p + 2] = colors[3 * l + 2]; im.data[4 * p + 3] = 255; }
    else { im.data[4 * p] = im.data[4 * p + 1] = im.data[4 * p + 2] = 150; im.data[4 * p + 3] = 255; } }
  ovG.getContext('2d').putImageData(im, 0, 0);
}
const hex = s => { s = s.replace('#', ''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
function hsl(h, s, l) { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0) * 255, f(8) * 255, f(4) * 255]; }

// ---------------- graphics viewer ----------------
const view = $('view'), stage = $('stage');
const ctx = view.getContext('2d');
function resize() { const r = stage.getBoundingClientRect(); if (!r.width) return; const d = devicePixelRatio || 1; view.width = Math.round(r.width * d); view.height = Math.round(r.height * d); render(); }
function fit() { if (!S.W0) return; const r = stage.getBoundingClientRect(); if (!r.width) return; const L = S.axes ? 44 : 0, B = S.axes ? 22 : 0, w = r.width - L, h = r.height - B; // keep the whole image clear of the µm rulers
  T.s = Math.min(w / S.W0, h / S.H0) * 0.96; T.ox = L + (w - S.W0 * T.s) / 2; T.oy = (h - S.H0 * T.s) / 2; render(); }
function zoom(k) { const r = stage.getBoundingClientRect(), sx = r.width / 2, sy = r.height / 2, ns = Math.min(16, Math.max(0.05, T.s * k)); T.ox = sx - (sx - T.ox) * ns / T.s; T.oy = sy - (sy - T.oy) * ns / T.s; T.s = ns; render(); }
const toImg = (sx, sy) => [(sx - T.ox) / T.s, (sy - T.oy) / T.s];
let live = null;
function render() {
  const d = devicePixelRatio || 1; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, view.width, view.height);
  if (!S.base) { placePop(); return; }
  ctx.setTransform(d * T.s, 0, 0, d * T.s, d * T.ox, d * T.oy);
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 8 / T.s; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S.W0, S.H0); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  ctx.imageSmoothingEnabled = T.s < 1;
  const f = S.p.f, v = peek ? 'image' : S.view;
  if (v === 'ridge' && ovR) { ctx.imageSmoothingEnabled = false; ctx.drawImage(ovR, 0, 0, ovR.width * f, ovR.height * f); }
  else ctx.drawImage(S.base, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (v === 'size' && ovS) { ctx.globalAlpha = 0.68; ctx.drawImage(ovS, 0, 0, ovS.width * f, ovS.height * f); ctx.globalAlpha = 1; }
  if (v === 'grains' && ovG) { ctx.globalAlpha = 0.5; ctx.drawImage(ovG, 0, 0, ovG.width * f, ovG.height * f); ctx.globalAlpha = 1; }
  if (v !== 'image' && ovB) ctx.drawImage(ovB, 0, 0, ovB.width * f, ovB.height * f);
  const lw = 1 / T.s;
  if (S.roi) { const r = S.roi; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(0, r.y1, S.W0, S.H0 - r.y1); ctx.fillRect(0, 0, S.W0, r.y0); ctx.fillRect(0, r.y0, r.x0, r.y1 - r.y0); ctx.fillRect(r.x1, r.y0, S.W0 - r.x1, r.y1 - r.y0);
    ctx.strokeStyle = '#1f63b5'; ctx.lineWidth = lw; if (S.tool === 'roi') ctx.setLineDash([5 * lw, 3 * lw]); ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); ctx.setLineDash([]);
    if (S.tool === 'roi') { const hs = 6 * lw; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1f63b5'; ctx.lineWidth = lw;
      for (const [hx, hy] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1], [(r.x0 + r.x1) / 2, r.y0], [(r.x0 + r.x1) / 2, r.y1], [r.x0, (r.y0 + r.y1) / 2], [r.x1, (r.y0 + r.y1) / 2]]) { ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs); ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs); } } }
  if ((S.tool === 'seed' || S.tool === 'merge') && S.res && (S.view !== 'image')) {
    if (S.mergeA) { const g = grainAt(S.mergeA[0], S.mergeA[1]); if (g) paintGrain(g.id, '192,57,143,110'); }
    if (hoverId && !(S.mergeA && grainAt(S.mergeA[0], S.mergeA[1])?.id === hoverId)) paintGrain(hoverId, S.tool === 'merge' && S.mergeA ? '192,57,143,70' : '255,255,255,70'); }
  if (live && live.t === 'split') { ctx.strokeStyle = '#c0398f'; ctx.lineWidth = 2 * lw; ctx.setLineDash([6 * lw, 4 * lw]); ctx.beginPath(); ctx.moveTo(live.pts[0][0], live.pts[0][1]); ctx.lineTo(live.pts[1][0], live.pts[1][1]); ctx.stroke(); ctx.setLineDash([]); }
  else if (live && live.t === 'mergeline') { ctx.strokeStyle = '#c0398f'; ctx.lineWidth = 2 * lw; ctx.beginPath(); ctx.moveTo(live.pts[0][0], live.pts[0][1]); ctx.lineTo(live.pts[1][0], live.pts[1][1]); ctx.stroke(); }
  else if (live) drawEdit(live, lw);
  drawScaleFlash(lw);
  if (S.scaleLine) { const [a, b] = S.scaleLine; ctx.strokeStyle = '#ff1f9f'; ctx.lineWidth = 1.5 * lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  if (S.axes) drawAxes(d);
  placePop();
}
// rulers along the bottom and left of the view, in µm from the ROI's lower-left corner (x right, y up)
function drawAxes(d) {
  if (!S.roi || !S.nmpx) return; const r = stage.getBoundingClientRect(), W = r.width, H = r.height, k = S.nmpx / 1000, B = 22;
  const toX = um => T.ox + (S.roi.x0 + um / k) * T.s, toY = um => T.oy + (S.roi.y1 - um / k) * T.s, fromX = sx => ((sx - T.ox) / T.s - S.roi.x0) * k, fromY = sy => (S.roi.y1 - (sy - T.oy) / T.s) * k;
  const step = niceStep(Math.abs(fromX(W) - fromX(0)) || 1, Math.max(3, Math.round(W / 90))), dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  ctx.setTransform(d, 0, 0, d, 0, 0); ctx.font = `11px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(0, H - B, W, B); ctx.fillRect(0, 0, 44, H - B);
  ctx.strokeStyle = '#8a95a3'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(44, H - B + .5); ctx.lineTo(W, H - B + .5); ctx.moveTo(44 - .5, 0); ctx.lineTo(44 - .5, H - B); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.strokeStyle = '#555'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let v = Math.ceil(fromX(44) / step) * step; toX(v) <= W; v += step) { const x = Math.round(toX(v)) + .5; ctx.beginPath(); ctx.moveTo(x, H - B); ctx.lineTo(x, H - B + 5); ctx.stroke(); ctx.fillText(v.toFixed(dec), x, H - B + 7); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(fromY(H - B) / step) * step; toY(v) >= 0; v += step) { const y = Math.round(toY(v)) + .5; ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(39, y); ctx.stroke(); ctx.fillText(v.toFixed(dec), 37, y); }
  ctx.textAlign = 'left'; ctx.fillStyle = '#1f63b5'; ctx.fillText('µm', 6, H - B / 2);
  const ox = toX(0), oy = toY(0); if (ox > 44 && oy < H - B) { ctx.strokeStyle = '#1f63b5'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ox, oy - 14); ctx.lineTo(ox, oy); ctx.lineTo(ox + 14, oy); ctx.stroke(); } }
function drawEdit(e, lw) {
  ctx.strokeStyle = e.t === 'draw' ? 'rgba(192,57,143,.85)' : 'rgba(31,99,181,.55)'; ctx.lineWidth = Math.max(e.r * 2, 1.5 * lw); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); e.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); if (e.pts.length === 1) ctx.lineTo(e.pts[0][0] + 0.1, e.pts[0][1]); ctx.stroke();
}
// one grain's pixels as a small canvas (cached per segmentation), used to highlight grains for Split / Merge
let gmCache = { lab: null, m: new Map() };
function grainMask(id, rgba) {
  const c = S.c; if (!c.lab) return null; if (gmCache.lab !== c.lab) gmCache = { lab: c.lab, m: new Map() };
  const key = id + rgba; if (gmCache.m.has(key)) return gmCache.m.get(key);
  let x0 = c.w, y0 = c.h, x1 = -1, y1 = -1; for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.lab[y * c.w + x] === id) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null; const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cv = document.createElement('canvas'); cv.width = bw; cv.height = bh;
  const cx = cv.getContext('2d'), im = cx.createImageData(bw, bh), col = rgba.split(',').map(Number);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (c.lab[(y + y0) * c.w + x + x0] === id) im.data.set(col, 4 * (y * bw + x));
  cx.putImageData(im, 0, 0); const o = { cv, x0, y0, bw, bh }; gmCache.m.set(key, o); return o; }
function paintGrain(id, rgba) { const o = grainMask(id, rgba); if (!o) return; const f = S.p.f; ctx.imageSmoothingEnabled = false; ctx.drawImage(o.cv, o.x0 * f, o.y0 * f, o.bw * f, o.bh * f); }
// cut line for a click: through the grain centroid along its short axis, clipped to the grain
function autoCut(x, y) {
  const c = S.c, f = S.p.f, id = c.lab[Math.floor(y / f) * c.w + Math.floor(x / f)]; if (!id) return null;
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) if (c.lab[j * c.w + i] === id) { n++; sx += i; sy += j; sxx += i * i; syy += j * j; sxy += i * j; }
  if (n < 8) return null; const mx = sx / n, my = sy / n, a = sxx / n - mx * mx, b = sxy / n - mx * my, d = syy / n - my * my;
  const th = 0.5 * Math.atan2(2 * b, a - d) + Math.PI / 2, ux = Math.cos(th), uy = Math.sin(th); // minor-axis direction
  const reach = sgn => { let t = 0; for (; t < 4000; t += 0.5) { const X = Math.round(mx + ux * t * sgn), Y = Math.round(my + uy * t * sgn); if (X < 0 || Y < 0 || X >= c.w || Y >= c.h || c.lab[Y * c.w + X] !== id) break; } return t + 1.5; };
  const tp = reach(1), tn = reach(-1);
  return [[(mx + ux * tp + .5) * f, (my + uy * tp + .5) * f], [(mx - ux * tn + .5) * f, (my - uy * tn + .5) * f]]; }
// a dragged cut is limited to the grain under its midpoint, so neighbouring grains are not cut
function clipCut(a, b) { const c = S.c, f = S.p.f, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, id = c.lab[Math.floor(my / f) * c.w + Math.floor(mx / f)]; if (!id) return [a, b];
  const go = p => { const L = Math.hypot(p[0] - mx, p[1] - my), n = Math.ceil(L / (f / 2)); let k = 0;
    for (; k <= n; k++) { const X = Math.floor((mx + (p[0] - mx) * k / n) / f), Y = Math.floor((my + (p[1] - my) * k / n) / f); if (X < 0 || Y < 0 || X >= c.w || Y >= c.h || c.lab[Y * c.w + X] !== id) break; }
    const t = Math.min(1, (k + 2) / Math.max(1, n)); return [mx + (p[0] - mx) * t, my + (p[1] - my) * t]; };
  return [go(a), go(b)]; }
let hoverId = 0;
function grainAt(x, y) { const c = S.c; if (!c.lab || !S.res) return null; const f = S.p.f, X = Math.floor(x / f), Y = Math.floor(y / f); if (X < 0 || Y < 0 || X >= c.w || Y >= c.h) return null; return S.res.byId.get(c.lab[Y * c.w + X]) || null; }

const hints = { pan: 'Pan — drag to move, wheel to zoom', roi: 'ROI — drag corners or edges to resize, drag elsewhere for a new region', scale: 'Trace Bar — drag along the scale bar from end to end (snaps horizontal/vertical, Alt for free angle), then Apply Scale', scalebox: 'Find in Box — drag a box around the scale bar; the bar is found inside the box', draw: 'Draw GB — drag along a missed boundary', erase: 'Erase GB — drag over a false boundary', seed: 'Split — click a grain to split it in two, or drag a line across it to set the direction; the cut follows the image boundary signal', merge: 'Merge — drag from one grain into its neighbour, or click both' };
function roiHit(x, y) { const r = S.roi; if (!r) return ''; const t = 9 / T.s; let v = '', h = '';
  const inX = x > r.x0 - t && x < r.x1 + t, inY = y > r.y0 - t && y < r.y1 + t;
  if (inX && Math.abs(y - r.y0) < t) v = 'n'; else if (inX && Math.abs(y - r.y1) < t) v = 's';
  if (inY && Math.abs(x - r.x0) < t) h = 'w'; else if (inY && Math.abs(x - r.x1) < t) h = 'e';
  return v + h; }
const roiCursor = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
const TOOL_NODE = { roi: 'roi', scale: 'image', scalebox: 'image', draw: 'edits', erase: 'edits', seed: 'edits', merge: 'edits' };
function setTool(t) { S.tool = t; S.mergeA = null; hoverId = 0; live = null;
  if (cur >= 0 && S.node) { const n = TOOL_NODE[t] || (GFX_NODES.includes(S.node) ? null : 'image'); if (n && n !== S.node && !(n === 'image' && GFX_NODES.includes(S.node) && t === 'pan')) selectNode(n); } $$('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t)); setStatus(hints[t]); stage.style.cursor = t === 'pan' ? 'grab' : 'crosshair'; if (S.wtab !== 'graphics') setWtab('graphics'); render(); }
function setView(v) { S.view = v; if (cur >= 0 && S.node && !GFX_NODES.includes(S.node)) selectNode('image'); $('cbar').hidden = v !== 'size' || !S.res; $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v)); if (S.wtab !== 'graphics') setWtab('graphics'); render(); }

let drag = null, spaceDown = false, peek = false;
stage.addEventListener('pointerdown', ev => {
  if (!S.base || ev.target.closest('#scpop')) return;
  if (!S.res && ['draw', 'erase', 'seed', 'merge'].includes(S.tool) && !spaceDown && ev.button !== 1) { toast('Run Process first.', 1); return; }
  stage.setPointerCapture(ev.pointerId);
  const r = stage.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top, [x, y] = toImg(sx, sy);
  const tool = (spaceDown || ev.button === 1) ? 'pan' : S.tool;
  drag = { tool, sx, sy, x, y, ox: T.ox, oy: T.oy };
  if (tool === 'pan') stage.style.cursor = 'grabbing';
  if (tool === 'draw' || tool === 'erase') live = { t: tool, r: S.brush, pts: [[x, y]] };
  if (tool === 'roi') { live = null; drag.edge = roiHit(x, y); drag.r0 = { ...S.roi };
    if (!drag.edge && (x < 0 || y < 0 || x > S.W0 || y > S.H0)) { drag = null; setTool('pan'); return; } } // click on the margin ends ROI editing
  if (tool === 'seed') live = { t: 'split', pts: [[x, y], [x, y]] };
  if (tool === 'merge') { const g = grainAt(x, y); if (!g) { drag = null; return; }
    if (S.mergeA && grainAt(S.mergeA[0], S.mergeA[1]) && grainAt(S.mergeA[0], S.mergeA[1]).id !== g.id) { const a = S.mergeA; S.mergeA = null; hoverId = 0; addEdit({ t: 'merge', a, b: [x, y] }); drag = null; return; }
    S.mergeA = [x, y]; live = { t: 'mergeline', pts: [[x, y], [x, y]] }; render(); }
});
stage.addEventListener('pointermove', ev => {
  const r = stage.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top, [x, y] = toImg(sx, sy);
  if (drag) {
    if (drag.tool === 'pan') { T.ox = drag.ox + sx - drag.sx; T.oy = drag.oy + sy - drag.sy; render(); }
    else if (live && (live.t === 'split' || live.t === 'mergeline')) { live.pts[1] = [x, y]; const g = grainAt(x, y); hoverId = g ? g.id : 0; drag.moved = true; render(); }
    else if (live && (drag.tool === 'draw' || drag.tool === 'erase')) { const l = live.pts[live.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 1 / T.s) { live.pts.push([x, y]); render(); } }
    else if (drag.tool === 'roi' && drag.edge) { const q = { ...drag.r0 }, cx = Math.max(0, Math.min(S.W0, x)), cy = Math.max(0, Math.min(S.H0, y)), m = 20;
      if (drag.edge.includes('n')) q.y0 = Math.min(cy, q.y1 - m); if (drag.edge.includes('s')) q.y1 = Math.max(cy, q.y0 + m);
      if (drag.edge.includes('w')) q.x0 = Math.min(cx, q.x1 - m); if (drag.edge.includes('e')) q.x1 = Math.max(cx, q.x0 + m);
      S.roi = { x0: Math.round(q.x0), y0: Math.round(q.y0), x1: Math.round(q.x1), y1: Math.round(q.y1) }; drag.moved = true; render(); syncRoiUI(); updateDatabar(); }
    else if (drag.tool === 'roi' || drag.tool === 'scalebox') { drag.cur = [x, y]; render(); const d = devicePixelRatio || 1; ctx.setTransform(d * T.s, 0, 0, d * T.s, d * T.ox, d * T.oy); ctx.strokeStyle = drag.tool === 'scalebox' ? '#ffffff' : '#1f63b5'; ctx.lineWidth = 1 / T.s; ctx.setLineDash(drag.tool === 'scalebox' ? [2.5 / T.s, 2 / T.s] : [5 / T.s, 3 / T.s]); ctx.strokeRect(drag.x, drag.y, x - drag.x, y - drag.y); ctx.setLineDash([]); }
    else if (drag.tool === 'scale') { let ex = x, ey = y; if (!ev.altKey) { if (Math.abs(x - drag.x) >= Math.abs(y - drag.y)) ey = drag.y; else ex = drag.x; }
      S.scaleLine = [[drag.x, drag.y], [ex, ey]]; render(); }
    $('tip').hidden = true; return;
  }
  if (S.tool === 'roi' && S.base) stage.style.cursor = roiCursor[roiHit(x, y)] || 'crosshair';
  if (S.base) $('cursorXY').textContent = x >= 0 && y >= 0 && x < S.W0 && y < S.H0 ? physXY(x, y) : '';
  const g = grainAt(x, y), tip = $('tip');
  if (S.tool === 'seed' || S.tool === 'merge') { const id = g ? g.id : 0; if (id !== hoverId) { hoverId = id; render(); } }
  if (g && S.view !== 'image') { tip.hidden = false;
    tip.innerHTML = `Grain ${g.id}${g.inc ? '' : ' (excluded)'}<br>ECD: ${(g.ecd * 1000).toFixed(0)} nm<br>Area: ${g.area.toFixed(4)} µm²<br>Aspect ratio: ${g.ar.toFixed(2)}, ${g.angle.toFixed(0)}°`;
    tip.style.left = Math.min(sx + 14, r.width - tip.offsetWidth - 6) + 'px'; tip.style.top = Math.min(sy + 14, r.height - tip.offsetHeight - 6) + 'px'; }
  else tip.hidden = true;
});
stage.addEventListener('pointerleave', () => { $('tip').hidden = true; $('cursorXY').textContent = ''; });
stage.addEventListener('pointerup', () => {
  if (!drag) return; const d = drag; drag = null; if (S.tool === 'pan') stage.style.cursor = 'grab';
  if (live && live.t === 'split') { const [a, b] = live.pts; live = null;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) * T.s > 6) addEdit({ t: 'split', pts: clipCut(a, b), r: S.p.f });
    else { const cut = autoCut(a[0], a[1]); if (cut) addEdit({ t: 'split', pts: cut, r: S.p.f }); else { toast('Split — click inside a grain, or drag a line across it.', 1); render(); } } }
  else if (live && live.t === 'mergeline') { const [, b] = live.pts; live = null; const A = S.mergeA && grainAt(S.mergeA[0], S.mergeA[1]), B = grainAt(b[0], b[1]);
    if (d.moved && A && B && A.id !== B.id) { const a = S.mergeA; S.mergeA = null; hoverId = 0; addEdit({ t: 'merge', a, b }); }
    else { setStatus('Merge — click the neighbouring grain, or drag into it (Esc to cancel)'); render(); } }
  else if (live && (d.tool === 'draw' || d.tool === 'erase')) { const e = live; live = null; addEdit(e); }
  else if (d.tool === 'roi' && d.edge) { if (d.moved) { markDirty(); renderEdits(); commit('ROI'); log(`ROI: ${roiText()}`); } render(); }
  else if (d.tool === 'roi' && d.cur) { const x0 = Math.max(0, Math.min(d.x, d.cur[0])), x1 = Math.min(S.W0, Math.max(d.x, d.cur[0])), y0 = Math.max(0, Math.min(d.y, d.cur[1])), y1 = Math.min(S.H0, Math.max(d.y, d.cur[1]));
    if (x1 - x0 > 20 && y1 - y0 > 20) { S.roi = { x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1) }; markDirty(); syncRoiUI(); updateDatabar(); renderEdits(); commit('ROI'); log(`ROI: ${roiText()}`); } render(); }
  else if (d.tool === 'scale' && S.scaleLine) { const [a, b] = S.scaleLine, L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L >= 5) propose({ kind: 'manual', pts: [a, b], L }, 'Trace Bar'); selectNode('image'); }
  else if (d.tool === 'scalebox' && d.cur) regionDetect({ x0: Math.min(d.x, d.cur[0]), x1: Math.max(d.x, d.cur[0]), y0: Math.min(d.y, d.cur[1]), y1: Math.max(d.y, d.cur[1]) });
});
stage.addEventListener('wheel', ev => { if (!S.base) return; ev.preventDefault(); const r = stage.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top;
  const k = Math.exp(-ev.deltaY * 0.0015), ns = Math.min(16, Math.max(0.05, T.s * k)); T.ox = sx - (sx - T.ox) * ns / T.s; T.oy = sy - (sy - T.oy) * ns / T.s; T.s = ns; render(); }, { passive: false });
const isFileDrag = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { if (!isFileDrag(e)) return; e.preventDefault(); $('drop').hidden = false; }));
['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); if (t === 'dragleave' && stage.contains(e.relatedTarget)) return; $('drop').hidden = true; }));
stage.addEventListener('drop', e => { if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files); });
const roiText = () => `${S.roi.x0}, ${S.roi.y0} – ${S.roi.x1}, ${S.roi.y1} px`;

// edits
const EDIT_NAMES = { draw: 'Draw GB', erase: 'Erase GB', seed: 'Split', split: 'Split', merge: 'Merge' };
// ---------------- history (undo / redo) ----------------
// One stack for everything the user changes: manual edits, scale, ROI, detection settings, filters and plot style.
// Settings are recorded as before/after snapshots; edits as the edit itself. Entries remember their image.
const HIST = { u: [], r: [] };
let baseline = null;
function stateSnap() {
  return JSON.stringify({
    d: cur >= 0 ? { nmpx: S.nmpx, srcL: S.srcL, tk: S.tk, bar: S.bar, manual: S.manual, barlen: S.barlen, scaleInfo: S.scaleInfo, roi: S.roi, p: S.p, minEcd: S.minEcd } : null,
    g: { edge: S.edge, bins: S.bins, hmode: S.hmode, cmap: S.cmap, plot: PLOT, docs: docs.map((d, i) => i === cur ? { uid: S.uid, cmpOn: S.cmpOn, color: S.color, label: S.label, p: S.p } : { uid: d.uid, cmpOn: d.cmpOn, color: d.color, label: d.label, p: d.p }) } });
}
function resetBaseline() { baseline = stateSnap(); }
function pushHist(e) { e.uid = e.uid ?? (cur >= 0 ? S.uid : null); HIST.u.push(e); HIST.r = []; if (HIST.u.length > 300) HIST.u.shift(); syncUndo(); }
function commit(label) { const after = stateSnap(); if (baseline !== null && after !== baseline) pushHist({ kind: 'state', label, before: baseline, after }); baseline = after; syncUndo(); }
function restoreState(json, prev) {
  const st = JSON.parse(json), pv = prev ? JSON.parse(prev) : null, g = st.g;
  Object.assign(S, { edge: g.edge, bins: g.bins, hmode: g.hmode, cmap: g.cmap }); Object.assign(PLOT, JSON.parse(JSON.stringify(g.plot))); $$('.lgDetail').forEach(x => x.checked = !!PLOT.legend.detail);
  $('edgeRoi').checked = S.edge; $('bins').value = S.bins; $('binsO').textContent = S.bins; $$('.hmsel').forEach(x => x.value = S.hmode); $('cmapSel').value = S.cmap;
  g.docs.forEach(o => { const d = docs.find(x => x.uid === o.uid); if (!d) return; const pChanged = JSON.stringify(d.p) !== JSON.stringify(o.p);
    Object.assign(d, { cmpOn: o.cmpOn, color: o.color, label: o.label, p: o.p }); if (pChanged && d.uid !== S.uid) d.dirty = true; if (d.uid === S.uid) Object.assign(S, { cmpOn: o.cmpOn, color: o.color, label: o.label }); });
  if (st.d && cur >= 0) { const o = st.d, was = pv && pv.d; Object.assign(S, { nmpx: o.nmpx, srcL: o.srcL, tk: o.tk, bar: o.bar, manual: o.manual, barlen: o.barlen, roi: o.roi, p: o.p, minEcd: o.minEcd ?? 80 }); syncMinUI(); if ((!pv || !pv.d || pv.d.minEcd !== o.minEcd) && S.c && S.c.lab) { stats(); renderCmp(); } setScaleInfo(o.scaleInfo || '');
    $('nmpx').value = S.nmpx.toFixed(3); $('barlen').value = $('rbBar').value = (+S.barlen || 2).toFixed(2); syncDetectUI(); syncRoiUI();
    if (!was || JSON.stringify(was.p) !== JSON.stringify(o.p) || JSON.stringify(was.roi) !== JSON.stringify(o.roi)) markDirty(); }
  syncImageUI(); allStats(); renderImgProps(); drawSizeMap(); render(); updateDatabar(); renderTree(); renderCmp(); baseline = stateSnap();
}
function docByUid(uid) { return docs.findIndex(d => d.uid === uid); }
function stepHist(dir) { // dir -1 undo, +1 redo
  const from = dir < 0 ? HIST.u : HIST.r, to = dir < 0 ? HIST.r : HIST.u; const e = from.pop(); if (!e) return;
  if (e.uid != null && e.uid !== S.uid) { const i = docByUid(e.uid); if (i < 0) { syncUndo(); return stepHist(dir); } activate(i); }
  if (e.kind === 'state' || e.kind === 'reset') { restoreState(dir < 0 ? e.before : e.after, dir < 0 ? e.after : e.before); }
  if (e.kind === 'edit-add') { if (dir < 0) S.edits.pop(); else S.edits.push(e.e); }
  if (e.kind === 'edit-del') { if (dir < 0) S.edits.splice(e.i, 0, e.e); else S.edits.splice(e.i, 1); }
  if (e.kind === 'edits' || e.kind === 'reset') S.edits = (dir < 0 ? e.eb : e.ea).slice();
  to.push(e); log(`${dir < 0 ? 'Undo' : 'Redo'}: ${e.label}`); renderEdits(); renderTree();
  if (e.kind === 'reset') { saveDoc(); if (dir < 0) run('A'); else { S.c = {}; S.res = null; ovB = ovG = ovR = ovS = null; markDirty(); render(); renderCmp(); } }
  else if (e.kind !== 'state') { saveDoc(); if (S.c.lab) run('B'); }
}
function undo() { stepHist(-1); }
function redo() { stepHist(1); }
function addEdit(e) { S.edits.push(e); pushHist({ kind: 'edit-add', label: EDIT_NAMES[e.t], e }); log(`${EDIT_NAMES[e.t]} #${S.edits.length}`); renderEdits(); renderTree(); run('B'); }
function syncUndo() { $$('[data-act="undo"]').forEach(b => { b.disabled = !HIST.u.length; b.dataset.tip = HIST.u.length ? 'Undo: ' + HIST.u[HIST.u.length - 1].label : 'Undo'; });
  $$('[data-act="redo"]').forEach(b => { b.disabled = !HIST.r.length; b.dataset.tip = HIST.r.length ? 'Redo: ' + HIST.r[HIST.r.length - 1].label : 'Redo'; }); $('clearEdits').disabled = !(S.edits && S.edits.length); }
function renderEdits() { syncUndo(); const el = $('elist');
  el.innerHTML = S.edits.length ? S.edits.map((e, i) => { const p = e.pts ? e.pts[0] : e.a || [e.x, e.y], q = physXY(p[0], p[1]); return `<div><span>${i + 1}. ${EDIT_NAMES[e.t]} <span style="color:#888">(${q})</span></span><button class="xbtn" data-i="${i}" title="Delete">✕</button></div>`; }).join('') : '<div><span style="color:#888">No edits</span></div>';
  el.querySelectorAll('.xbtn').forEach(b => b.onclick = () => { const i = +b.dataset.i, e = S.edits.splice(i, 1)[0]; pushHist({ kind: 'edit-del', label: 'Delete ' + EDIT_NAMES[e.t], i, e }); renderEdits(); renderTree(); run('B'); });
}
$('clearEdits').onclick = () => { if (!S.edits.length) return; const eb = S.edits.slice(); S.edits = []; pushHist({ kind: 'edits', label: 'Clear edits', eb, ea: [] }); log('All manual edits cleared'); renderEdits(); renderTree(); run('B'); };
// any setting changed through an input records itself (the element's own handler runs first)
const HLABEL = { nmpx: 'Pixel size', barlen: 'Bar value', rbBar: 'Bar value', popBar: 'Bar value', roiX0: 'ROI', roiY0: 'ROI', roiX1: 'ROI', roiY1: 'ROI', mode: 'Boundary type', rbMode: 'Boundary type', pol: 'Line tone', destripe: 'Scan-line noise', fres: 'Computation scale',
  sigma: 'Boundary width', L: 'Line length filter', hi: 'Start level', lo: 'Continue level', h: 'Split depth', merge: 'Weak-boundary merge', minA: 'Minimum ECD', edge: 'Edge grains', edgeRoi: 'Edge grains', bins: 'Bins', hmode: 'Weighting', hmode2: 'Weighting', cmapSel: 'Color table', imgName: 'Label', cmpOn: 'Show in Results' };
document.addEventListener('change', e => { const t = e.target; if (!t.matches || !t.matches('input,select') || t.id === 'file' || t.closest('.dlg')) return; commit(HLABEL[t.id] || (t.type === 'color' ? 'Color' : t.type === 'checkbox' ? 'Visibility' : 'Setting')); });
// physical coordinates: origin at the ROI's lower-left corner, x to the right, y up, in µm
function physXY(x, y, unit) { if (!S.roi) return `${Math.round(x)}, ${Math.round(y)} px`; const k = S.nmpx / 1000, X = (x - S.roi.x0) * k, Y = (S.roi.y1 - y) * k, d = k < 0.01 ? 3 : 2;
  return `${X.toFixed(d)}, ${Y.toFixed(d)} µm`; }

// ROI fields
function syncRoiUI() { if (!S.roi) return; $('roiX0').value = S.roi.x0; $('roiY0').value = S.roi.y0; $('roiX1').value = S.roi.x1; $('roiY1').value = S.roi.y1; }
['roiX0', 'roiY0', 'roiX1', 'roiY1'].forEach(id => $(id).onchange = () => { if (!S.roi) return;
  const x0 = Math.max(0, +$('roiX0').value || 0), y0 = Math.max(0, +$('roiY0').value || 0), x1 = Math.min(S.W0, +$('roiX1').value || S.W0), y1 = Math.min(S.H0, +$('roiY1').value || S.H0);
  if (x1 - x0 > 20 && y1 - y0 > 20) { S.roi = { x0, y0, x1, y1 }; markDirty(); render(); updateDatabar(); renderEdits(); } syncRoiUI(); });
$('roiReset').onclick = () => { if (!S.gray) return; S.roi = autoRoi(); syncRoiUI(); markDirty(); render(); updateDatabar(); renderEdits(); commit('Reset ROI'); log(`ROI reset: ${roiText()}`); };

// keyboard
addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea')) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'o') { if (!NATIVE) { e.preventDefault(); $('file').click(); } return; }
  if (mod && e.shiftKey && k === 'c') { e.preventDefault(); quickCopy(); return; }
  if (mod) return;
  if (e.key === ' ') { spaceDown = true; return; }
  if (k === 'i') { if (!e.repeat && S.base && S.view !== 'image') { peek = true; render(); setStatus('Original image — release I to return'); } return; } // hold I: original image only
  const m = { v: 'pan', r: 'roi', s: 'scale', b: 'draw', e: 'erase', a: 'seed', m: 'merge' }[k];
  if (m) setTool(m); if (k === 'f') fit();
  if (e.key === 'Escape') { if (S.cand) { cancelScale(); return; } S.mergeA = null; render(); setStatus(hints[S.tool]); }
});
addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; if (e.key.toLowerCase() === 'i' && peek) { peek = false; render(); setStatus(hints[S.tool]); } });
addEventListener('blur', () => { if (peek) { peek = false; render(); } });

// ---------------- controls ----------------
const bindRange = (id, get, set, fmt, dirty) => { const el = $(id), o = $(id + 'O'); el.value = get(); o.textContent = fmt(get());
  el.oninput = () => { set(+el.value); o.textContent = fmt(+el.value); if (!dirty) stats(); };
  el.onchange = () => { if (dirty) markDirty(); }; };
Object.keys(fmtP).forEach(id => bindRange(id, () => S.p[id], v => S.p[id] = v, fmtP[id], true));
bindRange('brush', () => S.brush, v => { S.brush = v; $('rbBrush').value = v; }, v => v + ' px', true);
$('brush').onchange = null;
bindRange('minA', () => S.minEcd, v => S.minEcd = v, v => v + ' nm', true);
function syncMinUI() { $('minA').value = S.minEcd ?? 80; $('minAO').textContent = (S.minEcd ?? 80) + ' nm'; }
$('minA').onchange = () => { saveDoc(); commit('Minimum ECD'); }; $('minA').oninput = () => { S.minEcd = +$('minA').value; $('minAO').textContent = S.minEcd + ' nm'; if (S.c && S.c.lab) stats(); renderCmp(); };
bindRange('bins', () => S.bins, v => { S.bins = v; drawRes(); }, v => String(v), true);
$('bins').onchange = null; $('bins').oninput = () => { S.bins = +$('bins').value; $('binsO').textContent = S.bins; drawRes(); };
$('rbBrush').value = S.brush; $('rbBrush').onchange = () => { S.brush = Math.max(1, Math.min(30, +$('rbBrush').value || 5)); $('brush').value = S.brush; $('brushO').textContent = S.brush + ' px'; };
$('pol').onchange = () => { S.p.pol = $('pol').value; markDirty(); };
function setMode(v) { S.p.mode = v; applyAuto(true); markDirty(); log(`Boundary type: ${v === 'contrast' ? 'Contrast' : 'Line'} (default parameters applied)`); }
$('mode').onchange = () => setMode($('mode').value);
$('rbMode').onchange = () => setMode($('rbMode').value);
$('cmapSel').onchange = () => { S.cmap = $('cmapSel').value; drawSizeMap(); render(); drawHist(); };
$('destripe').onchange = () => { S.destripe = $('destripe').checked; markDirty(); };
$('fres').onchange = () => { S.p.f = +$('fres').value; markDirty(); };
$$('.hmsel').forEach(el => el.onchange = () => { S.hmode = el.value; $$('.hmsel').forEach(x => x.value = S.hmode); drawRes(); });
$('autoBins').onclick = () => { if (!S.res || S.res.sm.n < 4) return; const e = S.res.sm.sorted, iqr = quant(e, .75) - quant(e, .25), bw = 2 * iqr / Math.cbrt(e.length), xr = quant(S.res.all.map(g => g.ecd).sort((a, b) => a - b), .995) * 1.05; // Freedman–Diaconis
  S.bins = Math.max(6, Math.min(40, Math.round(xr / (bw || xr / 15)))); $('bins').value = S.bins; $('binsO').textContent = S.bins; drawRes(); commit('Automatic bins'); log(`Bins: ${S.bins} (Freedman–Diaconis)`); };
$('edgeRoi').onchange = e => { S.edge = e.target.checked; allStats(); commit('Edge grains'); };
function setBar(len) { $('barlen').value = $('rbBar').value = len; if (len > 0) S.barlen = len; if (!(len > 0)) return;
  if (S.cand) { propose(S.cand, 'Pending'); return; } if (!S.srcL) return; S.nmpx = len * 1000 / S.srcL; $('nmpx').value = S.nmpx.toFixed(3); setScaleInfo(`Bar ${len} µm over ${S.srcL.toFixed(1)} px → ${S.nmpx.toFixed(3)} nm/px`); log('Scale: ' + S.scaleInfo); flashScale(); stats(); renderImgProps(); updateDatabar(); renderTree(); }
$('barlen').onchange = () => setBar(parseFloat($('barlen').value));
$('rbBar').onchange = () => setBar(parseFloat($('rbBar').value));
$('nmpx').onchange = () => { const v = parseFloat($('nmpx').value); if (v > 0) { S.nmpx = v; S.srcL = null; S.tk = S.bar = S.manual = null; setScaleInfo('Pixel size entered manually.'); log(`Pixel size set to ${v} nm`); stats(); renderImgProps(); renderTree(); } };
$('imgName').onchange = () => { if (!S.gray) return; S.label = $('imgName').value.trim() || S.name.replace(/\.[^.]+$/, ''); $('imgName').value = S.label; saveDoc(); renderTree(); renderCmp(); };
$('cmpOn').onchange = () => { if (!S.gray) return; S.cmpOn = $('cmpOn').checked; saveDoc(); renderCmp(); };
$('file').onchange = e => { loadFiles(e.target.files); e.target.value = ''; };
let demoN = 0;
async function loadSample() { const v = DEMOS[demoN++ % DEMOS.length]; setStatus(`Generating demo sample (${v.name})…`, true); await tick();
  $('barlen').value = $('rbBar').value = v.len.toFixed(2); // the printed bar value of this demo
  const s = makeSample(v); window.__gtLab = s.lab; /* ground-truth labels, for accuracy checks */ setImage(s.g, s.W, s.H, `demo_${(demoN - 1) % DEMOS.length + 1}_${v.name}.png`, null, true, s.gt);
  if (S.p.mode !== (v.mode || 'line') || (v.pol && S.p.pol !== v.pol)) log(`Note: automatic type detection differs from this demo's design (${v.mode || 'line'}${v.pol ? ', ' + v.pol : ''}).`, 1); saveDoc();
  log(`Demo sample: ${v.desc}. Ground truth is known, so Grain Statistics shows the error.`); if (!S.tk && !S.bar) log('No scale bar found automatically — try Find in Box around the bar.', 1); run('A'); }

async function processAll() {
  if (!docs.length) return toast('Open an image first.', 1);
  if (running) return;
  saveDoc();
  const todo = docs.map((d, i) => i).filter(i => !docs[i].res || docs[i].dirty);
  if (!todo.length) return toast('All samples are already processed.');
  const keep = cur; log(`Process All: ${todo.length} image(s)`);
  for (const i of todo) { activate(i); await run('A'); }
  activate(keep); log('Process All finished'); selectNode('stats');
}
function applyToAll() {
  if (!S.gray || docs.length < 2) return toast('No other samples to apply settings to.', 1);
  saveDoc(); const src = S.p, k0 = S.nmpx;
  docs.forEach((d, i) => { if (i === cur) return; const r = k0 / d.nmpx; // carry parameters over in nm, re-expressed in each image's pixels
    d.p = { ...src, sigma: Math.min(8, Math.max(1, Math.round(src.sigma * r * 5) / 5)), L: Math.min(80, 2 * Math.round(src.L * r / 2)), h: Math.min(20, Math.max(0.5, Math.round(src.h * r * 2) / 2)), minSeg: src.minSeg * r * r,
      f: src.mode === 'contrast' ? Math.max(1, Math.min(4, Math.round(d.W0 / 900))) : Math.max(1, Math.min(4, Math.round(4 / d.nmpx), d.W0 * d.H0 > 6e6 ? 4 : 2)) };
    d.minEcd = S.minEcd; d.dirty = true; });
  log(`Applied detection settings and Minimum ECD of ${S.label} to ${docs.length - 1} other image(s) (converted in nm). Run Process All to update.`); renderTree();
}
const ACTIONS = {
  open: () => $('file').click(), sample: loadSample, ticks: autoDetect, applyScale, showScale: () => { if (S.tk || S.bar || S.manual) { clearCand(); flashScale(); } else toast('The scale was entered as a number, so there is no bar to show. Use Auto Detect, Find in Box or Trace Bar.', 1); }, popApply: () => applyScale(true), popCancel: cancelScale, process: () => run('A'), processAll, applyAll: applyToAll, close: () => closeImage(), closeAll,
  auto: () => { if (!S.gray) return toast('Open an image first.', 1); applyAuto(true); markDirty(); commit('Default parameters'); log(`Detection parameters reset to the defaults (set in nm, converted at ${S.nmpx.toFixed(2)} nm/px)`); },
  axes: () => { S.axes = !S.axes; $$('[data-act="axes"]').forEach(b => b.setAttribute('aria-pressed', S.axes)); PREFS.axes = S.axes; savePrefs(); fit(); },
  undo, redo, resetLayout, fit, zin: () => zoom(1.25), zout: () => zoom(0.8), reset: resetImage, expandAll: () => setAllCollapsed(false), pzin: () => zoomPlot(0.8), pzout: () => zoomPlot(1.25), pfit: autoScale, axis: () => axisDialog(), collapseAll: () => setAllCollapsed(true),
  exCsv, exGrains: exCsv, exSum: exCsv, exCmp: exReportAll, exReport, exReportAll, exPng: exImage, copyImg: quickCopy, exImage, prefs: prefsDialog, autoScale, detectType: () => detectType(false), axisDlg: () => axisDialog(), legend: toggleLegend, resetStyle,
};
$$('[data-act]').forEach(b => b.addEventListener('click', () => ACTIONS[b.dataset.act] && ACTIONS[b.dataset.act]()));
$$('.lgDetail').forEach(x => x.onchange = () => setLegendDetail(x.checked));
$$('[data-sview]').forEach(b => { if (b.dataset.sview) b.addEventListener('click', () => setSview(b.dataset.sview)); });
$$('[data-tool]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.tool, sc = t === 'scale' || t === 'scalebox';
  if (sc) { const had = !!S.cand; clearCand(); if (had && S.tool === t) { setTool(t); return; } } // a new scale attempt resets: proposal, marker, label and Apply box go away
  setTool(S.tool === t && t !== 'pan' ? 'pan' : t); })); // click an active tool again to turn it off
$$('[data-view]').forEach(b => b.addEventListener('click', () => setView(S.view === b.dataset.view && b.dataset.view !== 'image' ? 'image' : b.dataset.view))); // active overlay clicked again → plain image

function updateDatabar() {
  if (!S.W0) { $('databar').innerHTML = ''; return; }
  const r = S.roi;
  $('databar').innerHTML = `<b>${S.W0} × ${S.H0}</b> px &nbsp;|&nbsp; <b>${S.nmpx.toFixed(3)}</b> nm/px &nbsp;|&nbsp; ROI <b>${((r.x1 - r.x0) * S.nmpx / 1000).toFixed(2)} × ${((r.y1 - r.y0) * S.nmpx / 1000).toFixed(2)}</b> µm &nbsp;|&nbsp; Edits <b>${S.edits.length}</b> &nbsp;|&nbsp; Zoom <b>${Math.round(T.s * 100)}</b>%`;
}

// ---------------- plots (CAE-style 1D plot frame) ----------------
// Four views of the same grain data, one per Results item:
//   Grain Statistics → box plot per data set · ECD Distribution → histogram · Cumulative → cumulative curve · Grain Shape → ECD vs aspect ratio
const niceStep = (span, n) => { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; };
const PTYPE = { stats: 'box', hist: 'bar', cdf: 'cdf', shape: 'shape' };
// axis definition per plot: x/y units shown to the user, k converts display units to data units (ECD is stored in µm)
const AXDEF = {
  bar: { title: 'ECD distribution', x: { lab: 'ECD (nm)', u: 'nm', k: 1000 }, y: { lab: () => S.hmode === 'n' ? 'Number fraction (%)' : 'Area fraction (%)', u: '%', k: 1 } },
  cdf: { title: 'Cumulative ECD distribution', x: { lab: 'ECD (nm)', u: 'nm', k: 1000 }, y: { lab: () => S.hmode === 'n' ? 'Cumulative number fraction (%)' : 'Cumulative area fraction (%)', u: '%', k: 1 } },
  box: { title: 'Grain size by data set', x: null, y: { lab: 'ECD (nm)', u: 'nm', k: 1000 } },
  shape: { title: 'Grain shape', x: { lab: 'ECD (nm)', u: 'nm', k: 1000 }, y: { lab: 'Aspect ratio (major / minor)', u: '', k: 1 } } };
const curPT = () => PTYPE[S.node] || S.ptype || 'box';
const axOf = t => PLOT.ax[t] || {};
const axCap = () => { const a = axOf('bar'); return a.xmax != null ? a.xmax / 1000 : null; }; // size-map colour range follows the histogram's x maximum
let PS = { fs: 1 }; // drawing scale for text and margins (export)
function plotCanvas(cv) { const r = cv.parentNode.getBoundingClientRect(), d = devicePixelRatio || 1, w = Math.max(320, r.width), h = Math.max(220, r.height);
  cv.width = Math.round(w * d); cv.height = Math.round(h * d); const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); return { c, w, h }; }
function frame(c, w, h, o) { // o: {xmin, xmax, ymin, ymax, xstep, ystep, title, xlab, ylab, xk, yk, cats}
  const L = 72, R = 28, Tp = 46, B = o.cats ? 64 : 52, pw = w - L - R, ph = h - Tp - B, x0 = o.xmin || 0, y0 = o.ymin || 0, xk = o.xk || 1, yk = o.yk || 1;
  const X = v => L + (v - x0) / (o.xmax - x0) * pw, Y = v => Tp + ph - (v - y0) / (o.ymax - y0) * ph;
  const xs = o.xstep > 0 && (o.xmax - x0) / o.xstep <= 60 ? o.xstep : niceStep(o.xmax - x0, 6), ys = o.ystep > 0 && (o.ymax - y0) / o.ystep <= 60 ? o.ystep : niceStep(o.ymax - y0, 5);
  const xt = [], yt = []; if (!o.cats) for (let v = Math.ceil(x0 / xs - 1e-9) * xs; v <= o.xmax + 1e-9; v += xs) xt.push(v); for (let v = Math.ceil(y0 / ys - 1e-9) * ys; v <= o.ymax + 1e-9; v += ys) yt.push(v);
  const fmt = (v, k) => { const x = v * k, a = Math.abs(x); return a >= 100 || a === 0 ? String(Math.round(x)) : +x.toPrecision(3) + ''; };
  c.font = `13px ${FONT}`; c.fillStyle = '#000'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(o.title, L + pw / 2, 14);
  c.font = `11.5px ${FONT}`; c.strokeStyle = '#d9d9d9'; c.lineWidth = 1;
  yt.forEach(v => { const y = Math.round(Y(v)) + .5; c.beginPath(); c.moveTo(L, y); c.lineTo(L + pw, y); c.stroke(); });
  xt.forEach(v => { const x = Math.round(X(v)) + .5; c.beginPath(); c.moveTo(x, Tp); c.lineTo(x, Tp + ph); c.stroke(); });
  c.fillStyle = '#000'; c.strokeStyle = '#000'; c.textAlign = 'right'; c.textBaseline = 'middle';
  yt.forEach(v => { const y = Math.round(Y(v)) + .5; c.beginPath(); c.moveTo(L - 4, y); c.lineTo(L, y); c.stroke(); c.fillText(fmt(v, yk), L - 7, y); });
  c.textAlign = 'center'; c.textBaseline = 'top';
  xt.forEach(v => { const x = Math.round(X(v)) + .5; c.beginPath(); c.moveTo(x, Tp + ph); c.lineTo(x, Tp + ph + 4); c.stroke(); c.fillText(fmt(v, xk), x, Tp + ph + 7); });
  if (o.cats) o.cats.forEach((t, i) => { const x = X(i + 0.5); let s = t; while (s.length > 3 && c.measureText(s).width > pw / o.cats.length - 8) s = s.slice(0, -2); c.fillText(s === t ? t : s + '…', x, Tp + ph + 8); });
  c.font = `12px ${FONT}`; if (o.xlab) c.fillText(o.xlab, L + pw / 2, Tp + ph + (o.cats ? 40 : 28));
  c.save(); c.translate(18, Tp + ph / 2); c.rotate(-Math.PI / 2); c.textBaseline = 'middle'; c.fillText(o.ylab, 0, 0); c.restore();
  return { L, R, Tp, B, ph, pw, X, Y, clip: () => { c.save(); c.beginPath(); c.rect(L, Tp, pw, ph); c.clip(); }, box: () => { c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(L + .5, Tp + .5, pw, ph); } };
}
// legend box: default top-right inside the plot; PLOT.legend.pos keeps a dragged position as a fraction of the plot area
function legendBox(f, lw, lh) { const p = PLOT.legend.pos; let x = f.L + f.pw - lw - 8, y = f.Tp + 8;
  if (p) { x = f.L + p.fx * f.pw; y = f.Tp + p.fy * f.ph; } return { x: Math.max(f.L + 4, Math.min(f.L + f.pw - lw - 4, x)), y: Math.max(f.Tp + 4, Math.min(f.Tp + f.ph - lh - 4, y)) }; } // kept inside the plot area
function legend(c, f, items) { // canvas legend (exported images)
  if (PLOT.legend.hidden || !items.length || items[0].mark === 'box') return; c.font = `11.5px ${FONT}`; const lw = Math.max(...items.map(i => c.measureText(i.label).width)) + 44, lh = 18, H = items.length * lh + 8, { x, y } = legendBox(f, lw, H);
  c.fillStyle = 'rgba(255,255,255,.94)'; c.fillRect(x, y, lw, H); c.strokeStyle = '#999'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, lw, H);
  items.forEach((it, i) => { const yy = y + 4 + i * lh + lh / 2; c.strokeStyle = it.color; c.fillStyle = it.color; c.lineWidth = 2;
    if (it.mark === 'line') { c.beginPath(); c.moveTo(x + 8, yy); c.lineTo(x + 30, yy); c.stroke(); } else if (it.mark === 'dot') { c.beginPath(); c.arc(x + 19, yy, 4, 0, 6.283); c.fill(); } else c.fillRect(x + 8, yy - 5, 22, 10);
    c.fillStyle = '#000'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(it.label, x + 36, yy); });
}
function binVals(list, nb, bw, x0) {
  const cnt = new Array(nb).fill(0), ar = new Array(nb).fill(0); let At = 0;
  list.forEach(([e, a]) => { At += a; const i = Math.floor((e - x0) / bw); if (i < 0 || i >= nb) return; cnt[i]++; ar[i] += a; });
  return { cnt, val: cnt.map((n, i) => list.length ? 100 * (S.hmode === 'n' ? n / list.length : ar[i] / At) : 0) };
}

// Results: every processed image is a data set; the checkbox (legend or table) decides what is plotted
const colorOf = d => d.color || C.s[d.ci % C.s.length];
const tagOf = d => d.label || d.name;
// data-set visibility is kept per plot (Statistics, Distribution, Cumulative, Shape); a plain true/false means the same for all
const PTS = ['box', 'bar', 'cdf', 'shape'];
const isOn = (d, t = curPT()) => d.cmpOn == null || d.cmpOn === true ? true : d.cmpOn === false ? false : d.cmpOn[t] !== false;
function setOn(d, t, v) { const o = Object.fromEntries(PTS.map(p => [p, isOn(d, p)])); o[t] = v; d.cmpOn = PTS.every(p => o[p]) ? true : PTS.every(p => !o[p]) ? false : o; }
function dataSets() { saveDoc(); return docs.map((d, i) => ({ d, i })).filter(o => o.d.res && o.d.res.sm.n); }
function setVisible(i, v, t = curPT()) { setOn(docs[i], t, v); if (i === cur) { S.cmpOn = docs[i].cmpOn; syncImageUI(); } renderCmp(); commit(v ? 'Show data set' : 'Hide data set'); }
function setColor(i, v) { docs[i].color = v; if (i === cur) S.color = v; renderCmp(); }
function setAllVisible(on) { const sets = dataSets(); if (!sets.length) return;
  const keep = on ? null : (sets.find(o => o.i === cur) || sets[0]).i;
  const t = curPT(); sets.forEach(o => setOn(o.d, t, on || o.i === keep)); if (cur >= 0) { S.cmpOn = docs[cur].cmpOn; syncImageUI(); } renderCmp(); commit(on ? 'Show all data sets' : 'Show one data set'); }
// automatic ranges, overridden per axis by PLOT.ax[type] (display units)
function ranges(t, vis, head = 0) { // head: top fraction of the plot kept free for the legend (box plot)
  const A = axOf(t), dx = AXDEF[t].x, dy = AXDEF[t].y, ecdHi = Math.max(0.1, ...vis.map(o => quant(o.d.res.all.map(g => g.ecd).sort((a, b) => a - b), 0.995) * 1.05));
  let xmin = 0, xmax = 1, ymin = 0, ymax = 1;
  if (t === 'bar' || t === 'cdf' || t === 'shape') { const s = niceStep(ecdHi, 6); xmax = Math.ceil(ecdHi / s) * s; }
  if (t === 'cdf') ymax = 100;
  if (t === 'box') { xmax = Math.max(1, vis.length); const hi = Math.max(0.1, ...vis.map(o => quant(o.d.res.sm.sorted, 0.95))) * 1.15 / (1 - head), s = niceStep(hi, 5); ymax = Math.ceil(hi / s) * s; }
  if (t === 'shape') { const hi = Math.max(2, ...vis.map(o => quant(o.d.res.inc.map(g => g.ar).sort((a, b) => a - b), 0.99))) * 1.05; ymin = 1; ymax = Math.ceil(hi * 2) / 2; }
  const pick = (v, k, d) => v != null && isFinite(v) ? v / k : d;
  if (dx) { xmin = Math.max(0, pick(A.xmin, dx.k, xmin)); xmax = pick(A.xmax, dx.k, xmax); if (xmax <= xmin) xmax = xmin + niceStep(xmax || 1, 6); }
  ymin = pick(A.ymin, dy.k, ymin); const yAuto = A.ymax == null, ym = pick(A.ymax, dy.k, ymax); ymax = ym; if (ymax <= ymin) ymax = ymin + 1;
  return { xmin, xmax, ymin, ymax, yAuto, xstep: A.xstep != null && dx ? A.xstep / dx.k : null, ystep: A.ystep != null ? A.ystep / dy.k : null };
}
let resGeo = null;
// draw the current Results plot on a canvas context of logical size w×h; returns geometry and legend items
function paintPlot(c, w, h) {
  const t = curPT(), D = AXDEF[t], sets = dataSets(), vis = sets.filter(o => isOn(o.d, t)), ylab = typeof D.y.lab === 'function' ? D.y.lab() : D.y.lab;
  const base = { title: D.title, xlab: D.x ? D.x.lab : 'Data set', ylab, xk: D.x ? D.x.k : 1, yk: D.y.k };
  if (!vis.length) { const f = frame(c, w, h, { ...base, xmin: 0, xmax: t === 'box' ? 1 : 1, ymin: 0, ymax: t === 'cdf' ? 100 : 1, cats: t === 'box' ? [''] : null }); f.box(); c.fillStyle = '#888'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `12px ${FONT}`;
    c.fillText(sets.length ? 'All data sets are hidden — check one in the legend' : 'Shown after Process', f.L + f.pw / 2, f.Tp + f.ph / 2); return { f, sets, vis, items: [] }; }
  const r = ranges(t, vis), items = vis.map(o => ({ label: legLabel(o.d, t), color: colorOf(o.d), mark: t === 'cdf' ? 'line' : t === 'shape' ? 'dot' : 'box', i: o.i }));
  let f, geo = { t, vis, xmin: r.xmin, xmax: r.xmax, ymin: r.ymin, ymax: r.ymax };
  if (t === 'bar') {
    const nb = S.bins, bw = (r.xmax - r.xmin) / nb, bins = vis.map(o => binVals(o.d.res.inc.map(g => [g.ecd, g.area]), nb, bw, r.xmin));
    if (r.yAuto) { const yA = Math.max(5, ...bins.flatMap(b => b.val)) * 1.08, ys = niceStep(yA, 5); r.ymax = Math.max(r.ymin + ys, Math.ceil(yA / ys) * ys); geo.ymax = r.ymax; }
    f = frame(c, w, h, { ...base, ...r }); const y0 = f.Y(Math.max(r.ymin, 0)), k = vis.length, one = k === 1; f.clip();
    const mEs = [...new Set(vis.map(o => o.d.minEcd ?? 80))], mE = mEs.length === 1 ? mEs[0] / 1000 : 0; if (mE > r.xmin) { c.fillStyle = 'rgba(0,0,0,.06)'; c.fillRect(f.L, f.Tp, f.X(Math.min(mE, r.xmax)) - f.L, f.ph); }
    const sz = one && S.view === 'size' && vis[0].i === cur, [clo, chi] = sizeRange();
    for (let i = 0; i < nb; i++) { const x0 = f.X(r.xmin + i * bw) + (one ? 0 : 2), x1 = f.X(r.xmin + (i + 1) * bw) - (one ? 0 : 2), sw = (x1 - x0) / k;
      vis.forEach((o, j) => { const v = bins[j].val[i]; if (!v) return; const y = f.Y(v);
        c.fillStyle = sz ? `rgb(${cmap((r.xmin + (i + 0.5) * bw - clo) / (chi - clo)).join(',')})` : colorOf(o.d); c.fillRect(x0 + j * sw, y, sw, y0 - y);
        c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.strokeRect(Math.round(x0 + j * sw) + .5, Math.round(y) + .5, Math.round(sw), Math.round(y0 - y)); }); }
    vis.forEach(o => { const mx = f.X(o.d.res.sm.mean); c.strokeStyle = one ? '#c00000' : colorOf(o.d); c.lineWidth = 1.5; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(mx, f.Tp); c.lineTo(mx, f.Tp + f.ph); c.stroke(); c.setLineDash([]); });
    c.restore(); Object.assign(geo, { nb, bw, bins });
  } else if (t === 'cdf') {
    f = frame(c, w, h, { ...base, ...r }); f.clip();
    vis.forEach(o => { const inc = o.d.res.inc.slice().sort((a, b) => a.ecd - b.ecd), tot = S.hmode === 'n' ? inc.length : inc.reduce((s, g) => s + g.area, 0); let acc = 0;
      c.strokeStyle = colorOf(o.d); c.lineWidth = 2; c.beginPath(); c.moveTo(f.X(0), f.Y(0));
      inc.forEach(g => { c.lineTo(f.X(g.ecd), f.Y(100 * acc / tot)); acc += S.hmode === 'n' ? 1 : g.area; c.lineTo(f.X(g.ecd), f.Y(100 * acc / tot)); }); c.lineTo(f.X(Math.max(r.xmax, inc.length ? inc[inc.length - 1].ecd : 0)), f.Y(100)); c.stroke(); });
    c.restore();
  } else if (t === 'box') { // box D25–D75, median line, whiskers D10–D90, mean ◇
    f = frame(c, w, h, { ...base, ...r, xmin: 0, xmax: vis.length, cats: vis.map(o => tagOf(o.d)) }); f.clip();
    vis.forEach((o, i) => { const e = o.d.res.sm.sorted, q = p => quant(e, p), x = f.X(i + 0.5), bw = Math.min(70, f.pw / vis.length * 0.42), col = colorOf(o.d);
      c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, f.Y(q(.1))); c.lineTo(x, f.Y(q(.25))); c.moveTo(x, f.Y(q(.75))); c.lineTo(x, f.Y(q(.9))); c.moveTo(x - bw / 4, f.Y(q(.1))); c.lineTo(x + bw / 4, f.Y(q(.1))); c.moveTo(x - bw / 4, f.Y(q(.9))); c.lineTo(x + bw / 4, f.Y(q(.9))); c.stroke();
      c.globalAlpha = .75; c.fillStyle = col; c.fillRect(x - bw / 2, f.Y(q(.75)), bw, f.Y(q(.25)) - f.Y(q(.75))); c.globalAlpha = 1; c.strokeRect(Math.round(x - bw / 2) + .5, Math.round(f.Y(q(.75))) + .5, Math.round(bw), Math.round(f.Y(q(.25)) - f.Y(q(.75))));
      c.lineWidth = 2; c.beginPath(); c.moveTo(x - bw / 2, f.Y(q(.5))); c.lineTo(x + bw / 2, f.Y(q(.5))); c.stroke();
      const my = f.Y(o.d.res.sm.mean); c.fillStyle = '#fff'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, my - 5); c.lineTo(x + 5, my); c.lineTo(x, my + 5); c.lineTo(x - 5, my); c.closePath(); c.fill(); c.stroke(); });
    c.restore(); c.font = `11px ${FONT}`; c.fillStyle = '#555'; c.textAlign = 'right'; c.textBaseline = 'top'; c.fillText('box D25–D75 · line D50 · whiskers D10–D90 · ◇ mean', f.L + f.pw, f.Tp - 16);
  } else if (t === 'shape') {
    f = frame(c, w, h, { ...base, ...r }); f.clip();
    vis.forEach(o => { c.fillStyle = colorOf(o.d); c.globalAlpha = .55; o.d.res.inc.forEach(g => { c.beginPath(); c.arc(f.X(g.ecd), f.Y(g.ar), 2.6, 0, 6.283); c.fill(); }); c.globalAlpha = 1;
      const mx = f.X(o.d.res.sm.mean), my = f.Y(o.d.res.sm.ar); c.strokeStyle = colorOf(o.d); c.lineWidth = 2; c.beginPath(); c.moveTo(mx - 7, my); c.lineTo(mx + 7, my); c.moveTo(mx, my - 7); c.lineTo(mx, my + 7); c.stroke(); });
    c.restore(); items.forEach(it => { it.label = legLabel(docs[it.i], 'shape'); });
  }
  f.box(); Object.assign(geo, { L: f.L, Tp: f.Tp, pw: f.pw, ph: f.ph, B: f.B, X: f.X, Y: f.Y }); return { f, sets, vis, items, geo };
}
function drawRes() {
  layoutRes(); const cv = $('hist'); if (cv.parentNode.hidden) return; const { c, w, h } = plotCanvas(cv); const out = paintPlot(c, w, h); resGeo = out.geo || null; renderLegend(out.sets, out.f, w);
  $$('[data-act="legend"]').forEach(b => b.setAttribute('aria-pressed', !PLOT.legend.hidden));
}
const drawHist = drawRes;
// interactive legend: show/hide each set ("All" switches between every set and the active image only),
// drag it anywhere, ✕ hides it, double-click a swatch to pick its colour
function renderLegend(sets, f, w) {
  const el = $('lgd'); if (!sets.length || PLOT.legend.hidden || curPT() === 'box') { el.hidden = true; return; } // box plot: samples are named on the x-axis
  const t = curPT(), nOn = sets.filter(o => isOn(o.d, t)).length, mk = t === 'cdf' ? 'ln' : t === 'shape' ? 'dot' : '';
  el.hidden = false; el.style.maxHeight = (f.ph - 16) + 'px';
  el.innerHTML = `<div class="lgh"><label class="lg0"><input type="checkbox" id="lgAll"${nOn === sets.length ? ' checked' : ''}> All data sets</label><button class="xbtn" data-act="legend" title="Hide legend">✕</button></div>` + sets.map(o => { const d = o.d, lab = esc(legLabel(d, t));
    return `<div class="lgi${isOn(d, t) ? '' : ' off'}" data-i="${o.i}"><input type="checkbox"${isOn(d, t) ? ' checked' : ''}><span class="sw ${mk}" style="--c:${colorOf(d)}" title="Double-click to change the colour"></span><input type="color" value="${colorOf(d)}" tabindex="-1"><span class="lt">${lab}</span></div>`; }).join('');
  const lw = el.offsetWidth, lh = el.offsetHeight, { x, y } = legendBox(f, lw, lh); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto';
  const all = $('lgAll'); all.indeterminate = nOn > 0 && nOn < sets.length; all.onchange = () => setAllVisible(all.checked);
  el.querySelectorAll('.lgi').forEach(r => { const i = +r.dataset.i, cb = r.querySelector('input[type=checkbox]'), col = r.querySelector('input[type=color]');
    cb.onchange = () => setVisible(i, cb.checked); col.oninput = () => setColor(i, col.value);
    r.querySelector('.sw').ondblclick = () => col.click();
    r.querySelector('.lt').ondblclick = () => { dataSets().forEach(o => setOn(o.d, t, o.i === i)); if (cur >= 0) { S.cmpOn = docs[cur].cmpOn; syncImageUI(); } renderCmp(); commit('Show one data set'); }; });
  el.querySelector('[data-act="legend"]').onclick = e => { e.stopPropagation(); toggleLegend(); };
}
// legend text: sample name only by default; N and mean on request
function legLabel(d, t) { const sm = d.res.sm; return !PLOT.legend.detail ? tagOf(d) : t === 'shape' ? `${tagOf(d)} (N = ${sm.n}, mean AR ${sm.ar.toFixed(2)})` : `${tagOf(d)} (N = ${sm.n}, mean ${nm(sm.mean)} nm)`; }
function setLegendDetail(v) { PLOT.legend.detail = v; $$('.lgDetail').forEach(x => x.checked = v); drawRes(); commit(v ? 'Legend: show N and mean' : 'Legend: names only'); }
function toggleLegend() { PLOT.legend.hidden = !PLOT.legend.hidden; drawRes(); commit(PLOT.legend.hidden ? 'Hide legend' : 'Show legend'); }
$('lgd').addEventListener('pointerdown', e => { if (e.target.closest('input,button,.sw,.lt')) return; const el = $('lgd'), g = resGeo; if (!g) return; e.preventDefault(); el.setPointerCapture(e.pointerId);
  const x0 = e.clientX, y0 = e.clientY, l0 = el.offsetLeft, t0 = el.offsetTop; el.classList.add('dragging');
  const mv = ev => { el.style.left = (l0 + ev.clientX - x0) + 'px'; el.style.top = (t0 + ev.clientY - y0) + 'px'; };
  const up = ev => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.classList.remove('dragging');
    // a drag that ends over the "All data sets" label (or any control) must not also click it
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 3) { const eat = c => { c.stopPropagation(); c.preventDefault(); }; el.addEventListener('click', eat, { capture: true, once: true }); setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 0); }
    PLOT.legend.pos = { fx: (el.offsetLeft - g.L) / g.pw, fy: (el.offsetTop - g.Tp) / g.ph }; commit('Move legend'); };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });
// hover read-out
$('hist').addEventListener('pointermove', e => { const g = resGeo, tip = $('ctip'); if (!g || !g.vis) return; const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const inside = x >= g.L && x <= g.L + g.pw && y >= g.Tp && y <= g.Tp + g.ph; if (!inside) { tip.hidden = true; return; }
  const chip = o => `<span class="chip" style="background:${colorOf(o.d)}"></span>${esc(tagOf(o.d))}`, v = g.xmin + (x - g.L) / g.pw * (g.xmax - g.xmin);
  if (g.t === 'bar') { const i = Math.min(g.nb - 1, Math.floor((v - g.xmin) / g.bw)), a = g.xmin + i * g.bw;
    tip.innerHTML = `ECD: ${(a * 1000).toFixed(0)}–${((a + g.bw) * 1000).toFixed(0)} nm<br>` + g.vis.map((o, j) => `${chip(o)}: ${g.bins[j].val[i].toFixed(1)} % (${g.bins[j].cnt[i]})`).join('<br>'); }
  else if (g.t === 'cdf') tip.innerHTML = `ECD ≤ ${(v * 1000).toFixed(0)} nm<br>` + g.vis.map(o => { const e = o.d.res.sm.sorted; let k = 0; while (k < e.length && e[k] <= v) k++; return `${chip(o)}: ${(100 * k / e.length).toFixed(0)} % (number)`; }).join('<br>');
  else if (g.t === 'box') { const o = g.vis[Math.min(g.vis.length - 1, Math.floor(v))], sm = o.d.res.sm, e = sm.sorted;
    tip.innerHTML = `${chip(o)}<br>N ${sm.n} · mean ${nm(sm.mean)} nm<br>D10 / D25 / D50 / D75 / D90<br>${[.1, .25, .5, .75, .9].map(p => nm(quant(e, p))).join(' / ')} nm`; }
  else { tip.innerHTML = `ECD ${(v * 1000).toFixed(0)} nm · AR ${(g.ymin + (g.Tp + g.ph - y) / g.ph * (g.ymax - g.ymin)).toFixed(2)}`; }
  tip.hidden = false; tip.style.left = Math.max(0, Math.min(x + 14, r.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = Math.min(y + 14, r.height - tip.offsetHeight - 4) + 'px'; });
$('hist').addEventListener('pointerleave', () => $('ctip').hidden = true);
// zoom: buttons and wheel change the axis ranges of the current plot (recorded for undo)
function setAx(t, patch, label) { PLOT.ax[t] = { ...axOf(t), ...patch }; drawRes(); if (t === 'bar') { drawSizeMap(); render(); } if (label) commit(label); }
function zoomPlot(k) { const g = resGeo; if (!g) return; const D = AXDEF[g.t], p = {};
  if (D.x) { const c = (g.xmin + g.xmax) / 2, hw = (g.xmax - g.xmin) / 2 * k; p.xmin = Math.max(0, +((c - hw) * D.x.k).toPrecision(4)); p.xmax = +((c + hw) * D.x.k).toPrecision(4); }
  p.ymax = +((g.ymin + (g.ymax - g.ymin) * k) * D.y.k).toPrecision(4); setAx(g.t, p, k < 1 ? 'Zoom in' : 'Zoom out'); }
function autoScale() { const t = curPT(); PLOT.ax[t] = {}; drawRes(); if (t === 'bar') { drawSizeMap(); render(); } commit('Auto scale'); }
let wheelT = 0;
$('hist').addEventListener('wheel', ev => { const g = resGeo; if (!g || !AXDEF[g.t].x) return; ev.preventDefault(); const r = ev.target.getBoundingClientRect(), D = AXDEF[g.t], v = g.xmin + (ev.clientX - r.left - g.L) / g.pw * (g.xmax - g.xmin), k = Math.exp(ev.deltaY * 0.0015);
  const a = Math.max(0, v - (v - g.xmin) * k), b = v + (g.xmax - v) * k; setAx(g.t, { xmin: +(a * D.x.k).toPrecision(4), xmax: +(b * D.x.k).toPrecision(4) }); clearTimeout(wheelT); wheelT = setTimeout(() => commit('Zoom'), 400); }, { passive: false });
// axis settings window (ribbon, right-click menu, or double-click an axis)
async function axisDialog(focus) {
  const t = curPT(), D = AXDEF[t], A = axOf(t), g = resGeo, v = (key, k) => A[key] != null ? A[key] : '';
  const row = (lab, id, ph, u) => `<label>${lab}</label><input type="number" id="${id}" placeholder="${ph}" step="any"><span class="u">${u}</span>`;
  const auto = (key, k) => g && g[key] != null && isFinite(g[key]) ? +(g[key] * k).toPrecision(4) : 'auto';
  const ax = (nm, d, keys) => `<fieldset><legend>${nm} — ${typeof d.lab === 'function' ? d.lab() : d.lab}</legend><div class="grid2">${row('Minimum', 'dx' + keys + 'min', auto(keys + 'min', d.k), d.u)}${row('Maximum', 'dx' + keys + 'max', auto(keys + 'max', d.k), d.u)}${row('Tick spacing', 'dx' + keys + 'step', 'auto', d.u)}</div></fieldset>`;
  const dlg = await dialog({ title: `Axis Settings — ${D.title}`, ok: 'Apply', wide: true, body: `${D.x ? ax('x-axis', D.x, 'x') : ''}${ax('y-axis', D.y, 'y')}<p class="note">Leave a field empty for automatic. Values are in the units shown.</p>`,
    onOpen: d => { ['xmin', 'xmax', 'xstep', 'ymin', 'ymax', 'ystep'].forEach(k => { const el = d.querySelector('#dx' + k); if (el) el.value = A[k] != null ? A[k] : ''; }); const f = d.querySelector('#dx' + (focus || 'x') + 'min') || d.querySelector('input'); setTimeout(() => f && f.focus(), 0); } });
  if (!dlg) return; const p = {}; ['xmin', 'xmax', 'xstep', 'ymin', 'ymax', 'ystep'].forEach(k => { const el = dlg.querySelector('#dx' + k); if (!el) return; const n = parseFloat(el.value); p[k] = isFinite(n) ? n : null; });
  PLOT.ax[t] = p; drawRes(); if (t === 'bar') { drawSizeMap(); render(); } commit('Axis settings'); }
$('hist').addEventListener('dblclick', e => { const g = resGeo; if (!g) return; const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (y > g.Tp + g.ph && x > g.L) axisDialog('x'); else if (x < g.L && y < g.Tp + g.ph) axisDialog('y'); });
// right-click menu on the plot
function ctxMenu(x, y, items) { $$('.cmenu').forEach(m => m.remove()); const m = document.createElement('div'); m.className = 'cmenu';
  m.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep"></div>' : `<button data-i="${i}">${esc(it[0])}</button>`).join(''); document.body.appendChild(m);
  m.style.left = Math.min(x, innerWidth - m.offsetWidth - 4) + 'px'; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 4) + 'px';
  m.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; m.remove(); items[+b.dataset.i][1](); };
  setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }, true), 0); }
$('histWrap').addEventListener('contextmenu', e => { e.preventDefault(); ctxMenu(e.clientX, e.clientY, [['Axis Settings…', () => axisDialog()], ['Auto Scale', autoScale], '-', [PLOT.legend.hidden ? 'Show Legend' : 'Hide Legend', toggleLegend], [PLOT.legend.detail ? 'Legend: Names Only' : 'Legend: Show N and Mean', () => setLegendDetail(!PLOT.legend.detail)], ['Reset Plot Style', resetStyle], '-', ['Export Image…', exImage]]); });
function resetStyle() { PLOT.ax = {}; PLOT.legend = { hidden: false, pos: null, detail: false }; $$('.lgDetail').forEach(x => x.checked = false); docs.forEach(d => d.color = null); S.color = null; drawRes(); renderCmp(); drawSizeMap(); render(); commit('Reset plot style'); }

// data-set table under Grain Statistics (same checkbox and color as the legend)
function renderCmp() {
  saveDoc();
  for (const [id, pt] of [['cmpT', 'box'], ['cmpT_bar', 'bar'], ['cmpT_cdf', 'cdf'], ['cmpT_shape', 'shape']]) { const t = $(id); if (!t) continue;
    if (!docs.length) { t.innerHTML = `<tr><td class="note" style="white-space:normal;border:0">Open and process images; each sample becomes a data set here and in this plot.</td></tr>`; continue; }
    const last = pt === 'shape' ? ['AR', d => d.res.sm.ar.toFixed(2)] : pt === 'box' ? ['Lx/Ly', d => (d.res.it.Lx / d.res.it.Ly).toFixed(2)] : ['D50', d => nm(d.res.sm.d50)];
    t.innerHTML = `<tr><th style="width:18px"></th><th style="width:26px"></th><th style="width:auto">Sample</th><th style="width:auto;text-align:right">N</th><th style="width:auto;text-align:right">Mean</th><th style="width:auto;text-align:right">${last[0]}</th></tr>` + docs.map((d, i) =>
      `<tr><td><input type="checkbox" data-ci="${i}" ${isOn(d, pt) ? 'checked' : ''} ${d.res ? '' : 'disabled'}></td><td><input type="color" data-cc="${i}" value="${colorOf(d)}" title="Color"></td><td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${esc(tagOf(d))}</td><td class="n">${d.res ? d.res.sm.n : '–'}</td><td class="n">${d.res ? nm(d.res.sm.mean) : '–'}</td><td class="n">${d.res ? last[1](d) : '–'}</td></tr>`).join('');
    t.querySelectorAll('[data-ci]').forEach(b => b.onchange = () => setVisible(+b.dataset.ci, b.checked, pt));
    t.querySelectorAll('[data-cc]').forEach(b => b.oninput = () => setColor(+b.dataset.cc, b.value)); }
  drawRes();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- export ----------------
if (window.chrome && window.chrome.webview) window.chrome.webview.addEventListener('message', e => { if (typeof e.data === 'string' && e.data.startsWith('saved\n')) log(`Saved ${e.data.slice(6)}`); });
let dl = null; (async () => { try { if (window.claude && window.claude.use) dl = await window.claude.use('downloads'); } catch (e) { dl = null; } })();
async function save(filename, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain' });
  const mac = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.save;
  if (mac) { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    mac.postMessage({ name: filename, data: btoa(s) }); log(`Export: ${filename}`); return; }
  const wv = window.chrome && window.chrome.webview; // Windows app (WebView2): the shell shows a save dialog
  if (wv) { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    wv.postMessage(`save\n${filename}\n${btoa(s)}`); return; }
  if (dl) { try { await dl.save({ filename, data: blob }); log(`Saved ${filename}`); } catch (e) { if (e && e.code !== 'declined') toast('Save failed: ' + (e.message || e.code), 1); } return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); log(`Saved ${filename}`);
}
const stem = () => (S.name || 'sem').replace(/\.[^.]+$/, '');
const csv = rows => '﻿' + rows.map(r => r.map(v => typeof v === 'string' && /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n');
// ---------------- tables shared by the CSV and the Excel reports ----------------
const rd3 = v => v == null || !isFinite(v) ? '' : +(+v).toFixed(3), rd1 = v => v == null || !isFinite(v) ? '' : +(+v).toFixed(1), rd4 = v => v == null || !isFinite(v) ? '' : +(+v).toFixed(4);
const yesNo = v => v ? 'Yes' : 'No';
// [section, item, value, unit, kind]  kind: s text · n number · i integer · 3 / 1 decimals
function summaryRows(d = S) { const ORD = ['Sample', 'Results', 'Analysis parameters']; return summaryRows0(d).sort((x, y) => ORD.indexOf(x[0]) - ORD.indexOf(y[0])); }
function summaryRows0(d) { const { sm, it } = d.res, k = d.nmpx / 1000, rw = (d.roi.x1 - d.roi.x0) * k, rh = (d.roi.y1 - d.roi.y0) * k;
  return [
    ['Results', 'Grains counted', sm.n, '', 'i'], ['Results', 'Mean ECD', rd3(sm.mean), 'µm', '3'], ['Results', 'Standard deviation', rd3(sm.sd), 'µm', '3'], ['Results', '95% CI of mean ECD (±)', rd3(sm.ci), 'µm', '3'], ['Results', 'Relative accuracy (%RA)', rd1(sm.ra), '%', '1'],
    ['Results', 'D10', rd3(sm.d10), 'µm', '3'], ['Results', 'D50 (median)', rd3(sm.d50), 'µm', '3'], ['Results', 'D90', rd3(sm.d90), 'µm', '3'],
    ['Results', 'Area-weighted ECD', rd3(sm.aw), 'µm', '3'], ['Results', 'Mean aspect ratio', rd3(sm.ar), '', '3'],
    ['Results', 'Linear intercept Lx', rd3(it.Lx), 'µm', '3'], ['Results', 'Linear intercept Ly', rd3(it.Ly), 'µm', '3'], ['Results', 'Lx / Ly', rd3(it.Lx / it.Ly), '', '3'], ['Results', 'Reliability check', qualityFlags(d).join('; ') || 'OK', '', 's'],
    ['Sample', 'Label', d.label || '', '', 's'], ['Sample', 'File', d.name, '', 's'], ['Sample', 'Image size', `${d.W0} × ${d.H0}`, 'px', 's'],
    ['Sample', 'Pixel size', +(+d.nmpx).toFixed(4), 'nm/px', 'n'], ['Sample', 'Analysed area (ROI)', `${rd3(rw)} × ${rd3(rh)}`, 'µm', 's'], ['Sample', 'Scale source', d.scaleInfo || '', '', 's'],
    ['Analysis parameters', 'Boundary type', d.p.mode === 'contrast' ? 'Contrast' : 'Line', '', 's'], ['Analysis parameters', 'Boundary polarity', d.p.pol, '', 's'],
    ['Analysis parameters', 'Boundary width σ', rd1(d.p.sigma * d.nmpx), 'nm', '1'], ['Analysis parameters', 'Line length filter', rd1(d.p.L * d.nmpx), 'nm', '1'],
    ['Analysis parameters', 'Start / continue level', `${d.p.hi} / ${d.p.lo}`, '', 's'], ['Analysis parameters', 'Split depth h', rd1(d.p.h * d.nmpx), 'nm', '1'],
    ['Analysis parameters', 'Weak-boundary merge', d.p.merge, '', 'n'], ['Analysis parameters', 'Working scale', d.p.f, '× downsampling', 'n'],
    ['Analysis parameters', 'Minimum ECD', d.minEcd ?? 80, 'nm', 'n'], ['Analysis parameters', 'Exclude grains touching ROI edge', yesNo(S.edge), '', 's'],
    ['Analysis parameters', 'ROI (x0, y0, x1, y1)', `${d.roi.x0}, ${d.roi.y0}, ${d.roi.x1}, ${d.roi.y1}`, 'px', 's'], ['Analysis parameters', 'Manual edits', d.edits.length, '', 'i']]; }
const GRAIN_HEAD = ['Grain ID', 'Area (µm²)', 'ECD (µm)', 'Major axis (µm)', 'Minor axis (µm)', 'Aspect ratio', 'Angle (°)', 'Centroid x (px)', 'Centroid y (px)', 'Touches ROI edge', 'Used in statistics'];
const grainRows = (d = S) => d.res.all.map(g => [g.id, rd4(g.area), rd3(g.ecd), rd3(g.major), rd3(g.minor), rd3(g.ar), rd1(g.angle), rd1(g.cx * d.p.f), rd1(g.cy * d.p.f), yesNo(g.edge), yesNo(g.inc)]);
const SAMPLE_HEAD = ['Sample', 'File', 'Pixel size (nm/px)', 'Grains (N)', 'Mean ECD (µm)', 'SD (µm)', '95% CI (± µm)', 'D10 (µm)', 'D50 (µm)', 'D90 (µm)', 'Area-weighted ECD (µm)', 'Mean aspect ratio', 'Lx (µm)', 'Ly (µm)', 'Lx / Ly'];
const sampleRow = d => { const s = d.res.sm, it = d.res.it; return [tagOf(d), d.name, +(+d.nmpx).toFixed(4), s.n, rd3(s.mean), rd3(s.sd), rd3(s.ci), rd3(s.d10), rd3(s.d50), rd3(s.d90), rd3(s.aw), rd3(s.ar), rd3(it.Lx), rd3(it.Ly), rd3(it.Lx / it.Ly)]; };
const need = () => { if (!S.res) { toast('Run Process first.', 1); return false; } return true; };
// one CSV per sample: summary block, then the grain table
function exCsv() { if (!need()) return;
  save(stem() + '_results.csv', csv([['Grain Tracer results', tagOf(S)], [], ['Summary'], ['Section', 'Item', 'Value', 'Unit'], ...summaryRows().map(r => r.slice(0, 4)), [], ['Grains'], GRAIN_HEAD, ...grainRows()])); }

// ---------------- minimal .xlsx writer: stored zip, inline strings, generated styles, PNG drawings ----------------
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files, type) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const f of files) { const nm = enc.encode(f.name), d = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true); parts.push(new Uint8Array(h.buffer), nm, d);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true); cen.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + d.length; }
  const cs = cen.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type }); }
const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
function Styles() { // style objects → cellXfs index, deduplicated
  const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], borders = [], fmts = [], xfs = [], memo = new Map();
  const idx = (a, x) => { let i = a.indexOf(x); if (i < 0) { a.push(x); i = a.length - 1; } return i; };
  const st = (o = {}) => { const key = JSON.stringify(o); if (memo.has(key)) return memo.get(key);
    const f = o.font || {}, fi = idx(fonts, `<font>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}<sz val="${f.sz || 10.5}"/><color rgb="FF${f.c || '1F2937'}"/><name val="Calibri"/><family val="2"/></font>`);
    const fl = o.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${o.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const b = o.border || {}, side = n => b[n] ? `<${n} style="${b[n][0]}"><color rgb="FF${b[n][1]}"/></${n}>` : `<${n}/>`;
    const bi = idx(borders, `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`);
    const nf = !o.fmt || o.fmt === 'General' ? 0 : o.fmt === '0' ? 1 : 164 + idx(fmts, o.fmt);
    const al = (o.align || o.valign || o.wrap || o.indent) ? `<alignment${o.align ? ` horizontal="${o.align}"` : ''}${o.valign ? ` vertical="${o.valign}"` : ''}${o.wrap ? ' wrapText="1"' : ''}${o.indent ? ` indent="${o.indent}"` : ''}/>` : '';
    xfs.push(`<xf numFmtId="${nf}" fontId="${fi}" fillId="${fl}" borderId="${bi}" xfId="0" applyFont="1"${nf ? ' applyNumberFormat="1"' : ''}${fl ? ' applyFill="1"' : ''}${bi ? ' applyBorder="1"' : ''}${al ? ` applyAlignment="1">${al}</xf>` : '/>'}`);
    memo.set(key, xfs.length - 1); return xfs.length - 1; };
  st({}); // default
  st.xml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fmts.length ? `<numFmts count="${fmts.length}">${fmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xesc(f)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return st; }
class Sheet { // sparse cells, merges, row heights, column widths, images
  constructor(name, cols) { this.name = name; this.cols = cols || []; this.c = new Map(); this.h = {}; this.m = []; this.images = []; }
  set(r, c, v, s = 0) { this.c.set(r * 1000 + c, { v, s }); return this; }
  merge(r1, c1, r2, c2, s) { this.m.push(`${colName(c1)}${r1 + 1}:${colName(c2)}${r2 + 1}`); if (s != null) for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (!this.c.has(r * 1000 + c)) this.set(r, c, '', s); return this; }
  colPx(c) { const w = this.cols[c] ?? 8.43; return Math.round(w * 7 + 5); }
  rowPx(r) { return Math.round((this.h[r] || 15) * 4 / 3); }
  rowAfter(r0, px) { let r = r0, y = 0; while (y < px) y += this.rowPx(r++); return r; } // first row below px pixels starting at r0
  colAt(x) { let c = 0, s = 0; while (s < x) s += this.colPx(c++); return c; } // first column starting at or after x px
  img(r, c, png, w, h, name) { this.images.push({ row: r, col: c, png, w, h, name }); return this; }
  xml() {
    const keys = [...this.c.keys()].sort((a, b) => a - b), rows = new Map();
    keys.forEach(k => { const r = Math.floor(k / 1000); if (!rows.has(r)) rows.set(r, []); rows.get(r).push(k); });
    Object.keys(this.h).forEach(r => { if (!rows.has(+r)) rows.set(+r, []); });
    const body = [...rows.keys()].sort((a, b) => a - b).map(r => `<row r="${r + 1}"${this.h[r] ? ` ht="${this.h[r]}" customHeight="1"` : ''}>${rows.get(r).map(k => { const { v, s } = this.c.get(k), ref = colName(k % 1000) + (r + 1), sa = s ? ` s="${s}"` : '';
      return v === '' || v == null ? `<c r="${ref}"${sa}/>` : typeof v === 'number' && isFinite(v) ? `<c r="${ref}"${sa}><v>${v}</v></c>` : `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`; }).join('')}</row>`).join('');
    const view = `<sheetViews><sheetView workbookViewId="0"${this.grid ? '' : ' showGridLines="0"'}${this.tab ? ' tabSelected="1"' : ''}>${this.freeze ? `<pane ySplit="${this.freeze}" topLeftCell="A${this.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${view}<sheetFormatPr defaultRowHeight="15"/>${this.cols.length ? `<cols>${this.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${body}</sheetData>${this.filter ? `<autoFilter ref="${this.filter}"/>` : ''}${this.m.length ? `<mergeCells count="${this.m.length}">${this.m.map(x => `<mergeCell ref="${x}"/>`).join('')}</mergeCells>` : ''}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${this.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>${this.images.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`; } }
function buildXlsx(sheets, st, title) {
  const files = [], ct = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>', '<Default Extension="png" ContentType="image/png"/>', '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>', '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'];
  let img = 0, drw = 0; sheets[0].tab = true;
  sheets.forEach((sh, i) => { const n = i + 1; files.push({ name: `xl/worksheets/sheet${n}.xml`, data: sh.xml() });
    ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    if (!sh.images.length) return; drw++;
    files.push({ name: `xl/worksheets/_rels/sheet${n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drw}.xml"/></Relationships>` });
    const rels = [], anchors = sh.images.map((m, j) => { img++; const ext = m.png[0] === 0xFF ? 'jpeg' : 'png'; files.push({ name: `xl/media/image${img}.${ext}`, data: m.png });
      rels.push(`<Relationship Id="rId${j + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${img}.${ext}"/>`);
      const cx = Math.round(m.w * 9525), cy = Math.round(m.h * 9525);
      return `<xdr:oneCellAnchor><xdr:from><xdr:col>${m.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${m.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${j + 2}" name="${xesc(m.name)}" descr="${xesc(m.name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${j + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="9525"><a:solidFill><a:srgbClr val="D9DEE5"/></a:solidFill></a:ln></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`; });
    files.push({ name: `xl/drawings/drawing${drw}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>` });
    files.push({ name: `xl/drawings/_rels/drawing${drw}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>` });
    ct.push(`<Override PartName="/xl/drawings/drawing${drw}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`); });
  const fdb = sheets.map((s, i) => s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xesc(s.name)}'!${s.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : '').join('');
  files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xesc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${fdb ? `<definedNames>${fdb}</definedNames>` : ''}</workbook>` });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  files.push({ name: 'xl/styles.xml', data: st.xml() });
  files.push({ name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(title)}</dc:title><dc:creator>Grain Tracer</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` });
  files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' });
  files.unshift({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct.join('')}</Types>` });
  return zipStore(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }

// ---------------- report layout ----------------
const RC = { ink: '1F2937', muted: '6B7280', blue: '1F63B5', card: 'F3F7FC', head: 'E8F1FA', rule: 'DDE3EA', headRule: '8FBBE6' };
function reportStyles() { const st = Styles(), hair = ['thin', RC.rule], white = ['thick', 'FFFFFF'];
  const K = { title: st({ font: { b: 1, sz: 20, c: RC.ink }, valign: 'center' }), sub: st({ font: { sz: 10.5, c: RC.muted } }), section: st({ font: { b: 1, sz: 12, c: RC.blue }, border: { bottom: ['medium', RC.blue] }, valign: 'bottom' }),
    sectionR: st({ border: { bottom: ['medium', RC.blue] } }), th: st({ font: { b: 1, sz: 10, c: RC.ink }, fill: RC.head, border: { bottom: ['thin', RC.headRule] }, valign: 'center', wrap: 1 }),
    thR: st({ font: { b: 1, sz: 10, c: RC.ink }, fill: RC.head, border: { bottom: ['thin', RC.headRule] }, align: 'right', valign: 'center', wrap: 1 }),
    item: st({ border: { bottom: hair }, valign: 'center' }), text: st({ border: { bottom: hair }, valign: 'center' }), unit: st({ font: { c: RC.muted }, border: { bottom: hair }, valign: 'center' }),
    note: st({ font: { i: 1, sz: 9.5, c: RC.muted }, wrap: 1, valign: 'top' }), cap: st({ font: { b: 1, sz: 10.5, c: RC.ink } }), capSub: st({ font: { sz: 9.5, c: RC.muted } }),
    kL: st({ font: { sz: 9, c: RC.muted }, fill: RC.card, border: { left: white, right: white, top: ['thick', RC.blue] }, indent: 1, valign: 'bottom' }),
    kS: st({ font: { sz: 9, c: RC.muted }, fill: RC.card, border: { left: white, right: white }, indent: 1, valign: 'top' }),
    tx: st({ border: { bottom: hair }, valign: 'center' }), txB: st({ font: { b: 1 }, border: { bottom: hair }, valign: 'center' }) };
  const memo = {}; // number cells by format
  K.num = (fmt, extra = {}) => { const k = fmt + JSON.stringify(extra); return memo[k] ??= st({ fmt, border: { bottom: hair }, valign: 'center', ...extra }); };
  K.kV = fmt => { const k = 'kv' + fmt; return memo[k] ??= st({ fmt, font: { b: 1, sz: 20, c: RC.blue }, fill: RC.card, border: { left: white, right: white }, indent: 1, align: 'left', valign: 'center' }); };
  K.st = st; return K; }
const FMT_OF = { i: '0', '3': '0.000', '1': '0.0', n: 'General' };
// a sample's front page: KPI cards, result / sample / parameter tables, boundary image and ECD histogram beside them
function samplePage(sh, K, d, figs, when) {
  sh.cols = [2, 21, 17, 19, 19, 3, ...Array(10).fill(8.43)]; const sm = d.res.sm, it = d.res.it, segN = d.res.all.length;
  sh.set(0, 1, tagOf(d), K.title); sh.h[0] = 34;
  sh.set(1, 1, 'SEM grain size analysis  ·  ECD (equivalent circle diameter)', K.sub); sh.set(2, 1, `${d.name}  ·  Grain Tracer  ·  ${when}`, K.sub);
  const kpi = [['Grains counted', sm.n, '0', `of ${segN} segmented`], ['Mean ECD', rd3(sm.mean), '0.000" µm"', `SD ${rd3(sm.sd).toFixed(3)} µm`], ['D50 (median)', rd3(sm.d50), '0.000" µm"', `D10–D90  ${rd3(sm.d10).toFixed(3)}–${rd3(sm.d90).toFixed(3)} µm`], ['Area-weighted ECD', rd3(sm.aw), '0.000" µm"', `Lx / Ly ${rd3(it.Lx / it.Ly).toFixed(2)}`]];
  sh.h[4] = 17; sh.h[5] = 30; sh.h[6] = 17;
  kpi.forEach(([l, v, f, s], i) => { sh.set(4, 1 + i, l, K.kL).set(5, 1 + i, v, K.kV(f)).set(6, 1 + i, s, K.kS); });
  let r = 8; const sec = {};
  summaryRows(d).forEach(([section, item, val, unit, kind]) => {
    if (!sec[section]) { if (r > 8) r++; sec[section] = 1; sh.h[r] = 22; sh.set(r, 1, section, K.section).merge(r, 1, r, 4, K.sectionR); r++;
      sh.set(r, 1, 'Item', K.th).merge(r, 1, r, 2, K.th).set(r, 3, 'Value', K.th).set(r, 4, 'Unit', K.th); sh.h[r] = 18; r++; }
    sh.h[r] = 17; sh.set(r, 1, item, K.item).merge(r, 1, r, 2, K.item);
    if (typeof val === 'number') sh.set(r, 3, val, K.num(FMT_OF[kind] || 'General', { align: 'left' })); else sh.set(r, 3, val, K.num('General', { align: 'left' }));
    if (item === 'Scale source') { sh.h[r] = 30; sh.set(r, 3, val, K.st({ border: { bottom: ['thin', RC.rule] }, wrap: 1, valign: 'center', font: { sz: 9.5 } })).merge(r, 3, r, 4); }
    else sh.set(r, 4, unit, K.unit); r++; });
  r++; sh.set(r, 1, 'ECD = 2√(A/π), the same grain-size definition as EBSD software. Grains below the minimum ECD (and touching the ROI edge, when excluded) are left out of the statistics but kept in the grain table.', K.note).merge(r, 1, r + 1, 4); sh.h[r] = 18; sh.h[r + 1] = 18;
  // figures to the right
  // original and detected boundaries side by side for comparison, the ECD histogram below
  let y = 4; const fc = 6, x0 = Array.from({ length: fc }, (_, c) => sh.colPx(c)).reduce((s, v) => s + v, 0), W2 = 310, fc2 = sh.colAt(x0 + W2 + 14), WF = 634;
  const pair = figs.slice(0, 2), rest = figs.slice(2); let hm = 0;
  pair.forEach((f, j) => { const c = j ? fc2 : fc, h = Math.round(W2 * f.cv.height / f.cv.width); hm = Math.max(hm, h); sh.set(y, c, f.cap, K.cap); sh.img(y + 1, c, f.png, W2, h, f.cap); });
  y = sh.rowAfter(y + 1, hm) + 1;
  rest.forEach(f => { sh.set(y, fc, f.cap, K.cap); const h = Math.round(WF * f.cv.height / f.cv.width); sh.img(y + 1, fc, f.png, WF, h, f.cap); y = sh.rowAfter(y + 1, h) + 1; });
  return sh; }
function grainSheet(name, K, list) { // list: [{d, tag}]
  const multi = list.length > 1, head = multi ? ['Sample', ...GRAIN_HEAD] : GRAIN_HEAD, sh = new Sheet(name, multi ? [20, 9, 11, 10, 12, 12, 11, 10, 12, 12, 13, 15] : [9, 11, 10, 12, 12, 11, 10, 12, 12, 13, 15]);
  sh.grid = true; sh.freeze = 1; sh.h[0] = 30; head.forEach((h, c) => sh.set(0, c, h, c >= (multi ? 1 : 0) && c < head.length - 2 ? K.thR : K.th));
  const fmts = ['0', '0.0000', '0.000', '0.000', '0.000', '0.000', '0.0', '0.0', '0.0']; let r = 1;
  list.forEach(({ d }) => grainRows(d).forEach(row => { const o = multi ? [tagOf(d), ...row] : row;
    o.forEach((v, c) => { const k = c - (multi ? 1 : 0); sh.set(r, c, v, typeof v === 'number' ? K.num(fmts[k] || 'General') : (k >= 9 ? K.st({ border: { bottom: ['thin', RC.rule] }, align: 'center', font: v === 'Yes' && k === 10 ? { c: '1D7A3A' } : { c: RC.muted } }) : K.tx)); }); r++; }));
  sh.filter = `A1:${colName(head.length - 1)}${r}`; return sh; }
function figureSheet(K, figs, title, sub) { const sh = new Sheet('Figures', [2, ...Array(20).fill(8.43)]); sh.landscape = true;
  sh.set(0, 1, title, K.title); sh.h[0] = 34; sh.set(1, 1, sub, K.sub);
  const W = 560, gap = 24; let y = 3; const left = 1, right = sh.colAt(sh.colPx(0) + W + gap) ;
  for (let i = 0; i < figs.length; i += 2) { let hmax = 0;
    [figs[i], figs[i + 1]].forEach((f, j) => { if (!f) return; const c = j ? right : left, h = Math.round(W * f.cv.height / f.cv.width); hmax = Math.max(hmax, h);
      sh.set(y, c, f.cap, K.cap); if (f.sub) sh.set(y + 1, c, f.sub, K.capSub); sh.img(y + 2, c, f.png, W, h, f.cap); });
    y = sh.rowAfter(y + 2, hmax) + 2; }
  return sh; }
const pngBytes = (cv, jpg) => new Promise(res => { let c = cv; if (jpg) { c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(cv, 0, 0); }
  c.toBlob(async b => res(new Uint8Array(await b.arrayBuffer())), jpg ? 'image/jpeg' : 'image/png', 0.9); }); // micrographs as JPEG keep the workbook small
// run fn with doc i loaded into S (no UI changes), then restore the open one
async function withDoc(i, fn) { saveDoc(); const keep = cur; const load = j => { cur = j; const d = docs[j]; PER.forEach(k => S[k] = d[k]); ({ ovB, ovG, ovR, ovS, colors } = d.ov); };
  if (i === keep) return fn(); load(i); try { return await fn(); } finally { saveDoc(); load(keep); } }
// draw plots with only some data sets visible
async function withVisible(ids, fn) { saveDoc(); const prev = docs.map(d => d.cmpOn); docs.forEach((d, i) => d.cmpOn = ids.includes(i)); S.cmpOn = ids.includes(cur);
  try { return await fn(); } finally { docs.forEach((d, i) => d.cmpOn = prev[i]); S.cmpOn = prev[cur]; } }
async function plotFig(node, cap, sub) { const n0 = S.node; S.node = node; const cv = renderPlotTo(1500, 940, 26); S.node = n0; return { cap, sub, cv, png: await pngBytes(cv) }; }
async function viewFig(view, cap) { const v0 = S.view; S.view = view; if (view === 'size') drawSizeMap(); const cv = renderGraphicsTo(Math.min(1, 1400 / S.W0)); S.view = v0; return { cap, cv, png: await pngBytes(cv, true) }; }
const PLOTS = [['hist', 'ECD distribution', () => S.hmode === 'n' ? 'number fraction' : 'area fraction'], ['cdf', 'Cumulative ECD distribution', () => S.hmode === 'n' ? 'number weighted' : 'area weighted'], ['stats', 'Grain statistics', () => 'box D25–D75 · line D50 · whiskers D10–D90 · ◇ mean'], ['shape', 'Grain shape', () => 'ECD vs aspect ratio (major / minor)']];
const sheetName = (s, used) => { let b = String(s).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 28) || 'Sample', n = b, k = 2; while (used.has(n.toLowerCase())) n = `${b.slice(0, 26)} ${k++}`; used.add(n.toLowerCase()); return n; };
const nowStamp = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${t.toTimeString().slice(0, 5)}`; };
// Excel report for the open sample
async function exReport() { if (!need()) return; setStatus('Building Excel report…', true); await tick();
  try { const K = reportStyles(), when = nowStamp(), i = cur;
    const figs = await withVisible([i], async () => [await viewFig('image', 'Original image'), await viewFig('overlay', 'Detected grain boundaries'), await viewFig('size', `Size map — ${S.cmap}`), ...await Promise.all(PLOTS.map(([n, c, s]) => plotFig(n, c, s())))]);
    drawSizeMap(); render();
    const front = samplePage(new Sheet('Report'), K, S, [figs[0], figs[1], figs[3]], when);
    const grains = grainSheet('Grains', K, [{ d: S }]);
    const figSh = figureSheet(K, figs, 'Figures', `${tagOf(S)}  ·  images reduced to ≤1400 px wide, plots drawn at 1500 × 940 px`);
    save(stem() + '_report.xlsx', buildXlsx([front, figSh, grains], K.st, `Grain Tracer report — ${tagOf(S)}`)); }
  finally { setStatus('Ready'); } }
// one workbook for every processed sample: overview + comparison plots, all grains, one page per sample
async function exReportAll() { saveDoc(); const sets = dataSets(); if (!sets.length) return toast('Process at least one sample first.', 1);
  setStatus('Building Excel report for all samples…', true); await tick();
  try { const K = reportStyles(), when = nowStamp(), used = new Set(['overview', 'grains', 'figures']), ids = sets.map(o => o.i);
    const ov = new Sheet('Overview', [2, 22, 24, 11, 10, 12, 10, 11, 10, 10, 10, 14, 12, 10, 10, 9]); ov.landscape = true;
    ov.set(0, 1, 'Grain size analysis — sample comparison', K.title); ov.h[0] = 34; ov.set(1, 1, `${sets.length} samples  ·  Grain Tracer  ·  ${when}`, K.sub);
    ov.h[3] = 22; ov.set(3, 1, 'Samples', K.section).merge(3, 1, 3, 15, K.sectionR); ov.h[4] = 30;
    SAMPLE_HEAD.forEach((h, c) => ov.set(4, 1 + c, h, c >= 2 ? K.thR : K.th));
    const sf = ['0.0000', '0', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.00'];
    sets.forEach(({ d }, j) => { ov.h[5 + j] = 17; sampleRow(d).forEach((v, c) => ov.set(5 + j, 1 + c, v, c === 0 ? K.txB : c === 1 ? K.unit : K.num(sf[c - 2]))); });
    let y = 5 + sets.length + 1; ov.h[y] = 22; ov.set(y, 1, 'Comparison', K.section).merge(y, 1, y, 15, K.sectionR); y += 2;
    const cmp = await withVisible(ids, () => Promise.all(PLOTS.map(([n, c, s]) => plotFig(n, c, s()))));
    const W = 520, right = ov.colAt(ov.colPx(0) + W + 24);
    for (let i = 0; i < cmp.length; i += 2) { let hm = 0; [cmp[i], cmp[i + 1]].forEach((f, j) => { const c = j ? right : 1, h = Math.round(W * f.cv.height / f.cv.width); hm = Math.max(hm, h);
      ov.set(y, c, f.cap, K.cap).set(y + 1, c, f.sub, K.capSub).img(y + 2, c, f.png, W, h, f.cap); }); y = ov.rowAfter(y + 2, hm) + 2; }
    const pages = [];
    for (const { d, i } of sets) await withDoc(i, async () => { const figs = await withVisible([i], async () => [await viewFig('image', 'Original image'), await viewFig('overlay', 'Detected grain boundaries'), await plotFig('hist', 'ECD distribution', PLOTS[0][2]())]);
      pages.push(samplePage(new Sheet(sheetName(tagOf(S), used)), K, S, figs, when)); });
    drawSizeMap(); render();
    const grains = grainSheet('Grains', K, sets);
    save('grain_results_all_samples.xlsx', buildXlsx([ov, ...pages, grains], K.st, 'Grain Tracer report — all samples')); }
  finally { setStatus('Ready'); } }
// vertical colour legend in the exported image (inside the ROI, top-right)
function burnColorbar(c, W) {
  const [lo, hi] = sizeRange(), u = W / 1000, bw = Math.round(18 * u), bh = Math.round(300 * u), pad = Math.round(12 * u), fs = Math.max(10, Math.round(15 * u));
  c.font = `${fs}px ${FONT}`; const st = niceStep((hi - lo) * 1000, 5), t0 = Math.ceil(lo * 1000 / st) * st; let tw = c.measureText('ECD (nm)').width;
  for (let v = t0; v <= hi * 1000 + 1e-6; v += st) tw = Math.max(tw, bw + pad * .8 + c.measureText(String(Math.round(v))).width);
  const boxW = tw + pad * 2, boxH = bh + fs + pad * 3, x0 = Math.min(W, S.roi.x1) - boxW - pad, y0 = S.roi.y0 + pad;
  c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(x0, y0, boxW, boxH); c.strokeStyle = '#888'; c.lineWidth = Math.max(1, u); c.strokeRect(x0, y0, boxW, boxH);
  c.fillStyle = '#111'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('ECD (nm)', x0 + pad, y0 + pad);
  const by = y0 + pad * 2 + fs, bx = x0 + pad;
  for (let i = 0; i < bh; i++) { const [r, g, b] = cmap(1 - i / (bh - 1)); c.fillStyle = `rgb(${r},${g},${b})`; c.fillRect(bx, by + i, bw, 1); }
  c.strokeStyle = '#333'; c.strokeRect(bx, by, bw, bh); c.fillStyle = '#111'; c.textBaseline = 'middle';
  for (let v = t0; v <= hi * 1000 + 1e-6; v += st) { const y = by + (1 - (v / 1000 - lo) / (hi - lo)) * bh; c.fillRect(bx + bw, Math.round(y), Math.round(5 * u), Math.max(1, Math.round(u))); c.fillText(String(Math.round(v)), bx + bw + pad * .8, y); }
}
// ---------------- image export (graphics view or plot), with size / font / format ----------------
const FMT = { png: ['image/png', 'png'], jpg: ['image/jpeg', 'jpg'], webp: ['image/webp', 'webp'] };
function renderGraphicsTo(scale) { // current Graphics view at original resolution (× scale)
  const W = Math.round(S.W0 * scale), H = Math.round(S.H0 * scale), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'), f = S.p.f, v = S.view; c.scale(scale, scale);
  if (v === 'ridge' && ovR) { c.imageSmoothingEnabled = false; c.drawImage(ovR, 0, 0, ovR.width * f, ovR.height * f); } else c.drawImage(S.base, 0, 0);
  c.imageSmoothingEnabled = false;
  if (v === 'grains' && ovG) { c.globalAlpha = .5; c.drawImage(ovG, 0, 0, ovG.width * f, ovG.height * f); c.globalAlpha = 1; }
  if (v === 'size' && ovS) { c.globalAlpha = .68; c.drawImage(ovS, 0, 0, ovS.width * f, ovS.height * f); c.globalAlpha = 1; }
  if (v !== 'image' && ovB) c.drawImage(ovB, 0, 0, ovB.width * f, ovB.height * f);
  if (v === 'size' && S.res) burnColorbar(c, S.W0);
  return cv; }
function renderPlotTo(W, H, font) { // the Results plot at W×H pixels; font = size of axis text in pixels (12 = screen size)
  const k = Math.max(0.25, font / 12), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
  c.fillStyle = '#fff'; c.fillRect(0, 0, W / k, H / k); const out = paintPlot(c, W / k, H / k); legend(c, out.f, out.items); return cv; }
const PRESETS = [['Current window', 0, 0], ['Slide 16:9 — 1920 × 1080', 1920, 1080], ['Figure 4:3 — 1600 × 1200', 1600, 1200], ['Paper column — 1050 × 750', 1050, 750], ['Square — 1200 × 1200', 1200, 1200]];
async function exImage() {
  const plot = S.wtab === 'res'; if (!plot && !S.base) return toast('Open an image first.', 1); if (plot && !dataSets().length) return toast('Process an image first.', 1);
  const E = PREFS.exp, r = $('histWrap').getBoundingClientRect(), fmtSel = `<select id="exFmt">${Object.keys(FMT).map(k => `<option value="${k}"${E.fmt === k ? ' selected' : ''}>${k.toUpperCase()}</option>`).join('')}</select>`;
  const body = plot ? `<div class="grid2"><label>Preset</label><select id="exPre">${PRESETS.map((p, i) => `<option value="${i}">${p[0]}</option>`).join('')}</select><span></span>
      <label>Width</label><input type="number" id="exW" min="200" max="8000" step="10" value="${E.w}"><span class="u">px</span>
      <label>Height</label><input type="number" id="exH" min="150" max="8000" step="10" value="${E.h}"><span class="u">px</span>
      <label>Font size</label><input type="number" id="exF" min="6" max="96" step="1" value="${E.font > 4 ? E.font : 24}"><span class="u">px</span>
      <label>Format</label>${fmtSel}<span></span></div>
      <label class="chk"><input type="checkbox" id="exKeep" checked> Use these values next time</label><p class="note">The plot is drawn at exactly this size, so figures keep the same proportions whatever the window size. Font size is the axis text height in the saved image.</p>`
    : `<div class="grid2"><label>Size</label><select id="exSc"><option value="1">Original — ${S.W0} × ${S.H0} px</option><option value="0.5">Half — ${Math.round(S.W0 / 2)} × ${Math.round(S.H0 / 2)} px</option></select><span></span><label>Format</label>${fmtSel}<span></span></div>
      <label class="chk"><input type="checkbox" id="exKeep" checked> Use this format next time</label><p class="note">Saves the current Graphics view (${({ image: 'image', overlay: 'boundaries', grains: 'grains', size: 'size map with colour legend', ridge: 'boundary signal' })[S.view]}).</p>`;
  // live preview of the file that will be saved (drawn at the export size, shown scaled down)
  const preview = d => { const pc = d.querySelector('#exPv'), cap = d.querySelector('#exPvCap'); let src, W, H;
    if (plot) { W = Math.max(200, Math.min(8000, +d.querySelector('#exW').value || E.w)); H = Math.max(150, Math.min(8000, +d.querySelector('#exH').value || E.h)); const F = Math.max(6, Math.min(96, +d.querySelector('#exF').value || 24)), s = Math.min(1, 1600 / Math.max(W, H)); src = renderPlotTo(Math.round(W * s), Math.round(H * s), F * s); }
    else { const sc = +d.querySelector('#exSc').value; W = Math.round(S.W0 * sc); H = Math.round(S.H0 * sc); src = renderGraphicsTo(Math.min(sc, 1000 / S.W0)); }
    const bw = 520, bh = 300, k = Math.min(bw / src.width, bh / src.height), dpr = devicePixelRatio || 1, cw = Math.round(src.width * k), ch = Math.round(src.height * k);
    pc.width = cw * dpr; pc.height = ch * dpr; pc.style.width = cw + 'px'; pc.style.height = ch + 'px'; const x = pc.getContext('2d');
    const fmt = d.querySelector('#exFmt').value; x.fillStyle = fmt === 'png' ? '#fff' : '#fff'; x.fillRect(0, 0, pc.width, pc.height); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, pc.width, pc.height);
    cap.textContent = `Preview — saved as ${W} × ${H} px ${fmt.toUpperCase()}`; };
  let pvT = 0; const schedule = d => { clearTimeout(pvT); pvT = setTimeout(() => preview(d), 120); };
const build = (dlg, keepPrefs) => { const fmt = dlg.querySelector('#exFmt').value, [mime, ext] = FMT[fmt], keep = keepPrefs && dlg.querySelector('#exKeep').checked; let cv, name;
    if (plot) { const W = Math.max(200, Math.min(8000, +dlg.querySelector('#exW').value || E.w)), H = Math.max(150, Math.min(8000, +dlg.querySelector('#exH').value || E.h)), F = Math.max(6, Math.min(96, +dlg.querySelector('#exF').value || 24));
      if (keep) Object.assign(PREFS.exp, { w: W, h: H, font: F, fmt }); cv = renderPlotTo(W, H, F); name = `${dataSets().length > 1 ? 'grain_results' : stem()}_${({ box: 'statistics', bar: 'ecd_distribution', cdf: 'ecd_cumulative', shape: 'grain_shape' })[curPT()]}`; }
    else { if (keep) PREFS.exp.fmt = fmt; cv = renderGraphicsTo(+dlg.querySelector('#exSc').value); name = stem() + ({ image: '_image', overlay: '_boundaries', grains: '_grains', size: `_size_map_${S.cmap}`, ridge: '_signal' })[S.view]; }
    if (keep) savePrefs();
    if (mime !== 'image/png') { const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const x = c2.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(cv, 0, 0); cv = c2; }
    return { cv, name, mime, ext }; };
  const dlg = await dialog({ title: plot ? 'Export Plot Image' : 'Export Graphics Image', ok: 'Export', wide: true, alt: { label: 'Copy to Clipboard', icon: 'i-copy', run: d => { copyCanvas(build(d, false).cv, plot ? 'plot' : 'image'); } }, body: `<div class="expv"><canvas id="exPv"></canvas><div class="note" id="exPvCap"></div></div>` + body, onOpen: d => { const pre = d.querySelector('#exPre'); if (pre) pre.onchange = () => { const p = PRESETS[+pre.value]; d.querySelector('#exW').value = p[1] || Math.round(r.width * 2); d.querySelector('#exH').value = p[2] || Math.round(r.height * 2); schedule(d); };
    d.querySelectorAll('input,select').forEach(el => el.addEventListener('input', () => schedule(d))); preview(d); } });
  if (!dlg) return; const { cv, name, mime, ext } = build(dlg, true);
  cv.toBlob(b => b ? save(`${name}.${ext}`, b) : toast('This format is not supported here; choose PNG.', 1), mime, PREFS.exp.q || 0.92); }
// ⌘/Ctrl+Shift+C: copy the current view (Graphics at original size, or the plot at the saved export size) without the dialog
function quickCopy() { const plot = S.wtab === 'res'; if (!plot && !S.base) return toast('Open an image first.', 1); if (plot && !dataSets().length) return toast('Process an image first.', 1);
  const E = PREFS.exp; copyCanvas(plot ? renderPlotTo(E.w, E.h, E.font > 4 ? E.font : 24) : renderGraphicsTo(1), plot ? 'plot' : 'image'); }
// copy the exported image (PNG, same size and content as Export) to the clipboard
function copyCanvas(cv, what) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') { toast('Copying images is not available here — use Export instead.', 1); return; }
  const blob = new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error('encode')), 'image/png'));
  navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => { toast(`Copied ${what} to the clipboard (${cv.width} × ${cv.height} px PNG)`); log(`Copied ${what} to the clipboard — ${cv.width} × ${cv.height} px PNG`); },
    () => toast('The clipboard refused the image — use Export instead.', 1)); }

// app preferences (kept between sessions)
async function prefsDialog() { const E = PREFS.exp;
  const dlg = await dialog({ title: 'Preferences', ok: 'Save', wide: true, body: `<fieldset><legend>Plot export defaults</legend><div class="grid2">
      <label>Width</label><input type="number" id="pfW" min="200" max="8000" step="10" value="${E.w}"><span class="u">px</span>
      <label>Height</label><input type="number" id="pfH" min="150" max="8000" step="10" value="${E.h}"><span class="u">px</span>
      <label>Font size</label><input type="number" id="pfF" min="6" max="96" step="1" value="${E.font > 4 ? E.font : 24}"><span class="u">px</span>
      <label>Format</label><select id="pfFmt">${Object.keys(FMT).map(k => `<option value="${k}"${E.fmt === k ? ' selected' : ''}>${k.toUpperCase()}</option>`).join('')}</select><span></span>
      <label>JPEG quality</label><input type="number" id="pfQ" min="0.5" max="1" step="0.01" value="${E.q || 0.92}"><span></span></div></fieldset>
      <fieldset><legend>Graphics</legend><label class="chk"><input type="checkbox" id="pfAx"${PREFS.axes ? ' checked' : ''}> Show µm rulers (Axes) at start</label></fieldset>
      <p class="note">Saved on this computer and kept after closing the app.</p>` });
  if (!dlg) return; const q = id => dlg.querySelector(id);
  Object.assign(PREFS.exp, { w: +q('#pfW').value || 1600, h: +q('#pfH').value || 1000, font: +q('#pfF').value || 24, fmt: q('#pfFmt').value, q: +q('#pfQ').value || 0.92 }); PREFS.axes = q('#pfAx').checked; savePrefs(); log('Preferences saved'); }

// ---------------- ribbon follows the other windows ----------------
// a command used from Settings, a graphics toolbar or a popup shows the ribbon tab that holds the same command and marks it
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-tool],[data-view],[data-act],[data-node]'); if (!b || b.closest('.ribbon') || b.closest('#tree') || b.classList.contains('sform')) return;
  const key = ['tool', 'view', 'act', 'node'].find(k => b.dataset[k] !== undefined); if (!key) return;
  if ($(`.appbar [data-${key}="${b.dataset[key]}"]`)) return; // also on the quick-access bar: no need to switch tabs
  const twins = $$(`.ribbon [data-${key}="${b.dataset[key]}"]`); if (!twins.length) return;
  const page = twins[0].closest('.rpage'); if (page && page.hidden && !twins.some(t => !t.closest('.rpage').hidden)) setRibbon(page.dataset.r);
  const vis = twins.find(t => !t.closest('.rpage').hidden); if (vis && key !== 'tool' && key !== 'view') { vis.classList.remove('pulse'); void vis.offsetWidth; vis.classList.add('pulse'); } });

// ---------------- toolbar tooltips ----------------
(() => { const tip = document.createElement('div'); tip.className = 'btip'; tip.hidden = true; document.body.appendChild(tip); let tm = 0;
  $$('.gtool [title], .phbtns [title], .appbar [title], .ribbon [title], #settings [title], .scpop [title]').forEach(b => { b.dataset.tip = b.title; b.removeAttribute('title'); });
  document.addEventListener('pointerover', e => { const b = e.target.closest && e.target.closest('[data-tip]'); clearTimeout(tm); if (!b) { tip.hidden = true; return; }
    tm = setTimeout(() => { if (!b.isConnected) return; tip.textContent = b.dataset.tip; tip.hidden = false; const r = b.getBoundingClientRect(), tw = tip.offsetWidth;
      tip.style.left = Math.max(4, Math.min(innerWidth - tw - 4, r.left + r.width / 2 - tw / 2)) + 'px'; tip.style.top = (r.bottom + 6) + 'px'; }, 350); });
  document.addEventListener('pointerdown', () => { clearTimeout(tm); tip.hidden = true; }, true); })();

// ---------------- init ----------------
new ResizeObserver(() => { resize(); updateDatabar(); }).observe(stage);
new ResizeObserver(() => drawRes()).observe($('histWrap'));
stage.addEventListener('wheel', () => updateDatabar(), { passive: true });
$('rbBar').value = $('barlen').value;
S.axes = !!PREFS.axes; $$('[data-act="axes"]').forEach(b => b.setAttribute('aria-pressed', S.axes));
syncDetectUI(); syncImageUI(); setTool('pan'); setView('overlay'); renderCmp(); renderKpis(); renderImgProps(); renderEdits(); selectNode('image'); setWtab('graphics');
log('Grain Tracer ready. Open an SEM image (⌘O) or open the demo sample.');
setStatus('Ready');
window.__S = S; window.__T = T;
})();
