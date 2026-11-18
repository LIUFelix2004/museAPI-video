import { useEffect, useMemo, useState } from 'react';
import {
  X, Chrome, Loader2, CheckCircle2, AlertTriangle, RefreshCw, ShieldAlert, RotateCcw, Zap, Plug, Search,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../lib/api.js';
import { useToast } from './ui.jsx';

/**
 * 多环境导入：
 *  - 本机 Chrome：可指定 profile（多账号 / 多环境常见）
 *  - 自定义 CDP 端口：接 AdsPower / BitBrowser 等指纹浏览器
 */
export default function ChromeImportModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [source, setSource] = useState('chrome'); // chrome | port
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | working | done | error
  const [msg, setMsg] = useState('');
  const [label, setLabel] = useState('');
  const [result, setResult] = useState(null);

  const [profileDir, setProfileDir] = useState('');
  const [customPort, setCustomPort] = useState('9222');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const port = source === 'port' ? Number(customPort) || 9222 : 9222;

  const check = async () => {
    setChecking(true);
    try {
      const s = await api.chromeStatus(port);
      setStatus(s);
      if (!profileDir && s.profiles?.length) setProfileDir(s.profiles[0].dir);
    } catch (e) {
      setPhase('error');
      setMsg(e.message);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setMsg('');
      setResult(null);
      return;
    }
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, port]);

  const currentProfile = useMemo(
    () => status?.profiles?.find((p) => p.dir === profileDir) || null,
    [status, profileDir]
  );

  if (!open) return null;

  const doBind = async () => {
    setPhase('working');
    setMsg(source === 'port' ? `正在连接 ${port} 端口…` : '正在重启 Chrome 并读取 Cookie…');
    // 没填备注名时，自动用环境名，方便多账号区分
    const fallbackLabel = source === 'chrome'
      ? (currentProfile?.name || 'chrome')
      : `port-${port}`;
    const finalLabel = label.trim() || fallbackLabel;
    try {
      const out = source === 'port'
        ? await api.chromeBind(finalLabel, port)
        : await api.chromeRestartBind(finalLabel, profileDir || undefined);
      setResult(out);
      setPhase('done');
      toast('账号已导入', 'ok');
      onDone?.();
    } catch (e) {
      setPhase('error');
      setMsg(e.message);
    }
  };

  const closeDebug = async () => {
    try {
      await api.chromeCloseDebug();
      toast('已关闭调试模式', 'ok');
      await check();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const scanPorts = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const out = await api.chromeScan();
      setScanResult(out);
      if (out.ports?.length) {
        // 优先选有 muse 登录态的那个
        const best = out.ports.find((p) => p.hasMuse === true) || out.ports[0];
        setCustomPort(String(best.port));
        toast(`找到 ${out.ports.length} 个 CDP 端口`, 'ok');
      } else {
        toast('没发现 CDP 端口，请先启动浏览器环境', 'error');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const portReady = status?.debugPortReady;
  const needsRestart = source === 'chrome' && status && !portReady;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-[#1e2432] bg-ink-850 shadow-2xl fade-in">
        <div className="flex items-center justify-between border-b border-[#1e2432] px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-white">
            <Chrome size={15} className="text-brand-400" /> 从浏览器自动导入
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-mist-400 hover:bg-ink-700 hover:text-white">
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 来源切换 */}
          <div className="flex gap-1 rounded-xl bg-ink-900 p-1">
            {[
              ['chrome', '本机 Chrome', Chrome],
              ['port', '自定义端口', Plug],
            ].map(([k, text, Icon]) => (
              <button
                key={k}
                onClick={() => setSource(k)}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-medium transition',
                  source === k ? 'bg-[#182030] text-white' : 'text-mist-400 hover:text-mist-200'
                )}
              >
                <Icon size={13} /> {text}
              </button>
            ))}
          </div>

          {/* 本机 Chrome */}
          {source === 'chrome' && (
            <>
              <div>
                <label className="mb-1.5 block text-[12px] text-mist-300">
                  浏览器环境（Profile）
                  {status?.profiles?.length > 0 && (
                    <span className="ml-1 text-ink-500">共 {status.profiles.length} 个</span>
                  )}
                </label>
                {checking ? (
                  <div className="flex items-center gap-2 py-2 text-[12px] text-mist-400">
                    <Loader2 size={12} className="animate-spin" /> 读取中…
                  </div>
                ) : status?.profiles?.length ? (
                  <select
                    value={profileDir}
                    onChange={(e) => setProfileDir(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#1e2432] bg-ink-900 px-3 text-[12.5px] text-mist-100 outline-none focus:border-brand-500/50"
                  >
                    {status.profiles.map((p) => (
                      <option key={p.dir} value={p.dir}>
                        {p.name}　（{p.dir}
                        {p.activeTime ? ` · ${new Date(p.activeTime).toLocaleDateString('zh-CN')}` : ''}）
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[12px] text-mist-400">没有读到 profile 列表</p>
                )}
                {currentProfile && (
                  <p className="mt-1 font-mono text-[10.5px] text-ink-500">
                    将在「{currentProfile.name}」这个环境里读取 muse.ai 登录态
                  </p>
                )}
              </div>

              {needsRestart && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-amber-200">
                    <AlertTriangle size={13} /> 需要重启 Chrome
                  </p>
                  <ul className="mt-1.5 space-y-1 pl-4 text-[11.5px] leading-relaxed text-amber-200/80" style={{ listStyle: 'disc' }}>
                    <li>会关闭当前所有 Chrome 窗口（含其他 profile）</li>
                    <li>重启后自动切到上面选的环境，标签页会恢复</li>
                    <li>确保这个环境里 muse.ai 是登录状态</li>
                  </ul>
                </div>
              )}
            </>
          )}

          {/* 自定义端口 */}
          {source === 'port' && (
            <>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[12px] text-mist-300">CDP 调试端口</label>
                  <button
                    onClick={scanPorts}
                    disabled={scanning}
                    className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 disabled:opacity-50"
                  >
                    {scanning ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />}
                    {scanning ? '扫描中…' : '扫描本机'}
                  </button>
                </div>
                <input
                  value={customPort}
                  onChange={(e) => setCustomPort(e.target.value.replace(/\D/g, ''))}
                  placeholder="9222"
                  className="h-10 w-full rounded-lg border border-[#1e2432] bg-ink-900 px-3 font-mono text-[12.5px] text-mist-100 outline-none focus:border-brand-500/50"
                />

                {/* 扫描结果 */}
                {scanResult && (
                  <div className="mt-2 rounded-lg border border-[#232a38] bg-ink-900/60 p-2">
                    {scanResult.ports?.length === 0 ? (
                      <p className="px-1 py-1 text-[11px] leading-relaxed text-mist-400">
                        扫描了 {scanResult.scanned} 个监听端口，没有发现 CDP 调试端口。
                        <br />
                        说明目前没有浏览器以调试模式运行 —— 先在 AdsPower / BitBrowser 里启动环境。
                      </p>
                    ) : (
                      <>
                        <p className="mb-1.5 px-1 text-[10.5px] text-ink-500">
                          扫描 {scanResult.scanned} 个端口，找到 {scanResult.ports.length} 个 CDP：
                        </p>
                        <div className="space-y-1">
                          {scanResult.ports.map((p) => (
                            <button
                              key={p.port}
                              onClick={() => setCustomPort(String(p.port))}
                              className={clsx(
                                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition',
                                Number(customPort) === p.port ? 'bg-brand-500/15' : 'hover:bg-[#182030]'
                              )}
                            >
                              <span className="flex items-center gap-2">
                                <span className="font-mono text-[12px] text-mist-100">{p.port}</span>
                                <span className="text-[10px] text-mist-400">{p.browser}</span>
                              </span>
                              {p.hasMuse === true ? (
                                <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[9.5px] text-brand-300">
                                  有 muse 登录态
                                </span>
                              ) : p.hasMuse === false ? (
                                <span className="text-[9.5px] text-ink-500">未登录 muse</span>
                              ) : (
                                <span className="text-[9.5px] text-ink-500">?</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <p className="mt-1.5 text-[11px] leading-relaxed text-mist-400">
                  适用于 AdsPower / BitBrowser 等指纹浏览器：先启动目标环境，再点「扫描本机」自动发现端口。
                </p>
              </div>

              {status?.fingerprintBrowsers?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {status.fingerprintBrowsers.map((b) => (
                    <span key={b.name} className="rounded-full border border-[#232a38] px-2.5 py-1 text-[10.5px] text-mist-400">
                      检测到 {b.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-[#232a38] px-3 py-2.5">
                <p className="text-[11px] leading-relaxed text-mist-400">
                  <b className="text-mist-200">AdsPower</b>：启动环境后，在其 API 响应或设置里能看到调试端口。<br />
                  <b className="text-mist-200">BitBrowser</b>：环境详情里有「调试端口」字段。<br />
                  端口只接受本机连接（127.0.0.1）。
                </p>
              </div>
            </>
          )}

          {/* 连接状态 */}
          {!checking && status && (
            <div className="space-y-1.5 rounded-xl bg-ink-900 p-3">
              <Row label="Chrome 已安装" ok={status.chromeInstalled} value={status.chromeInstalled ? '是' : '否'} />
              {source === 'chrome' && (
                <Row label="Chrome 正在运行" value={status.chromeRunning ? `${status.chromeRunning} 个进程` : '未运行'} />
              )}
              <Row
                label={`端口 ${status.debugPort}`}
                ok={portReady}
                value={portReady ? `已连接（${status.browser}）` : '未响应'}
              />
            </div>
          )}

          {/* 备注名 */}
          {(phase === 'idle' || phase === 'error') && (
            <div>
              <label className="mb-1.5 block text-[12px] text-mist-300">备注名（可留空）</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={currentProfile ? `比如：${currentProfile.name}` : '比如：主号'}
                className="h-9 w-full rounded-lg border border-[#1e2432] bg-ink-900 px-3 text-[12.5px] text-mist-100 outline-none placeholder:text-mist-400/60 focus:border-brand-500/50"
              />
            </div>
          )}

          {phase === 'working' && (
            <div className="flex items-center gap-2 rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-2.5 text-[12.5px] text-brand-200">
              <Loader2 size={14} className="animate-spin" /> {msg}
            </div>
          )}

          {phase === 'done' && result && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-300">
                <CheckCircle2 size={14} /> 导入成功
              </p>
              <p className="mt-1 text-[11.5px] text-mist-400">
                账号：{result.account?.label} · 读到 {result.cookieCount} 条 Cookie
                {result.restarted && '（Chrome 已重启）'}
              </p>
              {result.warning && <p className="mt-1 text-[11px] text-amber-300">{result.warning}</p>}
            </div>
          )}

          {phase === 'error' && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5">
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-rose-300">
                <AlertTriangle size={13} /> 导入失败
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-rose-200/80">{msg}</p>
            </div>
          )}

          {portReady && (
            <div className="flex items-start gap-2 rounded-lg border border-[#232a38] px-3 py-2">
              <ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="text-[10.5px] leading-relaxed text-mist-400">
                调试端口开启期间，本机任何程序都能读到该浏览器的 Cookie。用完可点左下角关掉。
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#1e2432] px-5 py-3">
          {source === 'chrome' && portReady && (
            <button
              onClick={closeDebug}
              className="mr-auto flex items-center gap-1 rounded-lg border border-[#232a38] px-3 py-1.5 text-[11.5px] text-mist-400 hover:border-rose-500/40 hover:text-rose-300"
            >
              <RotateCcw size={11} /> 关闭调试模式
            </button>
          )}

          <button onClick={onClose} className="rounded-lg border border-[#232a38] px-4 py-1.5 text-[12px] text-mist-300">
            {phase === 'done' ? '完成' : '取消'}
          </button>

          {(phase === 'idle' || phase === 'error') && (
            <>
              {phase === 'error' && (
                <button onClick={check} className="flex items-center gap-1 rounded-lg border border-[#232a38] px-4 py-1.5 text-[12px] text-mist-300">
                  <RefreshCw size={11} /> 重新检查
                </button>
              )}
              <button
                onClick={doBind}
                disabled={!status?.chromeInstalled || checking}
                className="flex items-center gap-1.5 rounded-lg brand-gradient px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
              >
                <Zap size={12} />
                {source === 'port'
                  ? '连接并导入'
                  : portReady ? '立即读取并导入' : '重启 Chrome 并导入'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between text-[11.5px]">
      <span className="text-mist-400">{label}</span>
      <span className={clsx('font-mono', ok === true ? 'text-brand-300' : ok === false ? 'text-amber-300' : 'text-mist-200')}>
        {value}
      </span>
    </div>
  );
}
