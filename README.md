# MuseAPI-Video · AI 视频创作平台

把 **muse.ai** 的网页端能力包装成一个可对外运营的视频创作站：多用户注册、积分计费、
账号池调度、任务队列、作品库、运营后台，全部本地自托管。

上游复用开源项目 [muse2api](https://github.com/czg86389-hub/muse2api)（把 muse.ai 逆向封成
OpenAI 兼容 API，靠无头 Chrome + CDP 驱动网页端），本仓库在它之上补了一整层**平台业务**。

```
┌──────────────┐   HTTP    ┌─────────────────┐   HTTP    ┌──────────────┐  CDP  ┌────────┐  HTTPS  ┌──────────┐
│  浏览器 web/  │ ────────► │ 平台 server/     │ ────────► │ 上游 muse2api │ ────► │ Chrome │ ──────► │ muse.ai  │
│  React SPA   │   :8787   │ Node + SQLite    │  :18610   │ FastAPI      │ :19210│ 无头   │         │ 网页端    │
└──────────────┘           │ 用户/积分/任务    │           │ 账号池/生成   │       └────────┘         └──────────┘
                           │ 作品库/账号导入   │           │ 会话续期     │
                           └─────────────────┘           └──────────────┘
```

- **上游**负责"怎么让 muse.ai 真的生成出东西"：浏览器驱动、Cookie 会话、附件上传、结果抓取。
- **平台**负责"怎么卖给用户"：登录注册、积分扣费与退款、任务编排与轮询、媒体落地、账号导入界面、运营后台。

两层解耦，上游升级（`git pull` 上游仓库）不影响平台代码。

---

## 功能（精简版：只保留三个）

平台视觉对齐 **jimengvip.online（XinMeng AI）**：深色 `#0a0d16` 底 + 品牌绿 `#0fa98a` / 高亮薄荷 `#4fe3c1`，
标题 Baloo 2、数据 JetBrains Mono、正文霞鹜文楷，字体自托管在 `web/public/fonts/`（离线可用）。

| 功能 | 路由 | 说明 |
|---|---|---|
| **快捷创作** | `/create` | 项目栏 + 任务网格 + WORKBENCH（提示词/@引用参考图/模型/时长/画幅/参数/生成）；附任务队列抽屉与参数面板 |
| **无限画布** | `/canvas` | 节点拖拽、缩放平移、多选删除、双击改文本、自动保存、节点级生成 |
| **muse 导入** | `/accounts` | 一键绑定（浏览器扩展读 HttpOnly Cookie）或手动粘贴；检测/保活/删除 |

登录后直接落在 `/create`。侧栏只有这三项。

**已下线**（源码保留在 `web/src/pages/`，需要时把 import 和 Route 加回 `App.jsx` 即可）：
首页 `/home`、论坛 `/forum`、价目表 `/pricing`、会员 `/membership`、充值 `/recharge`、
邀请 `/invite`、团队 `/team`、设置 `/settings`、历史 `/history`、作品库 `/works`、
API 平台 `/api-platform`、运营后台 `/admin`。

这些模块的**后端接口仍然可用**（计费、邀请、团队、社区、密钥、`/v1` 代理都没删），
只是前端不再暴露入口；直接访问旧地址会兜底跳回 `/create`。


### OpenAI 兼容接口

平台对外暴露 `/v1/*`，用 `sk-xm-` 密钥鉴权，内部转发到上游 muse2api：

```bash
curl "$BASE/v1/models" -H "Authorization: Bearer sk-xm-..."
curl -X POST "$BASE/v1/videos" -H "Authorization: Bearer sk-xm-..." \
  -H "Content-Type: application/json" \
  -d '{"prompt":"雨夜霓虹街头","duration":5,"size":"16:9"}'
```

密钥在 **API 平台**页生成；调用走站内积分计费。

---

## 目录结构

```
G:\museAPI\
├── start.ps1              # 一键启动（上游 + 平台）
├── stop.ps1               # 全部停止
├── upstream\muse2api\     # 上游引擎（Python FastAPI，端口 18610）
│   ├── .env               # 已配置：KEY / Chrome 路径 / 超时
│   └── .venv\             # Python 3.11 虚拟环境
├── server\                # 平台后端（Node ESM，端口 8787）
│   ├── .env               # 平台配置（JWT、上游地址、定价）
│   ├── public\            # 扩展打包下载（museapi-video-extension.zip）
│   ├── src\
│   │   ├── index.js       # 入口：路由挂载、静态资源、引导管理员
│   │   ├── config.js      # 配置读取
│   │   ├── db.js          # SQLite schema + 任务/账号/账本/绑定码读写（node:sqlite）
│   │   ├── muse.js        # 上游客户端（账号池、视频、图片、媒体下载）
│   │   ├── auth.js        # bcrypt + JWT + 权限中间件
│   │   ├── worker.js      # 任务轮询器：轮询上游 → 落地媒体 → 失败退款
│   │   └── routes\        # auth / accounts（含绑定码）/ generate / admin
│   └── data\              # 运行时数据（SQLite、媒体、上传）
├── extension\             # 浏览器扩展：一键读取 HttpOnly cookie 完成绑定
│   ├── manifest.json      # MV3：cookies + content script
│   ├── background.js      # 读 muse.ai cookie → POST /api/accounts/bind
│   ├── content.js         # 在 /bind/<code> 页面自动触发
│   └── popup.html/js      # 手动兜底入口
├── web\                   # 平台前端（React 18 + Vite + Tailwind v4）
│   ├── public\fonts\      # 自托管字体（Baloo 2 / JetBrains Mono）
│   └── src\pages\         # Home / Create / Canvas / History / Pricing / Membership
│                          # Recharge / Invite / Forum / ApiPlatform / Settings
│                          # Accounts / Credits / Admin / Login / Bind
├── scripts\               # 冒烟测试、截图验证、链路测试
└── shots\                 # UI 截图
```

---

## 快速开始

```powershell
cd G:\museAPI

# 首次：构建前端 + 拉起全部服务
.\start.ps1 -Build

# 之后日常启动
.\start.ps1

# 前端改动用 dev 模式（热更新，5173）
.\start.ps1 -Dev

# 停止全部
.\stop.ps1
```

打开 <http://127.0.0.1:8787>，用默认管理员登录：

```
admin@muse.local / admin123456
```

> 生产部署前务必改掉 `.env` 里的 `ADMIN_PASSWORD` 和 `JWT_SECRET`。

上游面板（调试用）：<http://127.0.0.1:18610/admin?key=m2a_muse_studio_local_2026>

---

## 账号导入（核心流程）

平台要生成任何东西，**上游必须至少有一个可用 muse.ai 账号**。没有账号时上游会直接返回
`没有可用账号`，平台会自动退还积分。

### 方式一：一键绑定（推荐，免 F12）

`hatch_sess` 是 **HttpOnly** cookie，网页 JS 读不到，所以必须由浏览器扩展来读。
装一次扩展，之后每次绑定只要三步：

1. 平台 **账号管理 → 一键绑定** → 生成绑定链接（20 分钟有效）
2. 复制链接，在**已登录 muse.ai 的那个浏览器**里打开
3. 扩展自动读取登录态并提交，页面显示「绑定成功」

扩展装一次即可，之后无需再碰 F12：

- 下载：平台的管理页会打包 `extension/` 到 `server/public/museapi-video-extension.zip`，
  也可以直接跑 `.\scripts\build-extension.ps1`
- 安装：`chrome://extensions` → 打开右上角「开发者模式」→「加载已解压的扩展程序」→ 选 `extension\` 目录
- 它只做一件事：用 `chrome.cookies` 读 muse.ai 的 cookie，POST 到平台的一次性绑定接口，不碰别的数据

绑定码是一次性的、20 分钟过期、绑定到生成它的那个用户。

### 方式二：手动粘贴 Cookie（兜底）

不想装扩展时用这个：

1. Chrome 打开 <https://muse.ai/>，登录并进入聊天主界面。
2. 按 `F12` → **Application → Cookies → https://muse.ai**。
3. 复制整段 Cookie（至少要含 `hatch_sess`），或按 `Ctrl+A` 全选后复制。
4. 平台里进 **账号管理 → 粘贴**，粘贴、起个备注名、保存。

也可以直接粘贴 `document.cookie` 的输出，格式随意，带不带 `Cookie:` 前缀都能识别，
多行会自动清理成 `; ` 分隔。

### 方式三：上游自带的导号工具

如果已经在用上游面板，也可以直接用它的工具（导入进的是同一个账号池）：

- Chrome 扩展：`upstream\muse2api\extension\`（填服务地址 `http://<IP>:18610` + Key）
- 油猴脚本：`upstream\muse2api\tools\muse2api_cookie_importer.user.js`

这种方式导入的账号归属为空，即公共池。

### 账号有效期

Muse 会话约 **48 小时**，到期后上游返回 401，需要重新导入 Cookie。账号卡片上会显示到期时间，
快过期时变黄。点「保活」可以让上游尝试续期，点「检测」验证会话状态。

### 账号归属

- **管理员**导入的账号 → 进入公共池，所有用户共用（适合对外运营）。
- **普通用户**导入的账号 → 只自己可见，优先给自己用。

---

## 平台 API

所有接口都在 `/api` 下，除注册登录外都要 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册（赠送积分可配） |
| POST | `/api/auth/login` | 登录，返回 JWT |
| GET | `/api/auth/me` | 当前用户与余额 |
| GET | `/api/auth/ledger` | 积分流水 |
| GET | `/api/meta` | 时长/画幅/定价 |
| POST | `/api/videos` | 创建视频任务 `{prompt,duration,size,images[]}` |
| POST | `/api/images` | 创建图片任务 `{prompt,size,images[]}` |
| GET | `/api/jobs` | 任务列表（分页/筛选） |
| GET | `/api/jobs/:id` | 任务详情（前端轮询用） |
| DELETE | `/api/jobs/:id` | 删除任务与本地媒体 |
| POST | `/api/upload` | 上传参考素材（multipart，最多 10 个） |
| GET | `/api/accounts` | 账号池（含上游实时状态） |
| POST | `/api/accounts` | **导入账号** `{label,cookie}` |
| POST | `/api/accounts/bind-code` | 生成一次性绑定码（20 分钟） |
| GET | `/api/accounts/bind/:code` | 查绑定状态（绑定页轮询） |
| POST | `/api/accounts/bind` | **扩展提交** `{code,cookie}`，用 code 认证 |
| POST | `/api/accounts/:id/test` | 检测会话 |
| POST | `/api/accounts/:id/keepalive` | 保活续期 |
| DELETE | `/api/accounts/:id` | 删除账号 |
| GET | `/api/admin/overview` | 运营概览 |
| GET/PATCH | `/api/admin/users[/:id]` | 用户管理 / 加减积分 / 封禁 |
| GET/PATCH | `/api/admin/settings` | 站点名、定价、注册开关 |
| GET | `/api/admin/system` | 上游状态（浏览器、账号池、超时） |
| GET | `/api/admin/orders` | 订单（充值/订阅） |
| GET | `/api/admin/posts` | 社区帖子管理 |
| GET | `/api/admin/trend` | 近 7 天趋势 |
| GET/POST | `/api/keys` | API 密钥（sk-xm-） |
| GET/POST | `/api/membership` | 会员档位 / 订阅 |
| POST | `/api/recharge` | 充值（1 元 = 10 积分） |
| GET/POST | `/api/posts` | 社区帖子 |
| GET | `/api/auth/invite` | 邀请码与邀请记录 |
| ALL | `/v1/*` | **OpenAI 兼容对外接口**（sk- 鉴权，转发上游） |

### 一个完整的下单链路

```
POST /api/videos
  ↓ 校验余额 → 扣积分 → 落库 jobs(status=queued)
  ↓ 调上游 POST /v1/videos  → 拿到 task_id
  ↓ 回写 jobs(upstream_id, status=processing)
         ↓ worker 每 3 秒轮询 GET /v1/videos/{task_id}
         ↓ completed → 下载 mp4 到 server/data/media/ → jobs(media_file)
         ↓ failed    → 自动退还积分 → jobs(refunded=1)
GET /api/jobs/{id}  ← 前端每 2.5 秒轮询
```

---

## 计费模型

默认：**视频 = 10 + 2 × 时长秒**（5s = 20 积分，10s = 30 积分），**图片 5 积分**。
注册送 100 积分。全部可在后台「设置」里改，改完立即对新任务生效。

失败自动退款，重复退款有 `refunded` 标记保护。

---

## 数据与备份

| 内容 | 位置 |
|---|---|
| 用户、任务、积分、账号镜像 | `server\data\studio.db`（SQLite WAL） |
| 生成的视频/图片 | `server\data\media\` |
| 用户上传的参考素材 | `server\data\uploads\` |
| 上游账号 Cookie、上游任务 | `upstream\muse2api\data\` |

备份就打包这两个 `data\` 目录。**Cookie 是明文存储的**，注意目录权限。

---

## 常见问题

**上游报「没有可用账号」**
账号池是空的，按上面「账号导入」加一个。平台的账号管理页会在顶部提示。

**上游 401 / 403**
401 是会话过期，重新导入 Cookie。403 是账号权限或出口 IP 被限制，不一定是 Cookie 问题，
先确认这个账号在官网还能正常用。

**生成很慢 / 一直排队**
上游默认并发 2（`MUSE2API_CONCURRENCY`）。机器够强可以调大，但每个并发会占一个浏览器上下文。
视频超时默认 900 秒，在 `upstream\muse2api\.env` 里改 `MUSE2API_VIDEO_TIMEOUT`。

**部署到服务器后 502**
Nginx 反代要放大超时并关 buffering：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    proxy_buffering off;
    client_max_body_size 200M;
}
```

**想换端口 / 加域名**
改 `server\.env` 的 `PORT` 和 `PUBLIC_BASE`；上游端口改 `upstream\muse2api\.env` 的
`MUSE2API_PORT`，同时改 `server\.env` 的 `MUSE_BASE` 指向新端口。

**参考图怎么传给上游**
平台把用户上传的图读成 `data:` URL 再传给上游，所以上游不需要能访问平台的本地文件，
也不用开 `MUSE2API_REF_IMAGE_LOCAL_FILES`。

---

## 验证脚本

```powershell
node scripts/smoke.mjs                # 接口冒烟（9 项）
node scripts/test-bind.mjs            # 一键绑定链路：生成码 → 提交 → 入库 → 码失效（8 项）
node scripts/test-extension-logic.mjs # 沙箱执行 background.js + manifest 校验（14 项）
node scripts/test-failure-path.mjs    # 无账号下单 → 自动退款链路
node scripts/test-success-mock.mjs    # mock 上游 → 媒体落地 → 作品库可读
node scripts/test-upstream-timing.mjs # 上游任务查询时序
node scripts/shots.mjs                # 登录并逐页截图到 shots\
node scripts/shots-bind.mjs           # 截一键绑定弹窗与绑定页
```

> 扩展本身无法用 puppeteer 加载验证：Chrome 137+ 起，`--load-extension` 在自动化环境下被禁用
> （实测 Chrome 157 无论 headless 还是 headful 都不加载，加 `--enable-unsafe-extension-debugging` 也无效）。
> 因此 `test-extension-logic.mjs` 改为用 `node:vm` 在沙箱里**真实执行** `background.js`，
> 注入 mock 的 `chrome.cookies`，断言它读 cookie、拼接、提交、处理无 cookie 分支的行为。
> 「Chrome 能否加载扩展」这一环仍需人工装一次确认。

---

## 与参考仓库的关系

- 上游 `upstream/muse2api` 是 [czg86389-hub/muse2api](https://github.com/czg86389-hub/muse2api)（MIT）的
  完整克隆，未经修改，只加了 `.env` 与 `.venv`。它负责浏览器自动化和账号池。
- 平台层（`server/` + `web/`）是本仓库新增，负责多用户、计费、任务编排、作品库与运营界面。

升级上游：`cd upstream\muse2api && git pull`，然后 `.\stop.ps1; .\start.ps1`。
