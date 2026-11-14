// Live tools for the web manual: type blur tester, 3D ribbon, background builder.
(() => {
'use strict';
const $ = s => document.querySelector(s);
const DPR = () => Math.min(2, devicePixelRatio || 1);

// ---------- shared: flat slider with value readout ----------
function slider(el, { min, max, step, value, fmt = v => v, onInput }) {
  el.innerHTML = `<input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output></output>`;
  const inp = el.querySelector('input'), out = el.querySelector('output');
  const paint = () => { out.textContent = fmt(+inp.value); inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%'); };
  inp.addEventListener('input', () => { paint(); onInput(+inp.value); });
  paint();
  return { set(v) { inp.value = v; paint(); }, get: () => +inp.value };
}
function download(canvas, name) {
  canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
}

// =====================================================================
// 1. Type tester — what you type is set with the brand's "time as blur":
//    letters near the soft spot melt away, the rest stay sharp.
// =====================================================================
(function typeTool() {
  const root = $('#tool-type'); if (!root) return;
  const input = root.querySelector('input.type-in'), out = root.querySelector('.type-out');
  const st = { peak: 8, spread: 2.6, flow: true, center: .45 };
  const isHangul = ch => /[ᄀ-ᇿ㄰-㆏가-힯]/.test(ch);
  function build() {
    const txt = input.value || input.placeholder;
    out.innerHTML = [...txt].map(ch => ch === ' ' ? '<span class="sp"> </span>'
      : `<span class="${isHangul(ch) ? 'ko' : 'en'}">${ch.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</span>`).join('');
    blur();
  }
  function blur() {
    const sp = out.querySelectorAll('span'), n = sp.length;
    sp.forEach((s, i) => {
      const d = (i + .5) / n - st.center;
      // slightly lopsided like the specimen rows: a quick rise, a longer fade-out
      const w = st.spread / Math.max(n, 1) * (d < 0 ? .8 : 1.25);
      const b = st.peak * Math.exp(-(d * d) / (w * w));
      s.style.filter = b > .05 ? `blur(${(b * out.clientHeight / 100).toFixed(2)}px)` : '';
    });
  }
  input.addEventListener('input', build);
  out.addEventListener('pointermove', e => { const r = out.getBoundingClientRect(); st.center = (e.clientX - r.left) / r.width; st.flow = false; flowBtn.classList.remove('on'); blur(); });
  slider(root.querySelector('[data-s=peak]'), { min: 0, max: 14, step: .1, value: st.peak, fmt: v => v.toFixed(1), onInput: v => { st.peak = v; blur(); } });
  slider(root.querySelector('[data-s=spread]'), { min: .8, max: 6, step: .1, value: st.spread, fmt: v => v.toFixed(1), onInput: v => { st.spread = v; blur(); } });
  const flowBtn = root.querySelector('[data-a=flow]');
  flowBtn.addEventListener('click', () => { st.flow = !st.flow; flowBtn.classList.toggle('on', st.flow); });
  let t0 = performance.now();
  const loop = now => {
    if (st.flow && root.getBoundingClientRect().bottom > 0 && root.getBoundingClientRect().top < innerHeight) {
      st.center = .5 + .42 * Math.sin((now - t0) / 2600); blur();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  addEventListener('resize', blur);
  build();
})();

// =====================================================================
// 2. Ribbon — the S as a real paper strip; drag to turn it, slide to loosen the fold.
// =====================================================================
(function ribbonTool() {
  const root = $('#tool-ribbon'); if (!root || !window.Ribbon3D) return;
  const R3 = window.Ribbon3D, rr = new R3.Renderer(), RP = window.LOGO_DATA.real;
  const STOPS = ['fold', 'base', 'loose', 'curved'].map(k => RP[k]);
  const KEYS = ['r', 'th', 'a', 'bar0', 'diag', 'bar1'];
  const COLORS = {
    blue: { back: '#c9d8f0', line: '#8ea7d8', lineB: '#9db3df', shadow: 'rgba(60,80,130,.22)' },
    yellow: { back: '#f8e1b8', line: '#d6aa66', lineB: '#e2bd84', shadow: 'rgba(150,110,50,.2)' },
    coral: { back: '#f3c7b6', line: '#d98e76', lineB: '#e4a690', shadow: 'rgba(150,80,60,.2)' },
    green: { back: '#e3ebbd', line: '#a7b46a', lineB: '#bcc784', shadow: 'rgba(90,110,60,.2)' },
  };
  const st = { t: 1, color: 'blue', yaw: 12, pitch: -20 };
  const cv = root.querySelector('canvas');
  const ease = x => x * x * (3 - 2 * x);
  function params() {
    const i = Math.min(2, Math.floor(st.t)), f = ease(Math.min(1, st.t - i)), a = STOPS[i], b = STOPS[i + 1];
    const p = Object.fromEntries(KEYS.map(k => [k, a[k] + (b[k] - a[k]) * f]));
    return { ...p, pitch: st.pitch, yaw: st.yaw };
  }
  function strip(p) {
    const k = Math.PI / 180, u1 = p.bar0, u2 = u1 + Math.abs(p.th) * k * p.r + p.diag, L = u2 + Math.abs(p.th) * k * p.r + p.bar1;
    const c = COLORS[st.color];
    return { L, h: 100, x: 0, y: 0, anchor: 0, pitch: p.pitch, yaw: p.yaw, folds: [{ u: u1, a: p.a, th: p.th, r: p.r }, { u: u2, a: p.a, th: p.th, r: p.r }],
      front: '#ffffff', back: c.back, line: c.line, lineB: c.lineB, lineW: 1.6, loF: .76, loB: .82 };
  }
  // the letter keeps a fixed size while it folds: fit against the base S, not the current one
  function bbox(rb, f) {
    const { pos } = R3.buildMesh({ ...rb, res: 6, rows: 4 });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < pos.length; i += 3) { const w = (f - pos[i + 2]) / f, x = pos[i] / w, y = pos[i + 1] / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  }
  function drawTo(ctx, W, H) {
    const f = 2400, rb = strip(params()), [x0, y0, x1, y1] = bbox(rb, f);
    const s = Math.min(W / (x1 - x0), H / (y1 - y0)) * .62, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const r = rr.render({ width: W, height: H, origin: [cx - W / 2 / s, cy - H / 2 / s], scale: s, cam: [cx, cy], f, ribbons: [rb] });
    const sh = document.createElement('canvas'); sh.width = W; sh.height = H;
    const sx = sh.getContext('2d'); sx.drawImage(r, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = COLORS[st.color].shadow; sx.fillRect(0, 0, W, H);
    ctx.save(); ctx.filter = `blur(${H * .03}px)`; ctx.globalAlpha = .9; ctx.drawImage(sh, 0, H * .03); ctx.restore();
    ctx.save(); ctx.filter = `blur(${H * .005}px)`; ctx.globalAlpha = .5; ctx.drawImage(sh, 0, H * .006); ctx.restore();
    ctx.drawImage(r, 0, 0);
  }
  let raf = 0;
  function draw() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const b = cv.getBoundingClientRect(), d = DPR();
      cv.width = Math.round(b.width * d); cv.height = Math.round(b.height * d);
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
      drawTo(ctx, cv.width, cv.height);
      root.querySelectorAll('[data-stop]').forEach(b2 => b2.classList.toggle('on', Math.abs(st.t - +b2.dataset.stop) < .02));
      root.querySelector('.readout').textContent = `yaw ${st.yaw.toFixed(0)}° · pitch ${st.pitch.toFixed(0)}°`;
    });
  }
  const fold = slider(root.querySelector('[data-s=fold]'), { min: 0, max: 3, step: .01, value: st.t, fmt: v => ['접힘', '기본', '느슨', '굴곡'][Math.round(v)] + (Math.abs(v - Math.round(v)) > .02 ? ' ~' : ''), onInput: v => { st.t = v; draw(); } });
  let anim = 0;
  root.querySelectorAll('[data-stop]').forEach(b => b.addEventListener('click', () => {
    const from = st.t, to = +b.dataset.stop, t0 = performance.now(), dur = 420 + 260 * Math.abs(to - from);
    cancelAnimationFrame(anim);
    const step = now => { const k = Math.min(1, (now - t0) / dur); st.t = from + (to - from) * ease(k); fold.set(st.t); draw(); if (k < 1) anim = requestAnimationFrame(step); };
    anim = requestAnimationFrame(step);
  }));
  root.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
    st.color = b.dataset.color; root.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('on', x === b)); draw();
  }));
  // drag to turn
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch }; cv.setPointerCapture(e.pointerId); cv.classList.add('grab'); });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    st.yaw = Math.max(-60, Math.min(60, drag.yaw + (e.clientX - drag.x) * .25));
    st.pitch = Math.max(-60, Math.min(20, drag.pitch - (e.clientY - drag.y) * .25));
    draw();
  });
  const end = () => { drag = null; cv.classList.remove('grab'); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  root.querySelector('[data-a=reset]').addEventListener('click', () => { st.yaw = 12; st.pitch = -20; draw(); });
  root.querySelector('[data-a=png]').addEventListener('click', () => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1500; drawTo(c.getContext('2d'), c.width, c.height); download(c, `passt_ribbon_${st.color}.png`);
  });
  addEventListener('resize', draw);
  draw();
})();

