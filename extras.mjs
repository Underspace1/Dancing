// Replay HUD — tosu widgets (catalogue, install, serving with the data shim), user presets,
// osu! account (OAuth client credentials for danser's leaderboard) and tosu/danser updates.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { Timeline } from './web/hud.js';
import { tosuMessages } from './web/tosu-emu.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const UA = { 'user-agent': 'ReplayHUD/2.0 (danser x tosu)' };
// Les releases de Dancing! (avec Dancing!-Setup.exe en pièce jointe) sont publiées sur ce dépôt GitHub.
const APP_REPO = 'Underspace1/Dancing';
const APP_VERSION = (() => { try { return JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version; } catch { return '0.0.0'; } })();
const ps = cmd => new Promise((res, rej) => execFile('powershell', ['-NoProfile', '-Command', cmd], { windowsHide: true, maxBuffer: 1e7 }, (e, out, err) => e ? rej(Error(err || e.message)) : res(out)));
// tar.exe de Windows : Expand-Archive met plusieurs minutes sur les ~800 fichiers des sources de danser (la mise à jour semblait bloquée).
const unzip = (zip, dir) => new Promise((res, rej) => { fs.mkdirSync(dir, { recursive: true }); execFile(path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dir], { windowsHide: true, timeout: 300000 }, e => e ? rej(Error('Archive illisible : ' + e.message)) : res()); });
async function download(url, file) { const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(300000) }); if (!r.ok) throw Error(`Téléchargement impossible (${r.status})`); await fsp.writeFile(file, Buffer.from(await r.arrayBuffer())); }
const safe = n => String(n).replace(/[\\/:*?"<>|]+/g, '_').trim();
const q = s => String(s).replace(/'/g, "''");

export function createExtras(ctx) {
  const { root, tosuDir, danserDir, osuDir, getJob, readJSON, send, serveFile, body } = ctx;
  const staticDir = () => path.join(tosuDir(), 'static');
  // Store Dancing! : widgets maison (maquettes Figma « Dancing! — Widgets du store ») livrés dans store/.
  const storeDir = path.join(root, 'store');
  const storeList = () => {
    let dirs = []; try { dirs = fs.readdirSync(storeDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { }
    return dirs.map(folder => { const m = metadata(folder, storeDir); return { ...m, id: 'store:' + folder, resolution: [m.w, m.h], source: 'store',
      preview: '/store/' + encodeURIComponent(folder) + '/index.html?demo', ...storeState(folder, m) }; });
  };
  // Un widget du store déjà installé dans une version plus ancienne se propose en mise à jour.
  const storeState = (folder, m) => {
    if (!fs.existsSync(path.join(staticDir(), folder, 'index.html'))) return { installed: false };
    const ok = metadata(folder).version === m.version;
    return { installed: ok, outdated: !ok };
  };
  const danserBuild = path.join(path.dirname(root), 'build');
  const canBuildDanser = fs.existsSync(path.join(danserBuild, 'build-core.ps1'));
  const localWidget = { folder: 'Replay HUD - Précision', name: 'Précision du replay', author: 'Replay HUD', w: 330, h: 96 };
  const presetsFile = path.join(root, 'data', 'presets.json');
  let catalog = null, catalogAt = 0, updates = null, updateJob = null;
  const thumbnails = new Map();

  // ---------- tosu widgets ----------
  // Créateur de widgets : écrit un widget « Perso - <nom> » dans tosu/static. N'écrase jamais un widget qu'il n'a pas créé.
  async function createWidget({ name, html, w, h, glass, blur, spec }) {
    name = String(name || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 40);
    const folder = safe('Perso - ' + name).replace(/\.+$/, ''), dir = path.join(staticDir(), folder);
    if (!name || folder.length < 9) throw Error('Donne un nom au widget.');
    if (typeof html !== 'string' || html.length > 300e3) throw Error('Widget invalide.');
    const [W, H] = [w, h].map(v => Math.round(Number(v)));
    if (!(W >= 8 && W <= 1920 && H >= 8 && H <= 1080)) throw Error('Taille du widget invalide.');
    if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, 'widget.json'))) throw Error('Un widget installé porte déjà ce nom. Choisis-en un autre.');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'index.html'), html);
    await fsp.writeFile(path.join(dir, 'widget.json'), JSON.stringify(spec || {}, null, 2));
    await fsp.writeFile(path.join(dir, 'metadata.txt'), `Usecase: ingame, obs-overlay\nName: ${name}\nVersion: 1.0\nAuthor: Créateur Dancing!\nCompatibleWith: tosu\nResolution: ${W}x${H}\n${glass > 0 ? `Glass: ${Math.round(glass)}\nGlassBlur: ${Math.round(Math.min(40, Math.max(1, Number(blur) || 18)))}\n` : ''}`);
    return metadata(folder);
  }
  function metadata(folder, dir = staticDir()) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dir, folder, 'metadata.txt'), 'utf8'); } catch { }
    const get = k => (txt.match(new RegExp(`^${k}:\\s*(.+)$`, 'im')) || [])[1]?.trim();
    const [w, h] = (get('Resolution') || '').split(/[x,\s]+/).map(Number);
    return { folder, name: get('Name') || folder, author: get('Author') || '', version: get('Version') || '', w: w > 1 ? w : 600, h: h > 1 ? h : 200, glass: Number(get('Glass')) || 0, glassBlur: Number(get('GlassBlur')) || 0 };
  }
  const installed = () => {
    try { return [localWidget, ...fs.readdirSync(staticDir(), { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(staticDir(), d.name, 'index.html')) && !/^Replay HUD/.test(d.name)).map(d => metadata(d.name))]; }
    catch { return [localWidget]; }
  };
  async function getCatalog() {
    if (catalog && Date.now() - catalogAt < 3600e3) return catalog;
    const r = await fetch('https://tosu.app/api.json', { headers: UA, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw Error('Catalogue tosu indisponible');
    catalog = await r.json(); catalogAt = Date.now(); return catalog;
  }
  const folderOf = c => safe(`${c.name} by ${c.author}`);
  async function thumbnail(id) {
    const widget = (await getCatalog()).find(w => w.id === id);
    const url = widget?.assets?.find(a => a.type === 'image')?.url;
    if (!url || new URL(url).protocol !== 'https:') return null;
    if (!thumbnails.has(url)) thumbnails.set(url, (async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!response.ok || !response.body) throw Error('Miniature indisponible.');
      let length = 0; const chunks = [];
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 5 * 1024 * 1024) throw Error('Miniature trop volumineuse.');
        chunks.push(chunk);
      }
      const image = await loadImage(Buffer.concat(chunks,length));
      const scale = Math.min(1,420/image.width,210/image.height);
      const canvas = createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      return canvas.toBuffer('image/png');
    })().catch(error => { thumbnails.delete(url); throw error; }));
    return thumbnails.get(url);
  }
  async function install(id) {
    if (String(id).startsWith('store:')) {
      const folder = String(id).slice(6), src = path.join(storeDir, folder);
      if (path.dirname(src) !== storeDir || !fs.existsSync(path.join(src, 'index.html'))) throw Error('Widget introuvable');
      await fsp.cp(src, path.join(staticDir(), folder), { recursive: true });
      return metadata(folder);
    }
    const c = (await getCatalog()).find(x => x.id === id); if (!c) throw Error('Widget introuvable');
    const folder = folderOf(c), dest = path.join(staticDir(), folder);
    if (fs.existsSync(path.join(dest, 'index.html'))) return metadata(folder);
    await fsp.mkdir(staticDir(), { recursive: true });
    const tmp = await fsp.mkdtemp(path.join(tosuDir(), '.rh-tosu-'));
    const zip = path.join(tmp, 'w.zip'), out = path.join(tmp, 'x');
    try {
      if (new URL(c.downloadLink).protocol !== 'https:') throw Error('Adresse de téléchargement non sécurisée.');
      await download(c.downloadLink, zip);
      await unzip(zip, out);
      const items = await fsp.readdir(out, { withFileTypes: true });
      const src = items.length === 1 && items[0].isDirectory() ? path.join(out, items[0].name) : out;
      if (!fs.existsSync(path.join(src, 'index.html'))) throw Error('Le widget ne contient pas de fichier index.html.');
      if (!fs.existsSync(path.join(src, 'metadata.txt'))) await fsp.writeFile(path.join(src, 'metadata.txt'), `Name: ${c.name}\nAuthor: ${c.author}\nVersion: ${c.version}\nResolution: ${(c.resolution || []).join('x')}\n`);
      try { await fsp.rename(src, dest); } catch (e) { if (!fs.existsSync(path.join(dest, 'index.html'))) throw e; }
      return metadata(folder);
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true });
    }
  }
  function counterSettings(folder) {
    const out = {}, defs = readJSON(path.join(staticDir(), folder, 'settings.json'));
    if (Array.isArray(defs)) for (const d of defs) if (d.uniqueID) out[d.uniqueID] = d.value ?? d.default;
    return Object.assign(out, readJSON(path.join(tosuDir(), 'settings', `${folder}.values.json`)) || {});
  }
  function snapshot() {   // payload for widgets polling /json instead of the socket
    const f = getJob()?.exportFile, d = f && readJSON(f); if (!d) return null;
    const st = new Timeline(d).at(d.meta.end); return tosuMessages(st, d.meta, { board: st.board });
  }
  function serveWidget(req, res, rest) {
    const [folder, ...parts] = rest.split('/').map(decodeURIComponent);
    const base = folder === localWidget.folder ? path.join(root, 'web', 'accuracy-widget') : path.resolve(staticDir(), folder);
    const file = path.resolve(base, parts.join('/') || 'index.html');
    if (!folder || path.basename(folder) !== folder || folder === '..' || folder === '.' || !file.startsWith(base + path.sep)) return send(res, 403, { error: 'Refusé' });
    if (/\.html?$/i.test(file) && fs.existsSync(file)) {
      const tag = '<script src="/tosu-shim.js"></script>'; let html = fs.readFileSync(file, 'utf8');
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
      const transparency = '<meta name="color-scheme" content="light"><style>html, body { color-scheme: light !important; background: transparent !important; }</style>';
      html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, transparency + '</head>') : transparency + html;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html);
    }
    return serveFile(req, res, file);
  }

  // ---------- osu! account ----------
  const credFile = () => path.join(danserDir(), 'settings', 'credentials.json');
  async function testCredentials(id, secret) {
    const r = await fetch('https://osu.ppy.sh/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ client_id: Number(id), client_secret: secret, grant_type: 'client_credentials', scope: 'public' }), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw Error('osu! a refusé ces identifiants : vérifie l’ID client et la clé secrète.');
  }
  function account() { const c = readJSON(credFile()) || {}; return { configured: !!(c.ClientId && c.ClientSecret), clientId: c.ClientId ? String(c.ClientId).replace(/.(?=.{2})/g, '•') : '' }; }

  // ---------- updates ----------
  const latest = async repo => { const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: UA, signal: AbortSignal.timeout(10000) }); if (!r.ok) throw Error(r.status === 404 ? 'aucune release publiée' : 'GitHub indisponible'); return r.json(); };
  const ver = s => String(s || '').replace(/^v/, '').split(/[.-]/).map(n => parseInt(n) || 0);
  const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  const fromLog = (f, re) => { try { return (fs.readFileSync(f, 'utf8').match(re) || [])[1] || null; } catch { return null; } };
  async function checkUpdates() {
    const [t, d, a] = await Promise.allSettled([latest('tosuapp/tosu'), latest('Wieku/danser-go'), latest(APP_REPO)]);
    const lt = fromLog(path.join(tosuDir(), 'logs', 'latest.log'), /\(v(\d+\.\d+\.\d+)\)/), ld = fromLog(path.join(danserDir(), 'danser.log'), /danser-go version: (\d+\.\d+\.\d+)/);
    updates = {
      checked: Date.now(),
      tosu: t.value ? { current: lt, latest: t.value.tag_name, available: !!lt && newer(t.value.tag_name, lt), asset: t.value.assets?.find(a => /windows/i.test(a.name))?.browser_download_url } : { error: t.reason?.message },
      danser: d.value ? { current: ld, latest: d.value.tag_name, available: canBuildDanser && !!ld && newer(d.value.tag_name, ld), asset: d.value.assets?.find(a => /win/i.test(a.name))?.browser_download_url, tag: d.value.tag_name, error: canBuildDanser ? undefined : 'Mis à jour avec l’édition portable de Replay HUD' } : { error: d.reason?.message },
      dancing: a.value ? { current: APP_VERSION, latest: a.value.tag_name, available: newer(a.value.tag_name, APP_VERSION), asset: a.value.assets?.find(x => /setup.*\.exe$/i.test(x.name))?.browser_download_url, notes: String(a.value.body || '').slice(0, 1500), url: a.value.html_url } : { current: APP_VERSION, error: a.reason?.message },
    };
    return updates;
  }
  // Dancing! : on télécharge l'installateur de la release, puis un petit script (détaché de l'appli) ferme Dancing!,
  // installe en mode silencieux dans ce même dossier et relance l'appli. data/, videos/ et les widgets installés ne sont pas dans l'installateur.
  async function updateDancing() {
    const u = updates?.dancing; if (!u?.available || !u.asset) throw Error('Aucune mise à jour de Dancing!.');
    if (path.basename(root) !== 'Dancing!') throw Error('La mise à jour automatique ne marche que depuis une installation de Dancing!.');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dancing-up-')), setup = path.join(tmp, 'Dancing!-Setup.exe'), cmd = path.join(tmp, 'update.cmd');
    log(`Téléchargement de Dancing! ${u.latest}…`); await download(u.asset, setup);
    fs.writeFileSync(cmd, [
      '@echo off', 'chcp 65001 >nul', 'title Mise a jour de Dancing!', 'timeout /t 2 /nobreak >nul',
      'taskkill /IM "Dancing!.exe" /T /F >nul 2>&1', 'timeout /t 2 /nobreak >nul',
      `"${setup}" --silent "${root}"`, 'if errorlevel 1 (echo La mise a jour a echoue. Relance l installateur a la main. & pause)',
      `start "" /d "${root}" "${path.join(root, 'Dancing!.exe')}"`, `rd /s /q "${tmp}" 2>nul`, ''].join('\r\n'));
    log('Dancing! va se fermer, s’installer puis redémarrer tout seul.');
    updateJob.restarting = true;
    // « start » passe par un cmd qui se termine aussitôt : le script n'est plus un enfant de Dancing! et survit au taskkill /T
    spawn('cmd.exe', ['/c', `start "" /min "${cmd}"`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
  }
  const log = l => { if (!l) return; updateJob.log.push(l); if (updateJob.log.length > 300) updateJob.log.shift(); };
  async function updateTosu() {
    const u = updates?.tosu; if (!u?.asset) throw Error('Aucune mise à jour tosu.');
    if (+(await ps('(Get-Process tosu -ErrorAction SilentlyContinue | Measure-Object).Count')) > 0) throw Error('Ferme tosu avant de le mettre à jour.');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-tosuup-')), zip = path.join(tmp, 't.zip'), out = path.join(tmp, 'x');
    log('Téléchargement de tosu ' + u.latest); await download(u.asset, zip);
    await unzip(zip, out);
    const exe = fs.readdirSync(out, { recursive: true }).find(f => /tosu\.exe$/i.test(f)); if (!exe) throw Error('tosu.exe absent de l’archive');
    fs.copyFileSync(path.join(tosuDir(), 'tosu.exe'), path.join(tosuDir(), 'tosu.exe.bak'));
    fs.copyFileSync(path.join(out, exe), path.join(tosuDir(), 'tosu.exe'));
    log('tosu mis à jour (ancienne version gardée en tosu.exe.bak).'); fsp.rm(tmp, { recursive: true, force: true });
  }
  // danser: our HUD export is re-applied on the new sources and rebuilt, then installed with the official binaries
  async function updateDanser() {
    const u = updates?.danser; if (!u?.asset) throw Error('Aucune mise à jour danser.');
    const build = danserBuild, patch = path.join(root, 'patch', 'danser-hud.patch');
    if (!canBuildDanser) throw Error('La mise à jour de danser nécessite une nouvelle édition portable de Replay HUD.');
    if (!fs.existsSync(patch)) throw Error('Patch Replay HUD introuvable.');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-danserup-')), srcZip = path.join(tmp, 'src.zip');
    log(`Téléchargement des sources de danser ${u.tag}…`); await download(`https://github.com/Wieku/danser-go/archive/refs/tags/${u.tag}.zip`, srcZip);
    log('Extraction…'); await unzip(srcZip, path.join(tmp, 'src'));
    const srcDir = path.join(tmp, 'src', fs.readdirSync(path.join(tmp, 'src'))[0]);
    log('Application de l’export HUD sur la nouvelle version…');
    // GNU patch (shipped with Git for Windows) tolerates context that moved between danser versions
    const gnuPatch = ['C:\\Program Files\\Git\\usr\\bin\\patch.exe', 'C:\\Program Files (x86)\\Git\\usr\\bin\\patch.exe'].find(f => fs.existsSync(f));
    const [cmd, args] = gnuPatch ? [gnuPatch, ['-p1', '--fuzz=3', '--binary', '--forward', '--batch', '-i', patch]] : ['git', ['apply', '--whitespace=nowarn', patch]];
    await new Promise((res, rej) => execFile(cmd, args, { cwd: srcDir, windowsHide: true, timeout: 120000 }, (e, o, er) => e ? rej(Error(`le patch ne s’applique pas sur ${u.tag} : ${(o + er).slice(-400)}`)) : res()));
    // API differences between danser versions, adapted after patching
    const iface = path.join(srcDir, 'app', 'rulesets', 'osu', 'performance', 'api', 'interfaces.go'), hx = path.join(srcDir, 'app', 'states', 'components', 'overlays', 'hudexport.go');
    if (fs.existsSync(iface) && /CalculateStrainPeaks\(bMap \*beatmap\.BeatMap/.test(fs.readFileSync(iface, 'utf8')))
      fs.writeFileSync(hx, fs.readFileSync(hx, 'utf8').replace('CalculateStrainPeaks(bm.HitObjects, bm.Diff)', 'CalculateStrainPeaks(bm, bm.Diff)'));
    log('Compilation (plusieurs minutes)…');
    await new Promise((res, rej) => { const p = spawn('powershell', ['-NoProfile', '-File', path.join(build, 'build-core.ps1'), '-Src', srcDir, '-Online'], { windowsHide: true }); p.stdout.on('data', d => log(String(d).trim())); p.stderr.on('data', d => log(String(d).trim())); p.on('close', c => c === 0 ? res() : rej(Error('compilation échouée'))); });
    log(`Binaires officiels de danser ${u.tag}…`); const bin = path.join(tmp, 'bin.zip'); await download(u.asset, bin);
    await unzip(bin, path.join(tmp, 'bin'));
    const dd = danserDir(), backup = `${dd}-backup-${u.current || 'old'}`;
    if (!fs.existsSync(backup)) await fsp.cp(dd, backup, { recursive: true, filter: s => !/[\\/](videos|cache|replays)([\\/]|$)/.test(s) });
    await fsp.cp(path.join(tmp, 'bin'), dd, { recursive: true, force: true, filter: s => !/[\\/]settings([\\/]|$)/.test(s) });
    fs.copyFileSync(path.join(build, 'danser-core-hud.dll'), path.join(dd, 'danser-core.dll'));
    log(`danser ${u.tag} installé avec l’export HUD (sauvegarde : ${backup}).`); fsp.rm(tmp, { recursive: true, force: true });
  }

  return {
    state: () => ({ userPresets: readJSON(presetsFile) || [], tosuInstalled: installed(), account: account(), updates }),
    checkUpdates, metadata,
    async handle(req, res, url) {
      const p = url.pathname;
      if (p.startsWith('/tosu/')) { serveWidget(req, res, p.slice(6)); return true; }
      if (p.startsWith('/tosu-settings/')) { send(res, 200, counterSettings(decodeURIComponent(p.slice(15)))); return true; }
      if (p === '/json/v2' || p === '/json') { const s = snapshot(); send(res, 200, s ? (p === '/json' ? s.v1 : s.v2) : { error: 'no data' }); return true; }
      if (p.startsWith('/files/beatmap/')) {
        const rest = decodeURIComponent(p.slice(15)), d = getJob()?.exportFile && readJSON(getJob().exportFile), songs = osuDir('Songs');
        if (!songs && !(rest === 'background' && d)) { send(res, 404, {}); return true; }
        const f = rest === 'background' && d ? path.join(d.meta.dir, d.meta.bg) : path.resolve(songs, rest);
        if (!(rest === 'background' && d) && !f.startsWith(path.resolve(songs) + path.sep)) send(res, 403, {}); else serveFile(req, res, f);
        return true;
      }
      if (p === '/api/calculate/pp') { send(res, 200, { pp: 0, stars: 0 }); return true; }
      if (req.method === 'GET' && p === '/api/store') { send(res, 200, storeList()); return true; }
      if (req.method === 'GET' && p.startsWith('/store/')) {
        const f = path.resolve(storeDir, decodeURIComponent(p.slice(7)));
        if (!f.startsWith(storeDir + path.sep)) send(res, 403, {}); else serveFile(req, res, f);
        return true;
      }
      if (req.method === 'GET' && p === '/api/tosu/catalog') { const c = await getCatalog(), inst = new Set(installed().map(i => i.folder)); send(res, 200, c.map(x => ({ id: x.id, name: x.name, author: x.author, version: x.version, resolution: x.resolution, image: x.assets?.find(a => a.type === 'image')?.url, installed: inst.has(folderOf(x)), folder: folderOf(x) }))); return true; }
      if (req.method === 'GET' && p === '/api/tosu/thumbnail') {
        const image = await thumbnail(url.searchParams.get('id'));
        if (image) send(res,200,image,'image/png'); else send(res,404,{error:'Miniature indisponible.'});
        return true;
      }
      if (req.method === 'GET' && p === '/api/updates') { send(res, 200, await checkUpdates()); return true; }
      if (req.method === 'GET' && p === '/api/update-job') { send(res, 200, updateJob); return true; }
      if (req.method !== 'POST' || !['/api/tosu/install', '/api/presets', '/api/osu-auth', '/api/update', '/api/widgets/create'].includes(p)) return false;
      if (req.headers['x-token'] !== ctx.token) { send(res, 403, { error: 'Jeton invalide' }); return true; }
      const input = JSON.parse((await body(req)).toString() || '{}');
      if (p === '/api/tosu/install') { send(res, 200, await install(input.id)); return true; }
      if (p === '/api/widgets/create') { send(res, 200, await createWidget(input)); return true; }
      if (p === '/api/presets') { if (!Array.isArray(input)) throw Error('Liste invalide'); await fsp.writeFile(presetsFile, JSON.stringify(input, null, 2)); send(res, 200, { ok: true }); return true; }
      if (p === '/api/osu-auth') {
        const { id, secret } = input;
        if (!/^\d+$/.test(String(id)) || String(secret || '').length < 20) throw Error('ID client (un nombre) ou clé secrète invalide.');
        await testCredentials(id, secret);
        const c = readJSON(credFile()) || {}; Object.assign(c, { ClientId: String(id), ClientSecret: String(secret), AuthType: 'ClientCredentials', AccessToken: '', RefreshToken: '' });
        await fsp.writeFile(credFile(), JSON.stringify(c, null, 2)); ctx.resetToken?.();
        send(res, 200, account()); return true;
      }
      if (p === '/api/update') {
        if (updateJob?.running) throw Error('Une mise à jour est déjà en cours.');
        if (getJob()?.running) throw Error('Attends la fin du rendu.');
        updateJob = { what: input.what, running: true, log: [], ok: false };
        (input.what === 'tosu' ? updateTosu() : input.what === 'dancing' ? updateDancing() : updateDanser()).then(() => { updateJob.ok = true; }).catch(e => log('Erreur : ' + e.message)).finally(() => { updateJob.running = false; checkUpdates().catch(() => {}); });
        send(res, 202, { ok: true }); return true;
      }
      return false;
    },
  };
}
