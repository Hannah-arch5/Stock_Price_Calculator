# Project Memory: Stock_Price_Calculator (Ticker)

> **Global Memory Reference**: Global guidelines and habits are maintained in `~/.gemini/GEMINI.md`.

---

## 1. Project Overview
- **Project Name**: `Stock_Price_Calculator` (App Name: `Ticker`)
- **Repository**: `Hannah-arch5/Stock_Price_Calculator_Ticker`
- **Purpose**: High-frequency financial research dashboard & stock target price calculator designed for intrinsic value calculations, multi-timeframe tracking, and real-time earnings/fundamental analysis.
- **Tech Stack**: Electron 42, Node.js, Vanilla HTML5 / CSS3 / ES6+ JavaScript.

### Version Naming Conventions
- **Desktop Edition (电脑端版本)**: Any version name that does **NOT** contain `Ticker Pocket` or `Mobile Companion` strictly refers to the **Desktop Edition** (e.g., `v5.3.0`, `Ticker v5.3.0`).
- **Mobile Edition (手机版本)**: Any version name containing **`Ticker Pocket`** or **`Mobile Companion`** strictly refers to the **Mobile Edition** (e.g., `Ticker Pocket v5.3.0`, `v5.3.0 (Mobile Companion)`).

---

## 2. Design & Architectural Philosophy: "Studio Noir"
Hannah strongly prefers the **Studio Noir (工作室·暗黑极简风)** aesthetic:
- **Borderless Aesthetic**: Zero generic card boxes, zero drop-shadows. Structural separation is achieved through extreme negative whitespace (massively exaggerated margins/paddings) and subtle `1px` structural dividers.
- **Color System**:
  - Background: `--bg: #030303` (Pure deep black)
  - Primary Text: `--fg: #ffffff`
  - Secondary/Muted: `--fg-dim: #777777`
  - Subtle Border: `--border: rgba(255, 255, 255, 0.1)`
- **Typography & Scale**: High typographic contrast between impactful display numbers and ultra-compact metadata labels (uppercase / monospace numbers).
- **Icons & Controls**: Flat, minimalist, monochrome Unicode characters / SVG paths. No colorful default emojis.
- **Action Arrow `↗`**: Transparent background by default; highlights subtly only on hover.
- **C/Q & Inputs**: Inline editable with `border-bottom: 1px dashed var(--border)` and placeholder `--`.
- **macOS Dock Icon**: Minimalist flat Apple style with exact 15% transparent padding for perfect native dock alignment.

---

## 3. Data Storage & Persistence
- **User Data Location**: Pinned to `~/Library/Application Support/ticker/`
  - Records Ledger: `app-data-v1.json`
  - Window Geometry: `window-state-v9.json`
  - Custom Column Proportions: `custom-sizes.json`
- **Record Data Structure**:
  ```json
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "currency": "$",
    "records": [
      {
        "type": "Target Projection",
        "mode": "target",
        "symbol": "AAPL",
        "details": "<span>Base: $180</span><span>Up 15%</span>",
        "result": "$207.00",
        "isUp": true,
        "inputs": { "base": 180, "perc": 15, "isUp": true },
        "currency": "$"
      }
    ]
  }
  ```

---

## 4. Market Detection & Color System
The app features intelligent automatic market detection via `getMarketInfo(symbol)`:

| Asset Type | Pattern | Currency | Color Scheme |
|---|---|---|---|
| **A-Share (A股)** | 6-digit number (`600519`, `300750`) or `SH`/`SZ` prefix | `¥` | **红涨绿跌** (Up: `#ff453a`, Down: `#32d74b`) |
| **Hong Kong (港股)** | 5-digit number (`00700`, `09988`) | `HK$` | **绿涨红跌** (Up: `#32d74b`, Down: `#ff453a`) |
| **US Stocks (美股)** | Alphabetical (`AAPL`, `NVDA`, `BRK.B`) | `$` | **绿涨红跌** (Up: `#32d74b`, Down: `#ff453a`) |

