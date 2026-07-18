# Vendored: Pyodide 0.27.5 (core runtime)

CPython 3.11 compiled to WebAssembly. Source and license (MPL-2.0):
https://github.com/pyodide/pyodide

Files here are the unmodified core-runtime subset of the official `pyodide@0.27.5`
npm package (`pyodide.js`, `pyodide.asm.js`, `pyodide.asm.wasm`, `python_stdlib.zip`,
`pyodide-lock.json`). Vendored so NETFALL is fully self-contained on static hosting —
no CDN dependency, and everything loads same-origin under cross-origin isolation.

To upgrade: `npm pack pyodide@<version>`, copy the same five files, and test with
`node ../../tools/e2e.mjs`.
