/* sensors.js — continuous GPS + compass heading.
 *
 * GPS: geolocation watchPosition (high accuracy). Latest fix cached.
 * Compass: deviceorientationabsolute (Android/Chrome) or webkitCompassHeading
 * (iOS Safari). iOS 13+ requires DeviceOrientationEvent.requestPermission()
 * from a user gesture — Sensors.enableCompass() must be called from a tap.
 */
'use strict';

const Sensors = (() => {
  const state = {
    watching: false,
    watchId: null,
    fix: null,            // {lat, lng, acc, alt, ts}
    heading: null,        // degrees true-ish (0..360)
    headingSource: null,  // 'webkit' | 'absolute' | 'relative'
    compassEnabled: false,
    listeners: new Set(),
  };

  function notify() {
    for (const fn of state.listeners) { try { fn(state); } catch (e) { /* ignore */ } }
  }

  function startGPS() {
    if (state.watching || !('geolocation' in navigator)) { notify(); return; }
    state.watching = true;
    state.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        state.fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
          alt: pos.coords.altitude,
          ts: pos.timestamp,
        };
        /* moving fallback: GPS course when no compass */
        if (state.heading == null && pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          state.heading = pos.coords.heading;
          state.headingSource = 'gps-course';
        }
        notify();
      },
      (err) => {
        state.fix = null;
        state.gpsError = err.message;
        notify();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  }

  function stopGPS() {
    if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
    state.watching = false;
    state.watchId = null;
  }

  function onOrientation(e) {
    let h = null, src = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      h = e.webkitCompassHeading;               // iOS: already compass heading
      src = 'webkit';
    } else if (e.absolute === true && e.alpha != null) {
      h = (360 - e.alpha) % 360;                // absolute alpha -> compass
      src = 'absolute';
    } else if (e.alpha != null) {
      h = (360 - e.alpha) % 360;                // relative — better than nothing
      src = 'relative';
    }
    if (h != null) {
      /* account for screen orientation */
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      state.heading = ((h + angle) % 360 + 360) % 360;
      state.headingSource = src;
      state.compassEnabled = true;
      notify();
    }
  }

  async function enableCompass() {
    /* must be called from a user gesture on iOS */
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const resp = await DeviceOrientationEvent.requestPermission();
        if (resp !== 'granted') return false;
      }
      if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', onOrientation, true);
      }
      window.addEventListener('deviceorientation', onOrientation, true);
      state.compassEnabled = true;
      notify();
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    start() { startGPS(); },
    stop() { stopGPS(); },
    enableCompass,
    onChange(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); },
    get fix() { return state.fix; },
    get heading() { return state.heading; },
    get headingSource() { return state.headingSource; },
    get compassEnabled() { return state.compassEnabled; },
    /* snapshot for stamping a capture */
    snapshot() {
      return {
        lat: state.fix ? state.fix.lat : null,
        lng: state.fix ? state.fix.lng : null,
        acc: state.fix ? state.fix.acc : null,
        heading: state.heading,
        headingSource: state.headingSource,
        capturedAt: Date.now(),
      };
    },
  };
})();