### Key Isolation Features:
- **Per-Card Independent Colors**: Each stock holding card (`history-group`) sets its own local `--up-color` and `--down-color` CSS variables via inline styles. US and A-share stocks displayed side by side adhere strictly to their respective market color standards without interference.
- **Calculator Auto-Switching**: Clicking any holding record into the calculator, or typing a new symbol, automatically updates global currency (`$`/`¥`/`HK$`), radio toggles, and live color themes.
- **Symbol Edit Auto-Refresh**: Changing a stock identifier auto-migrates record currencies, clears stale news/earnings cache, and re-renders with the correct market styles.

---

## 5. Version History & Milestones

### v1.0.0 - v2.1.x: Genesis
- Basic target projection and percentage delta reverse calculations.
- Local storage and window persistence.

### v2.2.0: Inline Shares Logging
- Added inline `Shares:` count recording directly inside ledger cards with silent auto-save.

### v2.3.0: Multi-Timeframe Technical Memo
- Group header notes enhanced with responsive timeframe fields (`W:`, `D:`, `30:`).
- HTML report export compatibility.

### v3.0.0: Grouping & Grid Hierarchy
- Automatic symbol grouping, vertical drag-and-drop sorting of groups and items.
- Strict CSS grid alignment with extreme whitespace separating stock cards.

### v4.0.0: Custom Labels & Silent DOM Sync
- Pill-shaped custom labels module in left panel (inline editing, drag-to-reorder, drag-to-trash).
- Drag label to replace history card title.
- Silent DOM syncing without visual flickering.
- Integrated EastMoney real-time announcements.
- Window toggle between standard poster format (600x1180) and custom size.

### v5.0.0 - v5.1.3: Refinements & US News Iterations
- Added `C:` and `Q:` inputs with dashed border bottom.
- Action arrow `↗` styled with transparent background and hover highlights.
- US Quick-Tags updated to show full stock symbols (e.g. `AAPL`) rather than 2-char Chinese abbreviations.
- Translation integration explored and replaced due to network sandbox limitations.

### v5.2.0: Earnings & Analysis Matrix & Full Market Auto-Detection
- **US Earnings & Fundamental Analysis**:
  - Replaced legacy Yahoo news feed with structured **Earnings & Analysis (财报与分析)** panel.
  - Next Earnings release reminder via `calendarEvents.earnings`.
  - Report period banner: `最新财报: QX YYYY (TTM Data)` via `defaultKeyStatistics.mostRecentQuarter`.
  - 3×3 Grid + Summary: Market Cap, Rev Growth, Earnings Growth, Profit Margin, ROE, Debt/Equity, P/E, Forward P/E, Dividend Yield, Analyst Mean Target Price.
- **A-Share 财报与分析 Tab**:
  - Added 4th tab using EastMoney F10 data.
  - Aligned 3×3 layout: 营业收入, 营收增长, 净利润增长, 毛利率, 净利率, ROE, 资产负债率, 每股净资产 (BVPS), 每股收益 (EPS), 净利润.
- **Unified Market Detection Engine**:
  - Built-in `getMarketInfo()` auto-identifying symbol format.
  - Per-card independent color isolation.
  - Bidirectional calculator auto-switching.

### v5.3.0: Ticker Pocket (Mobile Companion Edition) [LOCKED & TAGGED]
- **Official Version Name**: `Ticker Pocket v5.3.0` (Mobile Edition).
- **Status**: Tagged and frozen in git (`v5.3.0`).

### v5.4.0: Ticker Pocket (Global Stock Research Matrix & AI Companion)
- **Official Version Name**: `Ticker Pocket v5.4.0` (Mobile Edition).
- **Global Stock Deep Research (`/api/stock-research`)**:
  - Auto-completion dropdown when typing in `#mobile-search-input` showing local ledger matches + `🔍 全网深度研报: 检索 "SYMBOL"`.
  - Supports arbitrary US, HK, and A-Share symbols/names.
  - **Homepage Card Header Tap Trigger**: Tapping any stock symbol/name in the ledger cards immediately opens the full Deep Stock Research sheet for that stock.
  - **Research Header Actions (➕ Add Card & ❤️ Favorite)**:
    - `➕`: One-tap adds clean stock card into the homepage ledger (symbol, name preserved; cost, qty, w/d/30, and strategy notes initialized empty).
    - `❤️`: Toggles favorite status, real-time syncs with the new `♥ 收藏` (FAV) homepage market tab.
  - **Homepage Market Tabs**: `ALL`, `US`, `A股`, `HK`, and `♥ 收藏` (Favorites).
  - **Homepage State Preservation**: When launching global research or closing the modal, search input and filter state automatically reset to show the full original ledger list without any disruption.
  - **Financial Matrix (English Labels)**: Market Cap, Revenue Growth (YoY), Earnings Growth (YoY), Net / Gross Margin, ROE, Debt / Equity Ratio, P/E (TTM / Forward), Dividend Yield, Analyst Target Price.
