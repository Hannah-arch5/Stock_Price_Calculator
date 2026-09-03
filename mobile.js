/**
 * Ticker Mobile - Studio Noir Mobile PWA Client
 * Real-time SSE synchronization + LocalStorage Offline Persistence + Cloud Edit
 */

(function () {
  let appState = {
    historyRecords: [],
    customLabels: [],
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
    // Fallback: parse HTML tags into plain text
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
      // Determine local card up/down colors based on market
      const upColor = marketInfo.isCn ? '#ff453a' : '#32d74b';
      const downColor = marketInfo.isCn ? '#32d74b' : '#ff453a';

      // Timeframe tags
      const tfTags = [];
      if (group.tf_w) tfTags.push(`<span class="tf-badge"><strong>W</strong>${escapeHtml(group.tf_w)}</span>`);
      if (group.tf_d) tfTags.push(`<span class="tf-badge"><strong>D</strong>${escapeHtml(group.tf_d)}</span>`);
      if (group.tf_30) tfTags.push(`<span class="tf-badge"><strong>30</strong>${escapeHtml(group.tf_30)}</span>`);

      // Cost & Qty
      const costQtyItems = [];
      if (group.cost) costQtyItems.push(`<span class="card-meta-item"><span class="meta-key">Cost:</span> <span class="meta-val-highlight mono">${group.cost}</span></span>`);
      if (group.qty) costQtyItems.push(`<span class="card-meta-item"><span class="meta-key">Qty:</span> <span class="meta-val-highlight mono">${group.qty}</span></span>`);

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
            <div class="record-right" style="display: flex; align-items: center; gap: 8px;">
              <div class="record-result mono ${colorClass}">${escapeHtml(r.result || '--')}</div>
              <button class="edit-pencil-btn" data-symbol="${escapeHtml(group.symbol)}" data-record="${rIdx}" title="Edit target">✎</button>
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
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="market-tag">${marketInfo.label}</span>
                <button class="edit-pencil-btn" data-symbol="${escapeHtml(group.symbol)}" title="Edit stock note">✎</button>
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

    // Attach edit pencil clicks
    document.querySelectorAll('.edit-pencil-btn').forEach(btn => {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        const symbol = this.getAttribute('data-symbol');
        const recordIdxStr = this.getAttribute('data-record');
        const recordIdx = recordIdxStr !== null ? parseInt(recordIdxStr, 10) : null;
        openEditSheet(symbol, recordIdx);
      };
    });

    // Check alerts
    checkTargetAlerts();
  }

  // ─── Edit Bottom Sheet Logic ─────────────────────────────────
  let editContext = {
    symbol: null,
    recordIdx: null
  };

  function openEditSheet(symbol, recordIdx) {
    const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
    if (!group) return;

    editContext.symbol = symbol;
    editContext.recordIdx = recordIdx;

    const sheet = document.getElementById('edit-bottom-sheet');
    const backdrop = document.getElementById('edit-sheet-backdrop');
    const symbolLabel = document.getElementById('sheet-symbol-label');
    const recordTypeLabel = document.getElementById('sheet-record-type');
    const editType = document.getElementById('edit-type');
    const editBase = document.getElementById('edit-base');
    const editPerc = document.getElementById('edit-perc');
    const editDirBtn = document.getElementById('edit-dir-btn');
    const editNote = document.getElementById('edit-note');
    const baseGroup = document.getElementById('edit-base-group');
    const percGroup = document.getElementById('edit-perc-group');

    if (!sheet || !backdrop) return;

    symbolLabel.textContent = `${group.symbol} ${group.name || ''}`.trim();
    editNote.value = group.note || '';

    if (recordIdx !== null && group.records && group.records[recordIdx]) {
      const rec = group.records[recordIdx];
      recordTypeLabel.textContent = `EDITING TARGET #${recordIdx + 1}`;
      editType.value = rec.type || '';

      if (rec.inputs && rec.inputs.base !== undefined) {
        editBase.value = rec.inputs.base;
        editPerc.value = rec.inputs.perc;
        const isUp = rec.inputs.isUp !== false;
        editDirBtn.setAttribute('data-dir', isUp ? 'up' : 'down');
        editDirBtn.textContent = isUp ? '▲ UP' : '▼ DOWN';
      } else {
        editBase.value = '';
        editPerc.value = '';
      }
      if (baseGroup) baseGroup.style.display = 'flex';
      if (percGroup) percGroup.style.display = 'flex';
    } else {
      recordTypeLabel.textContent = `EDITING STOCK NOTES & METADATA`;
      editType.value = '';
      if (baseGroup) baseGroup.style.display = 'none';
      if (percGroup) percGroup.style.display = 'none';
    }

    backdrop.classList.remove('hidden');
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      sheet.classList.add('visible');
    });
  }

  function closeEditSheet() {
    const sheet = document.getElementById('edit-bottom-sheet');
    const backdrop = document.getElementById('edit-sheet-backdrop');
    if (!sheet || !backdrop) return;
    sheet.classList.remove('visible');
    backdrop.classList.remove('visible');
    setTimeout(() => {
      sheet.classList.add('hidden');
      backdrop.classList.add('hidden');
      editContext = { symbol: null, recordIdx: null };
    }, 300);
  }

  async function saveEditSheet() {
    const { symbol, recordIdx } = editContext;
    if (!symbol) return;

    const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
    if (!group) return;

    const editType = document.getElementById('edit-type');
    const editBase = document.getElementById('edit-base');
    const editPerc = document.getElementById('edit-perc');
    const editDirBtn = document.getElementById('edit-dir-btn');
    const editNote = document.getElementById('edit-note');
    const saveBtn = document.getElementById('sheet-save-btn');

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'SAVING...';
    }

    // Update note
    group.note = (editNote ? editNote.value : '').trim();

    // Update record calculation if applicable
    if (recordIdx !== null && group.records && group.records[recordIdx]) {
      const rec = group.records[recordIdx];
      if (editType && editType.value.trim()) rec.type = editType.value.trim();

      const baseVal = editBase ? parseFloat(editBase.value) : NaN;
      const percVal = editPerc ? parseFloat(editPerc.value) : NaN;
      const isUp = editDirBtn ? editDirBtn.getAttribute('data-dir') === 'up' : true;

      if (!isNaN(baseVal) && !isNaN(percVal)) {
        rec.inputs = { base: baseVal, perc: percVal, isUp };
        const factor = isUp ? (1 + percVal / 100) : (1 - percVal / 100);
        const calcRes = baseVal * factor;
        const marketInfo = getMarketInfo(symbol);
        rec.result = `${marketInfo.currency}${calcRes.toFixed(2)}`;
        rec.details = `<span>Base: ${marketInfo.currency}${baseVal}</span> ${isUp ? '▲' : '▼'} ${percVal}%`;
      }
    }

    saveToCache(appState);

    // Sync to Mac server & Google Drive
    await pushDataToServer(appState);

    if (saveBtn) {
      saveBtn.textContent = 'SAVED!';
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE & SYNC';
        closeEditSheet();
      }, 500);
    }
  }

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

  // ─── Target Alerts Check ─────────────────────────────────────
  function checkTargetAlerts() {
    const banner = document.getElementById('alert-banner');
    const bannerText = document.getElementById('alert-banner-text');
    if (!banner || !bannerText) return;

    const alerts = [];
    (appState.historyRecords || []).forEach(g => {
      (g.records || []).forEach(r => {
        if (r.highlighted || r.alertTriggered) {
          alerts.push(`${g.symbol} 达到目标价 ${r.result || ''}`);
        }
      });
    });

    if (alerts.length > 0) {
      bannerText.textContent = `🎯 ${alerts.slice(0, 2).join(' · ')}`;
      banner.classList.remove('hidden');
      requestAnimationFrame(() => banner.classList.add('visible'));
    }
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

    // Direction toggle in sheet
    const editDirBtn = document.getElementById('edit-dir-btn');
    if (editDirBtn) {
      editDirBtn.addEventListener('click', function () {
        const current = this.getAttribute('data-dir');
        if (current === 'up') {
          this.setAttribute('data-dir', 'down');
          this.textContent = '▼ DOWN';
        } else {
          this.setAttribute('data-dir', 'up');
          this.textContent = '▲ UP';
        }
      });
    }

    // Sheet buttons
    const sheetCancelBtn = document.getElementById('sheet-cancel-btn');
    const sheetSaveBtn = document.getElementById('sheet-save-btn');
    const backdrop = document.getElementById('edit-sheet-backdrop');

    if (sheetCancelBtn) sheetCancelBtn.addEventListener('click', closeEditSheet);
    if (backdrop) backdrop.addEventListener('click', closeEditSheet);
    if (sheetSaveBtn) sheetSaveBtn.addEventListener('click', saveEditSheet);

    // Alert banner close
    const alertCloseBtn = document.getElementById('alert-banner-close');
    const alertBanner = document.getElementById('alert-banner');
    if (alertCloseBtn && alertBanner) {
      alertCloseBtn.addEventListener('click', () => {
        alertBanner.classList.remove('visible');
        setTimeout(() => alertBanner.classList.add('hidden'), 300);
      });
    }
  }

  // Init
  document.addEventListener('DOMContentLoaded', function () {
    loadFromCache();
    initListeners();
    fetchLatestData();
    setupEventStream();
  });
})();
