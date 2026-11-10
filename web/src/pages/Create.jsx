import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Sparkles, X, Loader2, RefreshCw, AlertTriangle, Image as ImageIcon, ChevronDown, Zap,
  SlidersHorizontal, Clock, Check, Users, Bell, Trash2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api, fmtAgo } from '../lib/api.js';
import { useAuth } from '../store/auth.jsx';
import { useToast, Modal } from '../components/ui.jsx';
import QueueDrawer from '../components/QueueDrawer.jsx';
import ParamsPanel, { buildExtra, PARAM_DEFAULTS } from '../components/ParamsPanel.jsx';

const IDEAS = [
  '国风少女：汉服少女立于桃花树下，花瓣纷飞，电影感光效',
  '赛博都市：雨夜霓虹街道，机甲少年回眸，赛博朋克风格',
  '水墨山水：云雾缭绕的黄山奇松，水墨晕染，大面积留白',
  '柴犬侦探：戴圆框眼镜的柴犬，复古英伦风插画，暖色调',
];

const STORE_KEY = 'xm_projects';

export default function Create() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [projects, setProjects] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
  });
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState('');

  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [size, setSize] = useState('16:9');
  const [refs, setRefs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [modelOpen, setModelOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [params, setParams] = useState({ ...PARAM_DEFAULTS });
  const [summary, setSummary] = useState(null);

  const fileRef = useRef(null);
  const pollRef = useRef(null);

  const cost = 10 + 2 * duration;

  /* ---------- 项目 ---------- */
  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(projects));
  }, [projects]);

  const addProject = () => {
    const name = window.prompt('请输入项目名称（必填）', '');
    if (!name?.trim()) return;
    const p = { id: 'p_' + Date.now(), name: name.trim(), createdAt: Date.now() };
    setProjects((list) => [p, ...list]);
    setActive(p.id);
    toast('项目已创建', 'ok');
  };

  const removeProject = (e, id) => {
    e.stopPropagation();
    if (!window.confirm('确认删除这个项目？')) return;
    setProjects((list) => list.filter((p) => p.id !== id));
    if (active === id) setActive(null);
  };

  const filtered = projects.filter((p) => !query || p.name.includes(query));

  /* ---------- 任务 ---------- */
  const loadJobs = useCallback(async () => {
    try {
      const out = await api.jobs({ pageSize: 18 });
      setJobs(out.jobs);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // 账号池额度（顶栏与底部提示共用）
  useEffect(() => {
    let alive = true;
    const load = () => api.accounts()
      .then((d) => { if (alive) setSummary(d.summary); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // 有运行中的任务就轮询
  useEffect(() => {
    const running = jobs.some((j) => ['queued', 'processing'].includes(j.status));
    if (!running) return undefined;
    pollRef.current = setTimeout(async () => {
      const next = await Promise.all(
        jobs.map(async (j) => {
          if (!['queued', 'processing'].includes(j.status)) return j;
          try { return (await api.job(j.id)).job; } catch { return j; }
        })
      );
      setJobs(next);
      if (next.some((j) => ['queued', 'processing'].includes(j.status)) === false) refresh();
    }, 2500);
    return () => clearTimeout(pollRef.current);
  }, [jobs, refresh]);

  /* ---------- 上传 ---------- */
  const onPick = async (files) => {
    if (!files?.length) return;
    if (refs.length + files.length > 3) return toast('最多 3 张参考图', 'error');
    setUploading(true);
    try {
      const out = await api.upload(Array.from(files));
      setRefs((r) => [...r, ...out.files].slice(0, 3));
      toast('图片已上传', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /* ---------- 生成 ---------- */
  const generate = async () => {
    if (prompt.trim().length < 2) return toast('请先输入提示词并选择模型', 'error');
    if ((user?.credits ?? 0) < cost) return toast(`积分不足，本次需要 ${cost}`, 'error');
    setBusy(true);
    try {
      await api.createVideo({
        prompt: prompt.trim(),
        duration,
        size,
        images: refs.map((r) => r.url),
        extra: buildExtra(params),
      });
      setPrompt('');
      setRefs([]);
      await loadJobs();
      refresh();
      toast('任务已加入队列', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const shown = jobs.filter((j) => {
    if (filter === 'done') return j.status === 'completed';
    return true;
  });

  const clearFailed = async () => {
    const failed = jobs.filter((j) => j.status === 'failed');
    if (!failed.length) return toast('没有失败的任务', 'error');
    if (!confirm(`清除 ${failed.length} 条失败任务？`)) return;
    try {
      await Promise.all(failed.map((j) => api.deleteJob(j.id)));
      setJobs((l) => l.filter((j) => j.status !== 'failed'));
      toast('已清理失败任务', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const running = jobs.filter((j) => ['queued', 'processing'].includes(j.status)).length;
  const activeProject = projects.find((p) => p.id === active);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---------------- 顶栏：项目 + 额度 ---------------- */}
      <header className="flex shrink-0 items-center gap-4 border-b border-white/[0.05] px-6 py-3.5">
        <span className="eyebrow">Project</span>
        <label className="relative flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(79,227,193,.8)]" />
          <select
            value={active || ''}
            onChange={(e) => setActive(e.target.value || null)}
            className="cursor-pointer appearance-none bg-transparent pr-5 text-[14px] font-medium text-white outline-none"
          >
            <option value="" className="bg-ink-800">全部作品</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-ink-800">{p.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-0 text-mist-400" />
        </label>

        <div className="no-scrollbar ml-3 flex min-w-0 items-center gap-2 overflow-x-auto">
          {projects.slice(0, 6).map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(active === p.id ? null : p.id)}
              className={clsx(
                'group flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-[12.5px] transition',
                active === p.id
                  ? 'border-brand-400/60 bg-brand-500/10 text-brand-300'
                  : 'border-white/[0.07] bg-white/[0.02] text-mist-300 hover:border-white/15 hover:text-white'
              )}
            >
              {p.name}
              <X
                size={11}
                onClick={(e) => removeProject(e, p.id)}
                className="hidden text-mist-400 hover:text-rose-400 group-hover:block"
              />
            </button>
          ))}
          <button
            onClick={addProject}
            title="新建项目"
            className="flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-white/10 px-3 py-1.5 text-[12.5px] text-mist-400 transition hover:border-brand-400/50 hover:text-brand-300"
          >
            <Plus size={13} /> 新建
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => nav('/accounts')}
            title={summary?.usable ? `可用账号 ${summary.usable}/${summary.total}` : '还没有可用账号，点这里导入'}
            className={clsx(
              'flex items-center gap-3 rounded-2xl border px-3.5 py-2 transition',
              summary?.usable
                ? 'border-white/[0.07] bg-white/[0.02] hover:border-brand-400/40'
                : 'border-amber-500/40 bg-amber-500/10 hover:border-amber-400'
            )}
          >
            {summary?.usable ? (
              <>
                <Users size={14} className="text-mist-300" />
                <div className="text-left">
                  <p className="text-[11.5px] text-mist-200">
                    {summary.usable} 账号 · 剩 {summary.weeklyLeftPct ?? '—'}%
                  </p>
                  <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
                      style={{ width: `${Math.max(2, summary.weeklyLeftPct ?? 0)}%` }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle size={13} className="text-amber-400" />
                <span className="text-[12px] text-amber-300">未接账号</span>
              </>
            )}
          </button>
          <button onClick={loadJobs} title="刷新" className="grid h-9 w-9 place-items-center rounded-xl text-mist-400 transition hover:bg-white/5 hover:text-brand-300">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setQueueOpen(true)} title="队列" className="relative grid h-9 w-9 place-items-center rounded-xl text-mist-400 transition hover:bg-white/5 hover:text-white">
            <Bell size={16} />
            {running > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-400 pulse-dot" />}
          </button>
        </div>
      </header>

      {/* ---------------- 任务网格 ---------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-medium text-white">{activeProject?.name || '全部作品'}</h2>
            <span className="text-[12px] text-mist-400">{shown.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="seg">
              {[['all', '全部'], ['done', '已完成']].map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)} className={clsx(filter === k && 'on')} style={{ minWidth: 0, padding: '4px 12px', fontSize: 12 }}>
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={clearFailed}
              className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12px] text-mist-400 transition hover:bg-white/5 hover:text-rose-400"
            >
              <Trash2 size={12} /> 清除失败
            </button>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="flex h-[calc(100%-40px)] min-h-[260px] flex-col items-center justify-center pb-6">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.07] bg-ink-800">
              <Sparkles size={22} className="text-brand-400" />
            </div>
            <h3 className="mt-4 text-[15px] font-medium text-mist-100">在下方工作台描述画面，开始创作</h3>
            <p className="mt-1.5 text-[12.5px] text-mist-400">支持文生视频、参考图生成，生成进度会实时显示在这里</p>
            <div className="mt-6 flex max-w-[640px] flex-wrap justify-center gap-2">
              {IDEAS.map((idea) => (
                <button
                  key={idea}
                  onClick={() => setPrompt(idea)}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2 text-[12px] text-mist-300 transition hover:border-brand-400/40 hover:text-white"
                >
                  {idea.split('：')[0]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown.map((j) => (
              <JobTile key={j.id} job={j} onClick={() => setPreview(j)} />
            ))}
          </div>
        )}
      </div>

      {/* ---------------- WORKBENCH ---------------- */}
      <div className="shrink-0 px-6 pb-5">
        <div className="panel p-4 shadow-[0_-20px_60px_-30px_rgba(0,0,0,.8)]">
          <p className="eyebrow mb-3">Workbench</p>

          <div className="flex flex-col gap-4 lg:flex-row">
            {/* 提示词 */}
            <div className="relative min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-[#0d111c] transition focus-within:border-brand-400/50">
              <textarea
                value={prompt}
                maxLength={1000}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
                }}
                rows={3}
                placeholder="描述视频内容，风格，或参考画面…（Ctrl+Enter 生成）"
                className="block w-full resize-none bg-transparent px-3.5 py-3 text-[13px] leading-relaxed text-mist-100 outline-none placeholder:text-mist-400/70"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 font-mono text-[10.5px] text-mist-400">
                {prompt.length}/1000
              </span>
            </div>

            {/* 参考画面 */}
            <div className="lg:w-[44%]">
              <p className="mb-2 text-[12.5px] font-medium text-mist-200">参考画面</p>
              <div className="flex flex-wrap items-center gap-2">
                {refs.map((r) => (
                  <div
                    key={r.url}
                    className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#0d111c] py-1 pl-1 pr-2"
                  >
                    <img src={r.url} alt="" className="h-9 w-12 rounded-lg object-cover" />
                    <span className="max-w-[130px] truncate text-[12px] text-mist-200">
                      @ {r.name || r.url.split('/').pop()}
                    </span>
                    <button
                      onClick={() => setRefs((l) => l.filter((x) => x.url !== r.url))}
                      className="text-mist-400 hover:text-rose-400"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {refs.length < 3 && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    title="上传参考图（最多 3 张）"
                    className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.07] bg-[#0d111c] text-mist-300 transition hover:border-brand-400/50 hover:text-brand-300"
                  >
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />}
                  </button>
                )}
                {refs.length === 0 && (
                  <span className="text-[11.5px] text-mist-400">可选，最多 3 张，提示词中用 @ 引用</span>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onPick(e.target.files)} />
            </div>
          </div>

          {/* 操作行 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] text-mist-300">时长</span>
              <div className="seg">
                {[5, 8, 10].map((d) => (
                  <button key={d} onClick={() => setDuration(d)} className={clsx(duration === d && 'on')}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] text-mist-300">比例</span>
              <div className="seg">
                {['16:9', '9:16', '1:1'].map((sz) => (
                  <button key={sz} onClick={() => setSize(sz)} className={clsx(size === sz && 'on')}>
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <button
                onClick={() => setParamsOpen(true)}
                className={clsx(
                  'flex h-11 items-center gap-2 rounded-xl border px-4 text-[13px] transition',
                  buildExtra(params)
                    ? 'border-brand-400/50 bg-brand-500/10 text-brand-300'
                    : 'border-white/[0.08] text-mist-200 hover:border-white/20 hover:text-white'
                )}
              >
                <SlidersHorizontal size={15} /> Params
                {buildExtra(params) && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />}
              </button>
              <button
                onClick={() => setQueueOpen(true)}
                className="flex h-11 items-center gap-2 rounded-xl border border-white/[0.08] px-4 text-[13px] text-mist-200 transition hover:border-white/20 hover:text-white"
              >
                <Clock size={15} /> Queue
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/[0.07] px-1.5 font-mono text-[10.5px]">
                  {running}
                </span>
              </button>
              <button
                onClick={generate}
                disabled={busy}
                className="mint-btn flex h-12 items-center gap-3 rounded-2xl pl-5 pr-2 text-[16px] font-semibold"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                <span className="pr-3">Generate</span>
                <span className="flex items-center gap-1 rounded-xl bg-[#04211a]/80 px-2.5 py-1.5 font-mono text-[12px] text-brand-300">
                  <Zap size={12} />
                  {summary?.usable ? `${summary.weeklyLeftPct ?? '—'}%` : '—'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <QueueDrawer
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        prompt={prompt}
        duration={duration}
        size={size}
      />

      <ParamsPanel
        open={paramsOpen}
        onClose={() => setParamsOpen(false)}
        params={params}
        onChange={setParams}
      />
      <Modal open={!!preview} onClose={() => setPreview(null)} title="作品详情" width="max-w-2xl">
        {preview && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl bg-black/50">
              {preview.mediaUrl ? (
                /\.(mp4|webm|mov)/i.test(preview.mediaUrl) ? (
                  <video src={preview.mediaUrl} controls autoPlay loop className="max-h-[55vh] w-full" />
                ) : (
                  <img src={preview.mediaUrl} alt="" className="max-h-[55vh] w-full object-contain" />
                )
              ) : (
                <div className="grid h-36 place-items-center text-[12.5px] text-mist-400">
                  {preview.status === 'failed' ? preview.error : '还在生成中'}
                </div>
              )}
            </div>
            <p className="text-[13px] leading-relaxed text-mist-200">{preview.prompt}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-500">
              <span>{preview.params?.duration}s · {preview.params?.size}</span>
              <span>{preview.cost} 积分</span>
              {preview.params?.extra && <span className="truncate">{preview.params.extra}</span>}
              <span>{fmtAgo(preview.createdAt)}</span>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              {preview.mediaUrl && (
                <a href={preview.mediaUrl} download>
                  <button className="rounded-lg border border-[#232a38] px-3.5 py-1.5 text-[12px] text-mist-200 hover:border-brand-500/50 hover:text-white">
                    下载
                  </button>
                </a>
              )}
              <button
                onClick={async () => {
                  if (!confirm('删除这条作品？文件会一起删掉。')) return;
                  try {
                    await api.deleteJob(preview.id);
                    setJobs((l) => l.filter((x) => x.id !== preview.id));
                    setPreview(null);
                    toast('已删除', 'ok');
                  } catch (e) {
                    toast(e.message, 'error');
                  }
                }}
                className="rounded-lg border border-rose-500/30 px-3.5 py-1.5 text-[12px] text-rose-300 hover:bg-rose-500/10"
              >
                删除
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function JobTile({ job, onClick }) {
  const running = ['queued', 'processing'].includes(job.status);
  const failed = job.status === 'failed';
  const done = job.status === 'completed';
  const isVideo = /\.(mp4|webm|mov)/i.test(job.mediaUrl || '');
  const title = (job.prompt || '未命名').split(/[：:，,。]/)[0].slice(0, 18);

  return (
    <button
      onClick={onClick}
      className="group relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-800 text-left transition hover:-translate-y-0.5 hover:border-white/15 hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,.8)]"
    >
      {job.mediaUrl ? (
        isVideo ? (
          <video
            src={job.mediaUrl}
            muted
            loop
            playsInline
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => e.currentTarget.pause()}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <img src={job.mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        )
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(15,169,138,.14),transparent_60%)]">
          {running ? (
            <Loader2 size={22} className="animate-spin text-brand-400/80" />
          ) : failed ? (
            <AlertTriangle size={20} className="text-rose-400" />
          ) : (
            <ImageIcon size={20} className="text-mist-400" />
          )}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/20" />

      {/* 状态 pill */}
      <span
        className={clsx(
          'absolute left-3 top-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur',
          running && 'border-white/10 bg-black/50 text-mist-100',
          done && 'border-brand-400/30 bg-[#06231d]/80 text-brand-300',
          failed && 'border-rose-400/30 bg-rose-950/70 text-rose-300'
        )}
      >
        {running && <span className="h-1.5 w-1.5 rounded-full bg-brand-400 pulse-dot" />}
        {done && <Check size={11} />}
        {failed && <X size={11} />}
        {running ? `Generating · ${job.progress || 0}%` : done ? 'Done' : failed ? 'Failed' : job.status}
      </span>

      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <p className="line-clamp-1 text-[15px] font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-[11.5px] text-mist-300">
          {job.params?.duration}s · {job.params?.size} · {fmtAgo(job.createdAt)}
        </p>
        {running && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${Math.max(3, job.progress || 0)}%` }} />
          </div>
        )}
      </div>
    </button>
  );
}
