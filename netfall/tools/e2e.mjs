// NETFALL end-to-end tests. Drives the real game in headless Chromium:
// terminal commands, the Pyodide worker bridge, an actual Python hack loop,
// error tracebacks, and the service-worker cross-origin-isolation path.
//
// Run: node tools/e2e.mjs   (uses a local or globally-installed playwright)

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = require(path.join(globalRoot, 'playwright')));
}

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const PORT_COI = 8137;
const PORT_PLAIN = 8138;

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !extra ? '' : ` — ${extra}`}`);
  if (!cond) failures += 1;
}

function startServer(port, extraArgs = []) {
  const proc = spawn('python3', [path.join(toolsDir, 'serve.py'), String(port), ...extraArgs], { stdio: 'ignore' });
  return proc;
}

async function typeCommand(page, cmd) {
  await page.fill('#term-in', cmd);
  await page.press('#term-in', 'Enter');
}

async function waitFor(page, fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await page.evaluate(fn)) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`timeout waiting for: ${label}`);
}

const HACK_SCRIPT = `import net
net.scan("home")
net.nuke("dustbox")
for attempt in range(20):
    took = net.hack("dustbox")
    print(f"attempt {attempt}: took {took:.0f}")
    if took > 0:
        break
print("HACK_DONE")
`;

const BAD_SCRIPT = `import net
print("about to crash")
raise ValueError("intentional test crash")
`;

async function main() {
  const servers = [startServer(PORT_COI), startServer(PORT_PLAIN, ['--no-coi'])];
  await new Promise(r => setTimeout(r, 1200));
  const browser = await chromium.launch();

  try {
    // ---- main suite: direct-header COI ------------------------------------
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('  [pageerror]', e.message));
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    // Seed a save containing our test scripts before the game boots, and skip
    // the title sequence — it has its own test block below.
    await page.addInitScript(([hack, bad]) => {
      localStorage.setItem('netfall_skip_intro', '1');
      localStorage.setItem('netfall_save_v1', JSON.stringify({
        version: 1,
        files: { 'e2e_hack.py': hack, 'e2e_bad.py': bad },
      }));
    }, [HACK_SCRIPT, BAD_SCRIPT]);

    await page.goto(`http://localhost:${PORT_COI}/netfall/`);
    check('page loads with COI headers', await page.evaluate(() => window.crossOriginIsolated));
    await waitFor(page, () => window.__netfall !== undefined, 10_000, 'game boot');
    check('game boots', true);

    // Terminal basics.
    await typeCommand(page, 'scan');
    let out = await page.textContent('#term-out');
    check('scan lists dustbox + vendnet', out.includes('dustbox') && out.includes('vendnet'));

    await typeCommand(page, 'connect dustbox');
    await typeCommand(page, 'nuke');
    out = await page.textContent('#term-out');
    check('nuke roots dustbox', out.includes('You have root'));
    check('dustbox rooted in state', await page.evaluate(() => window.__netfall.game.server('dustbox').rooted));

    await typeCommand(page, 'analyze');
    out = await page.textContent('#term-out');
    check('analyze shows credits + odds', out.includes('credits:') && out.includes('odds'));

    await typeCommand(page, 'market');
    out = await page.textContent('#term-out');
    check('market lists crackers', out.includes('picklock.py') && out.includes('nullsong.py'));

    await typeCommand(page, 'home');
    await typeCommand(page, 'ls');
    out = await page.textContent('#term-out');
    check('seeded files present', out.includes('e2e_hack.py') && out.includes('welcome.py'));

    // The big one: real Python through the blocking bridge.
    const moneyBefore = await page.evaluate(() => window.__netfall.game.s.money);
    await typeCommand(page, 'run e2e_hack.py');
    out = await page.textContent('#term-out');
    check('run reports pid', /pid \d+/.test(out));
    await waitFor(page, () => window.__netfall.procs.procs.size === 1 || window.__netfall.procs.history.length > 0, 30_000, 'proc spawn');

    await waitFor(page,
      () => window.__netfall.procs.history.some(p => p.script === 'e2e_hack.py'),
      120_000, 'hack script finishes');
    const hackProc = await page.evaluate(() =>
      window.__netfall.procs.history.find(p => p.script === 'e2e_hack.py'));
    const hackLog = hackProc.log.map(l => l.text).join('\n');
    check('hack script exits clean', hackProc.status === 'done', hackLog.slice(-400));
    check('print() captured in log', hackLog.includes('HACK_DONE'), hackLog.slice(-400));
    const moneyAfter = await page.evaluate(() => window.__netfall.game.s.money);
    check('hack earned money', moneyAfter > moneyBefore, `${moneyBefore} -> ${moneyAfter}`);
    const stats = await page.evaluate(() => window.__netfall.game.s.stats);
    check('stats recorded hack + scan', stats.hacksSucceeded >= 1 && stats.apiScans >= 1);

    // Error handling: traceback must survive in history.
    await typeCommand(page, 'run e2e_bad.py');
    await waitFor(page,
      () => window.__netfall.procs.history.some(p => p.script === 'e2e_bad.py'),
      60_000, 'bad script finishes');
    const badProc = await page.evaluate(() =>
      window.__netfall.procs.history.find(p => p.script === 'e2e_bad.py'));
    const badLog = badProc.log.map(l => l.text).join('\n');
    check('crash marked as error', badProc.status === 'error');
    check('traceback preserved + trimmed', badLog.includes('ValueError: intentional test crash')
      && badLog.includes('<script>') && !badLog.includes('pyodide'), badLog.slice(-400));
    check('stdout before crash captured', badLog.includes('about to crash'));

    // Long-running script + kill.
    await page.evaluate(() => {
      window.__netfall.game.writeFile('e2e_loop.py', 'import net\nwhile True:\n    net.weaken("dustbox")\n');
    });
    await typeCommand(page, 'run e2e_loop.py');
    await waitFor(page, () => [...window.__netfall.procs.procs.values()].some(p => p.script === 'e2e_loop.py' && p.status === 'run'),
      60_000, 'loop script running');
    const loopPid = await page.evaluate(() => [...window.__netfall.procs.procs.values()].find(p => p.script === 'e2e_loop.py').pid);
    await typeCommand(page, 'ps');
    out = await page.textContent('#term-out');
    check('ps shows loop script', out.includes('e2e_loop.py'));
    await typeCommand(page, `kill ${loopPid}`);
    check('kill stops the loop', await page.evaluate(() => window.__netfall.procs.procs.size === 0));

    // RAM gate: two fat scripts can't fit on the 4GB dustbox at once
    // (RAM is reserved synchronously at spawn).
    const spawnCheck = await page.evaluate(() => {
      const big = '# fat\nimport net\n' + ['hack', 'grow', 'weaken', 'scan', 'run', 'ps', 'kill', 'servers'].map(f => `net.${f}\n`).join('');
      window.__netfall.game.writeFile('e2e_fat.py', big);
      const first = window.__netfall.procs.spawn('e2e_fat.py', 'dustbox', []);
      const second = window.__netfall.procs.spawn('e2e_fat.py', 'dustbox', []);
      if (first.ok) window.__netfall.procs.kill(first.pid);
      return { first, second };
    });
    check('RAM limit enforced', spawnCheck.first.ok === true && spawnCheck.second.ok === false
      && spawnCheck.second.error.includes('RAM'), JSON.stringify(spawnCheck));

    // UI panels.
    await page.click('[data-tab="network"]');
    check('network panel renders cards', (await page.locator('.srv-card').count()) >= 3);
    await page.click('[data-tab="lessons"]');
    check('lessons render', (await page.locator('.lesson').count()) === 9);
    const lesson0Done = await page.evaluate(() => window.__netfall.game.s.lessonsDone['wake'] === true);
    check('lesson 0 auto-completed (dustbox rooted)', lesson0Done);
    await page.click('[data-tab="editor"]');
    await page.click('.ed-file');
    check('editor highlights python', (await page.locator('.ed-hl .py-kw').count()) > 0);

    // Persistence round-trip.
    await page.evaluate(() => window.__netfall.game.save());
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('netfall_save_v1')));
    check('save persists money + files', saved.money === moneyAfter && 'e2e_loop.py' in saved.files);

    check('no unexpected console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
    await page.close();

    // ---- service-worker COI path (GitHub Pages simulation) ----------------
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.addInitScript(() => localStorage.setItem('netfall_skip_intro', '1'));
    await page2.goto(`http://localhost:${PORT_PLAIN}/netfall/`);
    // The page registers the SW and reloads itself once; give it a moment.
    let isolated = false;
    for (let i = 0; i < 20; i++) {
      isolated = await page2.evaluate(() => window.crossOriginIsolated).catch(() => false);
      if (isolated) break;
      await new Promise(r => setTimeout(r, 500));
    }
    check('service worker achieves cross-origin isolation (no headers from host)', isolated);
    if (isolated) {
      await waitFor(page2, () => window.__netfall !== undefined, 10_000, 'game boot under SW');
      const r = await page2.evaluate(() => {
        window.__netfall.game.writeFile('sw_test.py', 'print("SW_OK")\n');
        return window.__netfall.procs.spawn('sw_test.py', 'home', []);
      });
      check('script spawns under SW isolation', r.ok === true, JSON.stringify(r));
      await waitFor(page2, () => window.__netfall.procs.history.some(p => p.script === 'sw_test.py' && p.status === 'done'),
        90_000, 'SW-path script finishes');
      const swLog = await page2.evaluate(() =>
        window.__netfall.procs.history.find(p => p.script === 'sw_test.py').log.map(l => l.text).join('\n'));
      check('python runs end-to-end under SW isolation', swLog.includes('SW_OK'), swLog);
    }
    await ctx2.close();

    // ---- title screen / intro flow ----------------------------------------
    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    await page3.goto(`http://localhost:${PORT_COI}/netfall/`);
    await page3.waitForSelector('.intro-boot', { timeout: 5000 });
    let bootText = await page3.textContent('.intro-boot');
    check('boot log plays', bootText.includes('RECLAIMER OS'));
    await page3.keyboard.press('Enter'); // skip boot -> title
    await page3.waitForSelector('.intro-menu', { timeout: 3000 });
    let menuText = await page3.textContent('.intro-menu');
    check('fresh save shows BEGIN OPERATION', menuText.includes('BEGIN OPERATION')
      && !menuText.includes('CONTINUE'), menuText);
    await page3.keyboard.press('ArrowDown');
    const activeItem = await page3.textContent('.intro-item.active');
    check('menu keyboard navigation', activeItem.includes('FIELD TRAINING'), activeItem);
    await page3.keyboard.press('ArrowUp');
    await page3.keyboard.press('Enter'); // BEGIN OPERATION
    await page3.waitForFunction(() => !document.getElementById('intro').classList.contains('visible'), null, { timeout: 3000 });
    check('intro closes into the game', true);
    check('new operatives land on lessons', await page3.evaluate(() =>
      document.getElementById('panel-lessons').classList.contains('active')));
    check('intro marked as seen', await page3.evaluate(() => localStorage.getItem('netfall_seen_intro') === '1'));
    // Reopen from the brand; seen flag means no boot log, straight to menu.
    await page3.click('.brand');
    await page3.waitForSelector('.intro-menu', { timeout: 3000 });
    check('brand click reopens title menu', true);
    await page3.keyboard.press('Enter');
    await page3.waitForFunction(() => !document.getElementById('intro').classList.contains('visible'), null, { timeout: 3000 });
    check('menu closes back into the game', true);
    await ctx3.close();
  } finally {
    await browser.close();
    for (const s of servers) s.kill();
  }

  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
