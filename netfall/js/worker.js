// NETFALL script worker. One per running script: boots a Pyodide interpreter,
// injects the `net` module, and runs the player's code synchronously.
//
// Blocking bridge: an API call posts a request to the main thread, then parks
// the whole worker on Atomics.wait until the game engine writes the response
// into the SharedArrayBuffer and notifies. This is what lets players write
// plain, synchronous Python (`while True: net.hack(t)`) with no async/await.

'use strict';

const VENDOR_URL = new URL('../vendor/pyodide/', self.location).href;
importScripts(VENDOR_URL + 'pyodide.js');

let sig = null;      // Int32Array view: [0] = signal, [1] = response byte length
let sabBytes = null; // Uint8Array view over the response region

function bridgeCall(fn, argsJson) {
  Atomics.store(sig, 0, 0);
  postMessage({ type: 'call', fn, args: JSON.parse(argsJson) });
  Atomics.wait(sig, 0, 0); // returns immediately with 'not-equal' if reply beat us here
  const len = Atomics.load(sig, 1);
  // TextDecoder refuses views over a SharedArrayBuffer; copy out first.
  const copy = new Uint8Array(len);
  copy.set(sabBytes.subarray(0, len));
  return new TextDecoder().decode(copy);
}

self.onmessage = async (ev) => {
  const { sab, code, host, args, netApiSource } = ev.data;
  sig = new Int32Array(sab, 0, 2);
  sabBytes = new Uint8Array(sab, 8);

  let pyodide;
  try {
    pyodide = await loadPyodide({ indexURL: VENDOR_URL });
  } catch (e) {
    postMessage({ type: 'error', error: `interpreter failed to boot: ${e.message}` });
    return;
  }

  pyodide.setStdout({ batched: (line) => postMessage({ type: 'log', text: line }) });
  pyodide.setStderr({ batched: (line) => postMessage({ type: 'log', text: line, isError: true }) });

  pyodide.registerJsModule('_netfall_bridge', {
    call: (fn, argsJson) => bridgeCall(fn, argsJson),
    log: (text) => postMessage({ type: 'log', text }),
  });

  try {
    pyodide.runPython(netApiSource, { filename: 'net_api.py' });
    const makeModule = pyodide.globals.get('_make_module');
    makeModule(host, pyodide.toPy(args));
    makeModule.destroy();
  } catch (e) {
    postMessage({ type: 'error', error: `net module failed to load: ${e.message}` });
    return;
  }

  postMessage({ type: 'running' });

  try {
    pyodide.runPython(code, { filename: '<script>' });
    postMessage({ type: 'exit' });
  } catch (e) {
    postMessage({ type: 'error', error: formatPythonError(e) });
  }
};

// Trim Pyodide's internal frames out of the traceback so players see only
// their own code.
function formatPythonError(e) {
  const msg = String(e.message || e);
  const lines = msg.split('\n');
  const start = lines.findIndex(l => l.includes('File "<script>"'));
  if (start === -1) return msg;
  return ['Traceback (most recent call last):', ...lines.slice(start)].join('\n');
}
