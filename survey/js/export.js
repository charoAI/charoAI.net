/* export.js — turns a survey into deliverables:
 *   1. Word-compatible .doc  (HTML-based, embedded stamped photos)
 *   2. PowerPoint .pptx      (vendored pptxgenjs, offline)
 *   3. Interactive .html     (self-contained: map, gallery, tables)
 *   4. JSON bundle           (full-fidelity backup / transfer / import)
 */
'use strict';

const Exporter = (() => {

  /* ---------- shared prep ---------- */

  async function prepare(survey, opts = {}) {
    const mediaRows = await DB.listMedia(survey.id);
    const photos = [];
    const videos = [];
    for (const m of mediaRows) {
      if (m.kind === 'photo') {
        const scaled = await U.downscaleImage(m.blob, opts.photoMax || 1280, 0.78);
        photos.push({ ...m, dataURL: await U.blobToDataURL(scaled) });
      } else {
        videos.push({ ...m, dataURL: opts.includeVideos ? await U.blobToDataURL(m.blob) : null });
      }
    }
    const byEntity = {};
    for (const m of [...photos, ...videos]) {
      const key = m.attachedTo ? `${m.attachedTo.section}:${m.attachedTo.entityId}` : 'general';
      (byEntity[key] = byEntity[key] || []).push(m);
    }
    return { photos, videos, byEntity, mediaRows };
  }

  function mediaFor(prep, sectionId, entityId) {
    return prep.byEntity[`${sectionId}:${entityId}`] || [];
  }

  function stampLine(m) {
    const bits = [U.fmtDateTime(m.capturedAt)];
    if (m.lat != null) bits.push(U.fmtCoords(m.lat, m.lng, m.acc));
    if (m.heading != null) bits.push('facing ' + U.fmtHeading(m.heading));
    return bits.join(' · ');
  }

  function fieldRows(sec, obj) {
    const rows = [];
    for (const f of sec.fields) {
      let v = (obj || {})[f.key];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
      if (f.type === 'geo') v = U.fmtCoords(v.lat, v.lng, v.acc);
      else if (f.type === 'heading') v = U.fmtHeading(v);
      else if (Array.isArray(v)) v = v.join(', ');
      rows.push([f.label, String(v)]);
    }
    return rows;
  }

  const fileBase = (survey) =>
    `SiteSurvey-${U.slug(survey.meta.siteName || survey.name)}-${survey.meta.surveyDate || U.todayISO()}`;

  /* =========================================================
   * 1. WORD DOC (.doc — HTML that Word/Google Docs opens natively)
   * ========================================================= */

  async function exportDoc(survey, onStatus) {
    onStatus && onStatus('Preparing media…');
    const prep = await prepare(survey, { photoMax: 1000 });
    const e = U.esc;
    const meta = survey.meta || {};

    const kvTable = (rows) => rows.length ? `<table class="kv">${rows.map(([k, v]) =>
      `<tr><td class="k">${e(k)}</td><td>${e(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>` : '';

    const photoBlock = (list, size = 460) => list.filter((m) => m.kind === 'photo').map((m) =>
      `<div class="ph"><img src="${m.dataURL}" width="${size}"><div class="cap">${e(m.caption || '')}${m.caption ? ' — ' : ''}${e(stampLine(m))}</div></div>`
    ).join('');

    const videoBlock = (list) => {
      const vids = list.filter((m) => m.kind === 'video');
      if (!vids.length) return '';
      return `<p class="videos"><i>Video recorded: ${vids.map((v) => e(v.name) + ' (' + e(stampLine(v)) + ')').join('; ')} — see media archive.</i></p>`;
    };

    let body = '';

    /* cover */
    body += `<div class="cover">
      <p class="doc-type">SECURITY SITE SURVEY</p>
      <h1>${e(meta.siteName || survey.name)}</h1>
      <p class="addr">${e(meta.address || '').replace(/\n/g, '<br>')}</p>
      <table class="cover-kv">
        ${meta.client ? `<tr><td>Client / Agency</td><td>${e(meta.client)}</td></tr>` : ''}
        ${meta.solicitation ? `<tr><td>Solicitation</td><td>${e(meta.solicitation)}</td></tr>` : ''}
        <tr><td>Survey date</td><td>${e(meta.surveyDate || '')}</td></tr>
        <tr><td>Surveyor</td><td>${e(meta.surveyor || '')}</td></tr>
        ${meta.escort ? `<tr><td>Escort</td><td>${e(meta.escort)}</td></tr>` : ''}
      </table>
    </div>`;

    /* site info */
    body += `<h2>1. Site Information</h2>` + kvTable(fieldRows(Schema.section('meta'), meta));
    const generalMedia = prep.byEntity['general'] || [];

    /* contacts */
    if ((survey.contacts || []).length) {
      body += `<h2>2. Points of Contact</h2><table class="grid"><tr><th>Name</th><th>Role</th><th>Org</th><th>Phone</th><th>Email</th></tr>`;
      for (const c of survey.contacts) {
        body += `<tr><td>${e(c.name)}</td><td>${e(c.role)}</td><td>${e(c.org)}</td><td>${e(c.phone)}</td><td>${e(c.email)}</td></tr>`;
      }
      body += `</table>`;
    }

    /* staffing summary */
    const staffing = Schema.staffingRows(survey);
    if (staffing.length) {
      body += `<h2>3. Post & Staffing Summary</h2>
      <table class="grid"><tr><th>Post</th><th>CLIN</th><th>Type</th><th>Coverage</th><th>Officers/shift</th><th>Wkly hrs</th><th>FTE</th><th>Armed</th></tr>`;
      for (const r of staffing) {
        body += `<tr><td>${e(r.post)}</td><td>${e(r.clin)}</td><td>${e(r.type)}</td><td>${e(r.hours)}</td><td>${e(r.officers)}</td><td>${e(r.weeklyHours)}</td><td>${e(r.fte)}</td><td>${e(r.armed)}</td></tr>`;
      }
      body += `</table><p class="note">FTE computed at 40 productive hrs/week; adjust for relief factor in pricing.</p>`;
    }

    /* entity sections */
    const listSections = [
      ['posts', '4. Guard Posts'],
      ['cctv', '5. CCTV / Camera Inventory'],
      ['acs', '6. Access Control Points'],
      ['vms', '7. VMS / Monitoring'],
      ['traffic', '9. Traffic & Flow'],
    ];
    for (const [id, title] of listSections) {
      const sec = Schema.section(id);
      const list = survey[id] || [];
      if (!list.length) continue;
      body += `<h2>${e(title)}</h2>`;
      list.forEach((ent, i) => {
        body += `<h3>${e(`${sec.badge}${i + 1} — ${Schema.entityTitle(sec, ent)}`)}</h3>`;
        body += kvTable(fieldRows(sec, ent).filter(([k]) => k !== sec.fields.find((f) => f.key === sec.titleField)?.label));
        const media = mediaFor(prep, id, ent.id);
        body += photoBlock(media) + videoBlock(media);
      });
    }

    /* comms + ops (form sections) */
    const commsRows = fieldRows(Schema.section('comms'), survey.comms);
    if (commsRows.length) body += `<h2>8. Communications</h2>` + kvTable(commsRows);
    const opsRows = fieldRows(Schema.section('ops'), survey.ops);
    if (opsRows.length) body += `<h2>10. Duties & Operations</h2>` + kvTable(opsRows);

    /* notes */
    if ((survey.notes || []).length) {
      body += `<h2>11. Field Notes & Hazards</h2>`;
      survey.notes.forEach((n, i) => {
        body += `<h3>N${i + 1} — ${e(n.title || 'Note')}${n.category ? ` <span class="cat">[${e(n.category)}]</span>` : ''}</h3>`;
        if (n.location) body += `<p class="note">${e(U.fmtCoords(n.location.lat, n.location.lng, n.location.acc))}</p>`;
        body += `<p>${e(n.body || '').replace(/\n/g, '<br>')}</p>`;
        body += photoBlock(mediaFor(prep, 'notes', n.id));
      });
    }

    /* general media appendix */
    if (generalMedia.length) {
      body += `<h2>Appendix A — Additional Site Photography</h2>` + photoBlock(generalMedia) + videoBlock(generalMedia);
    }

    onStatus && onStatus('Writing document…');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${e(meta.siteName || survey.name)} — Site Survey</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
  h1 { font-size: 26pt; margin: 6pt 0; color: #003a4d; }
  h2 { font-size: 15pt; color: #005a73; border-bottom: 1.5pt solid #007a99; padding-bottom: 3pt; margin-top: 22pt; }
  h3 { font-size: 12pt; color: #003a4d; margin: 14pt 0 4pt; }
  .cover { text-align: center; margin: 80pt 0; page-break-after: always; }
  .doc-type { letter-spacing: 4pt; color: #007a99; font-weight: bold; }
  .addr { color: #444; }
  .cover-kv { margin: 24pt auto 0; border-collapse: collapse; }
  .cover-kv td { padding: 3pt 10pt; }
  .cover-kv td:first-child { color: #666; text-align: right; }
  table.kv { border-collapse: collapse; margin: 6pt 0; }
  table.kv td { border: 0.5pt solid #ccc; padding: 4pt 8pt; vertical-align: top; }
  table.kv td.k { background: #eef6f8; font-weight: bold; width: 170pt; }
  table.grid { border-collapse: collapse; margin: 6pt 0; width: 100%; }
  table.grid th { background: #005a73; color: #fff; padding: 4pt 6pt; border: 0.5pt solid #005a73; font-size: 10pt; text-align: left; }
  table.grid td { border: 0.5pt solid #ccc; padding: 4pt 6pt; font-size: 10pt; }
  .ph { margin: 8pt 0; }
  .cap { font-size: 9pt; color: #555; margin-top: 2pt; }
  .note { font-size: 9pt; color: #666; }
  .cat { color: #b3261e; font-size: 10pt; }
  .videos { font-size: 9pt; color: #555; }
</style></head><body>${body}
<p class="note" style="margin-top:30pt;">Generated ${new Date().toLocaleString()} by CharoAI Site Survey.</p>
</body></html>`;

    U.download(new Blob(['﻿' + html], { type: 'application/msword' }), fileBase(survey) + '.doc');
    onStatus && onStatus('Word document downloaded.');
  }

  /* =========================================================
   * 2. POWERPOINT (.pptx via vendored pptxgenjs)
   * ========================================================= */

  let pptxLoading = null;
  function loadPptxLib() {
    if (window.PptxGenJS) return Promise.resolve();
    if (pptxLoading) return pptxLoading;
    pptxLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/pptxgen.bundle.js';
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load PPTX library'));
      document.head.append(s);
    });
    return pptxLoading;
  }

  const PP = {
    BG: '0D1517', PANEL: '13272B', CYAN: '00C8DC', TEXT: 'E8F4F4', MUTED: '93A6AB', W: 10, H: 5.625,
  };

  async function exportPptx(survey, onStatus) {
    onStatus && onStatus('Loading PPTX engine…');
    await loadPptxLib();
    onStatus && onStatus('Preparing media…');
    const prep = await prepare(survey, { photoMax: 1280 });
    const meta = survey.meta || {};
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'W16x9', width: PP.W, height: PP.H });
    pptx.layout = 'W16x9';

    const bgSlide = () => {
      const s = pptx.addSlide();
      s.background = { color: PP.BG };
      return s;
    };
    const title = (s, text) => {
      s.addText(text, { x: 0.4, y: 0.18, w: PP.W - 0.8, h: 0.5, fontSize: 20, bold: true, color: PP.CYAN, fontFace: 'Consolas' });
      s.addShape('line', { x: 0.4, y: 0.72, w: PP.W - 0.8, h: 0, line: { color: PP.CYAN, width: 1 } });
    };

    /* --- title slide --- */
    {
      const s = bgSlide();
      s.addText('SECURITY SITE SURVEY', { x: 0.5, y: 1.5, w: 9, h: 0.5, align: 'center', fontSize: 16, color: PP.CYAN, charSpacing: 6, fontFace: 'Consolas' });
      s.addText(meta.siteName || survey.name, { x: 0.5, y: 2.0, w: 9, h: 0.9, align: 'center', fontSize: 34, bold: true, color: PP.TEXT });
      const sub = [meta.address, [meta.client, meta.solicitation].filter(Boolean).join(' · '),
        `Surveyed ${meta.surveyDate || ''} by ${meta.surveyor || ''}`].filter(Boolean).join('\n');
      s.addText(sub, { x: 0.5, y: 3.0, w: 9, h: 1.2, align: 'center', fontSize: 13, color: PP.MUTED });
    }

    /* --- overview --- */
    {
      const s = bgSlide();
      title(s, 'Site Overview');
      const rows = fieldRows(Schema.section('meta'), meta).slice(0, 12)
        .map(([k, v]) => [
          { text: k, options: { color: PP.CYAN, bold: true, fontSize: 10 } },
          { text: v.length > 220 ? v.slice(0, 220) + '…' : v, options: { color: PP.TEXT, fontSize: 10 } },
        ]);
      if (rows.length) s.addTable(rows, { x: 0.4, y: 0.95, w: PP.W - 0.8, colW: [2.6, 6.6], border: { type: 'solid', color: '224', pt: 0.5 }, fill: { color: PP.PANEL }, valign: 'top' });
    }

    /* --- site map --- */
    onStatus && onStatus('Rendering site map…');
    try {
      const png = await SitePlot.toPNG(survey, prep.mediaRows, { width: 1200, height: 660, showMedia: true });
      const s = bgSlide();
      title(s, 'Site Map — Posts / Cameras / Access Points');
      s.addImage({ data: png, x: 0.4, y: 0.9, w: 9.2, h: 5.06 * (660 / 675) });
    } catch (err) { /* map optional */ }

    /* --- staffing summary --- */
    const staffing = Schema.staffingRows(survey);
    if (staffing.length) {
      const s = bgSlide();
      title(s, 'Post & Staffing Summary');
      const header = ['Post', 'CLIN', 'Coverage', 'Officers', 'Wkly hrs', 'FTE', 'Armed'].map((t) =>
        ({ text: t, options: { bold: true, color: PP.BG, fill: { color: PP.CYAN }, fontSize: 10 } }));
      const rows = staffing.map((r) => [r.post, r.clin, r.hours, String(r.officers), String(r.weeklyHours), r.fte, r.armed]
        .map((v) => ({ text: String(v), options: { color: PP.TEXT, fontSize: 10 } })));
      s.addTable([header, ...rows], { x: 0.4, y: 0.95, w: PP.W - 0.8, fill: { color: PP.PANEL }, border: { type: 'solid', color: '224', pt: 0.5 } });
    }

    /* --- one slide per post --- */
    const postSec = Schema.section('posts');
    (survey.posts || []).forEach((p, i) => {
      const s = bgSlide();
      title(s, `Post ${i + 1}: ${p.name || ''}`);
      const rows = fieldRows(postSec, p).filter(([k]) => k !== 'Post name / number').slice(0, 11)
        .map(([k, v]) => [
          { text: k, options: { color: PP.CYAN, fontSize: 9, bold: true } },
          { text: v.length > 160 ? v.slice(0, 160) + '…' : v, options: { color: PP.TEXT, fontSize: 9 } },
        ]);
      if (rows.length) s.addTable(rows, { x: 0.4, y: 0.95, w: 5.3, colW: [1.9, 3.4], fill: { color: PP.PANEL }, border: { type: 'solid', color: '224', pt: 0.5 }, valign: 'top' });
      const shots = mediaFor(prep, 'posts', p.id).filter((m) => m.kind === 'photo').slice(0, 2);
      shots.forEach((m, j) => {
        s.addImage({ data: m.dataURL, x: 6.0, y: 0.95 + j * 2.3, w: 3.6, h: 2.1, sizing: { type: 'contain', w: 3.6, h: 2.1 } });
      });
    });

    /* --- CCTV summary table + photo slides --- */
    if ((survey.cctv || []).length) {
      const s = bgSlide();
      title(s, 'CCTV Inventory');
      const header = ['#', 'Camera', 'Type', 'Facing', 'Covers', 'Condition'].map((t) =>
        ({ text: t, options: { bold: true, color: PP.BG, fill: { color: PP.CYAN }, fontSize: 10 } }));
      const rows = survey.cctv.map((c, i) => [
        `C${i + 1}`, c.label || '', c.cameraType || '', c.headingDeg != null ? U.fmtHeading(c.headingDeg) : '—',
        (c.coverage || '').slice(0, 60), c.condition || '',
      ].map((v) => ({ text: String(v), options: { color: PP.TEXT, fontSize: 9 } })));
      s.addTable([header, ...rows.slice(0, 14)], { x: 0.4, y: 0.95, w: PP.W - 0.8, fill: { color: PP.PANEL }, border: { type: 'solid', color: '224', pt: 0.5 } });

      /* photo contact sheets, 4-up */
      const camShots = [];
      survey.cctv.forEach((c, i) => {
        for (const m of mediaFor(prep, 'cctv', c.id).filter((x) => x.kind === 'photo')) {
          camShots.push({ m, label: `C${i + 1} ${c.label || ''}` });
        }
      });
      for (let i = 0; i < camShots.length; i += 4) {
        const s2 = bgSlide();
        title(s2, 'CCTV Photos');
        camShots.slice(i, i + 4).forEach((cs, j) => {
          const x = 0.4 + (j % 2) * 4.7, y = 0.95 + Math.floor(j / 2) * 2.35;
          s2.addImage({ data: cs.m.dataURL, x, y, w: 4.4, h: 1.95, sizing: { type: 'contain', w: 4.4, h: 1.95 } });
          s2.addText(cs.label, { x, y: y + 1.95, w: 4.4, h: 0.3, fontSize: 9, color: PP.MUTED });
        });
      }
    }

    /* --- ACS table --- */
    if ((survey.acs || []).length) {
      const s = bgSlide();
      title(s, 'Access Control Points');
      const header = ['#', 'Point', 'Type', 'Credentials', 'Manned by', 'Tailgating risk'].map((t) =>
        ({ text: t, options: { bold: true, color: PP.BG, fill: { color: PP.CYAN }, fontSize: 10 } }));
      const rows = survey.acs.map((a, i) => [
        `A${i + 1}`, a.label || '', a.type || '', (a.credentials || []).join(', '), a.mannedBy || '', a.tailgatingRisk || '',
      ].map((v) => ({ text: String(v), options: { color: PP.TEXT, fontSize: 9 } })));
      s.addTable([header, ...rows.slice(0, 14)], { x: 0.4, y: 0.95, w: PP.W - 0.8, fill: { color: PP.PANEL }, border: { type: 'solid', color: '224', pt: 0.5 } });
    }

    /* --- comms & traffic --- */
    const commsRows = fieldRows(Schema.section('comms'), survey.comms);
    if (commsRows.length) {
      const s = bgSlide();
      title(s, 'Communications');
      const rows = commsRows.slice(0, 11).map(([k, v]) => [
        { text: k, options: { color: PP.CYAN, fontSize: 10, bold: true } },
        { text: v.length > 200 ? v.slice(0, 200) + '…' : v, options: { color: PP.TEXT, fontSize: 10 } },
      ]);
      s.addTable(rows, { x: 0.4, y: 0.95, w: PP.W - 0.8, colW: [2.6, 6.6], fill: { color: PP.PANEL }, border: { type: 'solid', color: '224', pt: 0.5 }, valign: 'top' });
    }
    if ((survey.traffic || []).length) {
      const s = bgSlide();
      title(s, 'Traffic & Peak Flow');
      const header = ['Point', 'Mode', 'Peak periods', 'Volume', 'Screening'].map((t) =>
        ({ text: t, options: { bold: true, color: PP.BG, fill: { color: PP.CYAN }, fontSize: 10 } }));
      const rows = survey.traffic.map((t) => [t.point || '', t.mode || '', t.peakPeriods || '', t.volume || '', t.screening || '']
        .map((v) => ({ text: String(v), options: { color: PP.TEXT, fontSize: 9 } })));
      s.addTable([header, ...rows], { x: 0.4, y: 0.95, w: PP.W - 0.8, fill: { color: PP.PANEL }, border: { type: 'solid', color: '224', pt: 0.5 } });
    }

    /* --- notes / risks --- */
    const flagged = (survey.notes || []).filter((n) => ['Hazard / safety', 'Vulnerability', 'Pricing consideration'].includes(n.category));
    if (flagged.length) {
      const s = bgSlide();
      title(s, 'Key Findings & Considerations');
      s.addText(flagged.map((n) => ({
        text: `${n.category}: ${n.title || ''} — ${(n.body || '').slice(0, 140)}`,
        options: { bullet: true, color: PP.TEXT, fontSize: 11, breakLine: true },
      })), { x: 0.5, y: 1.0, w: 9, h: 4.2, valign: 'top' });
    }

    onStatus && onStatus('Writing .pptx…');
    await pptx.writeFile({ fileName: fileBase(survey) + '.pptx' });
    onStatus && onStatus('PowerPoint downloaded.');
  }

  /* =========================================================
   * 3. INTERACTIVE HTML (single self-contained file)
   * ========================================================= */

  async function exportHtml(survey, onStatus, opts = {}) {
    onStatus && onStatus('Preparing media…');
    const prep = await prepare(survey, { photoMax: 1280, includeVideos: !!opts.includeVideos });
    const meta = survey.meta || {};

    /* payload: survey + lightweight media descriptors with dataURLs */
    const payload = {
      survey: JSON.parse(JSON.stringify(survey)),
      media: [...prep.photos, ...prep.videos].map((m) => ({
        id: m.id, kind: m.kind, name: m.name, mime: m.mime,
        lat: m.lat, lng: m.lng, acc: m.acc, heading: m.heading,
        capturedAt: m.capturedAt, caption: m.caption, attachedTo: m.attachedTo,
        dataURL: m.dataURL,
      })),
      sections: Schema.sections.map((s) => ({
        id: s.id, kind: s.kind, icon: s.icon, title: s.title, badge: s.badge,
        titleField: s.titleField, subtitleFields: s.subtitleFields,
        fields: s.fields.map((f) => ({ key: f.key, label: f.label, type: f.type })),
      })),
      staffing: Schema.staffingRows(survey),
      plotSVG: SitePlot.render(survey, prep.mediaRows, { width: 900, height: 620, interactive: false }),
      generatedAt: Date.now(),
    };

    onStatus && onStatus('Building report…');
    const json = JSON.stringify(payload).replace(/<\//g, '<\\/');

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${U.esc(meta.siteName || survey.name)} — Site Survey</title>
<style>
:root { --neon:#00c8dc; --bg:#0d1517; --panel:#13272b; --text:#e8f4f4; --muted:#93a6ab; --line:rgba(0,200,220,0.3); }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,Segoe UI,Roboto,sans-serif;}
header{padding:1.6rem 1rem 1rem;text-align:center;border-bottom:1px solid var(--line);}
header .k{letter-spacing:5px;color:var(--neon);font-size:0.75rem;font-family:monospace;}
header h1{margin:0.3rem 0;font-size:1.7rem;} header .sub{color:var(--muted);font-size:0.9rem;line-height:1.5;}
nav{display:flex;flex-wrap:wrap;gap:0.4rem;justify-content:center;padding:0.8rem;position:sticky;top:0;background:rgba(13,21,23,0.96);border-bottom:1px solid var(--line);z-index:5;}
nav button{background:none;border:1px solid var(--line);color:var(--text);border-radius:999px;padding:0.4rem 0.9rem;cursor:pointer;font-size:0.85rem;}
nav button.on{background:var(--neon);color:#00252b;font-weight:700;border-color:var(--neon);}
main{max-width:1000px;margin:0 auto;padding:1rem;}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1rem;margin-bottom:0.9rem;}
.card h3{margin:0 0 0.5rem;color:var(--neon);font-size:1rem;}
table{border-collapse:collapse;width:100%;font-size:0.85rem;}
th{background:rgba(0,200,220,0.15);color:var(--neon);text-align:left;padding:0.45rem 0.55rem;border:1px solid var(--line);}
td{padding:0.45rem 0.55rem;border:1px solid rgba(0,200,220,0.15);vertical-align:top;}
.kv td:first-child{color:var(--muted);font-family:monospace;font-size:0.75rem;width:200px;}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.5rem;}
.gallery .cell{position:relative;aspect-ratio:4/3;cursor:pointer;}
.gallery img,.gallery video{width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid var(--line);}
.gallery .cap{position:absolute;left:4px;bottom:4px;right:4px;background:rgba(0,0,0,0.7);color:var(--neon);font-family:monospace;font-size:0.62rem;border-radius:5px;padding:0.1rem 0.3rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lb{position:fixed;inset:0;background:rgba(0,0,0,0.93);display:none;flex-direction:column;z-index:50;}
.lb.on{display:flex;} .lb .stage{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:0.6rem;}
.lb img,.lb video{max-width:100%;max-height:100%;border-radius:6px;}
.lb .meta{font-family:monospace;font-size:0.78rem;color:var(--neon);padding:0.6rem 1rem;line-height:1.5;}
.lb button{position:absolute;top:0.7rem;right:0.9rem;background:none;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:0.4rem 0.8rem;cursor:pointer;}
.plot{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#0a0f10;}
.plot svg{width:100%;height:auto;display:block;}
.legend{display:flex;flex-wrap:wrap;gap:0.9rem;font-family:monospace;font-size:0.75rem;color:var(--muted);padding:0.6rem 0.1rem;}
.legend i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:4px;}
.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:0.1rem 0.6rem;font-size:0.72rem;color:var(--muted);font-family:monospace;margin:0.1rem;}
.section-block{display:none;} .section-block.on{display:block;}
h2.sec{color:var(--neon);font-family:monospace;font-size:1.05rem;border-bottom:1px solid var(--line);padding-bottom:0.3rem;}
footer{color:var(--muted);text-align:center;font-size:0.75rem;padding:2rem 1rem;}
@media print { nav{display:none} .section-block{display:block!important} body{background:#fff;color:#111} }
</style></head><body>
<header>
  <div class="k">SECURITY SITE SURVEY</div>
  <h1 id="t-site"></h1>
  <div class="sub" id="t-sub"></div>
</header>
<nav id="tabs"></nav>
<main id="main"></main>
<div class="lb" id="lb"><button onclick="document.getElementById('lb').classList.remove('on')">✕ close</button><div class="stage" id="lb-stage"></div><div class="meta" id="lb-meta"></div></div>
<footer>Generated by CharoAI Site Survey · <span id="t-gen"></span> · self-contained file — safe to email or archive</footer>
<script id="data" type="application/json">${json}</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const S = D.survey, M = D.media;
const esc = (s) => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const fmtC = (la,ln,ac) => la==null?'':la.toFixed(6)+', '+ln.toFixed(6)+(ac!=null?' (±'+Math.round(ac)+'m)':'');
const HN = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const fmtH = (d) => d==null?'':Math.round(d)+'° '+HN[Math.round(((d%360)+360)%360/22.5)%16];
const fmtT = (ts) => ts?new Date(ts).toLocaleString():'';
document.getElementById('t-site').textContent = S.meta.siteName || S.name;
document.getElementById('t-sub').innerHTML = [S.meta.address, [S.meta.client,S.meta.solicitation].filter(Boolean).join(' · '), 'Surveyed '+(S.meta.surveyDate||'')+' by '+(S.meta.surveyor||'')].filter(Boolean).map(esc).join('<br>');
document.getElementById('t-gen').textContent = fmtT(D.generatedAt);

const mediaFor = (sec, id) => M.filter((m)=>m.attachedTo && m.attachedTo.section===sec && m.attachedTo.entityId===id);
const stamp = (m) => [fmtT(m.capturedAt), fmtC(m.lat,m.lng,m.acc), m.heading!=null?'facing '+fmtH(m.heading):null].filter(Boolean).join(' · ');

function gallery(list){
  if(!list.length) return '';
  return '<div class="gallery">'+list.map((m)=>{
    const idx = M.indexOf(m);
    if(m.kind==='video'){
      if(!m.dataURL) return '<div class="cell" style="display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:8px;color:var(--muted);font-size:0.7rem;padding:0.4rem;text-align:center;">🎬 '+esc(m.name)+'<br>(video not embedded)</div>';
      return '<div class="cell" onclick="openLb('+idx+')"><video src="'+m.dataURL+'" muted></video><div class="cap">🎬 '+esc(m.caption||m.name)+'</div></div>';
    }
    return '<div class="cell" onclick="openLb('+idx+')"><img loading="lazy" src="'+m.dataURL+'"><div class="cap">'+esc(m.caption||stamp(m))+'</div></div>';
  }).join('')+'</div>';
}
window.openLb = (i) => {
  const m = M[i]; if(!m || !m.dataURL) return;
  const st = document.getElementById('lb-stage');
  st.innerHTML = m.kind==='video' ? '<video src="'+m.dataURL+'" controls autoplay></video>' : '<img src="'+m.dataURL+'">';
  document.getElementById('lb-meta').textContent = (m.caption?m.caption+' — ':'')+stamp(m);
  document.getElementById('lb').classList.add('on');
};

function kvTable(sec, obj){
  const rows = [];
  for(const f of sec.fields){
    let v = (obj||{})[f.key];
    if(v==null||v===''||(Array.isArray(v)&&!v.length)) continue;
    if(f.type==='geo') v = fmtC(v.lat,v.lng,v.acc);
    else if(f.type==='heading') v = fmtH(v);
    else if(Array.isArray(v)) v = v.join(', ');
    rows.push('<tr><td>'+esc(f.label)+'</td><td>'+esc(v).replace(/\\n/g,'<br>')+'</td></tr>');
  }
  return rows.length ? '<table class="kv">'+rows.join('')+'</table>' : '<p style="color:var(--muted)">No data recorded.</p>';
}

const secDef = (id) => D.sections.find((s)=>s.id===id);
const tabs = [
  {id:'overview', label:'Overview'},
  {id:'map', label:'Site Map'},
  {id:'posts', label:'Posts ('+(S.posts||[]).length+')'},
  {id:'cctv', label:'CCTV ('+(S.cctv||[]).length+')'},
  {id:'acs', label:'ACS ('+(S.acs||[]).length+')'},
  {id:'ops', label:'Ops & Comms'},
  {id:'gallery', label:'All Media ('+M.length+')'},
];
const main = document.getElementById('main');
const nav = document.getElementById('tabs');
const blocks = {};

function entityBlock(id, title){
  const sec = secDef(id);
  const list = S[id]||[];
  let out = '<h2 class="sec">'+title+'</h2>';
  if(!list.length) out += '<p style="color:var(--muted)">None recorded.</p>';
  list.forEach((e,i)=>{
    out += '<div class="card"><h3>'+sec.badge+(i+1)+' — '+esc(e[sec.titleField]||'')+'</h3>'+kvTable(sec,e)+gallery(mediaFor(id,e.id))+'</div>';
  });
  return out;
}

blocks.overview = (()=>{
  let out = '<h2 class="sec">Site Information</h2><div class="card">'+kvTable(secDef('meta'), S.meta)+'</div>';
  if((S.contacts||[]).length){
    out += '<h2 class="sec">Contacts</h2><div class="card"><table><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr>'+
      S.contacts.map((c)=>'<tr><td>'+esc(c.name)+'</td><td>'+esc(c.role)+'</td><td>'+esc(c.phone)+'</td><td>'+esc(c.email)+'</td></tr>').join('')+'</table></div>';
  }
  if(D.staffing.length){
    out += '<h2 class="sec">Post & Staffing Summary</h2><div class="card"><table><tr><th>Post</th><th>CLIN</th><th>Coverage</th><th>Officers</th><th>Wkly hrs</th><th>FTE</th><th>Armed</th></tr>'+
      D.staffing.map((r)=>'<tr><td>'+esc(r.post)+'</td><td>'+esc(r.clin)+'</td><td>'+esc(r.hours)+'</td><td>'+esc(r.officers)+'</td><td>'+esc(r.weeklyHours)+'</td><td>'+esc(r.fte)+'</td><td>'+esc(r.armed)+'</td></tr>').join('')+'</table></div>';
  }
  if((S.notes||[]).length){
    const secN = secDef('notes');
    out += '<h2 class="sec">Field Notes & Hazards</h2>';
    S.notes.forEach((n,i)=>{
      out += '<div class="card"><h3>N'+(i+1)+' — '+esc(n.title||'Note')+(n.category?' <span class="pill">'+esc(n.category)+'</span>':'')+'</h3>'+
        (n.location?'<p class="pill">📍 '+fmtC(n.location.lat,n.location.lng,n.location.acc)+'</p>':'')+
        '<p style="line-height:1.5;">'+esc(n.body||'').replace(/\\n/g,'<br>')+'</p>'+gallery(mediaFor('notes',n.id))+'</div>';
    });
  }
  return out;
})();

blocks.map = '<h2 class="sec">Site Map</h2><div class="plot">'+D.plotSVG+'</div>'+
  '<div class="legend"><span><i style="background:#00ffff"></i>P post</span><span><i style="background:#f08fff"></i>C camera + FOV</span><span><i style="background:#ffd35e"></i>A access</span><span><i style="background:#58ec8f"></i>T flow</span><span><i style="background:#ff5c8a"></i>N note</span><span><i style="background:#8899aa"></i>· media</span></div>'+
  '<p style="color:var(--muted);font-size:0.8rem;">Local-plane plot from GPS captures (north up). Wedges show camera orientation and approximate field of view.</p>';

blocks.posts = entityBlock('posts','Guard Posts');
blocks.cctv = entityBlock('cctv','CCTV / Cameras');
blocks.acs = entityBlock('acs','Access Control Points') + entityBlock('vms','VMS / Monitoring');
blocks.ops = '<h2 class="sec">Communications</h2><div class="card">'+kvTable(secDef('comms'),S.comms)+'</div>'+
  '<h2 class="sec">Duties & Operations</h2><div class="card">'+kvTable(secDef('ops'),S.ops)+'</div>'+
  entityBlock('traffic','Traffic & Flow');
blocks.gallery = '<h2 class="sec">All Media</h2>'+gallery(M);

for(const t of tabs){
  const b = document.createElement('button');
  b.textContent = t.label;
  b.onclick = () => show(t.id, b);
  nav.append(b);
  const d = document.createElement('div');
  d.className = 'section-block'; d.id = 'blk-'+t.id;
  d.innerHTML = blocks[t.id] || '';
  main.append(d);
}
function show(id, btn){
  document.querySelectorAll('.section-block').forEach((x)=>x.classList.remove('on'));
  document.querySelectorAll('nav button').forEach((x)=>x.classList.remove('on'));
  document.getElementById('blk-'+id).classList.add('on');
  btn.classList.add('on');
  window.scrollTo(0,0);
}
show('overview', nav.firstChild);
</script></body></html>`;

    U.download(new Blob([html], { type: 'text/html' }), fileBase(survey) + '.html');
    onStatus && onStatus('Interactive HTML report downloaded.');
    return html;
  }

  /* build (not download) the report html — used by sync push */
  async function buildHtmlString(survey, opts = {}) {
    let captured = '';
    const orig = U.download;
    U.download = () => {};
    try {
      captured = await exportHtml(survey, null, opts);
    } finally {
      U.download = orig;
    }
    return captured;
  }

  /* =========================================================
   * 4. JSON BUNDLE (backup / import — full-fidelity)
   * ========================================================= */

  async function exportBundle(survey, onStatus) {
    onStatus && onStatus('Packing bundle (full-resolution media)…');
    const media = await DB.listMedia(survey.id);
    const packed = [];
    for (const m of media) {
      packed.push({
        ...m,
        blob: undefined,
        thumb: undefined,
        data: await U.blobToDataURL(m.blob),
      });
    }
    const bundle = { format: 'charoai-site-survey', version: 1, exportedAt: Date.now(), survey, media: packed };
    U.download(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), fileBase(survey) + '.survey.json');
    onStatus && onStatus('Bundle downloaded.');
  }

  async function importBundle(file) {
    const text = await file.text();
    const bundle = JSON.parse(text);
    if (bundle.format !== 'charoai-site-survey') throw new Error('Not a site-survey bundle');
    const survey = bundle.survey;
    survey.id = survey.id || U.uuid();
    await DB.putSurvey(survey);
    for (const m of bundle.media || []) {
      const blob = U.dataURLToBlob(m.data);
      let thumb = null;
      if (m.kind === 'photo') {
        try { thumb = await U.downscaleImage(blob, 320, 0.7); } catch (e) { /* ignore */ }
      }
      await DB.putMedia({ ...m, data: undefined, blob, thumb, surveyId: survey.id });
    }
    return survey;
  }

  return { exportDoc, exportPptx, exportHtml, buildHtmlString, exportBundle, importBundle, prepare };
})();
