import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import { upsertAccount, db } from '../db.js';
import * as muse from '../muse.js';

const execFileP = promisify(execFile);
const r = Router();

const CHROME_CANDIDATES = [
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
];

function chromePath() {
  return CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || null;
}

const CDP_PORT = 9222;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Chrome User Data 根目录 */
function userDataDir() {
  return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
}

/** 列出本机 Chrome 的所有 profile（来自 Local State） */
function listChromeProfiles() {
  const ls = path.join(userDataDir(), 'Local State');
  if (!fs.existsSync(ls)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(ls, 'utf8'));
    const cache = j?.profile?.info_cache || {};
    return Object.entries(cache)
      .map(([dir, v]) => ({
        dir,
        name: v?.name || dir,
        activeTime: v?.active_time ? Math.round(v.active_time * 1000) : null,
      }))
      .sort((a, b) => (b.activeTime || 0) - (a.activeTime || 0));
  } catch {
    return [];
  }
}

async function cdpVersion(port = CDP_PORT, timeout = 1500) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 通过 CDP 读取全部 cookie（含 HttpOnly） */
async function readAllCookies(port = CDP_PORT) {
  const ver = await cdpVersion(port, 3000);
  if (!ver?.webSocketDebuggerUrl) throw new Error('调试端口未就绪');

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WebSocket 连接超时')), 8000);
    ws.onopen = () => { clearTimeout(t); resolve(); };
    ws.onerror = () => { clearTimeout(t); reject(new Error('WebSocket 连接失败')); };
  });

  const send = (id, method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP ${method} 超时`)), 15000);
    const onMsg = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMsg);
      msg.error ? reject(new Error(msg.error.message || 'CDP 错误')) : resolve(msg.result);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });

  try {
    const { cookies } = await send(1, 'Storage.getCookies');
    return cookies || [];
  } finally {
    try { ws.close(); } catch { /* ignore */ }
  }
}

/** 优雅关闭 Chrome（只关有窗口的主进程），必要时强杀 */
async function stopChrome() {
  try {
    await execFileP('powershell', ['-NoProfile', '-Command',
      "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.CloseMainWindow() | Out-Null }",
    ], { timeout: 10000 });
  } catch { /* ignore */ }

  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const running = await execFileP('powershell', ['-NoProfile', '-Command',
      "(Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object).Count",
    ], { timeout: 5000 }).then((o) => parseInt(String(o.stdout).trim(), 10) || 0).catch(() => 0);
    if (running === 0) return { ok: true, forced: false };
  }

  // 兜底强杀
  try {
    await execFileP('taskkill', ['/IM', 'chrome.exe', '/F'], { timeout: 10000 });
    await sleep(2000);
    return { ok: true, forced: true };
  } catch {
    return { ok: false, forced: true };
  }
}

async function startChromeWithDebug(port = CDP_PORT, profileDir = null) {
  const exe = chromePath();
  if (!exe) throw new Error('没有找到 Chrome，请确认已安装');

  const args = [
    `--remote-debugging-port=${port}`,
    '--restore-last-session',
    '--no-first-run',
  ];
  // 指定 profile（多环境场景）
  if (profileDir) args.push(`--profile-directory=${profileDir}`);

  const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
  child.unref();

  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const v = await cdpVersion(port);
    if (v) return v;
  }
  throw new Error('Chrome 启动后调试端口未就绪');
}

export function pickMuseCookies(cookies) {
  const muse = (cookies || []).filter((c) => c.domain && c.domain.includes('muse.ai'));
  // 去重（同名取路径最短的）
  const map = new Map();
  for (const c of muse) {
    const cur = map.get(c.name);
    if (!cur || (c.path || '').length < (cur.path || '').length) map.set(c.name, c);
  }
  return [...map.values()];
}

export function buildCookieHeader(items) {
  return items.map((c) => `${c.name}=${c.value}`).join('; ');
}

/* ------------------------------ 状态 ------------------------------ */
r.get('/chrome/status', requireAuth, requireAdmin, async (req, res) => {
  const exe = chromePath();
  const port = Number(req.query?.port) || CDP_PORT;
  const running = await execFileP('powershell', ['-NoProfile', '-Command',
    "(Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object).Count",
  ], { timeout: 5000 }).then((o) => parseInt(String(o.stdout).trim(), 10) || 0).catch(() => 0);

  const ver = await cdpVersion(port);
  const profiles = listChromeProfiles();
  res.json({
    chromeInstalled: !!exe,
    chromePath: exe,
    chromeRunning: running,
    debugPortReady: !!ver,
    debugPort: port,
    browser: ver?.Browser || null,
    profiles,
    // 指纹浏览器探测（只报是否安装，不代表正在运行）
    fingerprintBrowsers: [
      { name: 'AdsPower', detected: fs.existsSync(path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'AdsPower Global')) },
      { name: 'BitBrowser', detected: fs.existsSync(path.join(process.env.LOCALAPPDATA || '', 'BitBrowser')) },
    ].filter((x) => x.detected),
  });
});

/* ------------------- 列出 Chrome 的 profile（供环境选择） ------------------- */
r.get('/chrome/profiles', requireAuth, requireAdmin, (_req, res) => {
  res.json({ profiles: listChromeProfiles(), userDataDir: userDataDir() });
});

/* ------------------- 扫描本机正在监听的 CDP 端口 ------------------- */
r.post('/chrome/scan', requireAuth, requireAdmin, async (_req, res) => {
  let ports = [];
  try {
    const { stdout } = await execFileP('powershell', ['-NoProfile', '-Command',
      'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort | Sort-Object -Unique',
    ], { timeout: 15000 });
    ports = String(stdout)
      .split(/\r?\n/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0 && n < 65536);
  } catch (e) {
    return res.status(500).json({ error: `读取端口列表失败：${e.message}` });
  }

  // 排除本项目自己的端口，避免误导
  const skip = new Set([8787, 18610, 19210, 5173]);
  const candidates = [...new Set(ports)].filter((p) => !skip.has(p));

  const found = [];
  await Promise.all(candidates.map(async (port) => {
    const v = await cdpVersion(port, 700);
    if (v && v.webSocketDebuggerUrl) {
      found.push({
        port,
        browser: v.Browser || 'Chromium',
        // 顺便看看这个浏览器里有没有 muse.ai 的 cookie
        hasMuse: null,
      });
    }
  }));

  // 对找到的端口逐个检查是否有 muse.ai 登录态（并发，单个失败不影响整体）
  await Promise.all(found.map(async (item) => {
    try {
      const cookies = await readAllCookies(item.port);
      const museCookies = pickMuseCookies(cookies);
      item.hasMuse = museCookies.some((c) => c.name === 'hatch_sess');
      item.museCookies = museCookies.length;
    } catch {
      item.hasMuse = null;
    }
  }));

  found.sort((a, b) => (b.hasMuse === true) - (a.hasMuse === true) || a.port - b.port);

  res.json({
    scanned: candidates.length,
    ports: found,
  });
});

/* --------------------- 一键读取（不重启，端口已开） --------------------- */
r.post('/chrome/bind', requireAuth, requireAdmin, async (req, res) => {
  const label = String(req.body?.label || '').slice(0, 40) || `chrome-${new Date().toISOString().slice(5, 16)}`;
  const port = Number(req.body?.port) || CDP_PORT;

  let cookies;
  try {
    cookies = await readAllCookies(port);
  } catch (e) {
    return res.status(409).json({ error: `读不到 ${port} 端口的 Cookie：${e.message}`, needRestart: true });
  }

  const museCookies = pickMuseCookies(cookies);
  const header = buildCookieHeader(museCookies);

  if (!museCookies.length) {
    return res.status(400).json({ error: '这个 Chrome 里没有 muse.ai 的 Cookie，请先在 Chrome 里登录 muse.ai' });
  }
  if (!/hatch_sess=/.test(header)) {
    return res.status(400).json({ error: '读到了 muse.ai 的 Cookie，但没有 hatch_sess，登录态可能已失效' });
  }

  try {
    const out = await muse.addAccount({ label, cookie: header });
    const added = (out.added || [])[0];
    if (!added) throw new Error('上游未返回账号信息');
    const row = upsertAccount({
      upstreamId: added.id,
      label: added.label,
      ownerId: req.user.role === 'admin' ? null : req.user.id,
      status: 'unknown',
      expiresAt: added.expires_at || null,
    });
    res.json({
      ok: true,
      account: { id: row.id, label: row.label, upstreamId: row.upstream_id },
      cookieCount: museCookies.length,
      warning: out.warning || null,
    });
  } catch (e) {
    res.status(502).json({ error: `上游拒绝导入：${e.message}` });
  }
});

/* --------------------- 重启 Chrome 并读取 --------------------- */
r.post('/chrome/restart-bind', requireAuth, requireAdmin, async (req, res) => {
  const label = String(req.body?.label || '').slice(0, 40) || `chrome-${new Date().toISOString().slice(5, 16)}`;
  const profileDir = req.body?.profileDir ? String(req.body.profileDir).slice(0, 64) : null;

  if (!chromePath()) return res.status(400).json({ error: '没有找到 Chrome' });

  // 已经是调试模式就直接读
  let ver = await cdpVersion();
  let restarted = false;

  if (!ver) {
    const stop = await stopChrome();
    if (!stop.ok) return res.status(500).json({ error: 'Chrome 无法关闭，请手动退出后重试' });
    try {
      ver = await startChromeWithDebug(CDP_PORT, profileDir);
      restarted = true;
    } catch (e) {
      return res.status(500).json({ error: `Chrome 启动失败：${e.message}` });
    }
  }

  let cookies;
  try {
    cookies = await readAllCookies();
  } catch (e) {
    return res.status(502).json({ error: `读取 Cookie 失败：${e.message}` });
  }

  const museCookies = pickMuseCookies(cookies);
  if (!museCookies.length) {
    return res.status(400).json({
      error: '重启后的 Chrome 里没有 muse.ai 的 Cookie。请在这个 Chrome 里登录 muse.ai，再点一次「自动导入」。',
      restarted,
    });
  }

  const header = buildCookieHeader(museCookies);
  if (!/hatch_sess=/.test(header)) {
    return res.status(400).json({ error: '读到 Cookie 但没有 hatch_sess，登录态无效', restarted });
  }

  try {
    const out = await muse.addAccount({ label, cookie: header });
    const added = (out.added || [])[0];
    if (!added) throw new Error('上游未返回账号信息');
    const row = upsertAccount({
      upstreamId: added.id,
      label: added.label,
      ownerId: null,
      status: 'unknown',
      expiresAt: added.expires_at || null,
    });
    res.json({
      ok: true,
      restarted,
      account: { id: row.id, label: row.label, upstreamId: row.upstream_id },
      cookieCount: museCookies.length,
      warning: out.warning || null,
    });
  } catch (e) {
    res.status(502).json({ error: `上游拒绝导入：${e.message}`, restarted });
  }
});

/* --------------------- 关闭调试模式（重启成普通 Chrome） --------------------- */
r.post('/chrome/close-debug', requireAuth, requireAdmin, async (_req, res) => {
  const ver = await cdpVersion();
  if (!ver) return res.json({ ok: true, note: '当前不是调试模式' });
  const stop = await stopChrome();
  if (!stop.ok) return res.status(500).json({ error: 'Chrome 无法关闭' });
  // 普通启动（不带调试端口）
  const exe = chromePath();
  if (exe) {
    const child = spawn(exe, ['--restore-last-session', '--no-first-run'], { detached: true, stdio: 'ignore' });
    child.unref();
  }
  res.json({ ok: true });
});

export default r;