- **Wind-Style 5 Deep Institutional Research Sections (万得风格五大深度投研板块，全英文术语注释)**:
  1. `BUSINESS & INDUSTRY (公司与行业洞察)`: 核心业务与商业模式 (Core Business & Monetization Model)、行业地位与竞争护城河 (Competitive Moat & Industry Standing)、SaaS模式、净留存率 (Net Retention Rate)、全产业链协同 (Full-Stack Synergy).
  2. `INVESTMENT LOGIC (核心投资逻辑)`: 核心成长主线 (Core Thesis & High-Margin Expansion)、短线投资逻辑 (Short-term Catalysts)、长线投资逻辑 (Long-term Structural Drivers)、当前估值水平 (Valuation Context & Multiples / P/E / EV/EBITDA / Davis Double Play).
  3. `NEWS BRIEF (精选要闻简报)`: 实时精选 3 条与基本面深度相关的核心大事件 (Financial Disclosure / Industry Dynamics / Broker Research) 及影响解读.
  4. `INSTITUTIONAL VIEW (机构观点与研报共识)`: 机构一致买入/增持评级分布与目标价上涨空间 (Overweight/Buy Consensus & Target Upside)、华尔街/券商核心逻辑推导链条 (Deduction Chain & Growth Flywheel) 与盈利预期调整.
  5. `TECHNICAL ANALYSIS (技术面研判)`: 支撑位与压力位关键价位区间测算 (Support/Resistance Bands)、均线多空趋势 (Bullish Moving Average Alignment) 与 RSI 强弱信号.
- **6-Tab Luxury Smooth Navigation & Modal Floating Scroll-To-Top**:
  - Replaced action bar with 6 English quick tabs: `OVERVIEW`, `LOGIC`, `NEWS`, `CONSENSUS`, `TECHNICAL`, `AI CHAT`.
  - 100% Solid OLED black mask (`#030303`) sticky background preventing any text transparency/bleed-through.
  - Luxury smooth scrolling physics (`smoothScrollContainer` with 1150ms Studio Noir quintic ease-out) matching the desktop/homepage feel.
  - Active tab auto-synchronization (ScrollSpy) as the user scrolls.
  - Floating scroll-to-top button (`#res-modal-scroll-to-top-btn`) inside the research sheet with threshold appearance and smooth return to top.
- **Apple Calendar Reminder Integration (`/api/calendar-ics`)**:
  - Next Earnings release countdown and date display.
  - `📅 Add to Apple Calendar (添加到日历)` one-tap action: generates standard `.ics` iCalendar payload with preconfigured 9-hour-ahead alarm, invoking iOS native "Add Event" modal.
- **AI Research Companion (`/api/ai-chat`)**:
  - Embedded Studio Noir AI chat dialog pre-loaded with current stock's financial fundamentals and business background.
  - Quick-prompt chips: 核心护城河分析、财报风险评估、估值深度评估.

### v6.0.8: iOS Lifecycle Instant Wakeup Sync & Resilient Cloud Polling [LOCKED & TAGGED: v6.0.8]
- **Official Version Name**: `Ticker Pocket v6.0.8` (Mobile Edition).
- **Tag**: `v6.0.8` | **Commit**: `c662783` | **Date**: `2026-09-06`
- **iOS Lifecycle Instant Wakeup Sync (手机唤醒即刻自动同步)**:
  - 增加 `visibilitychange`、`pageshow` 与 `focus` 手机生命周期唤醒监听。当用户解锁手机或从后台切换回 Ticker PWA / Safari 时，立即在后台自动从云端静默拉取电脑端的最新修改数据。
  - 将 GitHub Pages 独立端自动轮询周期缩短至 20 秒，Google Apps Script 容错超时提升至 15 秒以应对冷启动。
