/* sync.js — push surveys to your home machine over Tailscale.
 *
 * The app is served over HTTPS, so the sync target must be HTTPS too
 * (browsers block mixed content). `tailscale serve` gives your home
 * machine a valid https://<machine>.<tailnet>.ts.net URL that proxies to
 * the receiver script — see survey/receiver/README.md.
 *
 * Everything is optional: with no endpoint configured, data simply stays
 * on the device.
 */
'use strict';

const Sync = (() => {

  async function getConfig() {
    return await DB.getSetting('sync', { baseUrl: '', token: '', includeReport: true });
  }

  async function setConfig(cfg) {
    await DB.setSetting('sync', cfg);
  }

  function normalize(baseUrl) {
    return (baseUrl || '').trim().replace(/\/+$/, '');
  }

  async function api(cfg, path, options = {}) {
    const url = normalize(cfg.baseUrl) + path;
    const headers = { ...(options.headers || {}) };
    if (cfg.token) headers['Authorization'] = 'Bearer ' + cfg.token;
    const res = await fetch(url, { ...options, headers, mode: 'cors' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res;
  }

  async function ping(cfg) {
    const res = await api(cfg, '/api/ping');
    return res.json();
  }

  /* Push survey JSON, any media the server doesn't have, and optionally
   * the interactive HTML report. onStatus(msg, frac) reports progress. */
  async function push(survey, onStatus) {
    const cfg = await getConfig();
    if (!normalize(cfg.baseUrl)) throw new Error('No sync endpoint configured — open Settings.');

    onStatus && onStatus('Contacting home machine…', 0);
    await ping(cfg);

    onStatus && onStatus('Sending survey data…', 0.05);
    await api(cfg, '/api/survey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(survey),
    });

    /* what media does the server already have? */
    let have = [];
    try {
      const res = await api(cfg, '/api/have?survey=' + encodeURIComponent(survey.id));
      have = (await res.json()).ids || [];
    } catch (e) { /* older receiver — push everything */ }

    const media = await DB.listMedia(survey.id);
    const todo = media.filter((m) => !have.includes(m.id));
    let sent = 0;
    for (const m of todo) {
      onStatus && onStatus(`Uploading media ${sent + 1}/${todo.length} (${U.fmtBytes(m.size)})…`, 0.1 + 0.8 * (sent / Math.max(todo.length, 1)));
      await api(cfg, '/api/media', {
        method: 'POST',
        headers: {
          'Content-Type': m.mime || 'application/octet-stream',
          'X-Survey-Id': survey.id,
          'X-Media-Id': m.id,
          'X-Filename': m.name || m.id,
          'X-Meta': btoa(unescape(encodeURIComponent(JSON.stringify({
            kind: m.kind, lat: m.lat, lng: m.lng, acc: m.acc,
            heading: m.heading, capturedAt: m.capturedAt,
            caption: m.caption, attachedTo: m.attachedTo,
          })))),
        },
        body: m.blob,
      });
      sent++;
    }

    if (cfg.includeReport) {
      onStatus && onStatus('Generating & sending HTML report…', 0.92);
      try {
        const html = await Exporter.buildHtmlString(survey, { includeVideos: false });
        await api(cfg, '/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'text/html', 'X-Survey-Id': survey.id },
          body: html,
        });
      } catch (e) { /* report is a bonus; don't fail the sync */ }
    }

    onStatus && onStatus(`Synced: survey + ${sent} new media file${sent === 1 ? '' : 's'} (${media.length - sent} already on server).`, 1);
    return { mediaSent: sent, mediaTotal: media.length };
  }

  return { getConfig, setConfig, ping, push };
})();
