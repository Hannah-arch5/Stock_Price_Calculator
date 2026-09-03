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

### v5.3.0: Ticker Pocket (Mobile Companion Edition)
- **Official Version Name**: `Ticker Pocket v5.3.0` (Mobile Edition).
- **Built-in HTTP & SSE Sync Server**:
  - Electron main process runs lightweight HTTP server on port `7321` serving PWA assets and REST API (`/api/data`, `/api/events`, `/api/server-info`).
  - Automatic LAN IP discovery (`os.networkInterfaces()`) for frictionless connection.
  - Real-time SSE push (`broadcastSyncData`): any save/update in Mac desktop instantly syncs to connected iPhones without refreshing.
- **iPhone 14 Pro Max & iPhone 15 Studio Noir Mobile PWA**:
  - Designed strictly to Studio Noir aesthetics: pure OLED black (`#030303`), high-contrast JetBrains Mono & Inter typography, 1px dividers, extreme negative whitespace.
  - Native iOS Web Clip integration: standalone fullscreen mode (`apple-mobile-web-app-capable`, `black-translucent`), customized `apple-touch-icon.png` (with Apple standard padding).
  - iOS Dynamic Island & Home indicator safe area adaptation (`env(safe-area-inset-top/bottom)`).
  - **Touch & Motion Engine**:
    - **Double-Tap to Highlight**: Instantly toggles row highlight with pure-white solid indicator (`3px solid #ffffff`), 12% luminous background (`rgba(255,255,255,0.12)`), and inset boundary glow.
    - **Hold-to-Drag (180ms)**: Responsive activation with subtle haptic vibration; early finger slide (>7px) yields immediately to native page scrolling.
    - **`smoothMove` Zero-Bounce Reorder Engine**: Sibling rows/tags calculate displacement deltas and glide silkily (`0.22s cubic-bezier(0.2, 0, 0, 1)`) without spring overshoot or scale distortion.
    - **Visual Differentiation**: Normal dragging rows display a subtle dashed slot (`1px dashed rgba(255,255,255,0.25)`); highlighted dragging rows strictly preserve the pure-white left stripe and glowing background.
    - **In-line Quick Controls**: Inline pencil edit button, add-to-calculator trigger, and dynamic micro-pill alert banner.
  - Offline cache resilience: LocalStorage caching retains full ledger snapshot even when disconnected or outside LAN.
  - Independent market color isolation: A-Share (red-up/green-down), US/HK (green-up/red-down).
- **Mac Desktop Integration**:
  - Added mobile sync icon button in top-right actions.
  - Studio Noir sync modal displaying current LAN address (e.g. `http://192.168.71.146:7321`), one-click copy button, and real-time connection status.

---

## 6. Build & Deployment
- **Build & Launch Command** (Requires `BypassSandbox: true`):
  ```bash
  npm run build && rm -rf /Applications/Ticker.app && cp -R dist/mac-arm64/Ticker.app /Applications/ && killall Ticker 2>/dev/null; sleep 2 && open -a /Applications/Ticker.app
  ```
- **Git Workflow**:
  - Project repo uses `Hannah-arch5/Stock_Price_Calculator_Ticker`
  - Release branches tagged (e.g., `v5.3.0`).
