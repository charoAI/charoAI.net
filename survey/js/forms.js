/* forms.js — schema-driven form renderer.
 * Renders a section's fields into a container, binds to a data object,
 * and calls onChange(patchedObject) as the user edits (debounced saves
 * happen in app.js). Geo/heading fields pull from Sensors.
 */
'use strict';

const Forms = (() => {
  const { h } = U;

  function field(f, obj, onChange) {
    const val = obj[f.key];
    const set = (v) => { obj[f.key] = v; onChange(); };

    let control;
    switch (f.type) {
      case 'text':
        control = h('input', {
          type: 'text', value: val || '', placeholder: f.placeholder || '',
          oninput: (e) => set(e.target.value),
        });
        break;

      case 'number':
        control = h('input', {
          type: 'number', value: val != null ? val : '', placeholder: f.placeholder || '',
          inputmode: 'decimal', step: 'any',
          oninput: (e) => set(e.target.value === '' ? null : Number(e.target.value)),
        });
        break;

      case 'date':
        control = h('input', {
          type: 'date', value: val || '',
          oninput: (e) => set(e.target.value),
        });
        break;

      case 'textarea':
        control = h('textarea', {
          placeholder: f.placeholder || '',
          oninput: (e) => set(e.target.value),
        }, val || '');
        break;

      case 'select':
        control = h('select', { onchange: (e) => set(e.target.value || null) },
          h('option', { value: '' }, '— select —'),
          ...f.options.map((o) => h('option', { value: o, selected: val === o }, o)));
        break;

      case 'toggle':
        control = h('label', { class: 'toggle' },
          h('input', { type: 'checkbox', checked: !!val, onchange: (e) => set(e.target.checked) }),
          h('span', { class: 'track' }),
          h('span', {}, f.toggleLabel || ''));
        break;

      case 'chips': {
        const current = Array.isArray(val) ? val.slice() : [];
        const wrap = h('div', { class: 'chips' });
        const render = () => {
          wrap.innerHTML = '';
          const opts = [...new Set([...(f.presets || []), ...current])];
          for (const o of opts) {
            const on = current.includes(o);
            wrap.append(h('span', {
              class: 'chip' + (on ? ' on' : ''),
              onclick: () => {
                const i = current.indexOf(o);
                if (i >= 0) current.splice(i, 1); else current.push(o);
                set(current.slice());
                render();
              },
            }, o));
          }
          wrap.append(h('span', {
            class: 'chip add',
            onclick: async () => {
              const v = await U.prompt('Add item');
              if (v && !current.includes(v)) {
                current.push(v);
                set(current.slice());
                render();
              }
            },
          }, '+ add'));
        };
        render();
        control = wrap;
        break;
      }

      case 'geo': {
        const valueEl = h('span', { class: 'value' + (val ? '' : ' empty') },
          val ? U.fmtCoords(val.lat, val.lng, val.acc) : 'not captured');
        control = h('div', { class: 'capture-widget' },
          h('span', {}, '📍'),
          valueEl,
          h('button', {
            class: 'btn small', onclick: () => {
              const fix = Sensors.fix;
              if (!fix) { U.toast('No GPS fix yet — stand still a moment and retry.', true); return; }
              set({ lat: fix.lat, lng: fix.lng, acc: fix.acc, ts: Date.now() });
              valueEl.textContent = U.fmtCoords(fix.lat, fix.lng, fix.acc);
              valueEl.classList.remove('empty');
              U.toast('Location captured');
            },
          }, 'Capture'),
          val ? h('button', {
            class: 'btn small', onclick: (e) => {
              set(null);
              valueEl.textContent = 'not captured';
              valueEl.classList.add('empty');
              e.target.remove();
            },
          }, '✕') : null);
        break;
      }

      case 'heading': {
        const valueEl = h('span', { class: 'value' + (val != null ? '' : ' empty') },
          val != null ? U.fmtHeading(val) : 'not captured');
        const liveEl = h('span', { class: 'value', style: 'flex:none;color:#93a6ab;' }, '');
        const unsub = Sensors.onChange((s) => {
          if (!liveEl.isConnected) { unsub(); return; }
          if (s.heading != null) liveEl.textContent = `now: ${Math.round(s.heading)}°`;
        });
        control = h('div', { class: 'capture-widget' },
          h('span', {}, '🧭'),
          valueEl, liveEl,
          h('button', {
            class: 'btn small', onclick: async () => {
              if (!Sensors.compassEnabled) {
                const ok = await Sensors.enableCompass();
                if (!ok) { U.toast('Compass unavailable — enter heading manually below.', true); return; }
              }
              if (Sensors.heading == null) { U.toast('No compass reading yet — move the phone in a figure-8 and retry.', true); return; }
              set(Math.round(Sensors.heading));
              valueEl.textContent = U.fmtHeading(Sensors.heading);
              valueEl.classList.remove('empty');
              U.toast('Heading captured');
            },
          }, 'Capture'),
          h('button', {
            class: 'btn small', onclick: async () => {
              const v = await U.prompt('Heading in degrees (0 = North, 90 = East)', val != null ? String(val) : '');
              if (v == null) return;
              const n = ((Number(v) % 360) + 360) % 360;
              if (isNaN(n)) return U.toast('Not a number', true);
              set(n);
              valueEl.textContent = U.fmtHeading(n);
              valueEl.classList.remove('empty');
            },
          }, '✎'));
        break;
      }

      default:
        control = h('input', { type: 'text', value: val || '', oninput: (e) => set(e.target.value) });
    }

    return h('div', { class: 'field' },
      h('label', {}, f.label + (f.important ? ' *' : '')),
      control,
      f.hint ? h('div', { class: 'hint' }, f.hint) : null);
  }

  /* Render all fields of a section into a fragment. */
  function render(sec, obj, onChange) {
    const frag = document.createDocumentFragment();
    for (const f of sec.fields) frag.append(field(f, obj, onChange));
    return frag;
  }

  return { render, field };
})();
