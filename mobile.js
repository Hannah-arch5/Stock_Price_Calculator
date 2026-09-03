/**
 * Ticker Mobile - Studio Noir Mobile PWA Client
 * Real-time SSE synchronization + LocalStorage Offline Persistence + Bidirectional Cloud Edit
 */

(function () {
  let appState = {
    historyRecords: [],
    customLabels: [
      "30买点2", "30卖点2", "M已跌", "目前30已跌", "目前D已跌",
      "目前30已涨", "目前D已涨", "D买点2", "D卖点2", "30买点1",
      "W卖点2", "30卖点1", "D卖点1", "W卖点1", "W买点1", "D买点1"
    ],
    lastUpdated: null,
  };

  let currentMarketFilter = 'all';
  let searchQuery = '';
  let eventSource = null;

  // Cache Keys
  const CACHE_KEY = 'ticker_mobile_cache_v1';
  const GDRIVE_CACHE_KEY = 'ticker_gdrive_url_v1';

  // Market Detection matching desktop Ticker
  function getMarketInfo(symbol) {
    if (!symbol) return { market: 'US', currency: '$', isCn: false, label: 'US' };
    const s = symbol.trim().toUpperCase();
    if (/^\d{6}$/.test(s) || /^(SH|SZ)\d{6}$/i.test(s)) {
      return { market: 'CN', currency: '¥', isCn: true, label: 'A-Share' };
    }
    if (/^\d{5}$/.test(s) || /^HK\d{4,5}$/i.test(s)) {
      return { market: 'HK', currency: 'HK$', isCn: false, label: 'HK' };
    }
    return { market: 'US', currency: '$', isCn: false, label: 'US' };
  }

  // Format Helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Strip HTML from formula details to make it clean for mobile
  function cleanDetails(detailsHtml, record) {
    if (!detailsHtml && !record.inputs) return '';
    if (record.inputs) {
      if (record.inputs.base !== undefined) {
        const dir = record.inputs.isUp !== false ? '▲' : '▼';
        return `Base: ${record.currency || ''}${record.inputs.base}  ${dir} ${record.inputs.perc}%`;
      }
      if (record.inputs.initial !== undefined) {
        return `Base: ${record.currency || ''}${record.inputs.initial} → Target: ${record.currency || ''}${record.inputs.final}`;
      }
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = detailsHtml;
    return tmp.textContent.replace(/\s+/g, ' ').trim();
  }

  // Render Functions
  function renderApp() {
    const container = document.getElementById('stocks-container');
    const emptyState = document.getElementById('empty-state');
    const totalSymbolsEl = document.getElementById('total-symbols-count');
    const totalTargetsEl = document.getElementById('total-targets-count');
    const lastSyncEl = document.getElementById('last-sync-time');

    if (!container) return;

    let records = appState.historyRecords || [];

    // Update global header stats
    totalSymbolsEl.textContent = records.length;
    let totalCalcs = 0;
    records.forEach(g => {
      if (g.records) totalCalcs += g.records.length;
    });
    totalTargetsEl.textContent = totalCalcs;

    if (appState.lastUpdated) {
      const d = new Date(appState.lastUpdated);
      lastSyncEl.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    }

    // Filter records
    const filtered = records.filter(group => {
      const marketInfo = getMarketInfo(group.symbol);
      
      // Market filter
      if (currentMarketFilter !== 'all' && marketInfo.market !== currentMarketFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const sym = (group.symbol || '').toLowerCase();
        const name = (group.name || '').toLowerCase();
        const note = (group.note || '').toLowerCase();
        const matchRecords = (group.records || []).some(r => (r.type || '').toLowerCase().includes(q));
        if (!sym.includes(q) && !name.includes(q) && !note.includes(q) && !matchRecords) {
          return false;
        }
      }

      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    // Build HTML
    container.innerHTML = filtered.map((group, groupIdx) => {
      const marketInfo = getMarketInfo(group.symbol);
      const upColor = marketInfo.isCn ? '#ff453a' : '#32d74b';
      const downColor = marketInfo.isCn ? '#32d74b' : '#ff453a';

      // Timeframe tags
      const tfTags = [];
      if (group.tf_w) tfTags.push(`<span class="tf-badge"><strong>W</strong>${escapeHtml(group.tf_w)}</span>`);
      if (group.tf_d) tfTags.push(`<span class="tf-badge"><strong>D</strong>${escapeHtml(group.tf_d)}</span>`);
      if (group.tf_30) tfTags.push(`<span class="tf-badge"><strong>30</strong>${escapeHtml(group.tf_30)}</span>`);

      // Cost & Qty
      const costQtyItems = [];
      if (group.cost) costQtyItems.push(`<span class="card-meta-item"><span class="meta-key">Cost:</span> <span class="meta-val-highlight mono">${escapeHtml(group.cost)}</span></span>`);
      if (group.qty) costQtyItems.push(`<span class="card-meta-item"><span class="meta-key">Qty:</span> <span class="meta-val-highlight mono">${escapeHtml(group.qty)}</span></span>`);

      // Calculations Ledger Rows
      const recordsHtml = (group.records || []).map((r, rIdx) => {
        const isUp = r.isUp !== false;
        const colorClass = isUp ? 'is-up' : 'is-down';
        const formulaStr = cleanDetails(r.details, r);
        const highlightedClass = r.highlighted ? 'highlighted' : '';
        const sharesHtml = r.shares ? `<div class="record-shares mono">${escapeHtml(r.shares)} 股</div>` : '';

        return `
          <div class="record-row ${highlightedClass}">
            <div class="record-left">
              <div class="record-type-badge">${escapeHtml(r.type || 'Projection')}</div>
              <div class="record-formula mono">${escapeHtml(formulaStr)}</div>
              ${sharesHtml}
            </div>
            <div class="record-right">
              <div class="record-result mono ${colorClass}">${escapeHtml(r.result || '--')}</div>
              <button class="edit-pencil-btn calc-edit-trigger" data-symbol="${escapeHtml(group.symbol)}" data-record="${rIdx}" title="Edit calculation">✎</button>
            </div>
          </div>
        `;
      }).join('');

      // Notes section
      const hasNote = group.note && group.note.trim().length > 0;
      const noteHtml = hasNote ? `
        <div class="note-accordion">
          <button class="note-toggle" data-target="note-${groupIdx}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span>STRATEGY & TRADING NOTES</span>
          </button>
          <div id="note-${groupIdx}" class="note-content">${escapeHtml(group.note)}</div>
        </div>
      ` : '';

      return `
        <article class="stock-card" style="--up-color: ${upColor}; --down-color: ${downColor};">
          <header class="card-header">
            <div class="card-title-row">
              <div class="symbol-name-wrap">
                <span class="stock-symbol mono">${escapeHtml(group.symbol)}</span>
                ${group.name ? `<span class="stock-name">${escapeHtml(group.name)}</span>` : ''}
              </div>
              <div class="card-title-right">
                <span class="market-tag">${marketInfo.label}</span>
                <button class="edit-pencil-btn stock-edit-trigger" data-symbol="${escapeHtml(group.symbol)}" title="Edit stock metadata">✎</button>
              </div>
            </div>

            ${costQtyItems.length > 0 ? `<div class="card-meta-row">${costQtyItems.join('')}</div>` : ''}
            ${tfTags.length > 0 ? `<div class="timeframe-tags">${tfTags.join('')}</div>` : ''}
          </header>

          <div class="records-ledger">
            ${recordsHtml || '<div class="record-row"><span class="record-formula">No active targets</span></div>'}
          </div>

          ${noteHtml}
        </article>
      `;
    }).join('');

    // Attach accordion toggles
    document.querySelectorAll('.note-toggle').forEach(btn => {
      btn.onclick = function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('data-target');
        const content = document.getElementById(targetId);
        if (content) {
          const isOpen = content.classList.contains('visible');
          if (isOpen) {
            content.classList.remove('visible');
            this.classList.remove('open');
          } else {
            content.classList.add('visible');
            this.classList.add('open');
          }
        }
      };
    });

    // Attach Stock Edit triggers
    document.querySelectorAll('.stock-edit-trigger').forEach(btn => {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        const symbol = this.getAttribute('data-symbol');
        openStockEditSheet(symbol);
      };
    });

    // Attach Calculation Edit triggers
    document.querySelectorAll('.calc-edit-trigger').forEach(btn => {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        const symbol = this.getAttribute('data-symbol');
        const recordIdx = parseInt(this.getAttribute('data-record'), 10);
        openCalcEditSheet(symbol, recordIdx);
      };
    });

    // Check alerts
    checkTargetAlerts();
  }

  // ─── 1. Stock Metadata Edit Sheet ────────────────────────────
  let currentEditingStockSymbol = null;

  function openStockEditSheet(symbol) {
    const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
    if (!group) return;

    currentEditingStockSymbol = symbol;

    const sheet = document.getElementById('stock-edit-sheet');
    const backdrop = document.getElementById('edit-sheet-backdrop');
    const subtitle = document.getElementById('stock-sheet-subtitle');

    subtitle.textContent = `${group.symbol} ${group.name || ''}`.trim();
    document.getElementById('stock-edit-symbol').value = group.symbol || '';
    document.getElementById('stock-edit-name').value = group.name || '';
    document.getElementById('stock-edit-cost').value = group.cost || '';
    document.getElementById('stock-edit-qty').value = group.qty || '';
    document.getElementById('stock-edit-tf-w').value = group.tf_w || '';
    document.getElementById('stock-edit-tf-d').value = group.tf_d || '';
    document.getElementById('stock-edit-tf-30').value = group.tf_30 || '';
    document.getElementById('stock-edit-note').value = group.note || '';

    backdrop.classList.remove('hidden');
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      sheet.classList.add('visible');
    });
  }

  function closeStockEditSheet() {
    const sheet = document.getElementById('stock-edit-sheet');
    const backdrop = document.getElementById('edit-sheet-backdrop');
    if (!sheet || !backdrop) return;
    sheet.classList.remove('visible');
    backdrop.classList.remove('visible');
    setTimeout(() => {
      sheet.classList.add('hidden');
      backdrop.classList.add('hidden');
      currentEditingStockSymbol = null;
    }, 300);
  }

  async function saveStockEditSheet() {
    if (!currentEditingStockSymbol) return;
    const group = (appState.historyRecords || []).find(g => g.symbol === currentEditingStockSymbol);
    if (!group) return;

    const newSymbol = document.getElementById('stock-edit-symbol').value.trim().toUpperCase();
    const newName = document.getElementById('stock-edit-name').value.trim();
    const newCost = document.getElementById('stock-edit-cost').value.trim();
    const newQty = document.getElementById('stock-edit-qty').value.trim();
    const newTfW = document.getElementById('stock-edit-tf-w').value.trim();
    const newTfD = document.getElementById('stock-edit-tf-d').value.trim();
    const newTf30 = document.getElementById('stock-edit-tf-30').value.trim();
    const newNote = document.getElementById('stock-edit-note').value.trim();
    const saveBtn = document.getElementById('stock-save-btn');

    if (!newSymbol) {
      alert('股票代码不能为空');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING...';

    // Update fields
    group.symbol = newSymbol;
    group.name = newName;
    group.cost = newCost;
    group.qty = newQty;
    group.tf_w = newTfW;
    group.tf_d = newTfD;
    group.tf_30 = newTf30;
    group.note = newNote;

    // Update records symbol if changed
    (group.records || []).forEach(r => {
      r.symbol = newSymbol;
    });

    saveToCache(appState);
    await pushDataToServer(appState);

    saveBtn.textContent = 'SAVED!';
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.textContent = 'SAVE & SYNC';
      closeStockEditSheet();
    }, 400);
  }

  async function deleteStockFromSheet() {
    if (!currentEditingStockSymbol) return;
    const groupIdx = (appState.historyRecords || []).findIndex(g => g.symbol === currentEditingStockSymbol);
    if (groupIdx === -1) return;

    const confirmed = confirm(`确定要删除股票 [${currentEditingStockSymbol}] 及所有计算数据吗？`);
    if (!confirmed) return;

    appState.historyRecords.splice(groupIdx, 1);
    saveToCache(appState);
    await pushDataToServer(appState);
    closeStockEditSheet();
  }

  // ─── 2. Calculation Target Edit Sheet ────────────────────────
  let currentEditingCalcContext = {
    symbol: null,
    recordIdx: null
  };

  function openCalcEditSheet(symbol, recordIdx) {
    const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
    if (!group || !group.records || !group.records[recordIdx]) return;

    currentEditingCalcContext = { symbol, recordIdx };
    const rec = group.records[recordIdx];

    const sheet = document.getElementById('calc-edit-sheet');
    const backdrop = document.getElementById('edit-sheet-backdrop');
    const subtitle = document.getElementById('calc-sheet-subtitle');
    const typeInput = document.getElementById('calc-edit-type');
    const baseInput = document.getElementById('calc-edit-base');
    const targetInput = document.getElementById('calc-edit-target');
    const percInput = document.getElementById('calc-edit-perc');
    const dirBtn = document.getElementById('calc-edit-dir-btn');
    const sharesInput = document.getElementById('calc-edit-shares');
    const highlightCheck = document.getElementById('calc-edit-highlight');
    const chipsContainer = document.getElementById('calc-chips-container');

    subtitle.textContent = `${group.symbol} #${recordIdx + 1} (${rec.type || 'Target'})`;
    typeInput.value = rec.type || '';

    // Render Label Chips
    const labels = appState.customLabels && appState.customLabels.length > 0
      ? appState.customLabels
      : ["D买点1", "D卖点1", "W买点1", "W卖点1", "30买点1", "30卖点1", "目前30已涨", "目前D已涨"];

    chipsContainer.innerHTML = labels.map(lbl => `
      <button class="label-chip ${lbl === rec.type ? 'selected' : ''}" type="button">${escapeHtml(lbl)}</button>
    `).join('');

    chipsContainer.querySelectorAll('.label-chip').forEach(chip => {
      chip.onclick = function () {
        typeInput.value = this.textContent;
        chipsContainer.querySelectorAll('.label-chip').forEach(c => c.classList.remove('selected'));
        this.classList.add('selected');
      };
    });

    // Populate numbers & inputs
    let baseVal = '';
    let percVal = '';
    let isUp = rec.isUp !== false;
    let targetVal = '';

    if (rec.inputs) {
      if (rec.inputs.base !== undefined) baseVal = rec.inputs.base;
      if (rec.inputs.perc !== undefined) percVal = rec.inputs.perc;
      if (rec.inputs.isUp !== undefined) isUp = rec.inputs.isUp;
      if (rec.inputs.final !== undefined) targetVal = rec.inputs.final;
      if (rec.inputs.initial !== undefined && !baseVal) baseVal = rec.inputs.initial;
    }

    if (!targetVal && rec.result) {
      const match = rec.result.match(/[\d.]+/);
      if (match) targetVal = parseFloat(match[0]);
    }

    baseInput.value = baseVal !== '' ? baseVal : '';
    targetInput.value = targetVal !== '' ? targetVal : '';
    percInput.value = percVal !== '' ? percVal : '';
    dirBtn.setAttribute('data-dir', isUp ? 'up' : 'down');
    dirBtn.textContent = isUp ? '▲ UP' : '▼ DOWN';
    sharesInput.value = rec.shares || '';
    highlightCheck.checked = !!rec.highlighted;

    backdrop.classList.remove('hidden');
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      sheet.classList.add('visible');
    });
  }

  function closeCalcEditSheet() {
    const sheet = document.getElementById('calc-edit-sheet');
    const backdrop = document.getElementById('edit-sheet-backdrop');
    if (!sheet || !backdrop) return;
    sheet.classList.remove('visible');
    backdrop.classList.remove('visible');
    setTimeout(() => {
      sheet.classList.add('hidden');
      backdrop.classList.add('hidden');
      currentEditingCalcContext = { symbol: null, recordIdx: null };
    }, 300);
  }

  function setupCalcInputBindings() {
    const baseInput = document.getElementById('calc-edit-base');
    const targetInput = document.getElementById('calc-edit-target');
    const percInput = document.getElementById('calc-edit-perc');
    const dirBtn = document.getElementById('calc-edit-dir-btn');

    const calcFromBaseAndPerc = () => {
      const base = parseFloat(baseInput.value);
      const perc = parseFloat(percInput.value);
      const isUp = dirBtn.getAttribute('data-dir') === 'up';
      if (!isNaN(base) && !isNaN(perc)) {
        const factor = isUp ? (1 + perc / 100) : (1 - perc / 100);
        targetInput.value = (base * factor).toFixed(4).replace(/\.?0+$/, '');
      }
    };

    const calcFromBaseAndTarget = () => {
      const base = parseFloat(baseInput.value);
      const target = parseFloat(targetInput.value);
      if (!isNaN(base) && !isNaN(target) && base > 0) {
        const diff = target - base;
        const perc = Math.abs((diff / base) * 100);
        percInput.value = perc.toFixed(2).replace(/\.?0+$/, '');
        if (diff >= 0) {
          dirBtn.setAttribute('data-dir', 'up');
          dirBtn.textContent = '▲ UP';
        } else {
          dirBtn.setAttribute('data-dir', 'down');
          dirBtn.textContent = '▼ DOWN';
        }
      }
    };

    baseInput.addEventListener('input', calcFromBaseAndPerc);
    percInput.addEventListener('input', calcFromBaseAndPerc);
    dirBtn.addEventListener('click', function () {
      const current = this.getAttribute('data-dir');
      if (current === 'up') {
        this.setAttribute('data-dir', 'down');
        this.textContent = '▼ DOWN';
      } else {
        this.setAttribute('data-dir', 'up');
        this.textContent = '▲ UP';
      }
      calcFromBaseAndPerc();
    });
    targetInput.addEventListener('input', calcFromBaseAndTarget);
  }

  async function saveCalcEditSheet() {
    const { symbol, recordIdx } = currentEditingCalcContext;
    if (!symbol || recordIdx === null) return;

    const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
    if (!group || !group.records || !group.records[recordIdx]) return;

    const rec = group.records[recordIdx];
    const typeVal = document.getElementById('calc-edit-type').value.trim() || 'Projection';
    const baseVal = parseFloat(document.getElementById('calc-edit-base').value);
    const targetVal = parseFloat(document.getElementById('calc-edit-target').value);
    const percVal = parseFloat(document.getElementById('calc-edit-perc').value);
    const isUp = document.getElementById('calc-edit-dir-btn').getAttribute('data-dir') === 'up';
    const sharesVal = document.getElementById('calc-edit-shares').value.trim();
    const isHighlighted = document.getElementById('calc-edit-highlight').checked;
    const saveBtn = document.getElementById('calc-save-btn');

    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING...';

    rec.type = typeVal;
    rec.isUp = isUp;
    rec.highlighted = isHighlighted;
    rec.shares = sharesVal || null;

    const marketInfo = getMarketInfo(symbol);

    if (!isNaN(baseVal) && !isNaN(percVal)) {
      rec.inputs = { base: baseVal, perc: percVal, isUp, final: !isNaN(targetVal) ? targetVal : undefined };
      const formattedTarget = !isNaN(targetVal) ? targetVal.toFixed(4).replace(/\.?0+$/, '') : (baseVal * (isUp ? 1 + percVal / 100 : 1 - percVal / 100)).toFixed(4).replace(/\.?0+$/, '');
      rec.result = `${marketInfo.currency}${formattedTarget}`;
      rec.details = `<span>Base: ${marketInfo.currency}<span class="edit-trigger-val" data-field="base"><span class="edit-container-val">${baseVal}</span></span></span><span><span class="editable-toggle" data-field="isUp">${isUp ? 'Up' : 'Down'}</span> <span class="edit-trigger-val" data-field="perc"><span class="edit-container-val">${percVal}</span>%</span></span>`;
    }

    saveToCache(appState);
    await pushDataToServer(appState);

    saveBtn.textContent = 'SAVED!';
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.textContent = 'SAVE & SYNC';
      closeCalcEditSheet();
    }, 400);
  }

  async function deleteCalcFromSheet() {
    const { symbol, recordIdx } = currentEditingCalcContext;
    if (!symbol || recordIdx === null) return;

    const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
    if (!group || !group.records || !group.records[recordIdx]) return;

    const confirmed = confirm(`确定要删除此条目标价记录 [${group.records[recordIdx].type || 'Target'}] 吗？`);
    if (!confirmed) return;

    group.records.splice(recordIdx, 1);
    saveToCache(appState);
    await pushDataToServer(appState);
    closeCalcEditSheet();
  }

  // ─── Push Data To Servers (Mac & GDrive) ─────────────────────
  async function pushDataToServer(data) {
    const payloadStr = JSON.stringify(data);

    // 1. Try local Mac server if on LAN
    try {
      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        signal: AbortSignal.timeout(2500)
      });
      console.log('[Mobile] Saved to local Mac server');
    } catch(e) {
      console.log('[Mobile] Local server unreachable, pushing to cloud...');
    }

    // 2. Also push to Google Drive Web App (works on 5G!)
    const gdriveUrl = getGDriveUrl();
    if (gdriveUrl) {
      try {
        await fetch(gdriveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: payloadStr,
          redirect: 'follow'
        });
        console.log('[Mobile] Saved to Google Drive Web App');
      } catch(err) {
        console.warn('[Mobile] Google Drive push failed:', err);
      }
    }
  }

  // ─── Target Alerts Check (No Emoji & Swipe to Dismiss) ───────
  function checkTargetAlerts() {
    const banner = document.getElementById('alert-banner');
    const bannerText = document.getElementById('alert-banner-text');
    if (!banner || !bannerText) return;

    const alerts = [];
    (appState.historyRecords || []).forEach(g => {
      const stockLabel = `${g.symbol} ${g.name || ''}`.trim();
      (g.records || []).forEach(r => {
        if (r.highlighted || r.alertTriggered) {
          alerts.push(`${stockLabel} · 达到目标价 ${r.result || ''}`);
        }
      });
    });

    if (alerts.length > 0) {
      bannerText.textContent = alerts.join(' | ');
      banner.classList.remove('hidden');
      requestAnimationFrame(() => banner.classList.add('visible'));
    } else {
      banner.classList.remove('visible');
      setTimeout(() => banner.classList.add('hidden'), 350);
    }
  }

  function setupAlertBannerGestures() {
    const banner = document.getElementById('alert-banner');
    const closeBtn = document.getElementById('alert-banner-close');
    if (!banner) return;

    const dismissBanner = () => {
      banner.classList.remove('visible');
      setTimeout(() => banner.classList.add('hidden'), 350);
    };

    if (closeBtn) closeBtn.onclick = dismissBanner;

    // Swipe Up to dismiss
    let touchStartY = 0;
    banner.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    banner.addEventListener('touchend', (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      if (touchStartY - touchEndY > 20) {
        dismissBanner();
      }
    }, { passive: true });
  }

  // Load from local storage cache
  function loadFromCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.historyRecords) {
          appState = parsed;
          renderApp();
        }
      }
    } catch (e) {
      console.warn('Failed to load cache:', e);
    }
  }

  // Save to local storage cache
  function saveToCache(data) {
    try {
      data.lastUpdated = Date.now();
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      appState = data;
      renderApp();
    } catch (e) {
      console.error('Failed to save cache:', e);
    }
  }

  function getGDriveUrl() {
    return localStorage.getItem(GDRIVE_CACHE_KEY) || null;
  }

  async function fetchFromGDrive(gdriveUrl) {
    try {
      const res = await fetch(gdriveUrl, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.historyRecords !== undefined) {
          saveToCache(json);
          return true;
        }
      }
    } catch (e) {
      console.log('[GDrive] fetch error:', e);
    }
    return false;
  }

  async function fetchLatestData() {
    // Try home Wi-Fi first (fast & direct)
    try {
      const res = await fetch('/api/data', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const json = await res.json();
        saveToCache(json);
        try {
          const infoRes = await fetch('/api/server-info', { signal: AbortSignal.timeout(2000) });
          if (infoRes.ok) {
            const info = await infoRes.json();
            if (info.gdriveUrl) localStorage.setItem(GDRIVE_CACHE_KEY, info.gdriveUrl);
          }
        } catch(_) {}
        return;
      }
    } catch (e) {
      console.log('[Mobile] Mac server unreachable, trying Google Drive...');
    }

    // Home Wi-Fi failed → try Google Drive (5G / away from home)
    const gdriveUrl = getGDriveUrl();
    if (gdriveUrl) {
      const ok = await fetchFromGDrive(gdriveUrl);
      if (ok) {
        const indicator = document.getElementById('sync-indicator');
        const syncText = document.getElementById('sync-text');
        if (indicator) indicator.className = 'status-pill status-live';
        if (syncText) syncText.textContent = 'GDRIVE';
        return;
      }
    }

    console.log('[Mobile] All sync sources unavailable, using cached data.');
  }

  // Setup Server-Sent Events (SSE) for Real-Time Sync (home Wi-Fi only)
  function setupEventStream() {
    const indicator = document.getElementById('sync-indicator');
    const syncText = document.getElementById('sync-text');

    function updateStatus(isLive, label) {
      if (!indicator || !syncText) return;
      if (isLive) {
        indicator.className = 'status-pill status-live';
        syncText.textContent = label || 'LIVE';
      } else {
        indicator.className = 'status-pill status-offline';
        syncText.textContent = label || 'CACHED';
      }
    }

    if (eventSource) {
      eventSource.close();
    }

    try {
      eventSource = new EventSource('/api/events');

      eventSource.onopen = function () {
        updateStatus(true, 'LIVE');
        fetchLatestData();
      };

      eventSource.onmessage = function (event) {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.data) {
            saveToCache(payload.data);
            updateStatus(true, 'LIVE');
          }
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };

      eventSource.onerror = function () {
        updateStatus(false, 'CACHED');
        eventSource.close();
        setTimeout(setupEventStream, 4000);
      };
    } catch (e) {
      updateStatus(false, 'CACHED');
      setTimeout(setupEventStream, 5000);
    }
  }

  // Setup UI Listeners
  function initListeners() {
    // Market filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentMarketFilter = this.getAttribute('data-filter');
        renderApp();
      });
    });

    // Search input
    const searchInput = document.getElementById('mobile-search-input');
    const clearBtn = document.getElementById('clear-search-btn');

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = this.value;
        if (clearBtn) {
          clearBtn.style.display = searchQuery ? 'block' : 'none';
        }
        renderApp();
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', function () {
        searchInput.value = '';
        searchQuery = '';
        this.style.display = 'none';
        renderApp();
      });
    }

    // Stock Edit Sheet Buttons
    const stockCancelBtn = document.getElementById('stock-cancel-btn');
    const stockSaveBtn = document.getElementById('stock-save-btn');
    const stockDeleteBtn = document.getElementById('stock-delete-btn');

    if (stockCancelBtn) stockCancelBtn.onclick = closeStockEditSheet;
    if (stockSaveBtn) stockSaveBtn.onclick = saveStockEditSheet;
    if (stockDeleteBtn) stockDeleteBtn.onclick = deleteStockFromSheet;

    // Calculation Edit Sheet Buttons & Bindings
    setupCalcInputBindings();
    const calcCancelBtn = document.getElementById('calc-cancel-btn');
    const calcSaveBtn = document.getElementById('calc-save-btn');
    const calcDeleteBtn = document.getElementById('calc-delete-btn');

    if (calcCancelBtn) calcCancelBtn.onclick = closeCalcEditSheet;
    if (calcSaveBtn) calcSaveBtn.onclick = saveCalcEditSheet;
    if (calcDeleteBtn) calcDeleteBtn.onclick = deleteCalcFromSheet;

    // Backdrop click
    const backdrop = document.getElementById('edit-sheet-backdrop');
    if (backdrop) {
      backdrop.onclick = function () {
        closeStockEditSheet();
        closeCalcEditSheet();
      };
    }

    // Alert Banner gestures
    setupAlertBannerGestures();
  }

  // Init
  document.addEventListener('DOMContentLoaded', function () {
    loadFromCache();
    initListeners();
    fetchLatestData();
    setupEventStream();
  });
})();