- **Desktop & Workspace Data Harmonization (桌面与仓库数据自动同步)**:
  - 桌面端保存（`save-data`）时，自动注入最新修改毫秒级时间戳，并同步更新工作区 `ticker-data.json`。
  - 更新钓达股份（`002865`）、特发信息（`000070`）、澜起科技（`688008`）、工业富联（`601138`）等全量最新策略笔记。
- **Version Indicator & Script Bumping**:
  - 主页最下方右下角版本升级为 `TICKER POCKET v6.0.8`。
  - 脚本与缓存引用升级为 `mobile.js?v=6.0.8` 与 `mobile-quotes.js?v=6.0.8`。

### v6.0.7: Timestamp-Aware Cloud Sync Engine & Real-Time Desktop Data Alignment [LOCKED & TAGGED: v6.0.7]
- **Official Version Name**: `Ticker Pocket v6.0.7` (Mobile Edition).
- **Tag**: `v6.0.7` | **Commit**: `da95027` | **Date**: `2026-09-06`
- **Timestamp-Aware Dynamic Cache Synchronization (时间戳防回退同步引擎)**:
  - 手机端 `saveToCache()` 引入基于时间戳的动态保护机制，杜绝静态文件覆盖云端/本地最新修改数据。
  - 手机主页下拉或手动点击同步时，优先拉取 Google Drive / 局域网最新数据，并提示明确同步状态反馈。
- **Desktop & Workspace Data Harmonization (桌面与仓库数据自动同步)**:
  - 桌面端保存（`save-data`）时，自动注入最新修改毫秒级时间戳，并同步更新工作区 `ticker-data.json`。
  - 更新三角防务（`300775`）与工业富联（`601138`）等全量13条标的最新交易笔录。
- **Version Indicator & Script Bumping**:
  - 主页最下方右下角版本升级为 `TICKER POCKET v6.0.7`。
  - 脚本与缓存引用升级为 `mobile.js?v=6.0.7` 与 `mobile-quotes.js?v=6.0.7`。

### v6.0.6: US Market Full Real-time Quotes Integration [LOCKED & TAGGED: v6.0.6]
- **Official Version Name**: `Ticker Pocket v6.0.6` (Mobile Edition).
- **Tag**: `v6.0.6` | **Commit**: `aa39a87` | **Date**: `2026-09-05`
- **US Stocks Real-Time Market Quotes (全美股实时行情全接入)**:
  - 接入东方财富与腾讯行情双备用通道（`105.<SYMBOL>` / `us<SYMBOL>`），全面支持美股（`AAPL`、`APP`、`NVDA`、`TSLA`、`BABA` 等）独立网页端秒级实时行情与涨跌幅获取。
  - 自动识别美股中英文名称、最新股价（美元 `$`）、涨跌幅（绿涨红跌）与收盘时间戳。
- **Version Indicator & Script Bumping**:
  - 主页最下方右下角版本升级为 `TICKER POCKET v6.0.6`。
  - 脚本与缓存引用升级为 `mobile.js?v=6.0.6` 与 `mobile-quotes.js?v=6.0.6`。

### v6.0.5: Silent PDF Export & Zero Alert Banners [LOCKED & TAGGED: v6.0.5]
- **Official Version Name**: `Ticker Pocket v6.0.5` (Mobile Edition).
- **Tag**: `v6.0.5` | **Commit**: `7545114` | **Date**: `2026-09-05`
- **Silent PDF Export (彻底静默导出 PDF)**:
  - 彻底删除了点击导出 PDF 后的顶部绿色悬浮横幅（`showAlert`），导出交互与备忘录保持一致的纯净静默体验，直接调起系统 PDF 预览。
- **Version Indicator & Script Bumping**:
  - 主页最下方右下角版本升级为 `TICKER POCKET v6.0.5`。
  - 脚本与缓存引用升级为 `mobile.js?v=6.0.5` 与 `mobile-quotes.js?v=6.0.5`。

