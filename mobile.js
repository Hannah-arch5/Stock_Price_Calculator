/**
 * Ticker Mobile - Studio Noir Mobile PWA Client
 * Real-time SSE synchronization + LocalStorage Offline Persistence
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

  // Cache Key
  const CACHE_KEY = 'ticker_mobile_cache_v1';

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
      const recordsHtml = (group.records || []).map(r => {
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
              <span class="market-tag">${marketInfo.label}</span>
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

  // Fetch full data from Server
  async function fetchLatestData() {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const json = await res.json();
        saveToCache(json);
      }
    } catch (e) {
      console.log('Fetch error (offline or server disconnected):', e);
    }
  }

  // Setup Server-Sent Events (SSE) for Real-Time Sync
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
        // Retry connection after 4 seconds
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
  }

  // Init
  document.addEventListener('DOMContentLoaded', function () {
    loadFromCache();
    initListeners();
    fetchLatestData();
    setupEventStream();
  });
})();
