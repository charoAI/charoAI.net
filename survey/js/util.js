/* util.js — shared helpers for the Site Survey app */
'use strict';

const U = {
  uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  },

  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /* h('div', {class:'x', onclick:fn}, child1, 'text', ...) */
  h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  },

  toast(msg, isErr) {
    const holder = document.getElementById('toast-holder');
    const t = U.h('div', { class: 'toast' + (isErr ? ' err' : '') }, msg);
    holder.append(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; }, 2600);
    setTimeout(() => t.remove(), 3000);
  },

  fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  },

  fmtDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },

  fmtTimestampForStamp(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },

  /* 247.3 -> "WSW 247°" */
  headingName(deg) {
    if (deg == null || isNaN(deg)) return '';
    const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const i = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
    return names[i];
  },

  fmtHeading(deg) {
    if (deg == null || isNaN(deg)) return '';
    return `${Math.round(deg)}° ${U.headingName(deg)}`;
  },

  fmtCoords(lat, lng, acc) {
    if (lat == null || lng == null) return '';
    let s = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    if (acc != null) s += ` (±${Math.round(acc)}m)`;
    return s;
  },

  /* meters between two lat/lng points */
  distanceM(lat1, lng1, lat2, lng2) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  },

  fmtBytes(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  },

  slug(s) {
    return String(s || 'survey').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'survey';
  },

  blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  },

  dataURLToBlob(dataURL) {
    const [head, body] = dataURL.split(',');
    const mime = (head.match(/data:(.*?);/) || [])[1] || 'application/octet-stream';
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  },

  /* Downscale an image blob to fit maxDim; returns JPEG blob. */
  async downscaleImage(blob, maxDim, quality = 0.82) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await U.loadImage(url);
      let { width: w, height: h } = img;
      if (Math.max(w, h) > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      return await new Promise((res) => cv.toBlob(res, 'image/jpeg', quality));
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  },

  todayISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  confirm(msg) {
    return new Promise((res) => {
      const back = U.h('div', { class: 'modal-backdrop' });
      const done = (v) => { back.remove(); res(v); };
      back.append(U.h('div', { class: 'modal' },
        U.h('p', { style: 'margin-top:0.2rem; line-height:1.5;' }, msg),
        U.h('div', { class: 'btn-row' },
          U.h('button', { class: 'btn danger', onclick: () => done(true) }, 'Yes, continue'),
          U.h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'))));
      back.addEventListener('click', (e) => { if (e.target === back) done(false); });
      document.body.append(back);
    });
  },

  /* simple prompt modal, returns string or null */
  prompt(msg, initial = '') {
    return new Promise((res) => {
      const input = U.h('input', { type: 'text', value: initial, style: 'width:100%;background:#0a0f10;color:#e8f4f4;border:1px solid rgba(0,255,255,0.28);border-radius:8px;padding:0.6rem;' });
      const back = U.h('div', { class: 'modal-backdrop' });
      const done = (v) => { back.remove(); res(v); };
      back.append(U.h('div', { class: 'modal' },
        U.h('p', { style: 'margin-top:0.2rem;' }, msg),
        input,
        U.h('div', { class: 'btn-row', style: 'margin-top:0.8rem;' },
          U.h('button', { class: 'btn primary', onclick: () => done(input.value.trim() || null) }, 'OK'),
          U.h('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'))));
      back.addEventListener('click', (e) => { if (e.target === back) done(null); });
      document.body.append(back);
      setTimeout(() => input.focus(), 50);
    });
  },
};
