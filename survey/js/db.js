/* db.js — IndexedDB persistence. Everything stays on-device unless the user
 * explicitly exports or syncs. Two stores:
 *   surveys: { id, ...survey document }        (media blobs NOT inside)
 *   media:   { id, surveyId, kind, blob, thumb, lat, lng, acc, heading,
 *              capturedAt, caption, attachedTo:{section, entityId}|null, ... }
 */
'use strict';

const DB = (() => {
  const NAME = 'charoai-site-survey';
  const VER = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('surveys')) {
          db.createObjectStore('surveys', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('media')) {
          const m = db.createObjectStore('media', { keyPath: 'id' });
          m.createIndex('bySurvey', 'surveyId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then((db) => new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => res(out && out.__result !== undefined ? out.__result : out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }

  function reqToPromise(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  return {
    async putSurvey(survey) {
      survey.updatedAt = Date.now();
      await tx('surveys', 'readwrite', (s) => s.put(survey));
      return survey;
    },
    async getSurvey(id) {
      const db = await open();
      return reqToPromise(db.transaction('surveys').objectStore('surveys').get(id));
    },
    async listSurveys() {
      const db = await open();
      const all = await reqToPromise(db.transaction('surveys').objectStore('surveys').getAll());
      return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async deleteSurvey(id) {
      const media = await this.listMedia(id);
      await tx('media', 'readwrite', (s) => { for (const m of media) s.delete(m.id); });
      await tx('surveys', 'readwrite', (s) => s.delete(id));
    },

    async putMedia(m) {
      await tx('media', 'readwrite', (s) => s.put(m));
      return m;
    },
    async getMedia(id) {
      const db = await open();
      return reqToPromise(db.transaction('media').objectStore('media').get(id));
    },
    async listMedia(surveyId) {
      const db = await open();
      const idx = db.transaction('media').objectStore('media').index('bySurvey');
      const all = await reqToPromise(idx.getAll(surveyId));
      return all.sort((a, b) => (a.capturedAt || 0) - (b.capturedAt || 0));
    },
    async deleteMedia(id) {
      await tx('media', 'readwrite', (s) => s.delete(id));
    },

    async getSetting(key, fallback) {
      const db = await open();
      const row = await reqToPromise(db.transaction('settings').objectStore('settings').get(key));
      return row ? row.value : fallback;
    },
    async setSetting(key, value) {
      await tx('settings', 'readwrite', (s) => s.put({ key, value }));
    },

    async estimateUsage() {
      if (navigator.storage && navigator.storage.estimate) {
        try { return await navigator.storage.estimate(); } catch (e) { /* ignore */ }
      }
      return null;
    },

    async requestPersistence() {
      if (navigator.storage && navigator.storage.persist) {
        try { return await navigator.storage.persist(); } catch (e) { return false; }
      }
      return false;
    },
  };
})();