### v6.0.4: Clean Title Formatting for Notes & PDF Export [LOCKED & TAGGED: v6.0.4]
- **Official Version Name**: `Ticker Pocket v6.0.4` (Mobile Edition).
- **Tag**: `v6.0.4` | **Commit**: `d3b74b5` | **Date**: `2026-09-05`
- **Clean Notes & PDF Title (纯净标题格式)**:
  - 彻底去除备忘录与各级导出大标题中多余的括号 `【` 与 `】`。
  - 首行大标题统一为标准纯净格式：`${todayFormatted} TICKER 策略测算与投资看板研报`（个股研报为 `${todayFormatted} ${sym} - ${name} TICKER 机构级深度投研研报`）。
- **Version Indicator & Script Bumping**:
  - 主页最下方右下角版本升级为 `TICKER POCKET v6.0.4`。
  - 脚本与缓存引用升级为 `mobile.js?v=6.0.4` 与 `mobile-quotes.js?v=6.0.4`。

### v6.0.3: Streamlined Export Menu & Clean PDF Print Preview [LOCKED & TAGGED: v6.0.3]
- **Official Version Name**: `Ticker Pocket v6.0.3` (Mobile Edition).
- **Tag**: `v6.0.3` | **Commit**: `8bff239` | **Date**: `2026-09-05`
- **Streamlined Export Sheet (精简导出选项)**:
  - 移除了使用率较低的 Word (.doc) 导出选项，聚焦于「导出到备忘录」与「导出为 PDF 文档 (.pdf)」两大核心场景。
- **Clean PDF Preview (纯净 PDF 打印与预览)**:
  - 彻底删除了 PDF 预览页面顶部的黑色悬浮框及其内部重复的返回/打印按钮，保留下方纯净的文档正文与系统原生打印/存储能力。
- **Version Indicator & Script Bumping**:
  - 主页最下方右下角版本升级为 `TICKER POCKET v6.0.3`。
  - 脚本与缓存引用升级为 `mobile.js?v=6.0.3` 与 `mobile-quotes.js?v=6.0.3`。

### v6.0.1: Large Bold Title & Dual Rich HTML/Markdown Apple Notes Export Engine [LOCKED & TAGGED: v6.0.1]
- **Official Version Name**: `Ticker Pocket v6.0.1` (Mobile Edition).
- **Tag**: `v6.0.1` | **Commit**: `81cca8a` | **Date**: `2026-09-05`
- **Large Bold Title Formatting (加粗加大标题导出)**:
  - 导出纯文本采用专属醒目标题框 `【 ${todayFormatted} TICKER 策略测算与投资看板研报 】`。
  - 同步生成富文本 HTML 结构，首行注入 `<h1 style="font-size: 26px; font-weight: 800; ...">`，各标的与章节采用 `<h2>`、`<strong>`、`<ul>` 等结构化样式。
- **Dual Clipboard Copying (富文本+纯文本双通道剪贴板)**:
  - 导出到备忘录时，通过 ClipboardItem / execCommand 将 `text/html` 和 `text/plain` 同时写入系统剪贴板。
  - 用户直接粘贴到 Apple Notes 时，标题自动以特大粗体显示，各小节与排版条理分明。

### v6.0.0: Native Apple Notes Optimized Export & Title Harmonization [LOCKED & TAGGED: v6.0.0]
- **Official Version Name**: `Ticker Pocket v6.0.0` (Mobile Edition).
- **Tag**: `v6.0.0` | **Commit**: `f419cab` | **Date**: `2026-09-05`
- **Apple Notes Native Title Harmonization (备忘录大标题自动识别)**:
  - 彻底去除首行虚线分割线，首行直接生成标准大标题（如 `2026/09/05 TICKER 策略测算与投资看板研报`）。
- **Silent & Clean Export Interaction (极简静默交互)**:
  - 导出到备忘录时静默执行剪贴板写入与系统分享调起，不再触发多余的顶部悬浮横幅。

### v5.9.9: Homepage Multi-Format Export Integration (Notes, Word, PDF) [LOCKED & TAGGED: v5.9.9]
- **Official Version Name**: `Ticker Pocket v5.9.9` (Mobile Edition).
- **Tag**: `v5.9.9` | **Commit**: `cbd5778` | **Date**: `2026-09-05`

