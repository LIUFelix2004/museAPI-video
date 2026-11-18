// 技术验证：通过 CDP 读取 Chrome 里 muse.ai 的 cookie（含 HttpOnly）
// 用一个独立 profile 的临时 Chrome 实例，不影响用户日常浏览器
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;
const PROFILE = path.join(process.env.TEMP || '.', 'museapi-cdp-probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('启动临时 Chrome（独立 profile，端口 ' + PORT + '）…');
const child = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  'https://muse.ai/',
], { detached: false, stdio: 'ignore' });

async function waitPort(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* 还没起来 */ }
    await sleep(500);
  }
  throw new Error('Chrome 调试端口未就绪');
}

let version;
try {
  version = await waitPort();
  console.log('CDP 就绪:', version.Browser);
  console.log('WebSocket:', version.webSocketDebuggerUrl.slice(0, 60) + '…');

  // 用 WebSocket 发 CDP 命令
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('WebSocket 连接失败'));
  });
  console.log('✅ WebSocket 已连接');

  const send = (id, method, params = {}) => new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener('message', onMsg);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error('CDP 超时')), 10000);
  });

  // 关键：Storage.getCookies 能拿到全部 cookie，包括 HttpOnly
  const { cookies } = await send(1, 'Storage.getCookies');
  console.log(`\n总共读到 ${cookies.length} 条 cookie`);

  const muse = cookies.filter((c) => c.domain && c.domain.includes('muse.ai'));
  console.log(`其中 muse.ai 相关: ${muse.length} 条`);
  for (const c of muse) {
    console.log(`  ${c.name.padEnd(26)} httpOnly=${String(c.httpOnly).padEnd(5)} len=${String(c.value.length).padEnd(5)}`);
  }

  const hasSess = muse.some((c) => c.name === 'hatch_sess');
  console.log(`\n${hasSess ? '✅' : '⚠️'} hatch_sess ${hasSess ? '已读到' : '不存在（这个临时 profile 没登录过 muse.ai，符合预期）'}`);
  console.log('\n结论：CDP 通道可用，能读取 HttpOnly cookie。');

  ws.close();
} catch (e) {
  console.log('❌ 验证失败:', e.message);
} finally {
  try { child.kill(); } catch { /* ignore */ }
  await sleep(800);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* ignore */ }
  console.log('已清理临时 profile');
}
