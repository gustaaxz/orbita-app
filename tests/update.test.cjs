'use strict';

// Run on a disposable Windows GitHub Actions runner: this installs two versions
// using the app's real NSIS installer and per-user Windows registration.
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { createServer } = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { setTimeout: delay } = require('node:timers/promises');
const { promisify } = require('node:util');
const { extractFile } = require('@electron/asar');
const { _electron: electron } = require('playwright');
const { version } = require('../package.json');

assert.equal(process.platform, 'win32');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Use um runner descartável do GitHub Actions.');

const previous = '1.1.0';
const previousHash = '01828d4f58abcb677f7e970d07f9ebaeaa56e924689db43db36a416199bd95c0';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita-update-'));
const install = path.join(root, 'installed');
const profile = path.join(root, 'profile');
const archive = path.join(install, 'resources', 'app.asar');
const run = promisify(execFile);
const filename = value => `Orbita-Instalar-${value}.exe`;
const env = { ...process.env, ORBITA_DATA_DIR: profile, ORBITA_TEST: '0' };
delete env.ELECTRON_RUN_AS_NODE;

const files = new Set(['latest.yml', filename(version), filename(version) + '.blockmap']);
const feed = createServer((request, response) => {
  const file = new URL(request.url, 'http://127.0.0.1').pathname.slice(1);
  if (!files.has(file)) { response.writeHead(404).end(); return; }
  const absolute = path.resolve('dist', file);
  response.writeHead(200, { 'Content-Length': fs.statSync(absolute).size });
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(absolute).pipe(response);
});

const installedVersion = () => JSON.parse(extractFile(archive, 'package.json')).version;
let running;

async function launch() {
  running = await electron.launch({ executablePath: path.join(install, 'Órbita.exe'), env });
  const page = await running.firstWindow();
  await page.waitForSelector('#content');
  return page;
}

async function verifyUpdate() {
  const setup = path.join(root, filename(previous));
  const url = `https://github.com/gustaaxz/orbita-app/releases/download/v${previous}/${filename(previous)}`;
  const download = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!download.ok) throw new Error(`Download da v${previous}: HTTP ${download.status}.`);
  await pipeline(Readable.fromWeb(download.body), fs.createWriteStream(setup));
  assert.equal(createHash('sha256').update(fs.readFileSync(setup)).digest('hex'), previousHash);
  await run(setup, ['/S', `/D=${install}`], { timeout: 120000, windowsHide: true });
  assert.equal(installedVersion(), previous);

  await new Promise((resolve, reject) => {
    feed.once('error', reject);
    feed.listen(0, '127.0.0.1', resolve);
  });
  // Replace the feed only in the installed test copy. Release builds keep GitHub.
  fs.writeFileSync(path.join(install, 'resources', 'app-update.yml'),
    `provider: generic\nurl: http://127.0.0.1:${feed.address().port}\nupdaterCacheDirName: orbita-test-updater\n`);
  let page = await launch();
  const task = await page.evaluate(async () => {
    await window.orbita.settings({ checkForUpdates: false, notifications: false });
    const result = await window.orbita.upsert('tasks', {
      title: 'Migration test', date: '2028-02-29', time: '09:30', reminder: true
    });
    return result.tasks[0];
  });
  await running.evaluate(({ app, dialog }, directory) => {
    const requireApp = process.getBuiltinModule('node:module').createRequire(app.getAppPath() + '/package.json');
    const { autoUpdater } = requireApp('electron-updater');
    autoUpdater.installDirectory = directory;
    autoUpdater.disableDifferentialDownload = true;
    const install = autoUpdater.quitAndInstall.bind(autoUpdater);
    // Keep the real download, checksum and NSIS install. The test relaunches
    // the new binary itself, so it can inspect the renderer after installation.
    autoUpdater.quitAndInstall = () => install(true, false);
    dialog.showMessageBox = async () => ({ response: 1 });
  }, install);
  await page.evaluate(() => window.orbita.update('check'));
  await page.waitForFunction(async () => (await window.orbita.read()).runtime.update.status === 'available');
  const ready = await page.evaluate(() => window.orbita.update('download'));
  assert.equal(ready.status, 'ready');
  assert.equal(ready.version, version);
  await page.evaluate(() => window.orbita.update('install')).catch(() => {});

  const deadline = Date.now() + 120000;
  for (;;) {
    let installed;
    try { installed = installedVersion(); } catch { /* NSIS may be replacing files. */ }
    if (installed === version) break;
    if (Date.now() > deadline) throw new Error(`O instalador não substituiu a v${previous} pela v${version}.`);
    await delay(500);
  }
  await running.close().catch(() => {});
  running = null;
  page = await launch();
  const data = await page.evaluate(() => window.orbita.read());
  assert.equal(data.runtime.version, version);
  assert.equal(data.schema, 3);
  assert.equal(data.tasks[0].id, task.id);
  assert.equal(data.tasks[0].date, task.date);
  assert.equal(data.tasks[0].plannedDate, task.date);
  assert.equal(data.tasks[0].time, task.time);
  console.log(`PASS: v${previous} instalou v${version} e preservou os dados.`);
}

verifyUpdate().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (running) await running.close().catch(() => {});
  feed.close();
});
