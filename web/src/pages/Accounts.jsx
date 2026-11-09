import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Trash2, RefreshCw, ShieldCheck, ShieldAlert, KeyRound, ClipboardPaste,
  ExternalLink, Zap, ChevronDown, Info, Wand2, Copy, CheckCircle2, Loader2, Puzzle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api, fmtAgo } from '../lib/api.js';
import { useAuth } from '../store/auth.jsx';
import { Badge, Button, Empty, Field, Input, Modal, Textarea, useToast, Spinner } from '../components/ui.jsx';

const STATUS = {
  ok: { tone: 'ok', label: '可用' },
  error: { tone: 'error', label: '异常' },
  unknown: { tone: 'warn', label: '待检测' },
  missing: { tone: 'error', label: '上游已删' },
};

export default function Accounts() {
  const toast = useToast();
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [guide, setGuide] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await api.accounts();
      setList(out.accounts);
      setSummary(out.summary || null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const refreshQuota = async (acc) => {
    setBusyId(acc.id);
    try {
      await api.refreshQuota(acc.upstreamId);
      await load();
      toast('额度已刷新', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const act = async (id, fn, okMsg) => {
    setBusyId(id);
    try {
      await fn(id);
      toast(okMsg, 'ok');
      await load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (acc) => {
    if (!confirm(`删除账号「${acc.label}」？`)) return;
    setBusyId(acc.id);
    try {
      await api.deleteAccount(acc.id);
      setList((l) => l.filter((a) => a.id !== acc.id));
      toast('已删除', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const quotaText = (q) => {
    if (!q) return '—';
    if (q.weeklyLeftPct != null) return `剩 ${q.weeklyLeftPct}%`;
    if (typeof q === 'string') return q;
    return '—';
  };
  void quotaText;

  return (
    <div className="mx-auto max-w-5xl p-5 lg:p-7">
      {/* 顶部 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-white">
            <KeyRound size={17} className="text-brand-400" /> muse 账号导入
          </h2>
          <p className="mt-0.5 text-[12.5px] text-mist-400">
            导入后所有生成都走这个账号池；{user?.role === 'admin' ? '管理员导入的账号公共可用' : '你导入的账号仅自己可见'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} loading={loading}>
            <RefreshCw size={13} /> 刷新
          </Button>
          <Button size="sm" onClick={() => setBindOpen(true)}>
            <Wand2 size={14} /> 一键绑定
          </Button>
          <Button variant="soft" size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} /> 粘贴
          </Button>
        </div>
      </div>

      {/* 账号池额度汇总 */}
      {summary?.usable > 0 && (
        <div className="mb-4 rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/[0.09] to-transparent p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] text-mist-400">账号池可用额度</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-[28px] font-bold leading-none text-white">
                  {summary.weeklyLeftPct != null ? `${summary.weeklyLeftPct}%` : '—'}
                </span>
                <span className="text-[11.5px] text-mist-400">平均剩余周额度</span>
              </p>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-[10px] text-ink-500">可用账号</p>
                <p className="font-mono text-[15px] text-mist-200">
                  {summary.usable}<span className="text-[11px] text-ink-500">/{summary.total}</span>
                </p>
              </div>
              {summary.pooledWeeklyPct != null && (
                <div>
                  <p className="text-[10px] text-ink-500">额度合计</p>
                  <p className="font-mono text-[15px] text-brand-300">{summary.pooledWeeklyPct}%</p>
                </div>
              )}
            </div>
          </div>

          {summary.weeklyLeftPct != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-brand-400 transition-all"
                style={{ width: `${Math.max(2, summary.weeklyLeftPct)}%` }}
              />
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-ink-500">
            {summary.weeklyReset && <span>{summary.weeklyReset} 重置</span>}
            {summary.tokensLeft?.length > 0 && <span>额外 {summary.tokensLeft.join('、')} tokens</span>}
            {summary.checkedAt && <span>更新于 {fmtAgo(summary.checkedAt * 1000)}</span>}
          </div>
        </div>
      )}

      {/* 使用说明 */}
      <div className="card mb-4 overflow-hidden">
        <button
          onClick={() => setGuide((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-mist-200">
            <Info size={14} className="text-brand-400" /> 怎么拿到 Cookie？
          </span>
          <ChevronDown size={15} className={clsx('text-mist-400 transition', guide && 'rotate-180')} />
        </button>
        {guide && (
          <div className="space-y-2.5 border-t border-ink-700 px-4 py-3.5 text-[12.5px] leading-relaxed text-mist-400">
            <p>
              <b className="text-mist-200">方式一（推荐，免 F12）</b>：点右上角
              <b className="text-brand-300">「一键绑定」</b>生成链接 → 在<span className="text-mist-200">已登录 muse.ai 的那个浏览器</span>里打开 →
              扩展自动读取登录态并入库。扩展只需装一次。
            </p>
            <p>
              <b className="text-mist-200">方式二（手动兜底）</b>：点「粘贴」，用 Chrome 打开{' '}
              <a className="text-brand-400 hover:underline" href="https://muse.ai/" target="_blank" rel="noreferrer">muse.ai <ExternalLink size={10} className="inline" /></a>
              {' '}登录 → <kbd className="rounded bg-ink-700 px-1.5 py-0.5 text-[11px]">F12</kbd> → <b className="text-mist-200">Application → Cookies → https://muse.ai</b> →
              复制整段（至少含 <code className="rounded bg-ink-700 px-1 text-[11px]">hatch_sess</code>）。
            </p>
            <p className="text-ink-500">会话约 48 小时有效，过期后重新绑定即可。多个账号可以重复绑定，池子自动轮转。</p>
          </div>
        )}
      </div>

      {/* 列表 */}
      {loading && !list.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="shimmer h-28 rounded-xl" />)}
        </div>
      ) : list.length === 0 ? (
        <Empty
          icon={KeyRound}
          title="账号池是空的"
          desc="导入至少一个 muse.ai 账号才能开始生成"
          action={<Button onClick={() => setOpen(true)}><Plus size={14} /> 导入第一个账号</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((a) => {
            const st = STATUS[a.status] || STATUS.unknown;
            const expiring = a.expiresAt && a.expiresAt * 1000 - Date.now() < 6 * 3600 * 1000;
            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13.5px] font-medium text-white">{a.label}</p>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {a.shared && <Badge tone="brand">公共池</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-ink-500">ID {a.upstreamId?.slice(0, 14) || '—'}</p>
                  </div>
                  {a.status === 'ok' ? (
                    <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
                  ) : (
                    <ShieldAlert size={16} className={clsx('shrink-0', a.status === 'error' ? 'text-rose-400' : 'text-amber-400')} />
                  )}
                </div>

                <div className="mt-3">
                  {a.quota?.weeklyLeftPct != null ? (
                    <>
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="text-mist-400">周额度</span>
                        <span className="font-mono text-mist-200">
                          剩 <b className="text-brand-300">{a.quota.weeklyLeftPct}%</b>
                          <span className="text-ink-500"> / 已用 {a.quota.weeklyUsedPct}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#1a2030]">
                        <div
                          className={clsx(
                            'h-full rounded-full transition-all',
                            a.quota.weeklyLeftPct > 40 ? 'bg-brand-400' : a.quota.weeklyLeftPct > 15 ? 'bg-gold-400' : 'bg-rose-400'
                          )}
                          style={{ width: `${Math.max(2, a.quota.weeklyUsedPct ?? 0)}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between font-mono text-[9.5px] text-ink-500">
                        <span>{a.quota.weeklyReset ? `${a.quota.weeklyReset} 重置` : '重置时间未知'}</span>
                        {a.quota.tokensLeft && <span>额外 {a.quota.tokensLeft} tokens</span>}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11px]">
                      <span className="text-mist-400">周额度</span>
                      <button
                        onClick={() => refreshQuota(a)}
                        disabled={busyId === a.id}
                        className="text-brand-400 hover:text-brand-300 disabled:opacity-50"
                      >
                        {busyId === a.id ? '查询中…' : '点此查询'}
                      </button>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11px]">
                    <span className="text-mist-400">有效期</span>
                    <span className={clsx('font-mono', expiring ? 'text-amber-300' : 'text-mist-200')}>
                      {a.expiresAt ? new Date(a.expiresAt * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  </div>
                </div>

                {a.note && <p className="mt-2 truncate text-[11px] text-ink-500" title={a.note}>{a.note}</p>}

                <div className="mt-3 flex gap-1.5">
                  <Button
                    variant="soft"
                    size="sm"
                    className="flex-1"
                    loading={busyId === a.id}
                    onClick={() => act(a.id, api.testAccount, '检测完成')}
                  >
                    <ShieldCheck size={12} /> 检测
                  </Button>
                  <Button
                    variant="soft"
                    size="sm"
                    className="flex-1"
                    disabled={busyId === a.id}
                    onClick={() => act(a.id, api.keepaliveAccount, '已尝试续期')}
                  >
                    <Zap size={12} /> 保活
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(a)} disabled={busyId === a.id}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ImportModal
        open={open}
        onClose={() => setOpen(false)}
        onDone={() => { setOpen(false); load(); }}
      />

      <BindModal
        open={bindOpen}
        onClose={() => setBindOpen(false)}
        onDone={load}
      />
    </div>
  );
}

function BindModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [code, setCode] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | creating | waiting | done | expired | error
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const link = code ? `${location.origin}/bind/${code.code}` : '';

  useEffect(() => {
    if (!open) {
      setCode(null);
      setStatus('idle');
      setErr('');
      return;
    }
    let cancelled = false;
    (async () => {
      setStatus('creating');
      setErr('');
      try {
        const out = await api.bindCode();
        if (cancelled) return;
        setCode(out);
        setStatus('waiting');
      } catch (e) {
        if (cancelled) return;
        setErr(e.message);
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // 轮询绑定状态
  useEffect(() => {
    if (status !== 'waiting' || !code) return undefined;
    const t = setInterval(async () => {
      try {
        const s = await api.bindStatus(code.code);
        if (s.status === 'done') {
          setStatus('done');
          onDone?.();
        } else if (s.status === 'expired') {
          setStatus('expired');
        }
      } catch (e) {
        if (e.status === 404) setStatus('expired');
      }
    }, 2500);
    return () => clearInterval(t);
  }, [status, code, onDone]);

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      toast('复制失败，请手动选中', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="免 F12 绑定账号">
      <div className="space-y-4">
        {/* 说明 */}
        <div className="rounded-xl border border-brand-500/25 bg-brand-500/8 p-3.5">
          <p className="text-[12.5px] leading-relaxed text-mist-300">
            在<span className="font-medium text-brand-300"> 已登录 muse.ai 的那个浏览器 </span>里打开下面的绑定链接，
            扩展会自动读取登录态并完成绑定 —— 不用再开 F12 找 Cookie。
          </p>
        </div>

        {/* 绑定码 / 链接 */}
        {status === 'creating' && (
          <div className="flex items-center gap-2 py-6 text-[13px] text-mist-400">
            <Loader2 size={15} className="animate-spin text-brand-400" /> 正在生成绑定码…
          </div>
        )}

        {code && (
          <>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-mist-300">绑定链接</span>
                <span className="text-[11px] text-ink-500">20 分钟内有效</span>
              </div>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1 truncate rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-[11.5px] text-mist-300">
                  {link}
                </div>
                <Button variant="soft" size="sm" onClick={() => copy(link, 'link')}>
                  {copied === 'link' ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                </Button>
                <a href={link} target="_blank" rel="noreferrer">
                  <Button size="sm">打开</Button>
                </a>
              </div>
            </div>

            <div className="rounded-xl bg-ink-900 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-mist-400">绑定码（扩展里可手动填）</span>
                <button
                  onClick={() => copy(code.code, 'code')}
                  className="flex items-center gap-1 text-[11.5px] text-brand-400 hover:text-brand-300"
                >
                  <Copy size={11} /> {copied === 'code' ? '已复制' : '复制'}
                </button>
              </div>
              <p className="mt-1 break-all font-mono text-[12.5px] text-mist-200">{code.code}</p>
            </div>
          </>
        )}

        {/* 状态 */}
        {status === 'waiting' && (
          <div className="flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2.5 text-[12.5px] text-mist-400">
            <Loader2 size={14} className="animate-spin text-brand-400" />
            等待扩展提交…打开链接后会自动完成
          </div>
        )}
        {status === 'done' && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-300">
            <CheckCircle2 size={14} /> 绑定成功，账号已进入你的账号池
          </div>
        )}
        {status === 'expired' && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-200">
            绑定码已过期，关掉这个窗口重新点「一键绑定」
          </div>
        )}
        {status === 'error' && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[12.5px] text-rose-300">
            {err || '生成绑定码失败'}
          </div>
        )}

        {/* 扩展安装 */}
        <div className="rounded-xl border border-ink-700 overflow-hidden">
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
          >
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-mist-200">
              <Puzzle size={13} className="text-brand-400" /> 还没装扩展？点这里
            </span>
            <ChevronDown size={14} className={clsx('text-mist-400 transition', showHelp && 'rotate-180')} />
          </button>
          {showHelp && (
            <div className="border-t border-ink-700 px-3.5 py-3">
              <ol className="space-y-1.5 pl-4 text-[11.5px] leading-relaxed text-mist-400" style={{ listStyle: 'decimal' }}>
                <li>下载下面的扩展包并解压到任意目录（别删）</li>
                <li>Chrome 地址栏进 <code className="rounded bg-ink-700 px-1">chrome://extensions</code>，打开右上角「开发者模式」</li>
                <li>点「加载已解压的扩展程序」，选解压出的文件夹</li>
                <li>回到本窗口刷新页面，扩展会出现在工具栏</li>
              </ol>
              <a href="/download/museapi-video-extension.zip" download>
                <Button variant="soft" size="sm" className="mt-2.5 w-full">下载扩展包 (.zip)</Button>
              </a>
              <p className="mt-2 text-[11px] text-ink-500">
                装一次即可，之后每次绑定只要点「一键绑定」。
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            {status === 'done' ? '完成' : '关闭'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }) {  const toast = useToast();
  const [label, setLabel] = useState('');
  const [cookie, setCookie] = useState('');
  const [busy, setBusy] = useState(false);

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setCookie(t.trim());
    } catch {
      toast('浏览器不允许读剪贴板，请手动粘贴', 'error');
    }
  };

  const submit = async () => {
    if (cookie.trim().length < 10) return toast('请粘贴 Cookie', 'error');
    setBusy(true);
    try {
      const out = await api.importAccount({ label: label.trim() || undefined, cookie: cookie.trim() });
      if (out.essentialMissing?.length) {
        toast(`导入成功，但缺少 ${out.essentialMissing.join(', ')}，可能无法生成`, 'error');
      } else {
        toast('账号已入库', 'ok');
      }
      setLabel(''); setCookie('');
      onDone();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="导入 Muse 账号">
      <div className="space-y-3.5">
        <Field label="备注名" hint="方便区分多个账号，可留空">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="比如：主号 / 小号A" />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-mist-300">Cookie</span>
            <button onClick={paste} className="flex items-center gap-1 text-[11.5px] text-brand-400 hover:text-brand-300">
              <ClipboardPaste size={11} /> 读剪贴板
            </button>
          </div>
          <Textarea
            rows={6}
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder={'hatch_sess=eyJhbGciOi...; hatch_vml=...; 其他项'}
            className="font-mono text-[11.5px]"
          />
          <p className="mt-1 text-[11px] text-ink-500">
            必须包含 <code className="rounded bg-ink-800 px-1">hatch_sess</code>。整段粘贴即可，多余的换行会自动清理。
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={submit} loading={busy}>导入</Button>
        </div>
      </div>
    </Modal>
  );
}
