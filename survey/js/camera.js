/* camera.js — in-app capture with location/direction stamping.
 *
 * Photos: getUserMedia viewfinder -> canvas grab -> stamp bar burned into the
 * image (timestamp, GPS, compass heading) + metadata stored in DB.
 * Videos: MediaRecorder where supported; metadata stored (no burn-in).
 * Fallback: <input type=file capture> routed through the same stamping path.
 */
'use strict';

const Camera = (() => {
  let stream = null;
  let recorder = null;
  let recChunks = [];
  let recStartSnap = null;

  async function startPreview(videoEl, facing = 'environment') {
    stopPreview();
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true;
    await videoEl.play();
    return stream;
  }

  function stopPreview() {
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch (e) {} }
    recorder = null;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
  }

  function previewActive() { return !!stream; }

  /* Draw the stamp footer onto a canvas containing the photo. */
  function drawStamp(ctx, w, h, snap, siteName) {
    const barH = Math.max(34, Math.round(h * 0.052));
    const font = Math.max(12, Math.round(barH * 0.34));
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, h - barH, w, barH);
    ctx.fillStyle = '#00ffff';
    ctx.font = `${font}px monospace`;
    ctx.textBaseline = 'middle';
    const l1y = h - barH + barH * 0.30;
    const l2y = h - barH + barH * 0.72;
    const gps = (snap.lat != null)
      ? `${snap.lat.toFixed(6)}, ${snap.lng.toFixed(6)} ±${Math.round(snap.acc || 0)}m`
      : 'GPS: no fix';
    const dir = (snap.heading != null) ? `DIR ${Math.round(snap.heading)}° ${U.headingName(snap.heading)}` : 'DIR —';
    ctx.fillText(` ${U.fmtTimestampForStamp(snap.capturedAt)}   ${dir}`, 8, l1y);
    ctx.fillStyle = '#e8f4f4';
    ctx.fillText(` ${gps}${siteName ? '   ' + siteName : ''}`, 8, l2y);
  }

  /* Capture a stamped photo from the live viewfinder. */
  async function capturePhoto(videoEl, siteName) {
    const snap = Sensors.snapshot();
    const w = videoEl.videoWidth, h = videoEl.videoHeight;
    if (!w) throw new Error('Camera not ready');
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);
    drawStamp(ctx, w, h, snap, siteName);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
    return { blob, snap, mime: 'image/jpeg' };
  }

  /* Stamp an imported/system-camera photo file. */
  async function stampImportedPhoto(file, siteName, snapOverride) {
    const snap = snapOverride || Sensors.snapshot();
    const url = URL.createObjectURL(file);
    try {
      const img = await U.loadImage(url);
      let w = img.width, h = img.height;
      const MAX = 2560; /* keep files sane */
      if (Math.max(w, h) > MAX) {
        const s = MAX / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      drawStamp(ctx, w, h, snap, siteName);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
      return { blob, snap, mime: 'image/jpeg' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function videoRecordingSupported() {
    return typeof MediaRecorder !== 'undefined';
  }

  function pickVideoMime() {
    const options = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const o of options) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(o)) return o;
    }
    return '';
  }

  async function startVideo(videoEl) {
    if (!stream) throw new Error('Start the camera first');
    /* re-acquire with audio for video notes */
    let recStream = stream;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStream = new MediaStream([...stream.getVideoTracks(), ...mic.getAudioTracks()]);
    } catch (e) { /* video-only if mic denied */ }
    recStartSnap = Sensors.snapshot();
    recChunks = [];
    const mime = pickVideoMime();
    recorder = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.start(1000);
    return recStartSnap;
  }

  function stopVideo() {
    return new Promise((res, rej) => {
      if (!recorder || recorder.state === 'inactive') return rej(new Error('Not recording'));
      const mime = recorder.mimeType || 'video/webm';
      recorder.onstop = () => {
        const blob = new Blob(recChunks, { type: mime });
        const snap = recStartSnap || Sensors.snapshot();
        /* stop borrowed mic tracks */
        for (const t of (recorder.stream ? recorder.stream.getAudioTracks() : [])) t.stop();
        recorder = null;
        recChunks = [];
        res({ blob, snap, mime });
      };
      recorder.stop();
    });
  }

  function isRecording() { return !!(recorder && recorder.state === 'recording'); }

  /* Persist a capture into the media store. */
  async function saveCapture(surveyId, kind, blob, mime, snap, attachedTo, caption) {
    const id = U.uuid();
    let thumb = null;
    if (kind === 'photo') {
      try { thumb = await U.downscaleImage(blob, 320, 0.7); } catch (e) { /* ignore */ }
    }
    const media = {
      id,
      surveyId,
      kind,
      blob,
      thumb,
      mime,
      name: `${kind}-${new Date(snap.capturedAt).toISOString().replace(/[:.]/g, '-')}.${mime.includes('mp4') ? 'mp4' : mime.includes('webm') ? 'webm' : 'jpg'}`,
      size: blob.size,
      lat: snap.lat, lng: snap.lng, acc: snap.acc,
      heading: snap.heading,
      headingSource: snap.headingSource || null,
      capturedAt: snap.capturedAt,
      caption: caption || '',
      attachedTo: attachedTo || null,
    };
    await DB.putMedia(media);
    return media;
  }

  return {
    startPreview, stopPreview, previewActive,
    capturePhoto, stampImportedPhoto,
    videoRecordingSupported, startVideo, stopVideo, isRecording,
    saveCapture,
  };
})();
