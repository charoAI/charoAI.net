/* siteplot.js — offline site map. Projects all geotagged items (posts,
 * cameras with FOV wedges, ACS points, flow points, notes, media) onto a
 * local-plane SVG plot with a scale bar. No map tiles needed, so it works
 * with zero connectivity and embeds cleanly in the HTML report and PPTX.
 */
'use strict';

const SitePlot = (() => {

  const COLORS = {
    post:   '#00ffff',
    cctv:   '#f08fff',
    acs:    '#ffd35e',
    traffic:'#58ec8f',
    notes:  '#ff5c8a',
    media:  '#8899aa',
    site:   '#ffffff',
  };

  /* Gather all plottable points from a survey (+ media list). */
  function collectPoints(survey, mediaList) {
    const pts = [];
    const push = (kind, label, geo, extra) => {
      if (geo && geo.lat != null && geo.lng != null) {
        pts.push({ kind, label, lat: geo.lat, lng: geo.lng, ...extra });
      }
    };
    if (survey.meta && survey.meta.siteLocation) {
      push('site', 'Site ref', survey.meta.siteLocation, {});
    }
    (survey.posts || []).forEach((p, i) => push('post', p.name || `Post ${i + 1}`, p.location, { n: i + 1 }));
    (survey.cctv || []).forEach((c, i) => push('cctv', c.label || `Cam ${i + 1}`, c.location, {
      n: i + 1, heading: c.headingDeg, fov: Number(c.fovDeg) || 90,
    }));
    (survey.acs || []).forEach((a, i) => push('acs', a.label || `ACS ${i + 1}`, a.location, { n: i + 1 }));
    (survey.traffic || []).forEach((t, i) => push('traffic', t.point || `Flow ${i + 1}`, t.location, { n: i + 1 }));
    (survey.notes || []).forEach((nt, i) => push('notes', nt.title || `Note ${i + 1}`, nt.location, { n: i + 1 }));
    (mediaList || []).forEach((m, i) => {
      if (m.lat != null) pts.push({ kind: 'media', label: m.caption || m.name, lat: m.lat, lng: m.lng, heading: m.heading, n: i + 1 });
    });
    return pts;
  }

  /* Equirectangular local projection around the centroid -> meters. */
  function project(pts) {
    const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
    const lng0 = pts.reduce((a, p) => a + p.lng, 0) / pts.length;
    const mPerLat = 111320;
    const mPerLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
    return pts.map((p) => ({
      ...p,
      x: (p.lng - lng0) * mPerLng,
      y: -(p.lat - lat0) * mPerLat,   /* north = up */
    }));
  }

  function niceScale(m) {
    const targets = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
    for (const t of targets) if (t >= m / 6) return t;
    return 5000;
  }

  /* Render SVG string. opts: {width, height, showMedia, interactive} */
  function render(survey, mediaList, opts = {}) {
    const W = opts.width || 800;
    const HGT = opts.height || 600;
    let pts = collectPoints(survey, opts.showMedia === false ? [] : mediaList);
    const havePts = pts.length > 0;
    if (!havePts) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${HGT}" width="${W}" height="${HGT}">
        <rect width="${W}" height="${HGT}" fill="#0a0f10"/>
        <text x="${W / 2}" y="${HGT / 2}" fill="#93a6ab" text-anchor="middle" font-family="monospace" font-size="15">No geotagged items yet — capture locations to build the site map</text>
      </svg>`;
    }
    pts = project(pts);

    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    let minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 30), spanY = Math.max(maxY - minY, 30);
    const pad = Math.max(spanX, spanY) * 0.15;
    minX -= pad; maxX = minX + spanX + 2 * pad;
    minY -= pad; maxY = minY + spanY + 2 * pad;
    const scale = Math.min(W / (maxX - minX), (HGT - 40) / (maxY - minY));
    const ox = (W - (maxX - minX) * scale) / 2;
    const oy = ((HGT - 40) - (maxY - minY) * scale) / 2;
    const X = (x) => ox + (x - minX) * scale;
    const Y = (y) => oy + (y - minY) * scale;

    const els = [];
    els.push(`<rect width="${W}" height="${HGT}" fill="#0a0f10"/>`);

    /* grid every scale unit */
    const grid = niceScale(Math.max(maxX - minX, maxY - minY));
    for (let gx = Math.ceil(minX / grid) * grid; gx < maxX; gx += grid) {
      els.push(`<line x1="${X(gx)}" y1="0" x2="${X(gx)}" y2="${HGT - 40}" stroke="rgba(0,255,255,0.07)"/>`);
    }
    for (let gy = Math.ceil(minY / grid) * grid; gy < maxY; gy += grid) {
      els.push(`<line x1="0" y1="${Y(gy)}" x2="${W}" y2="${Y(gy)}" stroke="rgba(0,255,255,0.07)"/>`);
    }

    /* camera FOV wedges under markers */
    for (const p of pts) {
      if (p.kind === 'cctv' && p.heading != null) {
        const r = Math.min(60, Math.max(28, grid * scale * 0.45));
        const fov = Math.min(Number(p.fov) || 90, 340);
        const a0 = ((p.heading - fov / 2 - 90) * Math.PI) / 180;
        const a1 = ((p.heading + fov / 2 - 90) * Math.PI) / 180;
        const cx = X(p.x), cy = Y(p.y);
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        const large = fov > 180 ? 1 : 0;
        els.push(`<path d="M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z" fill="rgba(240,143,255,0.14)" stroke="rgba(240,143,255,0.5)" stroke-width="1"/>`);
      }
      if (p.kind === 'media' && p.heading != null) {
        const cx = X(p.x), cy = Y(p.y);
        const a = ((p.heading - 90) * Math.PI) / 180;
        els.push(`<line x1="${cx}" y1="${cy}" x2="${cx + 14 * Math.cos(a)}" y2="${cy + 14 * Math.sin(a)}" stroke="#8899aa" stroke-width="1.5" marker-end="url(#arr)"/>`);
      }
    }

    /* markers */
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    for (const p of pts) {
      const cx = X(p.x), cy = Y(p.y);
      const col = COLORS[p.kind] || '#fff';
      const dataAttr = opts.interactive ? ` data-kind="${p.kind}" data-label="${esc(p.label)}" style="cursor:pointer"` : '';
      if (p.kind === 'media') {
        els.push(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="${col}" opacity="0.75"${dataAttr}><title>${esc(p.label)}</title></circle>`);
        continue;
      }
      if (p.kind === 'site') {
        els.push(`<g${dataAttr}><circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="2" fill="#fff"/><title>Site reference</title></g>`);
        continue;
      }
      const letter = { post: 'P', cctv: 'C', acs: 'A', traffic: 'T', notes: 'N' }[p.kind] || '?';
      els.push(`<g${dataAttr}>
        <circle cx="${cx}" cy="${cy}" r="11" fill="#0a0f10" stroke="${col}" stroke-width="2"/>
        <text x="${cx}" y="${cy + 3.5}" fill="${col}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold">${letter}${p.n || ''}</text>
        <title>${esc(p.label)}</title>
      </g>`);
    }

    /* north arrow */
    els.push(`<g transform="translate(${W - 34}, 34)">
      <circle r="18" fill="rgba(0,0,0,0.5)" stroke="rgba(0,255,255,0.4)"/>
      <path d="M 0 -12 L 5 4 L 0 1 L -5 4 Z" fill="#00ffff"/>
      <text y="14" fill="#00ffff" text-anchor="middle" font-family="monospace" font-size="9">N</text>
    </g>`);

    /* scale bar */
    const barM = niceScale(Math.max(maxX - minX, maxY - minY));
    const barPx = barM * scale;
    els.push(`<g transform="translate(16, ${HGT - 22})">
      <line x1="0" y1="0" x2="${barPx}" y2="0" stroke="#e8f4f4" stroke-width="2"/>
      <line x1="0" y1="-4" x2="0" y2="4" stroke="#e8f4f4" stroke-width="2"/>
      <line x1="${barPx}" y1="-4" x2="${barPx}" y2="4" stroke="#e8f4f4" stroke-width="2"/>
      <text x="${barPx / 2}" y="-7" fill="#e8f4f4" text-anchor="middle" font-family="monospace" font-size="11">${barM >= 1000 ? (barM / 1000) + ' km' : barM + ' m'}</text>
    </g>`);

    const defs = `<defs><marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#8899aa"/></marker></defs>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${HGT}" width="${W}" height="${HGT}">${defs}${els.join('\n')}</svg>`;
  }

  /* Rasterize the SVG to a PNG dataURL (for PPTX embedding). */
  async function toPNG(survey, mediaList, opts = {}) {
    const svg = render(survey, mediaList, { ...opts, interactive: false });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await U.loadImage(url);
      const cv = document.createElement('canvas');
      cv.width = opts.width || 800;
      cv.height = opts.height || 600;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function legend() {
    const items = [
      ['P', COLORS.post, 'Guard post'], ['C', COLORS.cctv, 'Camera (+FOV)'],
      ['A', COLORS.acs, 'Access control'], ['T', COLORS.traffic, 'Traffic/flow'],
      ['N', COLORS.notes, 'Field note'], ['·', COLORS.media, 'Photo/video'],
    ];
    return items;
  }

  return { render, toPNG, legend, collectPoints, COLORS };
})();