// =====================================================================
// 3. Background builder — composition, colour mix and texture are the only variables.
// =====================================================================
(function bgTool() {
  const root = $('#tool-bg'); if (!root || !window.BgEngine) return;
  const E = window.BgEngine, cv = root.querySelector('canvas.bg-view');
  let st = E.stateFrom(E.PRESETS[0]);
  const clone = o => JSON.parse(JSON.stringify(o));

  // composition thumbnails
  const comps = root.querySelector('.comps');
  comps.innerHTML = E.PRESETS.map((p, i) => `<button data-i="${i}" title="${p.name}"><canvas width="120" height="64"></canvas><span>${p.name.split(' ')[0]}</span></button>`).join('');
  comps.querySelectorAll('button').forEach(b => {
    const p = E.PRESETS[+b.dataset.i], c = b.querySelector('canvas');
    // landscape crop of the portrait background, like a swatch
    const src = E.render(E.stateFrom(p), 120, 260);
    c.getContext('2d').drawImage(src, 0, 98, 120, 64, 0, 0, 120, 64);
    b.addEventListener('click', () => { st = E.stateFrom(p); sync(); draw(); });
  });

  // stacked mix bar (blue · green · yellow · coral), dividers draggable
  const bar = root.querySelector('.mixbar');
  bar.innerHTML = E.FAM.map(f => `<div class="seg" style="background:${f.hex}"></div>`).join('') + '<i></i><i></i><i></i>';
  const legend = root.querySelector('.mixlegend');
  bar.querySelectorAll('i').forEach((d, j) => d.addEventListener('pointerdown', e => {
    d.setPointerCapture(e.pointerId);
    const r = bar.getBoundingClientRect(), sum = st.ratio.reduce((a, b) => a + b, 0);
    const move = ev => {
      const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * sum;
      const before = st.ratio.slice(0, j).reduce((a, b) => a + b, 0), pair = st.ratio[j] + st.ratio[j + 1];
      const a = Math.min(pair - sum * .02, Math.max(sum * .02, x - before));
      st.ratio[j] = a; st.ratio[j + 1] = pair - a; syncBar(); draw();
    };
    const up = () => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); };
    d.addEventListener('pointermove', move); d.addEventListener('pointerup', up);
  }));
  function syncBar() {
    const sum = st.ratio.reduce((a, b) => a + b, 0) || 1; let acc = 0;
    bar.querySelectorAll('.seg').forEach((s, i) => s.style.width = (st.ratio[i] / sum * 100) + '%');
    bar.querySelectorAll('i').forEach((d, j) => { acc += st.ratio[j] / sum; d.style.left = (acc * 100) + '%'; });
    legend.innerHTML = E.FAM.map((f, i) => `<span><b style="background:${f.hex}"></b>${f.name} ${Math.round(st.ratio[i] / sum * 100)}%</span>`).join('');
  }

  const S = {
    soft: slider(root.querySelector('[data-s=soft]'), { min: 0, max: 1, step: .01, value: st.soft, fmt: v => v.toFixed(2), onInput: v => { st.soft = v; draw(); } }),
    air: slider(root.querySelector('[data-s=air]'), { min: .3, max: 1.8, step: .01, value: st.air, fmt: v => v.toFixed(2), onInput: v => { st.air = v; draw(); } }),
    ribs: slider(root.querySelector('[data-s=ribs]'), { min: 6, max: 40, step: .1, value: 18.3, fmt: v => v.toFixed(0), onInput: v => { if (st.glass) { st.glass.ribs = v; draw(); } } }),
    bend: slider(root.querySelector('[data-s=bend]'), { min: -2, max: 2, step: .01, value: .6, fmt: v => v.toFixed(2), onInput: v => { if (st.glass) { st.glass.bend = v; draw(); } } }),
    grain: slider(root.querySelector('[data-s=grain]'), { min: 0, max: .1, step: .001, value: .03, fmt: v => v.toFixed(3), onInput: v => { if (st.grain) { st.grain.amount = v; draw(); } } }),
  };
  const glassBtn = root.querySelector('[data-a=glass]'), grainBtn = root.querySelector('[data-a=grain]');
  glassBtn.addEventListener('click', () => { st.glass = st.glass ? null : clone(E.DEFAULT_GLASS); sync(); draw(); });
  grainBtn.addEventListener('click', () => { st.grain = st.grain ? null : clone(E.DEFAULT_GRAIN); sync(); draw(); });
  root.querySelector('[data-a=random]').addEventListener('click', () => {
    const r = () => Math.random();
    st = E.stateFrom(E.PRESETS[Math.floor(r() * 4)]);
    st.ratio = st.ratio.map(v => Math.max(10, v * (.4 + r() * 1.4)));
    st.soft = .3 + r() * .5; st.air = .6 + r() * .9;
    st.glass = r() < .4 ? { ...clone(E.DEFAULT_GLASS), ribs: 10 + r() * 24, bend: .3 + r() * 1.1 } : null;
    st.grain = r() < .5 ? { ...clone(E.DEFAULT_GRAIN), amount: .01 + r() * .04 } : null;
    sync(); draw();
  });
  root.querySelector('[data-a=reset]').addEventListener('click', () => { const p = E.PRESETS.find(x => x.comp === st.comp) || E.PRESETS[0]; st = E.stateFrom(p); sync(); draw(); });
  root.querySelector('[data-a=png]').addEventListener('click', () => {
    const c = document.createElement('canvas'); c.width = E.W; c.height = E.H; c.getContext('2d').drawImage(E.render(st, E.W, E.H), 0, 0); download(c, `passt_bg_${st.comp}.png`);
  });

  function sync() {
    comps.querySelectorAll('button').forEach(b => b.classList.toggle('on', E.PRESETS[+b.dataset.i].comp === st.comp));
    S.soft.set(st.soft); S.air.set(st.air);
    glassBtn.classList.toggle('on', !!st.glass); grainBtn.classList.toggle('on', !!st.grain);
    glassBtn.textContent = st.glass ? 'On' : 'Off'; grainBtn.textContent = st.grain ? 'On' : 'Off';
    root.querySelector('.glass-opts').classList.toggle('off', !st.glass);
    root.querySelector('.grain-opts').classList.toggle('off', !st.grain);
    if (st.glass) { S.ribs.set(st.glass.ribs); S.bend.set(st.glass.bend); }
    if (st.grain) S.grain.set(st.grain.amount);
    syncBar();
  }
  let raf = 0;
  function draw() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const b = cv.getBoundingClientRect(), d = DPR(), w = Math.round(b.width * d), h = Math.round(b.height * d);
      cv.width = w; cv.height = h; cv.getContext('2d').drawImage(E.render(st, w, h), 0, 0);
    });
  }
  addEventListener('resize', draw);
  sync(); draw();
})();
})();
