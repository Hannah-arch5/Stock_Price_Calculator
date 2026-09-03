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
  function renderMarketTabsAndTags() {
    const marketTabsContainer = document.getElementById('market-filter-container');
    const quickTagsContainer = document.getElementById('mobile-quick-tags');
    const records = appState.historyRecords || [];

    // 1. Dynamic Market Tabs: ALL, US (if has US), A股 (if has CN), HK (if has HK), 收藏
    if (marketTabsContainer) {
      const hasUS = records.some(g => g.inLedger !== false && getMarketInfo(g.symbol).market === 'US');
      const hasCN = records.some(g => g.inLedger !== false && getMarketInfo(g.symbol).market === 'CN');
      const hasHK = records.some(g => g.inLedger !== false && getMarketInfo(g.symbol).market === 'HK');

      if (currentMarketFilter === 'US' && !hasUS) currentMarketFilter = 'all';
      if (currentMarketFilter === 'CN' && !hasCN) currentMarketFilter = 'all';
      if (currentMarketFilter === 'HK' && !hasHK) currentMarketFilter = 'all';

      let tabsHtml = `<button class="filter-tab ${currentMarketFilter === 'all' ? 'active' : ''}" data-filter="all">ALL</button>`;
      if (hasUS) {
        tabsHtml += `<button class="filter-tab ${currentMarketFilter === 'US' ? 'active' : ''}" data-filter="US">US</button>`;
      }
      if (hasCN) {
        tabsHtml += `<button class="filter-tab ${currentMarketFilter === 'CN' ? 'active' : ''}" data-filter="CN">A股</button>`;
      }
      if (hasHK) {
        tabsHtml += `<button class="filter-tab ${currentMarketFilter === 'HK' ? 'active' : ''}" data-filter="HK">HK</button>`;
      }
      tabsHtml += `<button class="filter-tab ${currentMarketFilter === 'FAV' ? 'active' : ''}" data-filter="FAV">♥ 收藏</button>`;
      marketTabsContainer.innerHTML = tabsHtml;
    }

    // 2. Stock Quick Tags matching Desktop Part 2 (Naming, Order, Urgency Colors)
    if (quickTagsContainer) {
      if (records.length === 0) {
        quickTagsContainer.innerHTML = '';
        return;
      }

      const visibleGroups = records.filter(group => {
        if (currentMarketFilter === 'FAV') return group.isFavorite === true;
        if (group.inLedger === false) return false;
        if (currentMarketFilter === 'all') return true;
        return getMarketInfo(group.symbol).market === currentMarketFilter;
      });

      const urgencyColors = {
        'green': '#32d74b',
        'orange': '#ff9f0a',
        'red': '#ff453a'
      };

      quickTagsContainer.innerHTML = visibleGroups.map(group => {
        let tagText = group.symbol;
        if (group.name) {
          const cleanName = group.name.replace(/\s+/g, '');
          const hasChinese = /[\u4e00-\u9fa5]/.test(cleanName);
          if (hasChinese) {
            tagText = cleanName.length <= 3 ? cleanName : cleanName.substring(0, 2);
          }
        }

        let customStyle = '';
        const currentGroupUrgency = group.urgency || (group.records && group.records[0] ? group.records[0].urgency : null);
        if (currentGroupUrgency && urgencyColors[currentGroupUrgency]) {
          const color = urgencyColors[currentGroupUrgency];
          customStyle = `style="color: ${color}; border-color: ${color};"`;
        }

        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const draggableAttr = isTouchDevice ? '' : 'draggable="true"';
        return `<button class="quick-tag mono" ${draggableAttr} data-symbol="${escapeHtml(group.symbol)}" ${customStyle}>${escapeHtml(tagText)}</button>`;
      }).join('');

      setupQuickTagsDragAndDrop();
    }
  }

  // Silky Smooth Sibling Reorder Animation (Zero Shake, Zero Bounce)
  function smoothMove(container, draggingEl, afterElement) {
    if (!container || !draggingEl) return;
    if (afterElement == null && draggingEl === container.lastElementChild) return;
    if (afterElement && draggingEl.nextElementSibling === afterElement) return;

    const siblings = [...container.children].filter(el => el !== draggingEl);
    const firsts = new Map();
    siblings.forEach(el => firsts.set(el, el.getBoundingClientRect()));

    if (afterElement == null) {
      container.appendChild(draggingEl);
    } else {
      container.insertBefore(draggingEl, afterElement);
    }

    siblings.forEach(el => {
      const first = firsts.get(el);
      if (!first) return;
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        el.style.transition = 'none';
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        void el.offsetHeight; // Force reflow
        el.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)';
        el.style.transform = '';
      }
    });
  }

  function setupQuickTagsDragAndDrop() {
    const container = document.getElementById('mobile-quick-tags');
    if (!container || container.dataset.dragInitialized) return;
    container.dataset.dragInitialized = 'true';

    let draggingTag = null;
    let isDragging = false;
    let hasMoved = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let dragHoldTimer = null;

    function getDragAfterTag(cont, x, y) {
      const draggableElements = [...cont.querySelectorAll('.quick-tag:not(.dragging-tag)')];
      for (const child of draggableElements) {
        const box = child.getBoundingClientRect();
        if (y >= box.top && y <= box.bottom) {
          if (x < box.left + box.width / 2) {
            return child;
          }
        } else if (y < box.top) {
          return child;
        }
      }
      return null;
    }

    function commitReorderedTags() {
      const currentTags = [...container.querySelectorAll('.quick-tag')];
      const orderedSymbols = currentTags.map(el => el.getAttribute('data-symbol'));
      if (!appState.historyRecords || orderedSymbols.length === 0) return;

      if (currentMarketFilter === 'all') {
        const newHistoryRecords = [];
        orderedSymbols.forEach(sym => {
          const group = appState.historyRecords.find(g => g.symbol === sym);
          if (group && !newHistoryRecords.includes(group)) {
            newHistoryRecords.push(group);
          }
        });
        // Append any groups that were not in currently visible tag list
        appState.historyRecords.forEach(g => {
          if (!newHistoryRecords.includes(g)) {
            newHistoryRecords.push(g);
          }
        });
        appState.historyRecords = newHistoryRecords;
      } else {
        // Tab-isolated in-place reordering:
        // Find exact slot indices in appState.historyRecords matching current active tab filter
        const targetIndices = [];
        appState.historyRecords.forEach((group, idx) => {
          let matches = false;
          if (currentMarketFilter === 'FAV') {
            matches = (group.isFavorite === true);
          } else {
            matches = (group.inLedger !== false && getMarketInfo(group.symbol).market === currentMarketFilter);
          }
          if (matches) {
            targetIndices.push(idx);
          }
        });

        // Map reordered symbols to corresponding group objects
        const reorderedGroups = orderedSymbols
          .map(sym => appState.historyRecords.find(g => g.symbol === sym))
          .filter(Boolean);

        // Substitute into targetIndices in-place without disturbing other tabs
        targetIndices.forEach((targetIdx, i) => {
          if (reorderedGroups[i]) {
            appState.historyRecords[targetIdx] = reorderedGroups[i];
          }
        });
      }

      appState.lastUpdated = new Date().toISOString();
      saveToCache(appState);
      renderApp();
      pushDataToServer(appState);
    }

    // Touch Support for Mobile (Long-press 280ms to drag, normal touch/swipe allows effortless vertical page scroll)
    container.addEventListener('touchstart', (e) => {
      const tag = e.target.closest('.quick-tag');
      if (!tag) return;

      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      draggedTag = tag;
      isDragging = false;
      hasMoved = false;

      if (dragHoldTimer) clearTimeout(dragHoldTimer);
      dragHoldTimer = setTimeout(() => {
        if (draggedTag) {
          isDragging = true;
          draggedTag.classList.add('dragging-tag');
          if (navigator.vibrate) {
            try { navigator.vibrate(25); } catch (_) {}
          }
        }
      }, 280);
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!draggedTag) return;
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartX);
      const deltaY = Math.abs(touch.clientY - touchStartY);

      if (!isDragging) {
        // Finger moved before 280ms hold completed -> cancel hold to allow natural scrolling!
        if (deltaX > 8 || deltaY > 8) {
          if (dragHoldTimer) {
            clearTimeout(dragHoldTimer);
            dragHoldTimer = null;
          }
          draggedTag = null;
          return;
        }
      } else {
        // In active drag mode
        if (e.cancelable) e.preventDefault();
        hasMoved = true;
        const afterElement = getDragAfterTag(container, touch.clientX, touch.clientY);
        smoothMove(container, draggedTag, afterElement);
      }
    }, { passive: false });

    container.addEventListener('touchend', () => {
      if (dragHoldTimer) {
        clearTimeout(dragHoldTimer);
        dragHoldTimer = null;
      }
      if (draggedTag) {
        draggedTag.classList.remove('dragging-tag');
        if (isDragging && hasMoved) {
          commitReorderedTags();
        }
      }
      draggedTag = null;
      isDragging = false;
      hasMoved = false;
    });

    container.addEventListener('touchcancel', () => {
      if (dragHoldTimer) {
        clearTimeout(dragHoldTimer);
        dragHoldTimer = null;
      }
      if (draggedTag) {
        draggedTag.classList.remove('dragging-tag');
      }
      draggedTag = null;
      isDragging = false;
      hasMoved = false;
    });

    // Desktop Mouse Drag & Drop
    container.addEventListener('dragstart', (e) => {
      const tag = e.target.closest('.quick-tag');
      if (!tag) return;
      tag.classList.add('dragging-tag');
      e.dataTransfer.effectAllowed = 'move';
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = container.querySelector('.dragging-tag');
      if (!dragging) return;
      const afterElement = getDragAfterTag(container, e.clientX, e.clientY);
      smoothMove(container, dragging, afterElement);
    });

    container.addEventListener('dragend', (e) => {
      const tag = e.target.closest('.quick-tag');
      if (tag) tag.classList.remove('dragging-tag');
      commitReorderedTags();
    });
  }

  function renderApp() {
    const container = document.getElementById('stocks-container');
    const emptyState = document.getElementById('empty-state');
    const totalSymbolsEl = document.getElementById('total-symbols-count');
    const totalTargetsEl = document.getElementById('total-targets-count');
    const lastSyncEl = document.getElementById('last-sync-time');

    if (!container) return;

    let records = appState.historyRecords || [];

    // Render Market tabs & stock quick tags
    renderMarketTabsAndTags();

    // Update global header stats
    if (totalSymbolsEl) totalSymbolsEl.textContent = records.length;
    let totalCalcs = 0;
    records.forEach(g => {
      if (g.records) totalCalcs += g.records.length;
    });
    if (totalTargetsEl) totalTargetsEl.textContent = totalCalcs;

    if (appState.lastUpdated && lastSyncEl) {
      const d = new Date(appState.lastUpdated);
      lastSyncEl.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    }

    // Filter records
    const filtered = records.filter(group => {
      const marketInfo = getMarketInfo(group.symbol);
      
      // Market & Favorite filter
      if (currentMarketFilter === 'FAV') {
        if (group.isFavorite !== true) return false;
      } else {
        if (group.inLedger === false) return false;
        if (currentMarketFilter !== 'all' && marketInfo.market !== currentMarketFilter) {
          return false;
        }
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
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Build HTML
    container.innerHTML = filtered.map((group, groupIdx) => {
      const marketInfo = getMarketInfo(group.symbol);
      const upColor = marketInfo.isCn ? '#ff453a' : '#32d74b';
      const downColor = marketInfo.isCn ? '#32d74b' : '#ff453a';

      // Timeframe tags (Always render W, D, 30 titles)
      const wVal = (group.tf_w !== undefined && group.tf_w !== null && String(group.tf_w).trim() !== '') ? escapeHtml(String(group.tf_w)) : '--';
      const dVal = (group.tf_d !== undefined && group.tf_d !== null && String(group.tf_d).trim() !== '') ? escapeHtml(String(group.tf_d)) : '--';
      const tf30Val = (group.tf_30 !== undefined && group.tf_30 !== null && String(group.tf_30).trim() !== '') ? escapeHtml(String(group.tf_30)) : '--';
      const tfTagsHtml = `
        <div class="timeframe-tags">
          <span class="tf-badge"><strong>W</strong>${wVal}</span>
          <span class="tf-badge"><strong>D</strong>${dVal}</span>
          <span class="tf-badge"><strong>30</strong>${tf30Val}</span>
        </div>
      `;

      // Cost & Qty (Always render Cost and Qty titles)
      const costVal = (group.cost !== undefined && group.cost !== null && String(group.cost).trim() !== '') ? escapeHtml(String(group.cost)) : '--';
      const qtyVal = (group.qty !== undefined && group.qty !== null && String(group.qty).trim() !== '') ? escapeHtml(String(group.qty)) : '--';
      const costQtyHtml = `
        <div class="card-meta-row">
          <span class="card-meta-item"><span class="meta-key">Cost:</span> <span class="meta-val-highlight mono">${costVal}</span></span>
          <span class="card-meta-item"><span class="meta-key">Qty:</span> <span class="meta-val-highlight mono">${qtyVal}</span></span>
        </div>
      `;

      // Calculations Ledger Rows
      const recordsHtml = (group.records || []).map((r, rIdx) => {
        const isUp = r.isUp !== false;
        const colorClass = isUp ? 'is-up' : 'is-down';
        const formulaStr = cleanDetails(r.details, r);
        const highlightedClass = r.highlighted ? 'highlighted' : '';
        const sharesHtml = r.shares ? `<div class="record-shares mono">${escapeHtml(r.shares)} 股</div>` : '';

        let displayResult = r.result || '--';
        if (displayResult !== '--' && !displayResult.includes('%') && !displayResult.startsWith('¥') && !displayResult.startsWith('$')) {
          const curSym = detectMarket(group.symbol).market === 'A' ? '¥' : '$';
          displayResult = `${curSym}${displayResult}`;
        }

        return `
          <div class="record-row ${highlightedClass}" data-symbol="${escapeHtml(group.symbol)}" data-record-idx="${rIdx}">
            <div class="record-left">
              <div class="record-type-badge">${escapeHtml(r.type || 'Projection')}</div>
              <div class="record-formula-row">
                <div class="record-formula mono">${escapeHtml(formulaStr)}</div>
                <button class="calc-load-btn" data-symbol="${escapeHtml(group.symbol)}" data-record="${rIdx}" title="导回上方计算器 (Load into Calculator)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 17L17 7M17 7H7M17 7V17"/>
                  </svg>
                </button>
              </div>
              ${sharesHtml}
            </div>
            <div class="record-right">
              <div class="record-result mono ${colorClass}">${escapeHtml(displayResult)}</div>
              <button class="edit-pencil-btn calc-edit-trigger" data-symbol="${escapeHtml(group.symbol)}" data-record="${rIdx}" title="Edit calculation">✎</button>
            </div>
          </div>
        `;
      }).join('');

      // Notes section (Always render STRATEGY & TRADING NOTES title)
      const hasNote = group.note && group.note.trim().length > 0;
      const noteContentHtml = hasNote ? escapeHtml(group.note) : '<span class="note-empty-hint">暂无策略备忘 (点击右上角✎编辑)</span>';
      const noteHtml = `
        <div class="note-accordion">
          <button class="note-toggle" data-target="note-${groupIdx}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span>STRATEGY & TRADING NOTES</span>
          </button>
          <div id="note-${groupIdx}" class="note-content">${noteContentHtml}</div>
        </div>
      `;

      // Urgency dots (Green / Orange / Red) matching Desktop
      const currentUrgency = group.urgency || ((group.records && group.records[0]) ? group.records[0].urgency : null);
      const urgencyDotsHtml = `
        <div class="urgency-dots">
          <button type="button" class="urgency-dot green ${currentUrgency === 'green' ? 'selected' : ''}" data-symbol="${escapeHtml(group.symbol)}" data-color="green" title="Green urgency"></button>
          <button type="button" class="urgency-dot orange ${currentUrgency === 'orange' ? 'selected' : ''}" data-symbol="${escapeHtml(group.symbol)}" data-color="orange" title="Orange urgency"></button>
          <button type="button" class="urgency-dot red ${currentUrgency === 'red' ? 'selected' : ''}" data-symbol="${escapeHtml(group.symbol)}" data-color="red" title="Red urgency"></button>
        </div>
      `;

      return `
        <article class="stock-card" data-symbol="${escapeHtml(group.symbol)}" style="--up-color: ${upColor}; --down-color: ${downColor};">
          <header class="card-header">
            <div class="card-title-row">
              <div class="symbol-name-wrap stock-research-trigger" data-symbol="${escapeHtml(group.symbol)}" title="查看全网深度投研与AI分析">
                <span class="stock-symbol mono">${escapeHtml(group.symbol)}</span>
                ${group.name ? `<span class="stock-name">${escapeHtml(group.name)}</span>` : ''}
              </div>
              <div class="card-title-right">
                ${urgencyDotsHtml}
                <button class="edit-pencil-btn stock-edit-trigger" data-symbol="${escapeHtml(group.symbol)}" title="Edit stock metadata">✎</button>
              </div>
            </div>

            ${costQtyHtml}
            ${tfTagsHtml}
          </header>

          <div class="records-ledger" data-symbol="${escapeHtml(group.symbol)}">
            ${recordsHtml || '<div class="record-row"><span class="record-formula">No active targets</span></div>'}
          </div>

          ${noteHtml}
        </article>
      `;
    }).join('');

    // Setup record double-tap highlight & hold-to-drag reorder
    setupRecordRowsInteractions();

    // Direct binding for calc-load-btn to guarantee 100% responsiveness on mobile
    document.querySelectorAll('.calc-load-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.blur) btn.blur();
        const symbol = btn.getAttribute('data-symbol');
        const recordIdxStr = btn.getAttribute('data-record');
        const recordIdx = recordIdxStr !== null ? parseInt(recordIdxStr, 10) : null;
        if (symbol && recordIdx !== null && !isNaN(recordIdx)) {
          const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
          if (group && group.records && group.records[recordIdx]) {
            populateMobileCalculator(group.records[recordIdx], symbol);
          }
        }
      };
    });

    // Check alerts
    checkTargetAlerts();
  }

  function toggleRecordHighlight(symbol, recordIdx) {
    if (!symbol || isNaN(recordIdx)) return;
    const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
    if (!group || !group.records || !group.records[recordIdx]) return;

    group.records[recordIdx].highlighted = !group.records[recordIdx].highlighted;
    saveToCache(appState);
    renderApp();
    pushDataToServer(appState);
  }

  function setupRecordRowsInteractions() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    document.querySelectorAll('.records-ledger').forEach(ledger => {
      const symbol = ledger.getAttribute('data-symbol');
      if (!symbol || ledger.dataset.dragInitialized) return;
      ledger.dataset.dragInitialized = 'true';

      let draggingRow = null;
      let isDragging = false;
      let hasMoved = false;
      let touchStartX = 0;
      let touchStartY = 0;
      let dragHoldTimer = null;
      let lastTapTime = 0;
      let lastTapRow = null;

      function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.record-row:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
          } else {
            return closest;
          }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
      }

      function commitReorderedRecords() {
        const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
        if (!group || !group.records) return;

        const currentRows = [...ledger.querySelectorAll('.record-row')];
        const newRecords = [];
        currentRows.forEach(row => {
          const origIdx = parseInt(row.getAttribute('data-record-idx'), 10);
          if (!isNaN(origIdx) && group.records[origIdx]) {
            newRecords.push(group.records[origIdx]);
          }
        });

        if (newRecords.length === group.records.length) {
          group.records = newRecords;
          saveToCache(appState);
          renderApp();
          pushDataToServer(appState);
        }
      }

      // Touch events (Single-tap hold to drag, Double-tap to highlight)
      ledger.addEventListener('touchstart', (e) => {
        if (e.target.closest('.calc-edit-trigger') || e.target.closest('.edit-pencil-btn') || e.target.closest('.calc-load-btn')) return;
        const row = e.target.closest('.record-row');
        if (!row) return;

        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        draggingRow = row;
        isDragging = false;
        hasMoved = false;

        // 200ms hold to activate drag
        dragHoldTimer = setTimeout(() => {
          if (draggingRow) {
            isDragging = true;
            draggingRow.classList.add('dragging');
            if (navigator.vibrate) {
              try { navigator.vibrate(20); } catch (_) {}
            }
          }
        }, 200);
      }, { passive: true });

      ledger.addEventListener('touchmove', (e) => {
        if (!draggingRow) return;
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);

        // Cancel hold if finger moved before 200ms hold (allows normal vertical page scroll)
        if (!isDragging) {
          if (deltaX > 7 || deltaY > 7) {
            if (dragHoldTimer) {
              clearTimeout(dragHoldTimer);
              dragHoldTimer = null;
            }
            draggingRow = null;
            return;
          }
        } else {
          // Silky smooth sibling reorder
          if (e.cancelable) e.preventDefault();
          hasMoved = true;
          const afterElement = getDragAfterElement(ledger, touch.clientY);
          smoothMove(ledger, draggingRow, afterElement);
        }
      }, { passive: false });

      ledger.addEventListener('touchend', (e) => {
        if (dragHoldTimer) {
          clearTimeout(dragHoldTimer);
          dragHoldTimer = null;
        }

        if (isDragging && draggingRow) {
          draggingRow.classList.remove('dragging');
          draggingRow = null;
          isDragging = false;
          if (hasMoved) {
            commitReorderedRecords();
          }
        } else if (draggingRow) {
          // Check for Double-Tap on Mobile
          const row = draggingRow;
          draggingRow = null;
          isDragging = false;

          const now = Date.now();
          if (now - lastTapTime < 320 && lastTapRow === row) {
            // Double tap triggered!
            lastTapTime = 0;
            lastTapRow = null;
            const rIdx = parseInt(row.getAttribute('data-record-idx'), 10);
            toggleRecordHighlight(symbol, rIdx);
          } else {
            lastTapTime = now;
            lastTapRow = row;
          }
        }
      });

      ledger.addEventListener('touchcancel', () => {
        if (dragHoldTimer) {
          clearTimeout(dragHoldTimer);
          dragHoldTimer = null;
        }
        if (draggingRow) draggingRow.classList.remove('dragging');
        draggingRow = null;
        isDragging = false;
      });

      // Desktop Double-Click Support
      ledger.addEventListener('dblclick', (e) => {
        if (e.target.closest('.calc-edit-trigger') || e.target.closest('.edit-pencil-btn')) return;
        const row = e.target.closest('.record-row');
        if (!row) return;
        const rIdx = parseInt(row.getAttribute('data-record-idx'), 10);
        toggleRecordHighlight(symbol, rIdx);
      });

      // Desktop Drag & Drop (Direct 100% match)
      if (!isTouch) {
        ledger.querySelectorAll('.record-row').forEach(row => {
          row.setAttribute('draggable', 'true');
        });

        ledger.addEventListener('dragstart', (e) => {
          if (e.target.closest('.calc-edit-trigger') || e.target.closest('.edit-pencil-btn')) {
            e.preventDefault();
            return;
          }
          const row = e.target.closest('.record-row');
          if (!row) return;
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });

        ledger.addEventListener('dragover', (e) => {
          e.preventDefault();
          const dragging = ledger.querySelector('.dragging');
          if (!dragging) return;
          const afterElement = getDragAfterElement(ledger, e.clientY);
          smoothMove(ledger, dragging, afterElement);
        });

        ledger.addEventListener('dragend', (e) => {
          const row = e.target.closest('.record-row');
          if (row) row.classList.remove('dragging');
          commitReorderedRecords();
        });
      }
    });
  }

  // ─── 1. Stock Metadata Edit Sheet ────────────────────────────
  let currentEditingStockSymbol = null;

  async function resolveStockNameOnline(sym) {
    if (!sym) return '';
    const cleanSym = sym.trim().toUpperCase();
    const existing = (appState.historyRecords || []).find(g => g.symbol.toUpperCase() === cleanSym && g.name);
    if (existing && existing.name) return existing.name;

    try {
      const url = `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(cleanSym)}&t=all`;
      const res = await fetch(url);
      const text = await res.text();
      const match = text.match(/v_hint="(.*?)"/);
      if (match && match[1]) {
        const parts = match[1].split('^')[0].split('~');
        if (parts.length >= 3 && parts[2]) {
          return JSON.parse('"' + parts[2] + '"');
        }
      }
    } catch (_) {}

    try {
      const res2 = await fetch(`/api/stock-research?symbol=${encodeURIComponent(cleanSym)}`);
      if (res2.ok) {
        const data = await res2.json();
        if (data && data.name) return data.name;
      }
    } catch (_) {}

    return '';
  }

  function openStockEditSheet(symbol) {
    const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
    if (!group) return;

    currentEditingStockSymbol = symbol;

    const sheet = document.getElementById('stock-edit-sheet');
    const backdrop = document.getElementById('edit-sheet-backdrop');
    const symEl = document.getElementById('stock-edit-symbol');
    const nameEl = document.getElementById('stock-edit-name');
    const nameDisplay = document.getElementById('stock-edit-name-display');
    const costEl = document.getElementById('stock-edit-cost');
    const qtyEl = document.getElementById('stock-edit-qty');
    const tfWEl = document.getElementById('stock-edit-tf-w');
    const tfDEl = document.getElementById('stock-edit-tf-d');
    const tf30El = document.getElementById('stock-edit-tf-30');
    const noteEl = document.getElementById('stock-edit-note');

    function updateSymInputWidth(input) {
      if (!input) return;
      const len = (input.value || '').length || 4;
      input.style.width = `${Math.max(3, len) + 0.6}ch`;
    }

    if (symEl) {
      symEl.value = group.symbol || '';
      updateSymInputWidth(symEl);
    }
    if (nameEl) nameEl.value = group.name || '';
    if (nameDisplay) nameDisplay.textContent = group.name || '--';
    if (costEl) costEl.value = group.cost || '';
    if (qtyEl) qtyEl.value = group.qty || '';
    if (tfWEl) tfWEl.value = group.tf_w || '';
    if (tfDEl) tfDEl.value = group.tf_d || '';
    if (tf30El) tf30El.value = group.tf_30 || '';
    if (noteEl) noteEl.value = group.note || '';

    // Bind dynamic symbol change -> auto resolve stock name
    if (symEl && !symEl.dataset.listenerBound) {
      symEl.dataset.listenerBound = 'true';
      let debounceTimer = null;

      const triggerNameLookup = async () => {
        const enteredSym = (symEl.value || '').trim().toUpperCase();
        updateSymInputWidth(symEl);
        if (!enteredSym) {
          if (nameEl) nameEl.value = '';
          if (nameDisplay) nameDisplay.textContent = '--';
          return;
        }
        if (nameDisplay) nameDisplay.textContent = '...';
        const foundName = await resolveStockNameOnline(enteredSym);
        if (nameEl) nameEl.value = foundName;
        if (nameDisplay) nameDisplay.textContent = foundName || '--';
      };

      symEl.addEventListener('input', () => {
        updateSymInputWidth(symEl);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(triggerNameLookup, 400);
      });
      symEl.addEventListener('change', triggerNameLookup);
      symEl.addEventListener('blur', triggerNameLookup);
    }

    if (backdrop && sheet) {
      backdrop.classList.remove('hidden');
      sheet.classList.remove('hidden');
      requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
      });
    }
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

    const newSymbol = (document.getElementById('stock-edit-symbol').value || '').trim().toUpperCase();
    const newName = (document.getElementById('stock-edit-name').value || '').trim();
    const newCost = (document.getElementById('stock-edit-cost').value || '').trim();
    const newQty = (document.getElementById('stock-edit-qty').value || '').trim();
    const newTfW = (document.getElementById('stock-edit-tf-w').value || '').trim();
    const newTfD = (document.getElementById('stock-edit-tf-d').value || '').trim();
    const newTf30 = (document.getElementById('stock-edit-tf-30').value || '').trim();
    const newNote = (document.getElementById('stock-edit-note').value || '').trim();
    const saveBtn = document.getElementById('stock-save-btn');

    if (!newSymbol) {
      alert('股票代码不能为空');
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'SAVING...';
    }

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

    if (saveBtn) {
      saveBtn.textContent = 'SAVED!';
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE & SYNC';
        closeStockEditSheet();
      }, 400);
    }
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

    const marketInfo = getMarketInfo(symbol);
    const upColor = marketInfo.isCn ? '#ff453a' : '#32d74b';
    const downColor = marketInfo.isCn ? '#32d74b' : '#ff453a';

    if (sheet) {
      sheet.style.setProperty('--modal-up-color', upColor);
      sheet.style.setProperty('--modal-down-color', downColor);
    }

    if (subtitle) subtitle.textContent = `${group.symbol} ${group.name || ''}`.trim();
    if (typeInput) typeInput.value = rec.type || '';

    // Render Label Chips matching homepage format
    renderPart1Chips();

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

    if (baseInput) baseInput.value = baseVal !== '' ? baseVal : '';
    if (targetInput) targetInput.value = targetVal !== '' ? targetVal : '';
    if (percInput) percInput.value = percVal !== '' ? percVal : '';
    if (dirBtn) {
      dirBtn.setAttribute('data-dir', isUp ? 'up' : 'down');
      dirBtn.textContent = isUp ? '▲ UP' : '▼ DOWN';
    }
    if (sharesInput) sharesInput.value = rec.shares || '';
    if (highlightCheck) highlightCheck.checked = !!rec.highlighted;

    if (backdrop && sheet) {
      backdrop.classList.remove('hidden');
      sheet.classList.remove('hidden');
      requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
      });
    }
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
      if (!baseInput || !percInput || !targetInput || !dirBtn) return;
      const base = parseFloat(baseInput.value);
      const perc = parseFloat(percInput.value);
      const isUp = dirBtn.getAttribute('data-dir') === 'up';
      if (!isNaN(base) && !isNaN(perc)) {
        const factor = isUp ? (1 + perc / 100) : (1 - perc / 100);
        targetInput.value = (base * factor).toFixed(4).replace(/\.?0+$/, '');
      }
    };

    const calcFromBaseAndTarget = () => {
      if (!baseInput || !targetInput || !percInput || !dirBtn) return;
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

    if (baseInput) baseInput.addEventListener('input', calcFromBaseAndPerc);
    if (percInput) percInput.addEventListener('input', calcFromBaseAndPerc);
    if (dirBtn) {
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
    }
    if (targetInput) targetInput.addEventListener('input', calcFromBaseAndTarget);
  }

  async function saveCalcEditSheet() {
    const { symbol, recordIdx } = currentEditingCalcContext;
    if (!symbol || recordIdx === null) return;

    const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
    if (!group || !group.records || !group.records[recordIdx]) return;

    const rec = group.records[recordIdx];
    const typeVal = (document.getElementById('calc-edit-type').value || '').trim() || 'Projection';
    const baseVal = parseFloat(document.getElementById('calc-edit-base').value);
    const targetVal = parseFloat(document.getElementById('calc-edit-target').value);
    const percVal = parseFloat(document.getElementById('calc-edit-perc').value);
    const isUp = document.getElementById('calc-edit-dir-btn').getAttribute('data-dir') === 'up';
    const sharesVal = (document.getElementById('calc-edit-shares').value || '').trim();
    const isHighlighted = document.getElementById('calc-edit-highlight').checked;
    const saveBtn = document.getElementById('calc-save-btn');

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'SAVING...';
    }

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

    if (saveBtn) {
      saveBtn.textContent = 'SAVED!';
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE & SYNC';
        closeCalcEditSheet();
      }, 400);
    }
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

  // ─── Target Alerts Check (Compact Micro-Pill & Session-Dismissed) ───────
  const dismissedAlertKeys = new Set(JSON.parse(sessionStorage.getItem('ticker_dismissed_alerts') || '[]'));

  function checkTargetAlerts() {
    const banner = document.getElementById('alert-banner');
    const container = document.getElementById('alert-banner-content');
    if (!banner || !container) return;

    const activeAlerts = [];
    (appState.historyRecords || []).forEach(g => {
      const market = detectMarket(g.symbol).market;
      const isChina = market === 'A';

      (g.records || []).forEach((r, rIdx) => {
        // ONLY trigger on real alertTriggered flag, and ignore if already dismissed in this session
        if (r.alertTriggered) {
          const alertKey = `${g.symbol}_${rIdx}_${r.targetPrice || r.result}`;
          if (!dismissedAlertKeys.has(alertKey)) {
            const isUp = r.isUp !== false;
            const priceColor = isChina ? (isUp ? '#ff453a' : '#32d74b') : (isUp ? '#32d74b' : '#ff453a');
            const priceText = r.result || (r.targetPrice ? `${isChina ? '¥' : '$'}${r.targetPrice}` : '');

            activeAlerts.push({
              key: alertKey,
              symbol: g.symbol,
              name: g.name || '',
              price: priceText,
              color: priceColor
            });
          }
        }
      });
    });

    if (activeAlerts.length > 0) {
      container.innerHTML = activeAlerts.slice(0, 2).map(a => `
        <div class="alert-item" data-key="${escapeHtml(a.key)}">
          <span class="alert-stock-tag">${escapeHtml(a.symbol)} ${escapeHtml(a.name)}</span>
          <span class="alert-price-val mono" style="color: ${a.color};">${escapeHtml(a.price)}</span>
        </div>
      `).join('<span style="color: var(--border); margin: 0 4px; opacity: 0.5;">|</span>');

      banner.classList.remove('hidden');
      requestAnimationFrame(() => banner.classList.add('visible'));
    } else {
      banner.classList.remove('visible');
      setTimeout(() => banner.classList.add('hidden'), 350);
    }
  }

  function dismissAllCurrentAlerts() {
    const banner = document.getElementById('alert-banner');
    const container = document.getElementById('alert-banner-content');
    if (!banner) return;

    if (container) {
      container.querySelectorAll('.alert-item').forEach(el => {
        const key = el.getAttribute('data-key');
        if (key) dismissedAlertKeys.add(key);
      });
      try {
        sessionStorage.setItem('ticker_dismissed_alerts', JSON.stringify([...dismissedAlertKeys]));
      } catch (e) {}
    }

    banner.classList.remove('visible');
    setTimeout(() => banner.classList.add('hidden'), 350);
  }

  function setupAlertBannerGestures() {
    const banner = document.getElementById('alert-banner');
    if (!banner) return;

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

  // Physics-based luxury smooth scroll matching desktop Studio Noir (Snappy Takeoff + Prolonged Velvety Landing)
  function smoothScrollContainer(container, targetY, duration = 1150) {
    const startY = container.scrollTop;
    const difference = targetY - startY;
    if (Math.abs(difference) < 2) return;

    const startTime = performance.now();

    // Studio Noir Quintic Ease-Out: Instant initial surge, followed by a long, slow, feather-soft coasting landing
    function easeOutStudioNoir(t) {
      return 1 - Math.pow(1 - t, 4.5);
    }

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeOutStudioNoir(progress);

      container.scrollTop = startY + difference * ease;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  // Setup UI Listeners with Robust Global Event Delegation
  function initListeners() {
    // 1. Top-Level Unified Click Delegation (works 100% on iOS PWA)
    document.addEventListener('click', function (e) {
      // (a0) Stock Symbol/Name Click -> Open Deep Stock Research Modal
      const researchTrigger = e.target.closest('.stock-research-trigger') || e.target.closest('.stock-symbol') || e.target.closest('.stock-name');
      if (researchTrigger && !e.target.closest('.stock-edit-trigger') && !e.target.closest('.urgency-dot')) {
        const card = researchTrigger.closest('.stock-card');
        const sym = researchTrigger.getAttribute('data-symbol') || (card ? card.getAttribute('data-symbol') : null);
        if (sym) {
          e.preventDefault();
          e.stopPropagation();
          openStockResearch(sym);
          return;
        }
      }

      // (a) Stock Edit Trigger
      const stockBtn = e.target.closest('.stock-edit-trigger');
      if (stockBtn) {
        e.preventDefault();
        e.stopPropagation();
        const symbol = stockBtn.getAttribute('data-symbol');
        if (symbol) openStockEditSheet(symbol);
        return;
      }

      // (b) Calculation Target Edit Trigger
      const calcBtn = e.target.closest('.calc-edit-trigger');
      if (calcBtn) {
        e.preventDefault();
        e.stopPropagation();
        const symbol = calcBtn.getAttribute('data-symbol');
        const recordIdxStr = calcBtn.getAttribute('data-record');
        const recordIdx = recordIdxStr !== null ? parseInt(recordIdxStr, 10) : null;
        if (symbol && recordIdx !== null && !isNaN(recordIdx)) {
          openCalcEditSheet(symbol, recordIdx);
        }
        return;
      }

      // (b2) Load Calculation into Top Calculator Trigger
      const loadBtn = e.target.closest('.calc-load-btn') || e.target.closest('.calc-load-trigger');
      if (loadBtn && !e.target.closest('.calc-edit-trigger')) {
        e.preventDefault();
        e.stopPropagation();
        if (loadBtn.blur) loadBtn.blur();
        const symbol = loadBtn.getAttribute('data-symbol');
        const recordIdxStr = loadBtn.getAttribute('data-record');
        const recordIdx = recordIdxStr !== null ? parseInt(recordIdxStr, 10) : null;
        if (symbol && recordIdx !== null && !isNaN(recordIdx)) {
          const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
          if (group && group.records && group.records[recordIdx]) {
            populateMobileCalculator(group.records[recordIdx], symbol);
          }
        }
        return;
      }

      // (c) Label Chip Click inside Calc Sheet / Chips Row
      const editChipsContainer = e.target.closest('#calc-chips-container');
      if (editChipsContainer) {
        const addBtn = e.target.closest('.calc-chip-add');
        if (addBtn) {
          e.preventDefault();
          e.stopPropagation();
          handleAddChip();
          return;
        }
        const editBtn = e.target.closest('.calc-chips-pencil-btn');
        if (editBtn) {
          e.preventDefault();
          e.stopPropagation();
          handleToggleEditChips();
          return;
        }
        const chip = e.target.closest('.calc-chip');
        if (chip) {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(chip.getAttribute('data-index'), 10);
          if (isChipsEditMode) {
            if (confirm(`Delete label "${appState.customLabels[idx]}"?`)) {
              appState.customLabels.splice(idx, 1);
              saveToCache(appState);
              renderPart1Chips();
              pushDataToServer(appState);
            }
          } else {
            const typeInput = document.getElementById('calc-edit-type');
            if (typeInput) typeInput.value = chip.textContent.trim();
            editChipsContainer.querySelectorAll('.calc-chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
          }
          return;
        }
      }

      // (c2) Urgency 3-Color Dot Toggle (Green / Orange / Red)
      const urgencyDot = e.target.closest('.urgency-dot');
      if (urgencyDot) {
        e.preventDefault();
        e.stopPropagation();
        const symbol = urgencyDot.getAttribute('data-symbol');
        const color = urgencyDot.getAttribute('data-color');
        if (!symbol || !color) return;

        const group = (appState.historyRecords || []).find(g => g.symbol === symbol);
        if (!group) return;

        const isSelected = urgencyDot.classList.contains('selected');
        const newUrgency = isSelected ? null : color;

        group.urgency = newUrgency;
        if (group.records && group.records.length > 0) {
          group.records.forEach(r => r.urgency = newUrgency);
        }

        saveToCache(appState);
        renderApp();
        pushDataToServer(appState);
        return;
      }

      // (d) Note Accordion Toggle
      const noteBtn = e.target.closest('.note-toggle');
      if (noteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const targetId = noteBtn.getAttribute('data-target');
        const content = document.getElementById(targetId);
        if (content) {
          const isOpen = content.classList.contains('visible');
          if (isOpen) {
            content.classList.remove('visible');
            noteBtn.classList.remove('open');
          } else {
            content.classList.add('visible');
            noteBtn.classList.add('open');
          }
        }
        return;
      }

      // (e) Market Filter Tab
      const filterTab = e.target.closest('.filter-tab');
      if (filterTab) {
        e.preventDefault();
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        filterTab.classList.add('active');
        currentMarketFilter = filterTab.getAttribute('data-filter') || 'all';
        renderApp();
        return;
      }

      // (f) Stock Quick Tag Tap (Smooth scroll to stock card & highlight)
      const quickTag = e.target.closest('.quick-tag');
      if (quickTag) {
        e.preventDefault();
        const symbol = quickTag.getAttribute('data-symbol');
        if (symbol) {
          const card = document.querySelector(`.stock-card[data-symbol="${symbol}"]`);
          const container = document.querySelector('.mobile-container');
          if (card && container) {
            const cardRect = card.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            // Generous 110px top clearance: ensures card header lands comfortably below Dynamic Island
            const topClearance = 110;
            const targetScroll = container.scrollTop + (cardRect.top - containerRect.top) - topClearance;

            smoothScrollContainer(container, Math.max(0, targetScroll), 1150);

            card.classList.remove('card-highlight-flash');
            void card.offsetWidth; // Force reflow
            card.classList.add('card-highlight-flash');
            setTimeout(() => card.classList.remove('card-highlight-flash'), 3300);
          }
        }
        return;
      }

      // (g) Alert Banner Close
      const alertClose = e.target.closest('#alert-banner-close');
      if (alertClose) {
        e.preventDefault();
        dismissAllCurrentAlerts();
        return;
      }

      // (g) Backdrop click to close sheets
      if (e.target.id === 'edit-sheet-backdrop') {
        closeStockEditSheet();
        closeCalcEditSheet();
        closeAddLabelSheet();
        return;
      }

      // (h) Clear search button
      if (e.target.id === 'clear-search-btn') {
        const searchInput = document.getElementById('mobile-search-input');
        if (searchInput) searchInput.value = '';
        searchQuery = '';
        e.target.style.display = 'none';
        renderApp();
        return;
      }

      // (i) Scroll To Top (Triggered by Floating Button OR Top Dynamic Island Sensor)
      if (e.target.closest('#scroll-to-top-btn') || e.target.closest('#top-scroll-sensor')) {
        e.preventDefault();
        e.stopPropagation();
        const container = document.querySelector('.mobile-container');
        if (container) {
          smoothScrollContainer(container, 0, 1150);
        }
        return;
      }
    });

    // 3. Stock Edit Sheet Buttons
    const stockCancelBtn = document.getElementById('stock-cancel-btn');
    const stockSaveBtn = document.getElementById('stock-save-btn');
    const stockDeleteBtn = document.getElementById('stock-delete-btn');

    if (stockCancelBtn) stockCancelBtn.onclick = closeStockEditSheet;
    if (stockSaveBtn) stockSaveBtn.onclick = saveStockEditSheet;
    if (stockDeleteBtn) stockDeleteBtn.onclick = deleteStockFromSheet;

    // 4. Calculation Edit Sheet Buttons & Bindings
    setupCalcInputBindings();
    const calcCancelBtn = document.getElementById('calc-cancel-btn');
    const calcSaveBtn = document.getElementById('calc-save-btn');
    const calcDeleteBtn = document.getElementById('calc-delete-btn');

    if (calcCancelBtn) calcCancelBtn.onclick = closeCalcEditSheet;
    if (calcSaveBtn) calcSaveBtn.onclick = saveCalcEditSheet;
    if (calcDeleteBtn) calcDeleteBtn.onclick = deleteCalcFromSheet;

    // 5. Alert Banner gestures
    setupAlertBannerGestures();

    // 6. Part 1: Quick Calculators Module
    setupPart1Calculators();

    // 7. Floating Scroll-To-Top Button Visibility based on scroll position
    const mainContainer = document.querySelector('.mobile-container');
    const scrollBtn = document.getElementById('scroll-to-top-btn');
    if (mainContainer && scrollBtn) {
      mainContainer.addEventListener('scroll', function () {
        if (mainContainer.scrollTop > 240) {
          scrollBtn.classList.remove('hidden');
          requestAnimationFrame(() => scrollBtn.classList.add('visible'));
        } else {
          scrollBtn.classList.remove('visible');
          setTimeout(() => {
            if (!scrollBtn.classList.contains('visible')) {
              scrollBtn.classList.add('hidden');
            }
          }, 350);
        }
      }, { passive: true });
    }
  }

  // ─── Part 1: Quick Calculators Controller ──────────────────────
  let targetCalcDir = 'up'; // 'up' | 'down'
  let isChipsEditMode = false;

  function renderPart1Chips() {
    const defaultLabels = ['D买点1', 'D买点2', 'D卖点1', 'D卖点2', 'W买点1', 'W买点2', 'W卖点1', 'W卖点2', '30买点1', '30买点2', '30卖点1', '30卖点2'];
    if (!appState.customLabels || appState.customLabels.length === 0) {
      appState.customLabels = defaultLabels;
    }
    const customLabels = appState.customLabels;

    const targetChipsEl = document.getElementById('m-target-chips-container');
    const deltaChipsEl = document.getElementById('m-delta-chips-container');
    const editSheetChipsEl = document.getElementById('calc-chips-container');

    const chipsHtml = customLabels.map((l, idx) => `
      <button type="button" class="calc-chip" data-index="${idx}">${escapeHtml(l)}</button>
    `).join('') + `
      <button type="button" class="calc-chip calc-chip-add" title="Add New Label">+</button>
      <button type="button" class="calc-chips-pencil-btn edit-pencil-btn ${isChipsEditMode ? 'active' : ''}" title="Edit Labels">✎</button>
    `;

    if (targetChipsEl) {
      targetChipsEl.innerHTML = chipsHtml;
      targetChipsEl.classList.toggle('chips-edit-mode', isChipsEditMode);
    }
    if (deltaChipsEl) {
      deltaChipsEl.innerHTML = chipsHtml;
      deltaChipsEl.classList.toggle('chips-edit-mode', isChipsEditMode);
    }
    if (editSheetChipsEl) {
      const typeInput = document.getElementById('calc-edit-type');
      const currentType = typeInput ? typeInput.value.trim() : '';
      const editChipsHtml = customLabels.map((l, idx) => `
        <button type="button" class="calc-chip ${l === currentType ? 'selected' : ''}" data-index="${idx}">${escapeHtml(l)}</button>
      `).join('') + `
        <button type="button" class="calc-chip calc-chip-add" title="Add New Label">+</button>
        <button type="button" class="calc-chips-pencil-btn edit-pencil-btn ${isChipsEditMode ? 'active' : ''}" title="Edit Labels">✎</button>
      `;
      editSheetChipsEl.innerHTML = editChipsHtml;
      editSheetChipsEl.classList.toggle('chips-edit-mode', isChipsEditMode);
    }
  }

  function openAddLabelSheet() {
    const sheet = document.getElementById('add-label-sheet');
    const backdrop = document.getElementById('edit-sheet-backdrop');
    const input = document.getElementById('new-label-input');
    if (sheet && backdrop) {
      if (input) input.value = '';
      sheet.classList.remove('hidden');
      backdrop.classList.remove('hidden');
      void sheet.offsetWidth;
      sheet.classList.add('visible');
      backdrop.classList.add('visible');
      if (input) setTimeout(() => input.focus(), 300);
    }
  }

  function closeAddLabelSheet() {
    const sheet = document.getElementById('add-label-sheet');
    const backdrop = document.getElementById('edit-sheet-backdrop');
    if (sheet && backdrop) {
      sheet.classList.remove('visible');
      backdrop.classList.remove('visible');
      setTimeout(() => {
        sheet.classList.add('hidden');
        backdrop.classList.add('hidden');
      }, 300);
    }
  }

  function submitNewCustomLabel() {
    const input = document.getElementById('new-label-input');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    if (!appState.customLabels) appState.customLabels = [];
    if (!appState.customLabels.includes(name)) {
      appState.customLabels.push(name);
      saveToCache(appState);
      renderPart1Chips();
      pushDataToServer(appState);
    }
    closeAddLabelSheet();
  }

  function handleAddChip() {
    openAddLabelSheet();
  }

  function handleToggleEditChips() {
    isChipsEditMode = !isChipsEditMode;
    renderPart1Chips();
  }

  function setupPart1Calculators() {
    renderPart1Chips();

    // Bind Add Label Sheet buttons
    const addLabelCancelBtn = document.getElementById('add-label-cancel-btn');
    const addLabelConfirmBtn = document.getElementById('add-label-confirm-btn');
    const newLabelInput = document.getElementById('new-label-input');

    if (addLabelCancelBtn) addLabelCancelBtn.onclick = closeAddLabelSheet;
    if (addLabelConfirmBtn) addLabelConfirmBtn.onclick = submitNewCustomLabel;
    if (newLabelInput) {
      newLabelInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitNewCustomLabel();
        }
      };
    }

    // 1. Mode Switcher
    const modeTargetBtn = document.getElementById('m-mode-target');
    const modeDeltaBtn = document.getElementById('m-mode-delta');
    const panelTarget = document.getElementById('m-panel-target');
    const panelDelta = document.getElementById('m-panel-delta');

    if (modeTargetBtn && modeDeltaBtn && panelTarget && panelDelta) {
      modeTargetBtn.onclick = () => {
        modeTargetBtn.classList.add('active');
        modeDeltaBtn.classList.remove('active');
        panelTarget.classList.remove('hidden');
        panelDelta.classList.add('hidden');
      };
      modeDeltaBtn.onclick = () => {
        modeDeltaBtn.classList.add('active');
        modeTargetBtn.classList.remove('active');
        panelDelta.classList.remove('hidden');
        panelTarget.classList.add('hidden');
      };
    }

    // 2. Target Projection Live Inputs
    const targetSymInput = document.getElementById('m-target-symbol');
    const targetBaseInput = document.getElementById('m-target-base');
    const targetPercInput = document.getElementById('m-target-perc');
    const targetDirBtn = document.getElementById('m-target-dir-btn');
    const targetTypeInput = document.getElementById('m-target-type');
    const targetResEl = document.getElementById('m-target-res-val');
    const targetCurSym = document.getElementById('m-target-cur');
    const targetSaveBtn = document.getElementById('m-target-save-btn');
    const targetClearBtn = document.getElementById('m-target-clear-btn');

    function updateTargetMarketColors() {
      const sym = (targetSymInput ? targetSymInput.value.trim() : '');
      const market = detectMarket(sym);
      const isChina = market.market === 'A';
      if (targetCurSym) targetCurSym.textContent = isChina ? '¥' : '$';

      const panel = document.getElementById('m-panel-target');
      if (panel) {
        if (isChina) {
          panel.style.setProperty('--calc-up-color', '#ff453a');
          panel.style.setProperty('--calc-down-color', '#32d74b');
        } else {
          panel.style.setProperty('--calc-up-color', '#32d74b');
          panel.style.setProperty('--calc-down-color', '#ff453a');
        }
      }
    }

    function calcTargetLive() {
      updateTargetMarketColors();
      const sym = (targetSymInput ? targetSymInput.value.trim() : '');
      const isChina = detectMarket(sym).market === 'A';
      const cur = isChina ? '¥' : '$';

      const base = parseFloat(targetBaseInput ? targetBaseInput.value : 0) || 0;
      const perc = parseFloat(targetPercInput ? targetPercInput.value : 0) || 0;
      const isUp = targetCalcDir === 'up';

      if (base <= 0) {
        if (targetResEl) targetResEl.textContent = `${cur}0.00`;
        return;
      }

      const res = isUp ? base * (1 + perc / 100) : base * (1 - perc / 100);
      if (targetResEl) targetResEl.textContent = `${cur}${res.toFixed(2)}`;
    }

    if (targetDirBtn) {
      targetDirBtn.onclick = () => {
        targetCalcDir = targetCalcDir === 'up' ? 'down' : 'up';
        targetDirBtn.setAttribute('data-dir', targetCalcDir);
        targetDirBtn.textContent = targetCalcDir === 'up' ? '▲ UP' : '▼ DOWN';
        targetDirBtn.classList.toggle('is-up', targetCalcDir === 'up');
        targetDirBtn.classList.toggle('is-down', targetCalcDir === 'down');
        calcTargetLive();
      };
    }

    // Rev. Calc for Target Projection
    const targetRevBtn = document.getElementById('m-target-rev-btn');
    if (targetRevBtn) {
      targetRevBtn.onclick = () => {
        const currentBase = parseFloat(targetBaseInput ? targetBaseInput.value : 0);
        const perc = parseFloat(targetPercInput ? targetPercInput.value : 0);
        if (!isNaN(currentBase) && currentBase > 0 && !isNaN(perc)) {
          const isUp = targetCalcDir === 'up';
          let newBase = currentBase;
          if (isUp) {
            newBase = currentBase / (1 + perc / 100);
          } else if (perc !== 100) {
            newBase = currentBase / (1 - perc / 100);
          }
          if (targetBaseInput) targetBaseInput.value = newBase.toFixed(2);
          calcTargetLive();
        }
      };
    }

    // Use as Entry for Target Projection
    const targetUseEntryBtn = document.getElementById('m-target-use-entry-btn');
    if (targetUseEntryBtn) {
      targetUseEntryBtn.onclick = () => {
        const base = parseFloat(targetBaseInput ? targetBaseInput.value : 0) || 0;
        const perc = parseFloat(targetPercInput ? targetPercInput.value : 0) || 0;
        const isUp = targetCalcDir === 'up';
        if (base > 0 && perc > 0) {
          const targetPrice = isUp ? base * (1 + perc / 100) : base * (1 - perc / 100);
          if (targetBaseInput) targetBaseInput.value = targetPrice.toFixed(2);
          calcTargetLive();
        }
      };
    }

    if (targetSymInput) targetSymInput.addEventListener('input', calcTargetLive);
    if (targetBaseInput) targetBaseInput.addEventListener('input', calcTargetLive);
    if (targetPercInput) targetPercInput.addEventListener('input', calcTargetLive);

    // Target Chips Click
    const targetChipsRow = document.getElementById('m-target-chips-container');
    if (targetChipsRow) {
      targetChipsRow.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.calc-chip-add');
        if (addBtn) {
          handleAddChip();
          return;
        }
        const editBtn = e.target.closest('.calc-chips-pencil-btn');
        if (editBtn) {
          handleToggleEditChips();
          return;
        }

        const chip = e.target.closest('.calc-chip');
        if (!chip) return;
        const idx = parseInt(chip.getAttribute('data-index'), 10);

        if (isChipsEditMode) {
          if (confirm(`Delete label "${appState.customLabels[idx]}"?`)) {
            appState.customLabels.splice(idx, 1);
            saveToCache(appState);
            renderPart1Chips();
            pushDataToServer(appState);
          }
        } else if (targetTypeInput) {
          targetTypeInput.value = chip.textContent.trim();
          targetChipsRow.querySelectorAll('.calc-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
        }
      });
    }

    // Save Projection
    if (targetSaveBtn) {
      targetSaveBtn.onclick = async () => {
        const sym = (targetSymInput ? targetSymInput.value.trim().toUpperCase() : '');
        if (!sym) {
          alert('Please enter a stock symbol');
          return;
        }
        const base = parseFloat(targetBaseInput ? targetBaseInput.value : 0) || 0;
        const perc = parseFloat(targetPercInput ? targetPercInput.value : 0) || 0;
        if (base <= 0) {
          alert('Please enter a valid entry price');
          return;
        }

        const isChina = detectMarket(sym).market === 'A';
        const cur = isChina ? '¥' : '$';
        const isUp = targetCalcDir === 'up';
        const resVal = isUp ? base * (1 + perc / 100) : base * (1 - perc / 100);
        const resultStr = `${cur}${resVal.toFixed(2)}`;
        const detailsStr = `${cur}${base.toFixed(2)} ${isUp ? '+' : '-'}${perc.toFixed(2)}%`;
        const labelType = (targetTypeInput ? targetTypeInput.value.trim() : '') || 'Target Projection';

        if (!appState.historyRecords) appState.historyRecords = [];
        let group = appState.historyRecords.find(g => g.symbol.toUpperCase() === sym);
        if (!group) {
          group = {
            symbol: sym,
            name: sym,
            costPrice: '',
            quantity: '',
            note: '',
            records: []
          };
          appState.historyRecords.unshift(group);
        }
        if (!group.records) group.records = [];

        const newRecord = {
          type: labelType,
          result: resultStr,
          details: detailsStr,
          timestamp: new Date().toISOString(),
          basePrice: base,
          targetPrice: resVal,
          percentage: perc,
          isUp: isUp,
          inputs: {
            basePrice: base,
            percentage: perc,
            direction: targetCalcDir,
            shares: ''
          }
        };

        group.records.unshift(newRecord);
        appState.lastUpdated = new Date().toISOString();

        saveToCache(appState);
        renderApp();
        pushDataToServer(appState);

        // Highlight and scroll to the card
        const card = document.querySelector(`.stock-card[data-symbol="${sym}"]`);
        const container = document.querySelector('.mobile-container');
        if (card && container) {
          const cardRect = card.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          smoothScrollContainer(container, Math.max(0, container.scrollTop + (cardRect.top - containerRect.top) - 110), 1150);
          card.classList.remove('card-highlight-flash');
          void card.offsetWidth;
          card.classList.add('card-highlight-flash');
          setTimeout(() => card.classList.remove('card-highlight-flash'), 3300);
        }
      };
    }

    // Clear Target
    if (targetClearBtn) {
      targetClearBtn.onclick = () => {
        if (targetBaseInput) targetBaseInput.value = '';
        if (targetPercInput) targetPercInput.value = '';
        if (targetTypeInput) targetTypeInput.value = '';
        if (targetResEl) {
          const isChina = detectMarket(targetSymInput ? targetSymInput.value : '').market === 'A';
          targetResEl.textContent = `${isChina ? '¥' : '$'}0.00`;
        }
      };
    }

    // 3. Percentage Delta Live Inputs
    const deltaSymInput = document.getElementById('m-delta-symbol');
    const deltaInitialInput = document.getElementById('m-delta-initial');
    const deltaFinalInput = document.getElementById('m-delta-final');
    const deltaTypeInput = document.getElementById('m-delta-type');
    const deltaResEl = document.getElementById('m-delta-res-val');
    const deltaCur1 = document.getElementById('m-delta-cur-1');
    const deltaCur2 = document.getElementById('m-delta-cur-2');
    const deltaSaveBtn = document.getElementById('m-delta-save-btn');
    const deltaClearBtn = document.getElementById('m-delta-clear-btn');

    function updateDeltaCur() {
      const sym = (deltaSymInput ? deltaSymInput.value.trim() : '');
      const isChina = detectMarket(sym).market === 'A';
      if (deltaCur1) deltaCur1.textContent = isChina ? '¥' : '$';
      if (deltaCur2) deltaCur2.textContent = isChina ? '¥' : '$';
    }

    function calcDeltaLive() {
      updateDeltaCur();
      const sym = (deltaSymInput ? deltaSymInput.value.trim() : '');
      const isChina = detectMarket(sym).market === 'A';
      const init = parseFloat(deltaInitialInput ? deltaInitialInput.value : 0) || 0;
      const fin = parseFloat(deltaFinalInput ? deltaFinalInput.value : 0) || 0;

      if (init <= 0 || fin <= 0) {
        if (deltaResEl) {
          deltaResEl.textContent = `0.00%`;
          deltaResEl.style.color = '#ffffff';
        }
        return;
      }

      const diff = ((fin - init) / init) * 100;
      if (deltaResEl) {
        deltaResEl.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`;
        if (isChina) {
          deltaResEl.style.color = diff >= 0 ? '#ff453a' : '#32d74b';
        } else {
          deltaResEl.style.color = diff >= 0 ? '#32d74b' : '#ff453a';
        }
      }
    }

    // Rev. Calc for Delta Initial Price
    const deltaRevInitBtn = document.getElementById('m-delta-rev-init-btn');
    if (deltaRevInitBtn) {
      deltaRevInitBtn.onclick = () => {
        const initialVal = parseFloat(deltaInitialInput ? deltaInitialInput.value : 0);
        const finalVal = parseFloat(deltaFinalInput ? deltaFinalInput.value : 0);
        if (!isNaN(initialVal) && initialVal > 0 && !isNaN(finalVal)) {
          const pctDecimal = (finalVal - initialVal) / initialVal;
          if (pctDecimal === -1) return;
          const newFinal = initialVal;
          const newInitial = newFinal / (1 + pctDecimal);
          if (deltaInitialInput) deltaInitialInput.value = newInitial.toFixed(2);
          if (deltaFinalInput) deltaFinalInput.value = newFinal.toFixed(2);
          calcDeltaLive();
        }
      };
    }

    // Rev. Calc for Delta Final Price
    const deltaRevFinalBtn = document.getElementById('m-delta-rev-final-btn');
    if (deltaRevFinalBtn) {
      deltaRevFinalBtn.onclick = () => {
        const initialVal = parseFloat(deltaInitialInput ? deltaInitialInput.value : 0);
        const finalVal = parseFloat(deltaFinalInput ? deltaFinalInput.value : 0);
        if (!isNaN(initialVal) && initialVal > 0 && !isNaN(finalVal) && finalVal > 0) {
          const pctDecimal = (finalVal - initialVal) / initialVal;
          const newInitial = finalVal;
          const newFinal = newInitial * (1 + pctDecimal);
          if (deltaInitialInput) deltaInitialInput.value = newInitial.toFixed(2);
          if (deltaFinalInput) deltaFinalInput.value = newFinal.toFixed(2);
          calcDeltaLive();
        }
      };
    }

    // Use as Target for Percentage Delta
    const deltaUseTargetBtn = document.getElementById('m-delta-use-target-btn');
    if (deltaUseTargetBtn) {
      deltaUseTargetBtn.onclick = () => {
        const init = parseFloat(deltaInitialInput ? deltaInitialInput.value : 0) || 0;
        const fin = parseFloat(deltaFinalInput ? deltaFinalInput.value : 0) || 0;
        if (init > 0 && fin > 0) {
          const diff = ((fin - init) / init) * 100;
          const isUp = diff >= 0;
          if (targetSymInput && deltaSymInput) targetSymInput.value = deltaSymInput.value;
          if (targetBaseInput) targetBaseInput.value = init.toFixed(2);
          if (targetPercInput) targetPercInput.value = Math.abs(diff).toFixed(2);
          targetCalcDir = isUp ? 'up' : 'down';
          if (targetDirBtn) {
            targetDirBtn.setAttribute('data-dir', targetCalcDir);
            targetDirBtn.textContent = targetCalcDir === 'up' ? '▲ UP' : '▼ DOWN';
            targetDirBtn.classList.toggle('is-up', targetCalcDir === 'up');
            targetDirBtn.classList.toggle('is-down', targetCalcDir === 'down');
          }
          // Switch to Target tab
          const modeTargetBtn = document.getElementById('m-mode-target');
          const modeDeltaBtn = document.getElementById('m-mode-delta');
          const panelTarget = document.getElementById('m-panel-target');
          const panelDelta = document.getElementById('m-panel-delta');
          if (modeTargetBtn && modeDeltaBtn && panelTarget && panelDelta) {
            modeTargetBtn.classList.add('active');
            modeDeltaBtn.classList.remove('active');
            panelTarget.classList.remove('hidden');
            panelDelta.classList.add('hidden');
          }
          calcTargetLive();
        }
      };
    }

    if (deltaSymInput) deltaSymInput.addEventListener('input', calcDeltaLive);
    if (deltaInitialInput) deltaInitialInput.addEventListener('input', calcDeltaLive);
    if (deltaFinalInput) deltaFinalInput.addEventListener('input', calcDeltaLive);

    // Delta Chips Click
    const deltaChipsRow = document.getElementById('m-delta-chips-container');
    if (deltaChipsRow) {
      deltaChipsRow.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.calc-chip-add');
        if (addBtn) {
          handleAddChip();
          return;
        }
        const editBtn = e.target.closest('.calc-chips-pencil-btn');
        if (editBtn) {
          handleToggleEditChips();
          return;
        }

        const chip = e.target.closest('.calc-chip');
        if (!chip) return;
        const idx = parseInt(chip.getAttribute('data-index'), 10);

        if (isChipsEditMode) {
          if (confirm(`Delete label "${appState.customLabels[idx]}"?`)) {
            appState.customLabels.splice(idx, 1);
            saveToCache(appState);
            renderPart1Chips();
            pushDataToServer(appState);
          }
        } else if (deltaTypeInput) {
          deltaTypeInput.value = chip.textContent.trim();
          deltaChipsRow.querySelectorAll('.calc-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
        }
      });
    }

    // Save Delta
    if (deltaSaveBtn) {
      deltaSaveBtn.onclick = async () => {
        const sym = (deltaSymInput ? deltaSymInput.value.trim().toUpperCase() : '');
        if (!sym) {
          alert('Please enter a stock symbol');
          return;
        }
        const init = parseFloat(deltaInitialInput ? deltaInitialInput.value : 0) || 0;
        const fin = parseFloat(deltaFinalInput ? deltaFinalInput.value : 0) || 0;
        if (init <= 0 || fin <= 0) {
          alert('Please enter valid initial and final prices');
          return;
        }

        const isChina = detectMarket(sym).market === 'A';
        const cur = isChina ? '¥' : '$';
        const diff = ((fin - init) / init) * 100;
        const isUp = diff >= 0;
        const resultStr = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`;
        const detailsStr = `${cur}${init.toFixed(2)} -> ${cur}${fin.toFixed(2)}`;
        const labelType = (deltaTypeInput ? deltaTypeInput.value.trim() : '') || 'Percentage Delta';

        if (!appState.historyRecords) appState.historyRecords = [];
        let group = appState.historyRecords.find(g => g.symbol.toUpperCase() === sym);
        if (!group) {
          group = {
            symbol: sym,
            name: sym,
            costPrice: '',
            quantity: '',
            note: '',
            records: []
          };
          appState.historyRecords.unshift(group);
        }
        if (!group.records) group.records = [];

        const newRecord = {
          type: labelType,
          result: resultStr,
          details: detailsStr,
          timestamp: new Date().toISOString(),
          basePrice: init,
          targetPrice: fin,
          percentage: Math.abs(diff),
          isUp: isUp,
          inputs: {
            initialPrice: init,
            finalPrice: fin,
            shares: ''
          }
        };

        group.records.unshift(newRecord);
        appState.lastUpdated = new Date().toISOString();

        saveToCache(appState);
        renderApp();
        pushDataToServer(appState);

        // Highlight and scroll to the card
        const card = document.querySelector(`.stock-card[data-symbol="${sym}"]`);
        const container = document.querySelector('.mobile-container');
        if (card && container) {
          const cardRect = card.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          smoothScrollContainer(container, Math.max(0, container.scrollTop + (cardRect.top - containerRect.top) - 110), 1150);
          card.classList.remove('card-highlight-flash');
          void card.offsetWidth;
          card.classList.add('card-highlight-flash');
          setTimeout(() => card.classList.remove('card-highlight-flash'), 3300);
        }
      };
    }

    // Clear Delta
    if (deltaClearBtn) {
      deltaClearBtn.onclick = () => {
        if (deltaInitialInput) deltaInitialInput.value = '';
        if (deltaFinalInput) deltaFinalInput.value = '';
        if (deltaTypeInput) deltaTypeInput.value = '';
        if (deltaResEl) deltaResEl.textContent = '0.00%';
      };
    }
  }

  // ─── Populate Mobile Calculator from Ledger Record ─────────────
  function populateMobileCalculator(record, symbol) {
    if (!record) return;
    const sym = symbol || record.symbol || '';

    let isPercentage = false;
    if (record.mode === 'percentage') {
      isPercentage = true;
    } else if (record.inputs && (record.inputs.initial !== undefined || record.inputs.initialPrice !== undefined)) {
      isPercentage = true;
    } else if (record.result && record.result.includes('%')) {
      isPercentage = true;
    } else if (record.type === 'Percentage Delta' || record.type === 'Percentage Change') {
      isPercentage = true;
    }

    const modeTargetBtn = document.getElementById('m-mode-target');
    const modeDeltaBtn = document.getElementById('m-mode-delta');
    const panelTarget = document.getElementById('m-panel-target');
    const panelDelta = document.getElementById('m-panel-delta');

    if (!isPercentage) {
      // 1. Switch to Target Projection tab
      if (modeTargetBtn) modeTargetBtn.classList.add('active');
      if (modeDeltaBtn) modeDeltaBtn.classList.remove('active');
      if (panelTarget) panelTarget.classList.remove('hidden');
      if (panelDelta) panelDelta.classList.add('hidden');

      const targetSymInput = document.getElementById('m-target-symbol');
      const targetBaseInput = document.getElementById('m-target-base');
      const targetPercInput = document.getElementById('m-target-perc');
      const targetDirBtn = document.getElementById('m-target-dir-btn');
      const targetTypeInput = document.getElementById('m-target-type');
      const targetCurSym = document.getElementById('m-target-cur');
      const targetResEl = document.getElementById('m-target-res-val');

      if (targetSymInput) targetSymInput.value = sym;
      if (targetTypeInput) targetTypeInput.value = record.type || '';

      if (record.inputs && record.inputs.base !== undefined) {
        if (targetBaseInput) targetBaseInput.value = record.inputs.base;
        if (targetPercInput) targetPercInput.value = record.inputs.perc;
        targetCalcDir = record.inputs.isUp !== false ? 'up' : 'down';
      } else {
        const baseMatch = (record.details || '').match(/Base:\s*([^\s\d]*)\s*([\d.]+)/);
        const percMatch = (record.details || '').match(/(Up|Down|▲|▼|\+|-)\s*([\d.]+)%/i);
        if (baseMatch && targetBaseInput) targetBaseInput.value = baseMatch[2];
        if (percMatch && targetPercInput) {
          targetPercInput.value = percMatch[2];
          const isDown = /Down|▼|-/i.test(percMatch[1]);
          targetCalcDir = isDown ? 'down' : 'up';
        }
      }

      if (targetDirBtn) {
        targetDirBtn.setAttribute('data-dir', targetCalcDir);
        targetDirBtn.textContent = targetCalcDir === 'up' ? '▲ UP' : '▼ DOWN';
        targetDirBtn.classList.toggle('is-up', targetCalcDir === 'up');
        targetDirBtn.classList.toggle('is-down', targetCalcDir === 'down');
      }

      const isChina = detectMarket(sym).market === 'A';
      const cur = isChina ? '¥' : '$';
      if (targetCurSym) targetCurSym.textContent = cur;

      const base = parseFloat(targetBaseInput ? targetBaseInput.value : 0) || 0;
      const perc = parseFloat(targetPercInput ? targetPercInput.value : 0) || 0;
      const isUp = targetCalcDir === 'up';
      if (targetResEl) {
        if (base > 0) {
          const res = isUp ? base * (1 + perc / 100) : base * (1 - perc / 100);
          targetResEl.textContent = `${cur}${res.toFixed(2)}`;
        } else {
          targetResEl.textContent = `${cur}0.00`;
        }
      }
    } else {
      // 2. Switch to Percentage Delta tab
      if (modeDeltaBtn) modeDeltaBtn.classList.add('active');
      if (modeTargetBtn) modeTargetBtn.classList.remove('active');
      if (panelDelta) panelDelta.classList.remove('hidden');
      if (panelTarget) panelTarget.classList.add('hidden');

      const deltaSymInput = document.getElementById('m-delta-symbol');
      const deltaInitialInput = document.getElementById('m-delta-initial');
      const deltaFinalInput = document.getElementById('m-delta-final');
      const deltaTypeInput = document.getElementById('m-delta-type');
      const deltaCur1 = document.getElementById('m-delta-cur-1');
      const deltaCur2 = document.getElementById('m-delta-cur-2');
      const deltaResEl = document.getElementById('m-delta-res-val');

      if (deltaSymInput) deltaSymInput.value = sym;
      if (deltaTypeInput) deltaTypeInput.value = record.type || '';

      const isChina = detectMarket(sym).market === 'A';
      const cur = isChina ? '¥' : '$';
      if (deltaCur1) deltaCur1.textContent = cur;
      if (deltaCur2) deltaCur2.textContent = cur;

      if (record.inputs && (record.inputs.initial !== undefined || record.inputs.initialPrice !== undefined)) {
        if (deltaInitialInput) deltaInitialInput.value = record.inputs.initial !== undefined ? record.inputs.initial : record.inputs.initialPrice;
        if (deltaFinalInput) deltaFinalInput.value = record.inputs.final !== undefined ? record.inputs.final : record.inputs.finalPrice;
      } else {
        const initMatch = (record.details || '').match(/Base:\s*([^\s\d]*)\s*([\d.]+)/) || (record.details || '').match(/([\d.]+)\s*(?:->|→)/);
        const finalMatch = (record.details || '').match(/Target:\s*([^\s\d]*)\s*([\d.]+)/) || (record.details || '').match(/(?:->|→)\s*([^\s\d]*)\s*([\d.]+)/);
        if (initMatch && deltaInitialInput) deltaInitialInput.value = initMatch[2] || initMatch[1];
        if (finalMatch && deltaFinalInput) deltaFinalInput.value = finalMatch[2] || finalMatch[1];
      }

      const init = parseFloat(deltaInitialInput ? deltaInitialInput.value : 0) || 0;
      const fin = parseFloat(deltaFinalInput ? deltaFinalInput.value : 0) || 0;
      if (deltaResEl) {
        if (init > 0 && fin > 0) {
          const diff = ((fin - init) / init) * 100;
          deltaResEl.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`;
          deltaResEl.style.color = isChina ? (diff >= 0 ? '#ff453a' : '#32d74b') : (diff >= 0 ? '#32d74b' : '#ff453a');
        } else {
          deltaResEl.textContent = '0.00%';
          deltaResEl.style.color = '#ffffff';
        }
      }
    }

    // Smooth scroll to top of mobile page to show calculator
    const mainContainer = document.querySelector('.mobile-container');
    if (mainContainer) {
      smoothScrollContainer(mainContainer, 0, 750);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    showToast(`已将 ${sym} [${record.type || '测算'}] 导回上方计算器`);
  }

  // ==========================================================================
  // Part 3: Global Stock Deep Research, Apple Calendar & AI Companion Module
  // ==========================================================================
  let currentResearchStock = null;
  let currentAiHistory = [];

  function showToast(msg) {
    let toast = document.getElementById('mobile-toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mobile-toast-notification';
      toast.className = 'mobile-toast hidden';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove('hidden');
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2200);
  }

  function updateFavButtonUI(isFav) {
    const favBtn = document.getElementById('res-modal-favorite-btn');
    const favSvg = document.getElementById('res-modal-fav-svg');
    if (!favBtn) return;
    if (isFav) {
      favBtn.classList.add('is-favorited');
      favBtn.title = '取消收藏';
      if (favSvg) favSvg.setAttribute('fill', '#ff453a');
    } else {
      favBtn.classList.remove('is-favorited');
      favBtn.title = '收藏股票';
      if (favSvg) favSvg.setAttribute('fill', 'none');
    }
  }

  function setupGlobalStockResearchAndSearch() {
    const searchInput = document.getElementById('mobile-search-input');
    const dropdown = document.getElementById('search-autocomplete-dropdown');
    const clearBtn = document.getElementById('clear-search-btn');

    const modal = document.getElementById('stock-research-modal');
    const backdrop = document.getElementById('research-modal-backdrop');
    const closeBtn = document.getElementById('res-modal-close');
    const addCardBtn = document.getElementById('res-modal-add-card-btn');
    const favBtn = document.getElementById('res-modal-favorite-btn');
    const openAiBtn = document.getElementById('res-modal-open-ai-btn');
    const calendarBtn = document.getElementById('res-modal-calendar-btn');

    const aiHistoryEl = document.getElementById('res-ai-chat-history');
    const aiInput = document.getElementById('res-ai-input');
    const aiSendBtn = document.getElementById('res-ai-send-btn');

    // ➕ Add Stock Card to Homepage Ledger (ALL / US / A股 / HK)
    if (addCardBtn) {
      addCardBtn.onclick = function () {
        if (!currentResearchStock) return;
        const sym = currentResearchStock.symbol || currentResearchStock.rawCode;
        const name = currentResearchStock.name || '';
        let group = (appState.historyRecords || []).find(g => g.symbol.toUpperCase() === sym.toUpperCase());

        if (!group) {
          const newCard = {
            symbol: sym,
            name: name,
            cost: '',
            qty: '',
            tf_w: '',
            tf_d: '',
            tf_30: '',
            note: '',
            inLedger: true,
            isFavorite: false,
            records: []
          };
          appState.historyRecords.unshift(newCard);
          showToast(`已将 ${sym} 加入首页看板列表`);
        } else {
          if (group.inLedger === false) {
            group.inLedger = true;
            showToast(`已将 ${sym} 加入首页看板列表`);
          } else {
            showToast(`${sym} 已在首页看板列表中`);
            return;
          }
        }

        appState.lastUpdated = new Date().toISOString();
        saveToCache(appState);
        renderApp();
        pushDataToServer(appState);
      };
    }

    // ❤️ Favorite Stock Toggle (ONLY in Favorite Tab, NOT in ALL / US / A股)
    if (favBtn) {
      favBtn.onclick = function () {
        if (!currentResearchStock) return;
        const sym = currentResearchStock.symbol || currentResearchStock.rawCode;
        const name = currentResearchStock.name || '';
        let group = (appState.historyRecords || []).find(g => g.symbol.toUpperCase() === sym.toUpperCase());

        if (!group) {
          group = {
            symbol: sym,
            name: name,
            cost: '',
            qty: '',
            tf_w: '',
            tf_d: '',
            tf_30: '',
            note: '',
            inLedger: false, // Favorite ONLY, NOT in ALL/US/A股 ledger!
            isFavorite: true,
            records: []
          };
          appState.historyRecords.unshift(group);
          updateFavButtonUI(true);
          showToast(`已将 ${sym} 加入收藏夹`);
        } else {
          group.isFavorite = !group.isFavorite;
          updateFavButtonUI(group.isFavorite);
          showToast(group.isFavorite ? `已将 ${sym} 加入收藏夹` : `已从收藏夹移除 ${sym}`);
        }

        appState.lastUpdated = new Date().toISOString();
        saveToCache(appState);
        renderApp();
        pushDataToServer(appState);
      };
    }

    if (!searchInput || !dropdown) return;

    function renderDropdown(query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        dropdown.innerHTML = '';
        dropdown.classList.add('hidden');
        return;
      }

      const records = appState.historyRecords || [];
      const matches = records.filter(g => {
        const sym = (g.symbol || '').toLowerCase();
        const name = (g.name || '').toLowerCase();
        return sym.includes(q) || name.includes(q);
      }).slice(0, 4);

      let html = '';
      matches.forEach(m => {
        const marketInfo = getMarketInfo(m.symbol);
        html += `
          <div class="dropdown-item" data-action="select-local" data-symbol="${escapeHtml(m.symbol)}">
            <div class="dropdown-item-left">
              <span class="dropdown-sym">${escapeHtml(m.symbol)}</span>
              <span class="dropdown-name">${escapeHtml(m.name || '')}</span>
            </div>
            <span class="dropdown-badge">${marketInfo.market}</span>
          </div>
        `;
      });

      // Bottom item for Global Deep Research
      html += `
        <div class="dropdown-item dropdown-item-global" data-action="search-global" data-query="${escapeHtml(query.trim())}">
          <div class="dropdown-global-label">
            <span>🔍 全网深度研报:</span>
            <span class="mono">${escapeHtml(query.trim().toUpperCase())}</span>
          </div>
          <span class="dropdown-badge">DEEP AI</span>
        </div>
      `;

      dropdown.innerHTML = html;
      dropdown.classList.remove('hidden');
    }

    // Input event
    searchInput.addEventListener('input', function () {
      searchQuery = this.value;
      if (clearBtn) clearBtn.style.display = searchQuery ? 'block' : 'none';
      renderDropdown(searchQuery);
      renderApp();
    });

    // Form submit listener (Mobile Keyboard "Search / Go / 前往")
    const searchForm = document.getElementById('mobile-search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const q = (searchInput.value || '').trim();
        if (q) {
          dropdown.classList.add('hidden');
          searchInput.blur();
          openStockResearch(q);
        }
      });
    }

    // Enter key listener on input
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = this.value.trim();
        if (q) {
          dropdown.classList.add('hidden');
          this.blur();
          openStockResearch(q);
        }
      }
    });

    // Dropdown selection (support touch/pointerdown & click)
    const handleDropdownSelect = function (e) {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();

      const action = item.getAttribute('data-action');
      if (action === 'select-local') {
        const sym = item.getAttribute('data-symbol');
        if (searchInput) {
          searchInput.value = sym;
          searchInput.blur();
        }
        searchQuery = sym;
        dropdown.classList.add('hidden');
        renderApp();

        // Scroll to card
        const card = document.querySelector(`.stock-card[data-symbol="${sym}"]`);
        const container = document.querySelector('.mobile-container');
        if (card && container) {
          const cardRect = card.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          smoothScrollContainer(container, Math.max(0, container.scrollTop + (cardRect.top - containerRect.top) - 110), 1000);
        }
      } else if (action === 'search-global') {
        const q = item.getAttribute('data-query');
        dropdown.classList.add('hidden');
        if (searchInput) searchInput.blur();
        openStockResearch(q);
      }
    };

    dropdown.addEventListener('pointerdown', handleDropdownSelect);
    dropdown.addEventListener('click', handleDropdownSelect);

    // Hide dropdown when tapping outside
    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('.search-box') && !e.target.closest('.search-form-wrap')) {
        dropdown.classList.add('hidden');
      }
    });

    // Modal close
    if (closeBtn) closeBtn.onclick = closeStockResearch;
    if (backdrop) backdrop.onclick = closeStockResearch;

    // 6 Quick Navigation Tabs & Modal Floating Scroll-To-Top
    const navTabsContainer = document.getElementById('res-nav-tabs');
    const researchBody = document.querySelector('.research-sheet-body');
    const modalScrollTopBtn = document.getElementById('res-modal-scroll-to-top-btn');

    if (navTabsContainer && researchBody) {
      navTabsContainer.addEventListener('click', function (e) {
        const tabBtn = e.target.closest('.res-nav-tab');
        if (!tabBtn) return;

        // Update active class
        navTabsContainer.querySelectorAll('.res-nav-tab').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');

        const targetId = tabBtn.getAttribute('data-target');
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          const targetY = targetEl.offsetTop - researchBody.offsetTop - 55;
          smoothScrollContainer(researchBody, Math.max(0, targetY), 1150);

          if (targetId === 'res-section-ai') {
            const aiInputEl = document.getElementById('res-ai-input');
            if (aiInputEl) setTimeout(() => aiInputEl.focus(), 400);
          }
        }
      });

      // Scroll listener on modal body for Scroll-To-Top button & ScrollSpy
      researchBody.addEventListener('scroll', function () {
        const top = researchBody.scrollTop;
        if (modalScrollTopBtn) {
          if (top > 160) {
            modalScrollTopBtn.classList.remove('hidden');
          } else {
            modalScrollTopBtn.classList.add('hidden');
          }
        }

        // ScrollSpy to highlight corresponding tab
        const sections = [
          'res-section-profile',
          'res-section-logic',
          'res-section-news',
          'res-section-inst',
          'res-section-tech',
          'res-section-ai'
        ];
        let currentSec = sections[0];
        for (const sId of sections) {
          const el = document.getElementById(sId);
          if (el) {
            const elTop = el.offsetTop - researchBody.offsetTop - 75;
            if (top >= elTop) {
              currentSec = sId;
            }
          }
        }
        navTabsContainer.querySelectorAll('.res-nav-tab').forEach(b => {
          if (b.getAttribute('data-target') === currentSec) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      }, { passive: true });

      // Modal Floating Scroll-To-Top button
      if (modalScrollTopBtn) {
        modalScrollTopBtn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          smoothScrollContainer(researchBody, 0, 1150);
        };
      }
    }

    // Add to iPhone Calendar Button
    if (calendarBtn) {
      calendarBtn.onclick = function () {
        if (!currentResearchStock) return;
        const sym = currentResearchStock.symbol;
        const name = currentResearchStock.name || sym;
        const dateVal = currentResearchStock.nextEarnings || currentResearchStock.nextEarningsFormatted;

        const icsUrl = `/api/calendar-ics?symbol=${encodeURIComponent(sym)}&name=${encodeURIComponent(name)}&date=${encodeURIComponent(dateVal)}`;
        
        // Trigger download / open in iOS Safari
        const link = document.createElement('a');
        link.href = icsUrl;
        link.download = `earnings-${sym}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showAlert(`正在打开 iPhone 日历日程，请在弹窗中点击“添加”`, 'success');
      };
    }

    // AI Quick Prompts
    document.querySelectorAll('.ai-chip-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const prompt = this.getAttribute('data-prompt');
        if (prompt) sendResearchAiMessage(prompt);
      });
    });

    // AI Send message
    if (aiSendBtn) {
      aiSendBtn.onclick = function () {
        if (aiInput && aiInput.value.trim()) {
          const text = aiInput.value.trim();
          aiInput.value = '';
          sendResearchAiMessage(text);
        }
      };
    }

    if (aiInput) {
      aiInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          if (aiSendBtn) aiSendBtn.click();
        }
      });
    }
  }

  async function openStockResearch(symbolOrQuery) {
    const modal = document.getElementById('stock-research-modal');
    const backdrop = document.getElementById('research-modal-backdrop');
    if (!modal || !backdrop) return;

    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');

    const researchBody = document.querySelector('.research-sheet-body');
    if (researchBody) researchBody.scrollTop = 0;
    const navTabs = document.getElementById('res-nav-tabs');
    if (navTabs) {
      navTabs.querySelectorAll('.res-nav-tab').forEach((b, idx) => {
        if (idx === 0) b.classList.add('active');
        else b.classList.remove('active');
      });
    }

    // Set Loading State
    const symEl = document.getElementById('res-modal-symbol');
    const nameEl = document.getElementById('res-modal-name');
    const mktEl = document.getElementById('res-modal-market');
    const priceEl = document.getElementById('res-modal-price');
    const chgEl = document.getElementById('res-modal-chg');
    const periodEl = document.getElementById('res-modal-period');
    const earnDateEl = document.getElementById('res-modal-earnings-date');
    const sectorEl = document.getElementById('res-m-sector');
    const indEl = document.getElementById('res-m-industry');
    const sumEl = document.getElementById('res-m-summary');

    if (symEl) symEl.textContent = symbolOrQuery.toUpperCase();
    if (nameEl) nameEl.textContent = '正在全网检索深度财报与分析数据...';
    if (mktEl) mktEl.textContent = 'SYNC';
    if (priceEl) priceEl.textContent = '--';
    if (chgEl) chgEl.textContent = '--';
    if (periodEl) periodEl.textContent = 'LOADING';
    if (earnDateEl) earnDateEl.textContent = '正在获取发布排期...';
    if (sectorEl) sectorEl.textContent = '板块: 检索中';
    if (indEl) indEl.textContent = '细分行业: 检索中';
    if (sumEl) sumEl.textContent = '正在获取公司业务模型与最新财务数据...';

    // Reset 3x3 cells
    ['mktcap', 'revgrowth', 'earngrowth', 'margin', 'roe', 'debt', 'pe', 'div', 'target'].forEach(id => {
      const el = document.getElementById(`res-m-${id}`);
      if (el) el.textContent = '...';
    });

    // Reset 5 Wind research sections
    ['business-industry', 'investment-logic', 'news-brief', 'institutional-view', 'technical-analysis'].forEach(s => {
      const el = document.getElementById(`res-m-${s}`);
      if (el) el.innerHTML = '<div class="wind-section-loading">正在提取深度研报数据...</div>';
    });

    // Reset AI History
    currentAiHistory = [];
    const aiHistoryEl = document.getElementById('res-ai-chat-history');
    if (aiHistoryEl) {
      aiHistoryEl.innerHTML = `
        <div class="ai-msg ai-msg-bot">
          您好！已为您连接 ${symbolOrQuery.toUpperCase()} 的深度投研中枢。您可以随时向我提问关于该股票的护城河、最新财报亮点或估值分析。
        </div>
      `;
    }

    try {
      const res = await fetch(`/api/stock-research?symbol=${encodeURIComponent(symbolOrQuery.trim())}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      currentResearchStock = data;

      // Sync Favorite Button State
      const existingGroup = (appState.historyRecords || []).find(g =>
        g.symbol.toUpperCase() === (data.symbol || '').toUpperCase() ||
        g.symbol.toUpperCase() === (data.rawCode || '').toUpperCase()
      );
      updateFavButtonUI(existingGroup ? !!existingGroup.isFavorite : false);

      // Populate Header
      if (symEl) symEl.textContent = data.symbol;
      if (nameEl) nameEl.textContent = data.name;
      if (mktEl) mktEl.textContent = data.market || 'GLOBAL';

      if (priceEl) {
        priceEl.textContent = data.currentPrice != null ? `${data.currency || '$'}${data.currentPrice}` : '--';
      }
      if (chgEl) {
        const chg = parseFloat(data.changePercent);
        if (!isNaN(chg)) {
          const isUp = chg >= 0;
          const isCN = data.market === 'CN';
          chgEl.textContent = `${isUp ? '+' : ''}${chg.toFixed(2)}%`;
          chgEl.style.color = (isUp ? (isCN ? 'var(--red-color, #ff453a)' : 'var(--green-color, #30d158)') : (isCN ? 'var(--green-color, #30d158)' : 'var(--red-color, #ff453a)'));
        } else {
          chgEl.textContent = '--';
          chgEl.style.color = 'var(--fg-dim)';
        }
      }

      // Period & Next Earnings
      if (periodEl) periodEl.textContent = data.periodLabel || '最新财报';
      if (earnDateEl) earnDateEl.textContent = data.nextEarningsFormatted || '暂无排期';

      // 3x3 Grid
      const m = data.metrics || {};
      const setCell = (id, val) => {
        const el = document.getElementById(`res-m-${id}`);
        if (el) el.textContent = val || 'N/A';
      };

      setCell('mktcap', m.marketCap);
      setCell('revgrowth', m.revenueGrowth);
      setCell('earngrowth', m.earningsGrowth);
      setCell('margin', m.profitMargins);
      setCell('roe', m.returnOnEquity);
      setCell('debt', m.debtToEquity);
      setCell('pe', m.pe !== 'N/A' && m.forwardPe !== 'N/A' ? `${m.pe} / ${m.forwardPe}` : (m.pe || 'N/A'));
      setCell('div', m.dividendYield);
      setCell('target', m.targetMeanPrice !== 'N/A' ? `${data.currency || '$'}${m.targetMeanPrice}` : 'N/A');

      // Sector & Industry
      const prof = data.companyProfile || {};
      if (sectorEl) sectorEl.textContent = `Sector: ${prof.sector || '科技 / 综合'}`;
      if (indEl) indEl.textContent = `Industry: ${prof.industry || '核心赛道'}`;

      // 1. Business & Industry (Wind Style)
      const bizEl = document.getElementById('res-m-business-industry');
      if (bizEl && data.businessIndustry) {
        const bi = data.businessIndustry;
        let html = '';
        if (bi.coreHeadline) html += `<div class="wind-headline">${escapeHtml(bi.coreHeadline)}</div>`;
        if (bi.coreBullets && bi.coreBullets.length) {
          html += `<div class="wind-bullet-list">`;
          bi.coreBullets.forEach(b => html += `<div class="wind-bullet-item">${escapeHtml(b)}</div>`);
          html += `</div>`;
        }
        if (bi.industryHeadline) html += `<div class="wind-subhead">${escapeHtml(bi.industryHeadline)}</div>`;
        if (bi.industryBullets && bi.industryBullets.length) {
          html += `<div class="wind-bullet-list">`;
          bi.industryBullets.forEach(b => html += `<div class="wind-bullet-item">${escapeHtml(b)}</div>`);
          html += `</div>`;
        }
        bizEl.innerHTML = html;
      }

      // 2. Investment Logic (Wind Style)
      const logicEl = document.getElementById('res-m-investment-logic');
      if (logicEl && data.investmentLogic) {
        const il = data.investmentLogic;
        let html = '';
        if (il.coreHeadline) html += `<div class="wind-headline">${escapeHtml(il.coreHeadline)}</div>`;
        if (il.coreBullets && il.coreBullets.length) {
          html += `<div class="wind-bullet-list">`;
          il.coreBullets.forEach(b => html += `<div class="wind-bullet-item">${escapeHtml(b)}</div>`);
          html += `</div>`;
        }
        if (il.shortTermHeadline) html += `<div class="wind-subhead">${escapeHtml(il.shortTermHeadline)}</div>`;
        if (il.shortTermBullets && il.shortTermBullets.length) {
          html += `<div class="wind-bullet-list">`;
          il.shortTermBullets.forEach(b => html += `<div class="wind-bullet-item">${escapeHtml(b)}</div>`);
          html += `</div>`;
        }
        if (il.longTermHeadline) html += `<div class="wind-subhead">${escapeHtml(il.longTermHeadline)}</div>`;
        if (il.longTermBullets && il.longTermBullets.length) {
          html += `<div class="wind-bullet-list">`;
          il.longTermBullets.forEach(b => html += `<div class="wind-bullet-item">${escapeHtml(b)}</div>`);
          html += `</div>`;
        }
        if (il.valuationHeadline) html += `<div class="wind-subhead">${escapeHtml(il.valuationHeadline)}</div>`;
        if (il.valuationBullets && il.valuationBullets.length) {
          html += `<div class="wind-bullet-list">`;
          il.valuationBullets.forEach(b => html += `<div class="wind-bullet-item">${escapeHtml(b)}</div>`);
          html += `</div>`;
        }
        logicEl.innerHTML = html;
      }

      // 2. News Brief
      const newsEl = document.getElementById('res-m-news-brief');
      if (newsEl && data.newsBrief) {
        let html = '';
        data.newsBrief.forEach(n => {
          html += `
            <div class="wind-news-item">
              <div class="wind-news-title-row">
                <span class="wind-news-title">${escapeHtml(n.title)}</span>
                <span class="wind-news-date">${escapeHtml(n.time || '')}</span>
              </div>
              <div class="wind-news-summary">${escapeHtml(n.summary || '')}</div>
            </div>
          `;
        });
        newsEl.innerHTML = html;
      }

      // 3. Institutional View
      const instEl = document.getElementById('res-m-institutional-view');
      if (instEl && data.institutionalView) {
        let html = '';
        data.institutionalView.forEach(v => {
          html += `
            <div class="wind-inst-block">
              <div class="wind-inst-title">${escapeHtml(v.title)}</div>
              <div class="wind-inst-body">${escapeHtml(v.body || '')}</div>
            </div>
          `;
        });
        instEl.innerHTML = html;
      }

      // 4. Technical Analysis
      const techEl = document.getElementById('res-m-technical-analysis');
      if (techEl && data.technicalAnalysis) {
        const ta = data.technicalAnalysis;
        let html = `
          <div class="wind-tech-grid">
            <div class="wind-tech-card">
              <span class="wind-tech-label">关键支撑区间</span>
              <span class="wind-tech-val">${escapeHtml(ta.supportBand || '--')}</span>
            </div>
            <div class="wind-tech-card">
              <span class="wind-tech-label">第一阻力区间</span>
              <span class="wind-tech-val">${escapeHtml(ta.resistanceBand || '--')}</span>
            </div>
            <div class="wind-tech-card">
              <span class="wind-tech-label">中期趋势信号</span>
              <span class="wind-tech-val" style="font-size:0.75rem;">${escapeHtml(ta.trendSignal || '--')}</span>
            </div>
            <div class="wind-tech-card">
              <span class="wind-tech-label">RSI 强弱状态</span>
              <span class="wind-tech-val" style="font-size:0.75rem;">${escapeHtml(ta.rsiStatus || '--')}</span>
            </div>
          </div>
        `;
        if (ta.bullets && ta.bullets.length) {
          html += `<div class="wind-bullet-list">`;
          ta.bullets.forEach(b => html += `<div class="wind-bullet-item">${escapeHtml(b)}</div>`);
          html += `</div>`;
        }
        techEl.innerHTML = html;
      }

    } catch (err) {
      console.error('[Research] Load error:', err);
      if (nameEl) nameEl.textContent = `检索失败: ${err.message}`;
      if (sumEl) sumEl.textContent = '未能加载该股票的财务与业务数据，请检查股票代码或网络连接。';
    }
  }

  function closeStockResearch() {
    const modal = document.getElementById('stock-research-modal');
    const backdrop = document.getElementById('research-modal-backdrop');
    if (modal) modal.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
    currentResearchStock = null;

    // Reset search input and search query so the homepage data list is always restored to full original state
    const searchInput = document.getElementById('mobile-search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    const dropdown = document.getElementById('search-autocomplete-dropdown');
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (dropdown) dropdown.classList.add('hidden');
    searchQuery = '';
    renderApp();
  }

  async function sendResearchAiMessage(promptText) {
    if (!promptText || !promptText.trim()) return;
    const text = promptText.trim();
    const aiHistoryEl = document.getElementById('res-ai-chat-history');
    if (!aiHistoryEl) return;

    // Append user message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-msg ai-msg-user';
    userMsg.textContent = text;
    aiHistoryEl.appendChild(userMsg);

    // Append loading bot message
    const botMsg = document.createElement('div');
    botMsg.className = 'ai-msg ai-msg-bot';
    botMsg.textContent = '正在分析财报指标与核心基本面...';
    aiHistoryEl.appendChild(botMsg);
    aiHistoryEl.scrollTop = aiHistoryEl.scrollHeight;

    currentAiHistory.push({ role: 'user', text: text });

    try {
      const apiKey = localStorage.getItem('geminiApiKey') || '';
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          symbol: currentResearchStock?.symbol || '',
          stockContext: currentResearchStock,
          history: currentAiHistory.slice(0, -1),
          apiKey: apiKey
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      botMsg.textContent = data.reply || '已完成分析。';
      currentAiHistory.push({ role: 'model', text: data.reply });
      aiHistoryEl.scrollTop = aiHistoryEl.scrollHeight;
    } catch (err) {
      console.error('[AI] Chat error:', err);
      botMsg.textContent = `分析请求失败: ${err.message}`;
    }
  }

  // Init
  document.addEventListener('DOMContentLoaded', function () {
    loadFromCache();
    initListeners();
    setupGlobalStockResearchAndSearch();
    fetchLatestData();
    setupEventStream();
  });
})();
