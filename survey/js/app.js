/* app.js — main application: views, navigation, capture UI, settings.
 * Views: home (survey list) → tabs [guide | survey | capture | map | export]
 *        survey → section (list/form) → entity (form + media)
 */
'use strict';

const App = (() => {
  const { h } = U;

  const state = {
    survey: null,        // active survey doc (live object, saved debounced)
    tab: 'guide',
    view: { name: 'home' },   // {name:'home'|'tab'|'section'|'entity', sectionId, entityId}
    saveTimer: null,
    captureTarget: null, // {section, entityId, label} | null
  };

  /* ---------------- persistence ---------------- */

  function saveSoon() {
    if (!state.survey) return;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => DB.putSurvey(state.survey), 400);
  }

  async function saveNow() {
    clearTimeout(state.saveTimer);
    if (state.survey) await DB.putSurvey(state.survey);
  }

  /* ---------------- navigation ---------------- */

  function go(view, push = true) {
    state.view = view;
    if (push) history.pushState({ v: view }, '');
    render();
  }

  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.v) {
      state.view = e.state.v;
      render();
    } else {
      state.view = state.survey ? { name: 'tab' } : { name: 'home' };
      render();
    }
  });

  function setTab(tab) {
    state.tab = tab;
    if (tab === 'capture') state.captureStayAlive = true;
    go({ name: 'tab' });
  }

  /* Resolve guide action targets. */
  function goTarget(t) {
    if (t.capture) { setTab('capture'); return; }
    if (t.map) { setTab('map'); return; }
    if (t.exportTab) { setTab('export'); return; }
    if (t.survey) { setTab('survey'); return; }
    if (t.section) {
      const sec = Schema.section(t.section);
      if (sec.kind === 'form') { state.tab = 'survey'; go({ name: 'section', sectionId: t.section }); }
      else if (t.add) { addEntity(t.section); }
      else { state.tab = 'survey'; go({ name: 'section', sectionId: t.section }); }
    }
  }

  function addEntity(sectionId) {
    const ent = Schema.newEntity(sectionId);
    state.survey[sectionId] = state.survey[sectionId] || [];
    state.survey[sectionId].push(ent);
    saveSoon();
    state.tab = 'survey';
    go({ name: 'entity', sectionId, entityId: ent.id });
  }

  /* ---------------- header / sensor pills ---------------- */

  function renderHeader() {
    const el = document.getElementById('hdr-status');
    el.innerHTML = '';
    const fix = Sensors.fix;
    const gpsPill = h('span', { class: 'pill ' + (fix ? (fix.acc <= 15 ? 'on' : 'warn') : 'off') },
      h('span', { class: 'dot' }), fix ? `±${Math.round(fix.acc)}m` : 'GPS');
    const cmpPill = h('span', {
      class: 'pill ' + (Sensors.compassEnabled && Sensors.heading != null ? 'on' : 'off'),
      onclick: async () => {
        const ok = await Sensors.enableCompass();
        U.toast(ok ? 'Compass enabled' : 'Compass unavailable on this device', !ok);
        renderHeader();
      },
      style: 'cursor:pointer',
    }, h('span', { class: 'dot' }), Sensors.heading != null ? `${Math.round(Sensors.heading)}°` : 'compass');
    el.append(gpsPill, cmpPill);

    const nameEl = document.getElementById('hdr-survey-name');
    nameEl.textContent = state.survey ? (state.survey.meta.siteName || state.survey.name) : '';
  }

  /* ---------------- views ---------------- */

  function render() {
    const view = document.getElementById('view');
    const tabbar = document.getElementById('tabbar');
    view.innerHTML = '';
    tabbar.style.display = state.view.name === 'home' ? 'none' : 'flex';
    document.querySelectorAll('#tabbar button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === state.tab);
    });

    if (state.view.name !== 'tab' || state.tab !== 'capture') stopCaptureIfRunning();

    switch (state.view.name) {
      case 'home': return renderHome(view);
      case 'tab':
        switch (state.tab) {
          case 'guide': return renderGuide(view);
          case 'survey': return renderSurvey(view);
          case 'capture': return renderCapture(view);
          case 'map': return renderMap(view);
          case 'export': return renderExport(view);
        }
        return;
      case 'section': return renderSection(view, state.view.sectionId);
      case 'entity': return renderEntity(view, state.view.sectionId, state.view.entityId);
    }
  }

  /* ----- home: survey picker ----- */

  async function renderHome(view) {
    const surveys = await DB.listSurveys();
    view.append(h('h2', { class: 'panel-title' }, 'Site Surveys'));
    view.append(h('p', { class: 'subtle' },
      'Guided prebid security site surveys — geotagged photos, posts, CCTV, access control, comms, and one-tap reports. ',
      'Everything stays on this device unless you export or sync.'));

    view.append(h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn primary block', onclick: async () => {
          const name = await U.prompt('Site / survey name', '');
          if (!name) return;
          const s = Schema.emptySurvey(name);
          s.meta.siteName = name;
          await DB.putSurvey(s);
          openSurvey(s);
        },
      }, '＋ New site survey')));

    if (!surveys.length) {
      view.append(h('div', { class: 'empty-note' }, 'No surveys yet. Create one, then follow the Guide tab on site.'));
    }
    for (const s of surveys) {
      const pct = Math.round(Schema.surveyCompleteness(s) * 100);
      view.append(h('div', {
        class: 'card tappable', onclick: async () => openSurvey(await DB.getSurvey(s.id)),
      },
        h('h3', {}, s.meta.siteName || s.name),
        h('div', { class: 'subtle' },
          `${s.meta.surveyDate || U.fmtDate(s.createdAt)} · ${(s.posts || []).length} posts · ${(s.cctv || []).length} cameras · updated ${U.fmtDateTime(s.updatedAt)}`),
        h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: `width:${pct}%` })),
        h('div', { class: 'row', style: 'margin-top:0.5rem; justify-content:space-between;' },
          h('span', { class: 'completeness-ring' }, `${pct}% complete`),
          h('button', {
            class: 'btn small danger', onclick: async (e) => {
              e.stopPropagation();
              if (await U.confirm(`Delete “${s.meta.siteName || s.name}” and all its media from this device? Export a bundle first if you need a backup.`)) {
                await DB.deleteSurvey(s.id);
                render();
              }
            },
          }, 'Delete'))));
    }

    /* import bundle */
    const fileIn = h('input', {
      type: 'file', accept: '.json,application/json', style: 'display:none',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const s = await Exporter.importBundle(f);
          U.toast('Imported ' + (s.meta.siteName || s.name));
          render();
        } catch (err) { U.toast('Import failed: ' + err.message, true); }
      },
    });
    view.append(h('div', { class: 'divider' }));
    view.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => fileIn.click() }, '⬆ Import survey bundle (.json)'),
      fileIn));
  }

  function openSurvey(s) {
    state.survey = s;
    state.tab = 'guide';
    renderHeader();
    go({ name: 'tab' });
  }

  /* ----- guide tab ----- */

  function renderGuide(view) {
    const s = state.survey;
    view.append(h('h2', { class: 'panel-title' }, 'Guided Walkthrough'));
    const pct = Math.round(Schema.surveyCompleteness(s) * 100);
    view.append(h('p', { class: 'subtle' },
      'Work the phases top to bottom on site. Each one tells you what to capture, why it matters, and what to ask your escort. ',
      h('b', { style: 'color:var(--neon)' }, `Survey ${pct}% complete.`)));

    for (const phase of Guide.phases) {
      const prog = Guide.phaseProgress(s, phase);
      const open = !(s.guide.collapsed || {})[phase.id] && prog.done < prog.total;
      const body = h('div', { class: 'phase-body', style: open ? '' : 'display:none' });

      body.append(h('p', { class: 'why' }, phase.why));
      if (phase.time) body.append(h('div', { class: 'subtle', style: 'font-family:var(--mono);font-size:0.72rem;' }, '⏱ ' + phase.time));
      for (const tip of phase.tips) body.append(h('div', { class: 'tipbox', html: tip }));

      if (phase.ask && phase.ask.length) {
        body.append(h('h4', { style: 'margin:0.8rem 0 0.3rem;color:var(--neon-dim);font-size:0.8rem;' }, 'ASK THE ESCORT'));
        body.append(h('ul', { style: 'margin:0.2rem 0;padding-left:1.2rem;font-size:0.85rem;line-height:1.55;color:var(--text);' },
          ...phase.ask.map((q) => h('li', {}, q))));
      }

      body.append(h('h4', { style: 'margin:0.9rem 0 0.2rem;color:var(--neon-dim);font-size:0.8rem;' }, 'CHECKLIST'));
      phase.checklist.forEach((item, i) => {
        const key = `${phase.id}:${i}`;
        const done = !!s.guide.checks[key];
        const row = h('div', {
          class: 'check-item' + (done ? ' done' : ''),
          onclick: () => {
            s.guide.checks[key] = !s.guide.checks[key];
            saveSoon();
            render();
          },
        },
          h('span', { class: 'box' }, s.guide.checks[key] ? '✓' : ''),
          h('span', { class: 'label' }, item));
        body.append(row);
      });

      if (phase.actions && phase.actions.length) {
        body.append(h('div', { class: 'btn-row', style: 'margin-top:0.7rem;' },
          ...phase.actions.map((a) => h('button', { class: 'btn small', onclick: () => goTarget(a.target) }, a.label))));
      }

      const head = h('div', {
        class: 'phase-head',
        onclick: () => {
          s.guide.collapsed = s.guide.collapsed || {};
          s.guide.collapsed[phase.id] = body.style.display !== 'none';
          body.style.display = body.style.display === 'none' ? '' : 'none';
          saveSoon();
        },
      },
        h('span', { class: 'num' }, prog.done >= prog.total ? '✓' : String(phase.num)),
        h('div', { class: 't' },
          h('div', { class: 'name' }, phase.title),
          h('div', { class: 'meta' }, `${prog.done}/${prog.total} checklist items`)),
        h('span', { class: 'chev' }, '▾'));

      view.append(h('div', { class: 'phase' + (prog.done >= prog.total ? ' done' : '') }, head, body));
    }
  }

  /* ----- survey tab: section cards ----- */

  function renderSurvey(view) {
    const s = state.survey;
    view.append(h('h2', { class: 'panel-title' }, 'Survey Sections'));
    for (const sec of Schema.sections) {
      const pct = Math.round(Schema.sectionCompleteness(s, sec) * 100);
      const count = sec.kind === 'list' ? (s[sec.id] || []).length : null;
      view.append(h('div', {
        class: 'card tappable',
        onclick: () => go({ name: 'section', sectionId: sec.id }),
      },
        h('div', { class: 'row' },
          h('span', { style: 'font-size:1.4rem' }, sec.icon),
          h('div', { class: 'grow' },
            h('h3', {}, sec.title + (count != null ? ` (${count})` : '')),
            h('div', { class: 'subtle' }, sec.blurb)),
          h('span', { class: 'chev', style: 'color:var(--muted)' }, '›')),
        h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: `width:${pct}%` }))));
    }
  }

  function crumb(...parts) {
    const el = h('div', { class: 'crumb' });
    parts.forEach((p, i) => {
      if (i) el.append(h('span', { class: 'sep' }, '›'));
      if (p.onclick) el.append(h('a', { href: 'javascript:void 0', onclick: p.onclick }, p.label));
      else el.append(h('span', {}, p.label));
    });
    return el;
  }

  /* ----- section view ----- */

  function renderSection(view, sectionId) {
    const s = state.survey;
    const sec = Schema.section(sectionId);
    view.append(crumb(
      { label: 'Survey', onclick: () => { state.tab = 'survey'; go({ name: 'tab' }); } },
      { label: sec.title }));
    view.append(h('h2', { class: 'panel-title' }, sec.icon + ' ' + sec.title));
    view.append(h('p', { class: 'subtle' }, sec.blurb));

    if (sec.kind === 'form') {
      const target = s[sec.id] = s[sec.id] || {};
      const card = h('div', { class: 'card' });
      card.append(Forms.render(sec, target, saveSoon));
      view.append(card);
      view.append(mediaStripFor(sectionId, null));
      return;
    }

    /* list section */
    view.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: () => addEntity(sectionId) }, `＋ Add ${sec.entityName}`)));

    const list = s[sec.id] || [];
    if (!list.length) {
      view.append(h('div', { class: 'empty-note' }, `No ${sec.entityName.toLowerCase()}s yet.`));
    }
    list.forEach(async (ent, i) => {
      const row = h('div', {
        class: 'entity-row',
        onclick: () => go({ name: 'entity', sectionId, entityId: ent.id }),
      },
        h('span', { class: 'badge' }, `${sec.badge}${i + 1}`),
        h('div', { class: 'info' },
          h('div', { class: 'name' }, Schema.entityTitle(sec, ent)),
          h('div', { class: 'sub' }, Schema.entitySubtitle(sec, ent) || '—')),
        h('span', { class: 'chev' }, '›'));
      view.append(row);
      /* thumbnail if entity has attached photo */
      const media = (await DB.listMedia(s.id)).filter((m) =>
        m.attachedTo && m.attachedTo.section === sectionId && m.attachedTo.entityId === ent.id && m.thumb);
      if (media.length) {
        const img = h('img', { class: 'thumb' });
        img.src = URL.createObjectURL(media[media.length - 1].thumb);
        row.insertBefore(img, row.lastChild);
      }
    });
  }

  /* ----- entity view ----- */

  function renderEntity(view, sectionId, entityId) {
    const s = state.survey;
    const sec = Schema.section(sectionId);
    const list = s[sectionId] || [];
    const ent = list.find((e) => e.id === entityId);
    if (!ent) { go({ name: 'section', sectionId }, false); return; }
    const idx = list.indexOf(ent);

    view.append(crumb(
      { label: 'Survey', onclick: () => { state.tab = 'survey'; go({ name: 'tab' }); } },
      { label: sec.title, onclick: () => go({ name: 'section', sectionId }) },
      { label: `${sec.badge}${idx + 1}` }));
    view.append(h('h2', { class: 'panel-title' }, `${sec.icon} ${sec.badge}${idx + 1} — ${Schema.entityTitle(sec, ent)}`));

    const card = h('div', { class: 'card' });
    card.append(Forms.render(sec, ent, saveSoon));
    view.append(card);

    view.append(mediaStripFor(sectionId, entityId));

    view.append(h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn', onclick: () => {
          state.captureTarget = { section: sectionId, entityId, label: `${sec.badge}${idx + 1} ${Schema.entityTitle(sec, ent)}` };
          setTab('capture');
        },
      }, '📸 Capture for this ' + sec.entityName.toLowerCase()),
      h('button', {
        class: 'btn danger', onclick: async () => {
          if (!(await U.confirm(`Delete ${sec.entityName} “${Schema.entityTitle(sec, ent)}”? Attached media stays in the library.`))) return;
          list.splice(idx, 1);
          await saveNow();
          go({ name: 'section', sectionId }, false);
        },
      }, 'Delete')));
  }

  /* media strip for a section/entity, with attach-existing */
  function mediaStripFor(sectionId, entityId) {
    const wrap = h('div', { class: 'card' });
    wrap.append(h('h3', {}, '📎 Attached media'));
    const strip = h('div', { class: 'media-strip' });
    wrap.append(strip);

    (async () => {
      const all = await DB.listMedia(state.survey.id);
      const mine = all.filter((m) => m.attachedTo && m.attachedTo.section === sectionId &&
        (entityId == null ? m.attachedTo.entityId == null : m.attachedTo.entityId === entityId));
      if (!mine.length) strip.append(h('div', { class: 'subtle' }, 'Nothing attached yet — use “Capture” below or attach from the media library.'));
      for (const m of mine) strip.append(mediaCell(m, () => { wrap.replaceWith(mediaStripFor(sectionId, entityId)); }));
    })();

    wrap.append(h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn small', onclick: () => {
          state.captureTarget = { section: sectionId, entityId, label: Schema.section(sectionId).title };
          setTab('capture');
        },
      }, '📸 Capture'),
      h('button', {
        class: 'btn small', onclick: async () => {
          const all = (await DB.listMedia(state.survey.id)).filter((m) => !m.attachedTo);
          if (!all.length) return U.toast('No unattached media in the library.');
          openAttachPicker(all, async (m) => {
            m.attachedTo = { section: sectionId, entityId };
            await DB.putMedia(m);
            wrap.replaceWith(mediaStripFor(sectionId, entityId));
          });
        },
      }, 'Attach existing')));
    return wrap;
  }

  function mediaCell(m, onChanged) {
    const cell = h('div', { class: 'cell' });
    if (m.kind === 'photo' && m.thumb) {
      const img = h('img', { onclick: () => openLightbox(m, onChanged) });
      img.src = URL.createObjectURL(m.thumb);
      cell.append(img);
    } else {
      cell.append(h('div', { class: 'vid', onclick: () => openLightbox(m, onChanged) }, '🎬'));
    }
    return cell;
  }

  function openAttachPicker(mediaList, onPick) {
    const back = h('div', { class: 'modal-backdrop' });
    const grid = h('div', { class: 'media-grid' });
    for (const m of mediaList) {
      const cell = h('div', { class: 'cell', onclick: () => { back.remove(); onPick(m); } });
      if (m.thumb) {
        const img = h('img');
        img.src = URL.createObjectURL(m.thumb);
        cell.append(img);
      } else cell.append(h('div', { class: 'vid', style: 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#101617;border-radius:8px;' }, '🎬'));
      cell.append(h('span', { class: 'tag' }, U.fmtDateTime(m.capturedAt)));
      grid.append(cell);
    }
    back.append(h('div', { class: 'modal' }, h('h3', {}, 'Attach media'), grid,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => back.remove() }, 'Cancel'))));
    back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
    document.body.append(back);
  }

  function openLightbox(m, onChanged) {
    const lb = h('div', { class: 'lightbox' });
    const stage = h('div', { class: 'stage' });
    const url = URL.createObjectURL(m.blob);
    if (m.kind === 'photo') stage.append(h('img', { src: url }));
    else stage.append(h('video', { src: url, controls: true, playsinline: true }));
    const metaBits = [U.fmtDateTime(m.capturedAt)];
    if (m.lat != null) metaBits.push(U.fmtCoords(m.lat, m.lng, m.acc));
    if (m.heading != null) metaBits.push('facing ' + U.fmtHeading(m.heading));
    if (m.attachedTo) metaBits.push(`attached: ${m.attachedTo.section}`);
    lb.append(stage,
      h('div', { class: 'meta' }, (m.caption ? m.caption + ' — ' : '') + metaBits.join(' · ')),
      h('div', { class: 'bar' },
        h('button', {
          class: 'btn small', onclick: async () => {
            const cap = await U.prompt('Caption', m.caption || '');
            if (cap == null) return;
            m.caption = cap;
            await DB.putMedia(m);
            U.toast('Caption saved');
          },
        }, '✎ Caption'),
        m.attachedTo ? h('button', {
          class: 'btn small', onclick: async () => {
            m.attachedTo = null;
            await DB.putMedia(m);
            U.toast('Detached');
            lb.remove(); URL.revokeObjectURL(url);
            onChanged && onChanged();
          },
        }, 'Detach') : null,
        h('button', {
          class: 'btn small danger', onclick: async () => {
            if (!(await U.confirm('Delete this media file from the device?'))) return;
            await DB.deleteMedia(m.id);
            lb.remove(); URL.revokeObjectURL(url);
            onChanged && onChanged();
          },
        }, 'Delete'),
        h('button', { class: 'btn small', style: 'margin-left:auto', onclick: () => { lb.remove(); URL.revokeObjectURL(url); } }, 'Close')));
    document.body.append(lb);
  }

  /* ----- capture tab ----- */

  let vfVideo = null;

  function stopCaptureIfRunning() {
    if (Camera.previewActive()) Camera.stopPreview();
    vfVideo = null;
  }

  function renderCapture(view) {
    const s = state.survey;
    view.append(h('h2', { class: 'panel-title' }, 'Capture'));

    /* attach target selector */
    const targetLabel = state.captureTarget ? `→ ${state.captureTarget.label}` : '→ General site media';
    view.append(h('div', { class: 'row wrap', style: 'margin-bottom:0.6rem;' },
      h('span', { class: 'pill on' }, h('span', { class: 'dot' }), targetLabel),
      state.captureTarget ? h('button', {
        class: 'btn small', onclick: () => { state.captureTarget = null; render(); },
      }, 'clear target') : null));

    const video = h('video', { autoplay: true, muted: true, playsinline: true });
    vfVideo = video;
    const overlay = h('div', { class: 'vf-overlay' },
      h('span', { id: 'vf-gps' }, 'GPS…'),
      h('span', { id: 'vf-time' }, ''));
    const compass = h('div', { class: 'vf-compass' },
      h('span', { id: 'vf-hdg', style: 'font-size:1rem;' }, '—'),
      h('span', { id: 'vf-hdg-name' }, ''));
    const wrap = h('div', { class: 'viewfinder-wrap' }, video, overlay, compass);
    view.append(wrap);

    const updateOverlay = () => {
      const fix = Sensors.fix;
      const g = document.getElementById('vf-gps');
      const t = document.getElementById('vf-time');
      const hd = document.getElementById('vf-hdg');
      const hn = document.getElementById('vf-hdg-name');
      if (g) g.textContent = fix ? U.fmtCoords(fix.lat, fix.lng, fix.acc) : 'GPS: acquiring…';
      if (t) t.textContent = new Date().toLocaleTimeString();
      if (hd) hd.textContent = Sensors.heading != null ? Math.round(Sensors.heading) + '°' : '—';
      if (hn) hn.textContent = Sensors.heading != null ? U.headingName(Sensors.heading) : '';
    };
    const ovInterval = setInterval(() => {
      if (!document.getElementById('vf-gps')) { clearInterval(ovInterval); return; }
      updateOverlay();
    }, 500);

    /* start camera */
    let started = false;
    const startBtn = h('button', {
      class: 'btn primary block', onclick: async () => {
        try {
          await Sensors.enableCompass();
          await Camera.startPreview(video);
          started = true;
          startBtn.style.display = 'none';
          shutterRow.style.display = '';
        } catch (err) {
          U.toast('Camera unavailable: ' + err.message + ' — use the system-camera buttons below.', true);
        }
      },
    }, '▶ Start camera');

    const recTimer = h('span', { class: 'pill', style: 'display:none' }, h('span', { class: 'rec-dot' }, '●'), h('span', { id: 'rec-time' }, '0:00'));
    let recInterval = null;

    const photoBtn = h('button', {
      class: 'shutter', title: 'Photo',
      onclick: async () => {
        try {
          const { blob, snap, mime } = await Camera.capturePhoto(video, s.meta.siteName || '');
          const m = await Camera.saveCapture(s.id, 'photo', blob, mime, snap, state.captureTarget && { section: state.captureTarget.section, entityId: state.captureTarget.entityId });
          U.toast(`Photo saved ${snap.lat != null ? '· ' + U.fmtCoords(snap.lat, snap.lng) : '(no GPS)'} ${snap.heading != null ? '· ' + U.fmtHeading(snap.heading) : ''}`);
          refreshStrip();
        } catch (err) { U.toast('Capture failed: ' + err.message, true); }
      },
    });

    const videoBtn = h('button', {
      class: 'shutter video', title: 'Video',
      onclick: async () => {
        if (!Camera.videoRecordingSupported()) {
          return U.toast('In-browser recording unsupported here — use “System camera (video)” below.', true);
        }
        try {
          if (Camera.isRecording()) {
            const { blob, snap, mime } = await Camera.stopVideo();
            videoBtn.classList.remove('recording');
            recTimer.style.display = 'none';
            clearInterval(recInterval);
            const m = await Camera.saveCapture(s.id, 'video', blob, mime, snap, state.captureTarget && { section: state.captureTarget.section, entityId: state.captureTarget.entityId });
            U.toast(`Video saved (${U.fmtBytes(blob.size)})`);
            refreshStrip();
          } else {
            await Camera.startVideo(video);
            videoBtn.classList.add('recording');
            recTimer.style.display = '';
            const t0 = Date.now();
            recInterval = setInterval(() => {
              const el = document.getElementById('rec-time');
              if (!el) { clearInterval(recInterval); return; }
              const sec = Math.floor((Date.now() - t0) / 1000);
              el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
            }, 500);
          }
        } catch (err) { U.toast('Video failed: ' + err.message, true); }
      },
    });

    const shutterRow = h('div', { class: 'shutter-row', style: 'display:none' }, videoBtn, photoBtn, recTimer);
    view.append(startBtn, shutterRow);

    /* fallback: system camera inputs */
    const sysPhoto = h('input', {
      type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const { blob, snap, mime } = await Camera.stampImportedPhoto(f, s.meta.siteName || '');
          await Camera.saveCapture(s.id, 'photo', blob, mime, snap, state.captureTarget && { section: state.captureTarget.section, entityId: state.captureTarget.entityId });
          U.toast('Photo imported & stamped');
          refreshStrip();
        } catch (err) { U.toast('Import failed: ' + err.message, true); }
        e.target.value = '';
      },
    });
    const sysVideo = h('input', {
      type: 'file', accept: 'video/*', capture: 'environment', style: 'display:none',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const snap = Sensors.snapshot();
        await Camera.saveCapture(s.id, 'video', f, f.type || 'video/mp4', snap, state.captureTarget && { section: state.captureTarget.section, entityId: state.captureTarget.entityId });
        U.toast('Video saved with current location stamp');
        refreshStrip();
        e.target.value = '';
      },
    });
    view.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onclick: () => sysPhoto.click() }, 'System camera (photo)'),
      h('button', { class: 'btn small', onclick: () => sysVideo.click() }, 'System camera (video)'),
      sysPhoto, sysVideo));
    view.append(h('p', { class: 'subtle' },
      'In-app captures stamp time, GPS, and compass direction onto the image and store the same data as searchable metadata. ',
      'System-camera fallbacks stamp with your location at import time.'));

    /* media library */
    view.append(h('div', { class: 'divider' }));
    view.append(h('h3', { style: 'color:var(--neon);font-size:1rem;' }, 'Media library'));
    const grid = h('div', { class: 'media-grid' });
    view.append(grid);

    async function refreshStrip() {
      grid.innerHTML = '';
      const all = (await DB.listMedia(s.id)).slice().reverse();
      if (!all.length) grid.append(h('div', { class: 'empty-note', style: 'grid-column:1/-1' }, 'No media yet.'));
      for (const m of all) {
        const cell = h('div', { class: 'cell', onclick: () => openLightbox(m, refreshStrip) });
        if (m.kind === 'photo' && m.thumb) {
          const img = h('img');
          img.src = URL.createObjectURL(m.thumb);
          cell.append(img);
        } else {
          cell.append(h('div', { class: 'vid', style: 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#101617;border-radius:8px;border:1px solid var(--line-soft);' }, '🎬'));
        }
        cell.append(h('span', { class: 'kind' }, m.attachedTo ? '📎' : ''));
        cell.append(h('span', { class: 'tag' }, m.caption || U.fmtDateTime(m.capturedAt)));
        grid.append(cell);
      }
    }
    refreshStrip();
  }

  /* ----- map tab ----- */

  async function renderMap(view) {
    const s = state.survey;
    view.append(h('h2', { class: 'panel-title' }, 'Site Map'));
    const media = await DB.listMedia(s.id);
    const wrap = h('div', { class: 'siteplot-wrap', html: SitePlot.render(s, media, { width: 900, height: 640, interactive: true }) });
    view.append(wrap);
    const legend = h('div', { class: 'plot-legend' });
    for (const [letter, color, label] of SitePlot.legend()) {
      legend.append(h('span', { class: 'k' }, h('span', { class: 'sw', style: `background:${color}` }), `${letter} ${label}`));
    }
    view.append(legend);
    view.append(h('p', { class: 'subtle' },
      'Offline local-plane plot built from your GPS captures (north up). Camera wedges show orientation and approximate field of view. ',
      'The same map is embedded in every export.'));
  }

  /* ----- export tab ----- */

  function renderExport(view) {
    const s = state.survey;
    view.append(h('h2', { class: 'panel-title' }, 'Export & Sync'));
    const status = h('div', { class: 'export-status' }, '');
    const setStatus = (msg) => { status.textContent = msg || ''; };

    const includeVideos = h('input', { type: 'checkbox' });

    const busy = (btn, fn) => async () => {
      btn.disabled = true;
      try { await fn(); }
      catch (err) { console.error(err); setStatus(''); U.toast('Failed: ' + err.message, true); }
      finally { btn.disabled = false; }
    };

    const docBtn = h('button', { class: 'btn block' }, '📄 Word document (.doc)');
    docBtn.onclick = busy(docBtn, () => Exporter.exportDoc(s, setStatus));
    const pptBtn = h('button', { class: 'btn block' }, '📊 PowerPoint (.pptx)');
    pptBtn.onclick = busy(pptBtn, () => Exporter.exportPptx(s, setStatus));
    const htmlBtn = h('button', { class: 'btn block' }, '🌐 Interactive HTML report');
    htmlBtn.onclick = busy(htmlBtn, () => Exporter.exportHtml(s, setStatus, { includeVideos: includeVideos.checked }));
    const bundleBtn = h('button', { class: 'btn block' }, '💾 JSON bundle (full backup)');
    bundleBtn.onclick = busy(bundleBtn, () => Exporter.exportBundle(s, setStatus));

    view.append(h('div', { class: 'card' },
      h('h3', {}, 'Deliverables'),
      h('p', { class: 'subtle' }, 'Generated entirely on this device — no connection needed.'),
      h('div', { class: 'btn-row', style: 'flex-direction:column;align-items:stretch;' }, docBtn, pptBtn, htmlBtn, bundleBtn),
      h('label', { class: 'toggle', style: 'margin-top:0.4rem;' }, includeVideos, h('span', { class: 'track' }),
        h('span', { class: 'subtle' }, 'Embed videos in HTML report (large files)')),
      status));

    /* sync */
    const syncCard = h('div', { class: 'card' });
    syncCard.append(h('h3', {}, '🏠 Sync to home machine (Tailscale)'));
    const syncStatus = h('div', { class: 'export-status' });
    const prog = h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: 'width:0%' }));
    const syncBtn = h('button', { class: 'btn primary block' }, '⇪ Sync now');
    syncBtn.onclick = busy(syncBtn, async () => {
      await saveNow();
      await Sync.push(s, (msg, frac) => {
        syncStatus.textContent = msg;
        prog.firstChild.style.width = Math.round((frac || 0) * 100) + '%';
      });
      U.toast('Sync complete');
    });
    syncCard.append(
      h('p', { class: 'subtle' }, 'Pushes the survey, new media, and the HTML report to the receiver on your tailnet. Configure the endpoint in Settings (⚙). Data otherwise stays on-device.'),
      syncBtn, prog, syncStatus);
    view.append(syncCard);
  }

  /* ----- settings modal ----- */

  async function openSettings() {
    const cfg = await Sync.getConfig();
    const back = h('div', { class: 'modal-backdrop' });
    const urlIn = h('input', { type: 'url', value: cfg.baseUrl || '', placeholder: 'https://machine.tailnet.ts.net' });
    const tokIn = h('input', { type: 'password', value: cfg.token || '', placeholder: 'shared secret from receiver --token' });
    const repIn = h('input', { type: 'checkbox', checked: cfg.includeReport !== false });
    const testOut = h('div', { class: 'export-status' });

    const usage = await DB.estimateUsage();

    back.append(h('div', { class: 'modal' },
      h('h3', {}, '⚙ Settings'),
      h('div', { class: 'field' }, h('label', {}, 'Sync endpoint (Tailscale HTTPS URL)'), urlIn,
        h('div', { class: 'hint' }, 'Run receiver.py on your home machine + “tailscale serve”. See survey/receiver/README.md in the repo. Leave blank to keep everything on-device.')),
      h('div', { class: 'field' }, h('label', {}, 'Auth token'), tokIn),
      h('label', { class: 'toggle', style: 'margin-bottom:0.8rem;' }, repIn, h('span', { class: 'track' }), h('span', {}, 'Include HTML report when syncing')),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn small', onclick: async (e) => {
            e.target.disabled = true;
            testOut.textContent = 'Testing…';
            try {
              const r = await Sync.ping({ baseUrl: urlIn.value, token: tokIn.value });
              testOut.textContent = `✓ Connected to ${r.name || 'receiver'} — saving to ${r.root || '?'}`;
            } catch (err) {
              testOut.textContent = '✗ ' + err.message + ' (is the phone on the tailnet? is tailscale serve running?)';
            }
            e.target.disabled = false;
          },
        }, 'Test connection'),
        h('button', {
          class: 'btn small primary', onclick: async () => {
            await Sync.setConfig({ baseUrl: urlIn.value.trim(), token: tokIn.value.trim(), includeReport: repIn.checked });
            U.toast('Settings saved');
            back.remove();
          },
        }, 'Save')),
      testOut,
      h('div', { class: 'divider' }),
      h('div', { class: 'subtle' },
        usage ? `Storage used: ${U.fmtBytes(usage.usage)} of ~${U.fmtBytes(usage.quota)} available. ` : '',
        'All survey data lives in this browser’s storage on this device.'),
      h('div', { class: 'btn-row', style: 'margin-top:0.6rem;' },
        h('button', {
          class: 'btn small', onclick: async () => {
            const ok = await DB.requestPersistence();
            U.toast(ok ? 'Persistent storage granted — the OS won’t evict survey data.' : 'Persistence not granted (browser decides). Export bundles as backup.', !ok);
          },
        }, 'Request persistent storage'),
        state.survey ? h('button', {
          class: 'btn small', onclick: () => { back.remove(); state.survey = null; renderHeader(); go({ name: 'home' }); },
        }, 'Switch survey') : null),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: () => back.remove() }, 'Close'))));
    back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
    document.body.append(back);
  }

  /* ---------------- boot ---------------- */

  async function boot() {
    Sensors.start();
    Sensors.onChange(renderHeader);
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-home').addEventListener('click', async () => {
      await saveNow();
      state.survey = null;
      renderHeader();
      go({ name: 'home' });
    });
    document.querySelectorAll('#tabbar button').forEach((b) => {
      b.addEventListener('click', () => setTab(b.dataset.tab));
    });

    /* resume most recent survey if one exists */
    const surveys = await DB.listSurveys();
    if (surveys.length) {
      state.survey = await DB.getSurvey(surveys[0].id);
      state.view = { name: 'tab' };
    }
    history.replaceState({ v: state.view }, '');
    renderHeader();
    render();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline still fine on repeat visits */ });
    }
    window.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { state, go, setTab, goTarget };
})();
