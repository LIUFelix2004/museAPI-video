import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Type, Image as ImageIcon, Film, Trash2, ZoomIn, ZoomOut, Maximize2,
  FolderClosed, Scissors, Grid3x3, Loader2, X, Sparkles, Link2, Send, MousePointer2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../lib/api.js';
import { useAuth } from '../store/auth.jsx';
import { useToast } from '../components/ui.jsx';

const STORE_KEY = 'xm_canvas_v1';

const NODE_W = 168;
const NODE_H = 96;

let seq = 1;
const newId = () => `n_${Date.now().toString(36)}_${seq++}`;

const defaultDoc = () => ({
  nodes: [
    {
      id: newId(),
      type: 'text',
      x: 420,
      y: 240,
      text: '输入或从下方输入区写入',
      label: '文本1',
    },
  ],
  links: [],
});

export default function Canvas() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [doc, setDoc] = useState(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return defaultDoc();
  });

  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [selected, setSelected] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [duration, setDuration] = useState(5);
  const [size, setSize] = useState('16:9');

  const viewportRef = useRef(null);
  const dragRef = useRef(null); // { mode:'pan'|'node', ... }
  const bootRef = useRef(false);

  // 首次进入默认选中第一个节点（对齐原站的高亮态）
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (doc.nodes.length) setSelected([doc.nodes[0].id]);
  }, [doc.nodes]);

  /* ---------------- 持久化 ---------------- */
  useEffect(() => {
    setSaved(false);
    const t = setTimeout(() => {
      localStorage.setItem(STORE_KEY, JSON.stringify(doc));
      setSaved(true);
    }, 400);
    return () => clearTimeout(t);
  }, [doc]);

  /* ---------------- 视口变换 ---------------- */
  const screenToCanvas = (clientX, clientY) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - view.x) / view.z,
      y: (clientY - rect.top - view.y) / view.z,
    };
  };

  const zoomBy = (factor, cx, cy) => {
    setView((v) => {
      const z = Math.min(2.5, Math.max(0.25, v.z * factor));
      const rect = viewportRef.current?.getBoundingClientRect();
      const px = cx ?? (rect ? rect.width / 2 : 0);
      const py = cy ?? (rect ? rect.height / 2 : 0);
      // 以光标为中心缩放
      const nx = px - ((px - v.x) / v.z) * z;
      const ny = py - ((py - v.y) / v.z) * z;
      return { x: nx, y: ny, z };
    });
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    const cx = rect ? e.clientX - rect.left : undefined;
    const cy = rect ? e.clientY - rect.top : undefined;
    zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08, cx, cy);
  };

  /* ---------------- 拖拽 ---------------- */
  const onBackgroundDown = (e) => {
    if (e.button === 2) return;
    const isMiddle = e.button === 1;
    const isSpace = e.getModifierState?.(' ') || false;
    // 只有空白处、中键、按住空格时平移
    if (!isMiddle && !isSpace && e.target !== e.currentTarget && !e.target.dataset.canvasbg) return;
    setSelected([]);
    dragRef.current = {
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      ox: view.x,
      oy: view.y,
    };
  };

  const onNodeDown = (e, node) => {
    e.stopPropagation();
    if (e.button === 2) return;
    const multi = e.shiftKey;
    setSelected((sel) => {
      if (multi) return sel.includes(node.id) ? sel.filter((i) => i !== node.id) : [...sel, node.id];
      return sel.includes(node.id) ? sel : [node.id];
    });
    dragRef.current = {
      mode: 'node',
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
      ids: multi ? [...selected, node.id] : [node.id],
      origins: {},
    };
    // 记录所有选中节点原位置
    if (multi) {
      const origins = {};
      for (const n of doc.nodes) {
        if (selected.includes(n.id) || n.id === node.id) origins[n.id] = { x: n.x, y: n.y };
      }
      dragRef.current.origins = origins;
    }
  };

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      if (d.mode === 'pan') {
        setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
      } else if (d.mode === 'node') {
        const cdx = dx / view.z;
        const cdy = dy / view.z;
        setDoc((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (d.origins && d.origins[n.id]) {
              return { ...n, x: d.origins[n.id].x + cdx, y: d.origins[n.id].y + cdy };
            }
            if (n.id === d.id) return { ...n, x: d.nodeX + cdx, y: d.nodeY + cdy };
            return n;
          }),
        }));
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [view.z]);

  /* ---------------- 键盘 ---------------- */
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selected.length) return;
        e.preventDefault();
        setDoc((d) => ({ ...d, nodes: d.nodes.filter((n) => !selected.includes(n.id)) }));
        setSelected([]);
      }
      if (e.key === 'Escape') setSelected([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  /* ---------------- 节点操作 ---------------- */
  const addNode = (type) => {
    const center = screenToCanvas(
      (viewportRef.current?.getBoundingClientRect().left ?? 0) + (viewportRef.current?.clientWidth ?? 400) / 2,
      (viewportRef.current?.getBoundingClientRect().top ?? 0) + (viewportRef.current?.clientHeight ?? 300) / 2
    );
    const n = {
      id: newId(),
      type,
      x: Math.round(center.x - NODE_W / 2 + (Math.random() * 40 - 20)),
      y: Math.round(center.y - NODE_H / 2 + (Math.random() * 40 - 20)),
      text: type === 'text' ? '双击输入或从下方输入区写入' : '',
      label: type === 'text' ? '文本' : type === 'image' ? '图片' : '视频',
    };
    setDoc((d) => ({ ...d, nodes: [...d.nodes, n] }));
    setSelected([n.id]);
  };

  const removeSelected = () => {
    setDoc((d) => ({ ...d, nodes: d.nodes.filter((n) => !selected.includes(n.id)) }));
    setSelected([]);
  };

  const fitView = () => {
    if (!doc.nodes.length) return setView({ x: 0, y: 0, z: 1 });
    const minX = Math.min(...doc.nodes.map((n) => n.x));
    const minY = Math.min(...doc.nodes.map((n) => n.y));
    const maxX = Math.max(...doc.nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...doc.nodes.map((n) => n.y + NODE_H));
    const rect = viewportRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 800;
    const h = rect?.height ?? 500;
    const z = Math.min(1.4, Math.max(0.3, Math.min(w / (maxX - minX + 160), h / (maxY - minY + 160))));
    setView({
      x: w / 2 - ((minX + maxX) / 2) * z,
      y: h / 2 - ((minY + maxY) / 2) * z,
      z,
    });
  };

  /* ---------------- 生成 ---------------- */
  const generate = async () => {
    if (prompt.trim().length < 2) return toast('请先输入文本内容', 'error');
    if ((user?.credits ?? 0) < 10 + 2 * duration) return toast('积分不足', 'error');

    const bound = selected.length === 1 ? doc.nodes.find((n) => n.id === selected[0]) : null;
    setBusy(true);
    try {
      const { job } = await api.createVideo({
        prompt: prompt.trim(),
        duration,
        size,
        images: [],
      });

      const node = {
        id: newId(),
        type: 'video',
        x: bound ? bound.x + NODE_W + 60 : 520,
        y: bound ? bound.y : 300,
        text: prompt.trim(),
        label: '视频',
        jobId: job.id,
        status: 'running',
        mediaUrl: null,
      };
      setDoc((d) => ({ ...d, nodes: [...d.nodes, node] }));
      setSelected([node.id]);
      setPrompt('');
      toast('节点已提交生成', 'ok');
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- 任务轮询 ---------------- */
  const syncJobs = useCallback(async () => {
    const running = doc.nodes.filter((n) => n.jobId && n.status === 'running');
    if (!running.length) return;
    const results = await Promise.all(
      running.map(async (n) => {
        try { return { id: n.id, job: (await api.job(n.jobId)).job }; } catch { return null; }
      })
    );
    setDoc((d) => ({
      ...d,
      nodes: d.nodes.map((n) => {
        const hit = results.find((r) => r?.id === n.id)?.job;
        if (!hit) return n;
        if (hit.status === 'completed') {
          return { ...n, status: 'done', mediaUrl: hit.mediaUrl || hit.result?.url };
        }
        if (hit.status === 'failed') {
          return { ...n, status: 'failed', error: hit.error };
        }
        return { ...n, progress: hit.progress };
      }),
    }));
  }, [doc.nodes]);

  useEffect(() => {
    const hasRunning = doc.nodes.some((n) => n.jobId && n.status === 'running');
    if (!hasRunning) return undefined;
    const t = setInterval(syncJobs, 2500);
    return () => clearInterval(t);
  }, [doc.nodes, syncJobs]);

  const boundNode = selected.length === 1 ? doc.nodes.find((n) => n.id === selected[0]) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---------------- 标题 ---------------- */}
      <div className="flex shrink-0 items-start justify-between px-8 pb-3 pt-5">
        <div>
          <p className="eyebrow">Canvas · Workflow</p>
          <h1 className="mt-1.5 flex items-center gap-2 text-[28px] font-semibold tracking-tight text-white">
            无限画布
            <span className="mx-1 h-1.5 w-1.5 rounded-full bg-brand-400" />
            <span className="brand-text">节点自己干活</span>
          </h1>
        </div>
        <button
          onClick={fitView}
          className="rounded-full border border-[#232a38] px-4 py-2 text-[12.5px] text-mist-300 transition hover:border-brand-500/50 hover:text-white"
        >
          适应画布
        </button>
      </div>

      {/* ---------------- 画布 ---------------- */}
      <div className="relative mx-6 mb-4 min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#1a2030] bg-[#080b12]">
        {/* 工具栏 */}
        <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-[#232a38] bg-[#0d1119]/90 px-2.5 py-1.5 text-[11.5px] text-mist-300 backdrop-blur">
            画布 · 默认 · 自动保存
            <span className={clsx('text-[11px]', saved ? 'text-brand-400' : 'text-mist-400')}>
              {saved ? '✓' : '…'}
            </span>
          </span>
          <span className="hidden rounded-lg bg-[#0d1119]/80 px-2 py-1.5 font-mono text-[10px] text-mist-400 backdrop-blur lg:block">
            中键/空格+拖动 移动画布 · 滚轮 缩放 · 左键框选 · Shift 多选 · Delete 移除选中
          </span>
        </div>

        {/* 视图 */}
        <div
          ref={viewportRef}
          data-canvasbg="1"
          onWheel={onWheel}
          onMouseDown={onBackgroundDown}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 cursor-default select-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,.055) 1px, transparent 0)',
            backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
          >
            {doc.nodes.map((n) => (
              <CanvasNode
                key={n.id}
                node={n}
                active={selected.includes(n.id)}
                onMouseDown={(e) => onNodeDown(e, n)}
                onDoubleClick={() => {
                  const t = window.prompt('节点文本', n.text || '');
                  if (t != null) setDoc((d) => ({ ...d, nodes: d.nodes.map((x) => x.id === n.id ? { ...x, text: t } : x) }));
                }}
              />
            ))}
          </div>
        </div>

        {/* 左侧节点按钮 */}
        <div className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1">
          {[
            { icon: Type, label: '文本', type: 'text' },
            { icon: ImageIcon, label: '图片', type: 'image' },
            { icon: Film, label: '视频', type: 'video' },
          ].map((b) => (
            <button
              key={b.type}
              onClick={() => addNode(b.type)}
              title={`新建${b.label}节点`}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[#232a38] bg-[#0d1119]/90 text-mist-400 backdrop-blur transition hover:border-brand-500/50 hover:text-brand-300"
            >
              <b.icon size={13} />
            </button>
          ))}
          <button
            onClick={removeSelected}
            disabled={!selected.length}
            title="删除选中"
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#232a38] bg-[#0d1119]/90 text-mist-400 backdrop-blur transition hover:border-rose-500/50 hover:text-rose-400 disabled:opacity-40"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* 右下缩放控件 */}
        <div className="absolute bottom-4 right-3 z-20 flex flex-col items-center gap-0.5 rounded-full border border-[#232a38] bg-[#0d1119]/95 p-1 backdrop-blur">
          <ZoomBtn icon={Plus} onClick={() => zoomBy(1.15)} />
          <ZoomBtn icon={FolderClosed} onClick={() => toast('画布分组：开发中')} />
          <ZoomBtn icon={Scissors} onClick={() => toast('框选模式：开发中')} />
          <ZoomBtn icon={Grid3x3} onClick={fitView} />
          <ZoomBtn icon={ZoomOut} onClick={() => zoomBy(1 / 1.15)} />
          <span className="py-0.5 font-mono text-[9.5px] text-mist-400">{Math.round(view.z * 100)}%</span>
          <ZoomBtn icon={ZoomIn} onClick={() => zoomBy(1.15)} />
          <ZoomBtn icon={Maximize2} onClick={fitView} />
        </div>

        {/* 底部输入区 */}
        <div className="absolute bottom-3 left-3 right-16 z-20">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-1 text-[10.5px] text-brand-300">
              <span className="h-1 w-1 rounded-full bg-brand-400" />
              已绑定节点{selected.length || 0} · {boundNode ? (boundNode.type === 'text' ? '文本' : boundNode.type === 'video' ? '视频' : '图片') : '未选中'} ·{' '}
              {boundNode ? 'TEXT 模式' : '空闲'}
            </span>
            <button
              onClick={() => setSelected([])}
              className="flex items-center gap-0.5 text-[10.5px] text-mist-400 hover:text-mist-200"
            >
              解除 <X size={9} />
            </button>
          </div>

          <div className="rounded-2xl border border-[#232a38] bg-[#0d1119]/95 p-2 backdrop-blur-xl">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }}
              rows={2}
              placeholder="输入文本内容，例如：雨夜断桥，白素贞立于西湖畔，回眸轻叹…"
              className="w-full resize-none bg-transparent px-2 py-1 text-[12.5px] leading-relaxed text-mist-100 outline-none placeholder:text-mist-400/70"
            />

            <div className="flex flex-wrap items-center gap-2 px-1">
              <button className="flex items-center gap-1.5 rounded-lg border border-[#232a38] px-2.5 py-1.5 text-[11px] text-mist-300 transition hover:border-[#2c3448] hover:text-white">
                <MousePointer2 size={11} className="text-brand-400" /> 选择模型
                <span className="font-mono text-[10px] text-brand-300">muse-video</span>
              </button>

              <div className="flex items-center gap-0.5 rounded-lg border border-[#232a38] p-0.5">
                {[5, 8, 10].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={clsx(
                      'rounded px-1.5 py-0.5 font-mono text-[10px] transition',
                      duration === d ? 'bg-brand-500/15 text-brand-300' : 'text-mist-400 hover:text-mist-200'
                    )}
                  >
                    {d}s
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-0.5 rounded-lg border border-[#232a38] p-0.5">
                {['16:9', '9:16'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={clsx(
                      'rounded px-1.5 py-0.5 font-mono text-[10px] transition',
                      size === s ? 'bg-brand-500/15 text-brand-300' : 'text-mist-400 hover:text-mist-200'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-2.5">
                <span className="font-mono text-[10px] tracking-wider text-mist-400">
                  COST <span className="text-gold-400">{10 + 2 * duration}</span> 积分
                </span>
                <button
                  onClick={generate}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-full brand-gradient px-4 py-1.5 text-[12px] font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:brightness-110 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  生成
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoomBtn({ icon: Icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-full text-mist-400 transition hover:bg-ink-700 hover:text-white"
    >
      <Icon size={11} />
    </button>
  );
}

function CanvasNode({ node, active, onMouseDown, onDoubleClick }) {
  const running = node.status === 'running';
  const failed = node.status === 'failed';

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      style={{ left: node.x, top: node.y, width: NODE_W }}
      className={clsx(
        'absolute cursor-grab rounded-xl border bg-[#0c1119]/95 px-2.5 py-2 backdrop-blur transition-shadow active:cursor-grabbing',
        active
          ? 'border-brand-400/80 shadow-[0_0_0_1px_rgba(79,227,193,.35),0_0_28px_-6px_rgba(79,227,193,.55)]'
          : 'border-[#232a38] hover:border-[#33405a]'
      )}
    >
      {/* 连接点 */}
      {[
        '-left-1 top-1/2 -translate-y-1/2',
        '-right-1 top-1/2 -translate-y-1/2',
        'left-1/2 -top-1 -translate-x-1/2',
        'left-1/2 -bottom-1 -translate-x-1/2',
      ].map((pos) => (
        <span
          key={pos}
          className={clsx('absolute h-1.5 w-1.5 rounded-full border border-[#33405a] bg-[#0d1119]', pos)}
        />
      ))}

      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] font-medium text-mist-200">
          <span className={clsx('h-1 w-1 rounded-full', active ? 'bg-brand-400' : 'bg-mist-400')} />
          {node.label}
        </span>
        <span className="font-mono text-[8px] tracking-wider text-mist-400">
          {node.type === 'text' ? 'TEXT' : node.type === 'image' ? 'IMG' : 'VID'}
        </span>
      </div>

      {node.type === 'text' ? (
        <p className="line-clamp-3 text-[10px] leading-relaxed text-mist-300">
          {node.text || '空文本'}
        </p>
      ) : (
        <div className="relative overflow-hidden rounded-lg bg-black/40">
          {node.mediaUrl ? (
            node.type === 'video' ? (
              <video src={node.mediaUrl} muted loop playsInline className="h-[62px] w-full object-cover" />
            ) : (
              <img src={node.mediaUrl} alt="" className="h-[62px] w-full object-cover" />
            )
          ) : (
            <div className="grid h-[62px] place-items-center">
              {running ? (
                <div className="flex items-center gap-1 text-[9.5px] text-brand-400">
                  <Loader2 size={11} className="animate-spin" /> {node.progress || 0}%
                </div>
              ) : failed ? (
                <span className="text-[9px] text-rose-400">失败</span>
              ) : (
                <span className="text-[9px] text-mist-400">待生成</span>
              )}
            </div>
          )}
        </div>
      )}

      {node.type !== 'text' && (
        <p className="mt-1 line-clamp-1 text-[9px] text-mist-400">{node.text}</p>
      )}
    </div>
  );
}