### v5.9.8: Restore Classic Badge Typography, Seamless Splash Background & Footer Version Placement [LOCKED & TAGGED: v5.9.8]
- **Official Version Name**: `Ticker Pocket v5.9.8` (Mobile Edition).
- **Tag**: `v5.9.8` | **Commit**: `04bd71a` | **Date**: `2026-09-05`

---

## 5. Locked Version Archive & Rollback Guide (锁定版本归档与回退索引)

| 锁定版本 Tag | 对应 Commit | 发布日期 | 核心功能与主要改动说明 | 回退切换命令 |
| **`v6.0.8`** | `c662783` | 2026-09-06 | **当前最新稳定版**：iOS 生命周期即刻唤醒同步、20s 云端轮询、版本号 `v6.0.8`。 | `git checkout v6.0.8` |
| **`v6.0.7`** | `da95027` | 2026-09-06 | **时间戳防回退版**：时间戳防回退同步引擎、桌面与仓库数据自动同步、版本号 `v6.0.7`。 | `git checkout v6.0.7` |
| **`v6.0.6`** | `aa39a87` | 2026-09-05 | **全美股行情版**：美股全实时行情接入（AAPL、APP、NVDA 等）、版本号 `v6.0.6`。 | `git checkout v6.0.6` |
| **`v6.0.5`** | `7545114` | 2026-09-05 | **静默导出版**：静默 PDF 导出（彻底去除顶部绿色横幅）。 | `git checkout v6.0.5` |
| **`v6.0.4`** | `d3b74b5` | 2026-09-05 | **纯净标题版**：去除备忘录大标题多余括号。 | `git checkout v6.0.4` |
| **`v6.0.3`** | `8bff239` | 2026-09-05 | **导出精简版**：精简导出菜单（保留备忘录与 PDF）、纯净 PDF 打印预览（去除顶部悬浮黑框）。 | `git checkout v6.0.3` |
| **`v6.0.1`** | `81cca8a` | 2026-09-05 | **加粗加大大标题版**：标题醒目标识、富文本 HTML 剪贴板复制。 | `git checkout v6.0.1` |
| **`v6.0.0`** | `f419cab` | 2026-09-05 | **备忘录标题规范版**：去除首行虚线、首行标准大标题、静默极简导出。 | `git checkout v6.0.0` |
| **`v5.9.9`** | `cbd5778` | 2026-09-05 | **多格式导出整合版**：主页右上角导出入口（支持 Apple Notes、Word、PDF 打印导出）。 | `git checkout v5.9.9` |
| **`v5.9.8`** | `04bd71a` | 2026-09-05 | **里程碑版本**：2026 财报周期统一、经典暗黑极简徽章字阶、自适应单双行排版、全尺寸桌面图标、纯黑无色差启动欢迎页。 | `git checkout v5.9.8` |
| **`v5.3.0`** | `e0cafd5` | 2026-09-04 | **纯测算看板移动版**：首个稳定手机 PWA 版本，包含买卖点双向测算、局域网多设备同步与卡片颜色独立隔离。 | `git checkout v5.3.0` |
| **`v5.0.0`** | `b0eb3eb` | 2026-09-03 | **桌面端多重行情重构版**：接入东方财富与腾讯行情双备用通道、修复休市状态判定与零买入成本计算。 | `git checkout v5.0.0` |
| **`v3.2.0`** | `4b47db9` | 2026-09-02 | **双向联动测算器**：目标价测算与涨跌幅测算双向自动切换、网格化买卖点管理。 | `git checkout v3.2.0` |
| **`v2.0.0`** | `839da49` | 2026-09-01 | **Studio Noir 架构奠基版**：纯黑极简设计语言、Electron 窗口记忆与无边框质感。 | `git checkout v2.0.0` |

---

## 6. Build & Deployment
- **Build & Launch Command** (Requires `BypassSandbox: true`):
  ```bash
  npm run build && rm -rf /Applications/Ticker.app && cp -R dist/mac-arm64/Ticker.app /Applications/ && killall Ticker 2>/dev/null; sleep 2 && open -a /Applications/Ticker.app
  ```
- **Git Workflow**:
  - Project repo uses `Hannah-arch5/Stock_Price_Calculator_Ticker`
  - Release tags frozen in Git (e.g., `v5.9.8`, `v5.3.0`, `v5.0.0`, `v3.2.0`, `v2.0.0`).

