
function replayAllAnimations() {
    document.body.classList.add('disable-animations');
    document.body.offsetHeight; // trigger reflow
    document.body.classList.remove('disable-animations');
}
// Market detection helper
function getMarketInfo(symbol) {
    if (!symbol) return { currency: '¥', upColor: '#ff453a', downColor: '#32d74b', market: 'cn' };
    const s = symbol.trim().toUpperCase();
    // A-share: 6-digit number
    if (/^\d{6}$/.test(s)) return { currency: '¥', upColor: '#ff453a', downColor: '#32d74b', market: 'cn' };
    // HK stock: 5-digit number (e.g. 00700)
    if (/^\d{5}$/.test(s)) return { currency: 'HK$', upColor: '#32d74b', downColor: '#ff453a', market: 'hk' };
    // SH/SZ prefix A-share
    if (/^(SH|SZ)\d/.test(s)) return { currency: '¥', upColor: '#ff453a', downColor: '#32d74b', market: 'cn' };
    // US stock: letters only (or letters + digits like BRK.B)
    return { currency: '$', upColor: '#32d74b', downColor: '#ff453a', market: 'us' };
}

// Global state
let currentCurrency = '¥';
let historyRecords = [];
let historyVersion = null;
let customLabels = [];
const NEWS_CACHE = {};
const INDUSTRY_MAPPING = {
  "元件": "459", "动物保健Ⅱ": "1254", "航空机场": "420", "银行Ⅱ": "475", "电池": "1033",
  "煤炭开采": "1250", "软件开发": "737", "一般零售": "482", "半导体": "1036", "旅游零售Ⅱ": "1269",
  "酒店餐饮": "1271", "专业服务": "1043", "旅游及景区": "1272", "化学制品": "538", "食品加工": "1280",
  "专用设备": "910", "汽车零部件": "481", "商用车": "1264", "计算机设备": "735", "消费电子": "1037",
  "房地产服务": "1045", "医疗器械": "1041", "广告营销": "1220", "证券Ⅱ": "473", "电网设备": "457",
  "家居用品": "440", "通用设备": "545", "服装家纺": "1225", "休闲食品": "1281", "工业金属": "1287",
  "普钢": "1226", "IT服务Ⅱ": "1238", "黑色家电": "1241", "航天装备Ⅱ": "1232", "其他家电Ⅱ": "1243",
  "医药商业": "1042", "中药Ⅱ": "1040", "保险Ⅱ": "474", "基础建设": "1247", "其他电源设备Ⅱ": "1034",
  "光伏设备": "1031", "通信设备": "448", "房地产开发": "451", "房屋建设Ⅱ": "1246", "生物制品": "1044",
  "环境治理": "1235", "多元金融": "738", "养殖业": "1259", "农产品加工": "1256", "光学光电子": "1038",
  "白酒Ⅱ": "1277", "教育": "740", "化妆品": "1252", "互联网电商": "1268", "电力": "428", "游戏Ⅱ": "1046",
  "能源金属": "1015", "物流": "422", "造纸": "1267", "数字媒体": "1221", "非金属材料Ⅱ": "1020",
  "工程机械": "739", "小金属": "1027", "环保设备Ⅱ": "1234", "医疗美容": "1253", "其他电子Ⅱ": "1223",
  "水泥": "424", "风电设备": "1032", "化学制药": "465", "农业综合Ⅱ": "1257", "汽车服务": "1016",
  "油气开采Ⅱ": "1276", "乘用车": "1262", "装修建材": "476", "贵金属": "732", "贸易Ⅱ": "484",
  "小家电": "1244", "通信服务": "736", "化学原料": "1019", "航运港口": "450", "农化制品": "731",
  "航空装备Ⅱ": "1231", "化学纤维": "471", "医疗服务": "727", "冶钢原料": "1228", "饮料乳品": "1282",
  "橡胶": "1018", "燃气Ⅱ": "1028", "非白酒": "1279", "炼化及贸易": "1274", "综合Ⅱ": "539",
  "种植业": "1261", "个护用品": "1251", "体育Ⅱ": "1273", "饲料": "1258", "纺织制造": "1224",
  "白色家电": "1239", "金属新材料": "1288", "包装印刷": "1265", "铁路公路": "421", "油服工程": "1275",
  "装修装饰Ⅱ": "725", "自动化设备": "1237", "厨卫电器": "1240", "航海装备Ⅱ": "1230", "摩托车及其他": "1263",
  "饰品": "734", "文娱用品": "1266"
};
const historyListEl = document.getElementById('history-list');
const currencyRadios = document.getElementsByName('currency');
const currencySymbols = document.querySelectorAll('.currency-symbol');

// Persistence Logic
function saveState() {
    // Strip runtime-only fields that should not persist between sessions
    const cleanRecords = historyRecords.map(group => {
        const { newsLoaded, newsTimeout, klineMetrics, ...cleanGroup } = group;
        return cleanGroup;
    });
    const stateObj = {
        historyRecords: cleanRecords,
        historyVersion: '2',
        customLabels: customLabels,
        calcInputs: {
            currency: currentCurrency,
            stock1: stockSymbol1Input.value,
            basePrice: basePriceInput.value,
            moveDown: document.getElementById('move-down').checked,
            percentChange: percentageChangeInput.value,
            stock2: stockSymbol2Input.value,
            initialPrice: initialPriceInput.value,
            finalPrice: finalPriceInput.value
        }
    };
    if (window.electronAPI && window.electronAPI.saveData) {
        window.electronAPI.saveData(JSON.stringify(stateObj));
    } else {
        localStorage.setItem('calcHistory', JSON.stringify(cleanRecords));
        localStorage.setItem('calcHistoryVersion', '2');
        localStorage.setItem('calcInputs', JSON.stringify(stateObj.calcInputs));
    }
}

// Currency Switcher Logic
function updateCurrency() {
    let selected = 'CNY';
    for (const radio of currencyRadios) {
        if (radio.checked) {
            selected = radio.value;
            break;
        }
    }
    const navToggle = document.getElementById('nav-currency-toggle');
    if (navToggle) {
        navToggle.textContent = selected;
    }

    currentCurrency = selected === 'CNY' ? '¥' : '$';
    
    if (currentCurrency === '¥') {
        document.documentElement.style.setProperty('--up-color', '#ff453a');
        document.documentElement.style.setProperty('--down-color', '#32d74b');
    } else {
        document.documentElement.style.setProperty('--up-color', '#32d74b');
        document.documentElement.style.setProperty('--down-color', '#ff453a');
    }

    currencySymbols.forEach(symbol => {
        symbol.textContent = currentCurrency;
    });

    calculateTargetPrice();
    calculatePercentage();
    saveState();
}

currencyRadios.forEach(radio => radio.addEventListener('change', updateCurrency));

const navCurrencyToggle = document.getElementById('nav-currency-toggle');
if (navCurrencyToggle) {
    navCurrencyToggle.addEventListener('click', () => {
        const isCNY = navCurrencyToggle.textContent === 'CNY';
        navCurrencyToggle.textContent = isCNY ? 'USD' : 'CNY';
        const targetRadio = document.getElementById(isCNY ? 'currency-usd' : 'currency-cny');
        if (targetRadio) {
            targetRadio.checked = true;
            updateCurrency();
        }
    });
}

const navItems = document.querySelectorAll('.nav-links .nav-item:not(.currency-nav-item)');
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
    });
});


function formatCurrency(value) {
    return value.toFixed(4).replace(/\.?0+$/, ''); 
}

// Removed tab switching logic as requested

// Mode 1: Target Price Logic
const stockSymbol1Input = document.getElementById('stock-symbol-1');
const basePriceInput = document.getElementById('base-price');
const movementRadios = document.getElementsByName('movement');
const percentageChangeInput = document.getElementById('percentage-change');
const targetResultEl = document.getElementById('target-result');
const saveTargetBtn = document.getElementById('save-target-btn');
const clearTargetBtn = document.getElementById('clear-target-btn');
const reuseTargetBtn = document.getElementById('reuse-target-btn');
const reuseBaseBtn = document.getElementById('reuse-base-btn');

reuseBaseBtn.addEventListener('click', () => {
    const currentBase = parseFloat(basePriceInput.value);
    const percentage = parseFloat(percentageChangeInput.value);
    
    if (!isNaN(currentBase) && currentBase > 0) {
        if (!isNaN(percentage)) {
            let isUp = true;
            for (const radio of movementRadios) {
                if (radio.checked && radio.value === 'down') {
                    isUp = false;
                    break;
                }
            }

            let newBase = currentBase;
            if (isUp) {
                newBase = currentBase / (1 + percentage / 100);
            } else {
                if (percentage !== 100) {
                    newBase = currentBase / (1 - percentage / 100);
                }
            }
            basePriceInput.value = formatCurrency(newBase);
        }
        handleInput();
    }
});

reuseTargetBtn.addEventListener('click', () => {
    if (currentTargetPrice > 0) {
        basePriceInput.value = formatCurrency(currentTargetPrice);
        handleInput();
    }
});

let currentTargetPrice = 0;
let currentTargetIsUp = true;

function calculateTargetPrice() {
    const basePrice = parseFloat(basePriceInput.value);
    const percentage = parseFloat(percentageChangeInput.value);
    
    let isUp = true;
    for (const radio of movementRadios) {
        if (radio.checked && radio.value === 'down') {
            isUp = false;
            break;
        }
    }

    currentTargetIsUp = isUp;

    if (isNaN(basePrice) || isNaN(percentage)) {
        targetResultEl.innerHTML = `<span class="currency-symbol">${currentCurrency}</span>0.00`;
        targetResultEl.className = 'result-value mono';
        currentTargetPrice = 0;
        return;
    }

    const multiplier = isUp ? (1 + percentage / 100) : (1 - percentage / 100);
    currentTargetPrice = basePrice * multiplier;

    targetResultEl.innerHTML = `<span class="currency-symbol">${currentCurrency}</span>${formatCurrency(currentTargetPrice)}`;
    
    if (isUp) {
        targetResultEl.className = 'result-value mono text-up';
    } else {
        targetResultEl.className = 'result-value mono text-down';
    }
}

// Mode 2: Percentage Logic
const stockSymbol2Input = document.getElementById('stock-symbol-2');
const initialPriceInput = document.getElementById('initial-price');
const finalPriceInput = document.getElementById('final-price');
const percentageResultEl = document.getElementById('percentage-result');
const percentageMovementTypeEl = document.getElementById('percentage-movement-type');
const savePercentageBtn = document.getElementById('save-percentage-btn');
const clearPercentageBtn = document.getElementById('clear-percentage-btn');
const reuseInitialBtn = document.getElementById('reuse-initial-btn');
const reuseFinalBtn = document.getElementById('reuse-final-btn');
const reuseCalcPercBtn = document.getElementById('reuse-calc-perc-btn');

reuseCalcPercBtn.addEventListener('click', () => {
    if (!isNaN(currentPercentage)) {
        percentageChangeInput.value = Math.abs(currentPercentage).toFixed(2);
        if (currentPercentage >= 0) {
            document.getElementById('move-up').checked = true;
        } else {
            document.getElementById('move-down').checked = true;
        }
        handleInput();
    }
});

reuseInitialBtn.addEventListener('click', () => {
    const initialVal = parseFloat(initialPriceInput.value);
    const finalVal = parseFloat(finalPriceInput.value);
    if (!isNaN(initialVal) && initialVal > 0 && !isNaN(finalVal)) {
        const pctDecimal = (finalVal - initialVal) / initialVal;
        if (pctDecimal === -1) return;
        
        const newFinal = initialVal;
        const newInitial = newFinal / (1 + pctDecimal);
        
        initialPriceInput.value = formatCurrency(newInitial);
        finalPriceInput.value = formatCurrency(newFinal);
        handleInput();
    }
});

reuseFinalBtn.addEventListener('click', () => {
    const initialVal = parseFloat(initialPriceInput.value);
    const finalVal = parseFloat(finalPriceInput.value);
    if (!isNaN(initialVal) && initialVal > 0 && !isNaN(finalVal) && finalVal > 0) {
        const pctDecimal = (finalVal - initialVal) / initialVal;
        
        const newInitial = finalVal;
        const newFinal = newInitial * (1 + pctDecimal);
        
        initialPriceInput.value = formatCurrency(newInitial);
        finalPriceInput.value = formatCurrency(newFinal);
        handleInput();
    }
});

let currentPercentage = 0;

function calculatePercentage() {
    const initialPrice = parseFloat(initialPriceInput.value);
    const finalPrice = parseFloat(finalPriceInput.value);

    if (isNaN(initialPrice) || isNaN(finalPrice) || initialPrice === 0) {
        percentageResultEl.textContent = '0.00%';
        percentageResultEl.className = 'result-value mono';
        percentageMovementTypeEl.textContent = '-';
        percentageMovementTypeEl.className = 'result-movement mono';
        currentPercentage = 0;
        return;
    }

    const difference = finalPrice - initialPrice;
    currentPercentage = (difference / initialPrice) * 100;
    
    const formattedPercentage = Math.abs(currentPercentage).toFixed(2) + '%';
    percentageResultEl.textContent = formattedPercentage;

    if (currentPercentage > 0) {
        percentageResultEl.className = 'result-value mono text-up';
        percentageMovementTypeEl.textContent = 'Up Rise';
        percentageMovementTypeEl.className = 'result-movement mono text-up';
    } else if (currentPercentage < 0) {
        percentageResultEl.className = 'result-value mono text-down';
        percentageMovementTypeEl.textContent = 'Down Fall';
        percentageMovementTypeEl.className = 'result-movement mono text-down';
    } else {
        percentageResultEl.className = 'result-value mono';
        percentageMovementTypeEl.textContent = 'No Change';
        percentageMovementTypeEl.className = 'result-movement mono';
    }
}

// Input Listeners
function handleInput() {
    calculateTargetPrice();
    calculatePercentage();
    saveState();
}

[
    stockSymbol1Input, basePriceInput, percentageChangeInput,
    stockSymbol2Input, initialPriceInput, finalPriceInput
].forEach(input => input.addEventListener('input', handleInput));

movementRadios.forEach(radio => radio.addEventListener('change', handleInput));

// Clear Buttons
clearTargetBtn.addEventListener('click', () => {
    stockSymbol1Input.value = '';
    basePriceInput.value = '';
    percentageChangeInput.value = '';
    document.getElementById('move-up').checked = true;
    handleInput();
});

clearPercentageBtn.addEventListener('click', () => {
    stockSymbol2Input.value = '';
    initialPriceInput.value = '';
    finalPriceInput.value = '';
    handleInput();
});
let isRenderingHistory = false;
let hasRenderedHistoryBefore = false;

// History Logic
function stripAnimationsForDrag() {
    document.querySelectorAll('.animate-stagger-row').forEach(el => {
        el.classList.remove('animate-stagger-row');
        el.style.animation = 'none';
        el.style.opacity = '1';
    });
}

function renderHistory(scrollToSymbol = null) {
    if (isRenderingHistory) return;
    isRenderingHistory = true;
    
    const animClass = hasRenderedHistoryBefore ? '' : ' animate-stagger-row';
    
    const prevScrollTop = historyListEl.scrollTop;

    try {
        const tagsEl = document.getElementById('quick-tags');
        if (tagsEl) tagsEl.innerHTML = '';

        if (historyRecords.length === 0) {
            historyListEl.innerHTML = '<p class="empty-history">No history yet.</p>';
            return;
        }

        historyListEl.innerHTML = '';
        
        historyRecords.forEach((group, groupIndex) => {
        if (tagsEl) {
            const tag = document.createElement('button');
            tag.className = 'quick-tag mono';
            
            let tagText = group.symbol;
            if (group.name) {
                const cleanName = group.name.replace(/\s+/g, '');
                const hasChinese = /[\u4e00-\u9fa5]/.test(cleanName);
                if (hasChinese) {
                    tagText = cleanName.length <= 3 ? cleanName : cleanName.substring(0, 2);
                }
                // For non-Chinese (US/HK stocks), keep the symbol as-is
            }
            tag.textContent = tagText;
            
            // Re-apply the priority dot color to the tag border/text if we want, or just leave it gray
            if (group.records[0] && group.records[0].urgency) {
                const colors = {
                    'green': '#32d74b',
                    'orange': '#ff9f0a',
                    'red': '#ff453a'
                };
                tag.style.color = colors[group.records[0].urgency];
                tag.style.borderColor = colors[group.records[0].urgency];
            }
            
            tag.draggable = true;
            tag.dataset.symbol = group.symbol;
            
            tag.addEventListener('dragstart', (e) => {
                if (e.target !== tag) return;
                stripAnimationsForDrag();
                tag.classList.add('dragging-tag');
                e.dataTransfer.effectAllowed = 'move';
            });

            tag.addEventListener('dragend', (e) => {
                if (e.target !== tag) return;
                tag.classList.remove('dragging-tag');
                updateArrayFromDOMTags();
                historyRecords.forEach(g => {
                    const groupNode = historyListEl.querySelector(`[data-symbol="${g.symbol}"]`);
                    if (groupNode) {
                        // Prevent re-animating when appending
                        groupNode.querySelectorAll('.animate-stagger-row').forEach(el => {
                            el.classList.remove('animate-stagger-row');
                            el.style.animation = 'none';
                            el.style.opacity = '1';
                        });
                        historyListEl.appendChild(groupNode);
                    }
                });
                saveState();
            });

            tag.onclick = () => {
                const targetGroup = historyListEl.querySelector(`[data-symbol="${group.symbol}"]`);
                if (targetGroup) {
                    targetGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            };
            tagsEl.appendChild(tag);
        }

        const groupEl = document.createElement('div');
        groupEl.className = 'history-group';
        groupEl.dataset.symbol = group.symbol;
        
        // Auto-detect market and apply per-card color variables
        const mktInfo = getMarketInfo(group.symbol);
        groupEl.style.setProperty('--up-color', mktInfo.upColor);
        groupEl.style.setProperty('--down-color', mktInfo.downColor);
        groupEl.dataset.market = mktInfo.market;
        
        const baseDelay = 0.3 + groupIndex * 0.15;
        groupEl.draggable = true;
        
        groupEl.addEventListener('dragstart', (e) => {
            if (e.target !== groupEl) return;
            stripAnimationsForDrag();
            groupEl.classList.add('dragging-group');
            e.dataTransfer.effectAllowed = 'move';
        });

        groupEl.addEventListener('dragend', (e) => {
            if (e.target !== groupEl) return;
            groupEl.classList.remove('dragging-group');
            updateArrayFromDOM();
            const tagsEl = document.getElementById('quick-tags');
            if (tagsEl) {
                historyRecords.forEach(g => {
                    const tagNode = tagsEl.querySelector(`[data-symbol="${g.symbol}"]`);
                    if (tagNode) {
                        tagNode.style.animation = 'none';
                        tagsEl.appendChild(tagNode);
                    }
                });
            }
            saveState();
        });
        
        const headerEl = document.createElement('div');
        headerEl.className = 'group-header' + animClass;
        headerEl.style.animationDelay = `${(baseDelay + 0 * 0.1).toFixed(2)}s`;
        const titleEl = document.createElement('div');
        titleEl.className = 'group-title-container';
        
        if (group.symbol !== 'Uncategorized') {
            const chartUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(group.symbol)}`;
            
            const codeSpan = document.createElement('span');
            codeSpan.className = 'stock-code stock-link';
            codeSpan.textContent = group.symbol;
            codeSpan.title = "Click to edit code";
            codeSpan.style.cursor = "pointer";
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'stock-name stock-link';
            nameSpan.textContent = group.name ? group.name : '';
            nameSpan.style.marginLeft = '8px';
            nameSpan.title = "Click to edit, Double-click to open chart";
            nameSpan.style.cursor = "pointer";
            
            titleEl.appendChild(codeSpan);
            titleEl.appendChild(nameSpan);
            
            const makeEditable = (spanEl, initialValue, onSave) => {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'edit-symbol-input mono';
                input.value = initialValue;
                input.style.fontSize = 'inherit';
                input.style.fontWeight = 'inherit';
                input.style.color = 'inherit';
                input.style.background = 'transparent';
                input.style.border = '1px solid var(--border-color)';
                input.style.borderRadius = '4px';
                input.style.outline = 'none';
                input.style.width = '100px';
                input.style.padding = '0 4px';
                input.style.margin = '0';
                
                spanEl.textContent = '';
                spanEl.appendChild(input);
                input.focus();
                input.select();
                
                let saved = false;
                const finishEdit = () => {
                    if (saved) return;
                    saved = true;
                    onSave(input.value);
                };
                
                input.addEventListener('blur', finishEdit);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') finishEdit();
                    if (e.key === 'Escape') {
                        saved = true;
                        onSave(initialValue); // cancel
                    }
                });
            };

            codeSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                if (codeSpan.querySelector('input')) return;
                makeEditable(codeSpan, group.symbol, (newVal) => {
                    newVal = newVal.trim().toUpperCase();
                    if (newVal && newVal !== group.symbol) {
                        const oldSymbol = group.symbol;
                        group.symbol = newVal;
                        group.records.forEach(r => {
                            r.symbol = newVal;
                            // Auto-update currency based on new symbol
                            r.currency = getMarketInfo(newVal).currency;
                        });
                        group.name = '';
                        group.nameFetched = false;
                        
                        // Clear news cache for both old and new symbol so it reloads fresh
                        delete NEWS_CACHE[oldSymbol];
                        delete NEWS_CACHE[newVal];
                        
                        const existingGroupIndex = historyRecords.findIndex(g => g !== group && g.symbol === newVal);
                        if (existingGroupIndex !== -1) {
                            historyRecords[existingGroupIndex].records.unshift(...group.records);
                            historyRecords = historyRecords.filter(g => g !== group);
                        }
                        saveState();
                        renderHistory();
                    } else {
                        codeSpan.textContent = group.symbol;
                    }
                });
            });
            
            let nameClickTimeout = null;
            nameSpan.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                e.stopPropagation();
                
                if (nameClickTimeout) {
                    clearTimeout(nameClickTimeout);
                    nameClickTimeout = null;
                    window.open(chartUrl, '_blank');
                } else {
                    nameClickTimeout = setTimeout(() => {
                        nameClickTimeout = null;
                        if (nameSpan.querySelector('input')) return;
                        makeEditable(nameSpan, group.name || '', (newVal) => {
                            newVal = newVal.trim();
                            if (newVal !== (group.name || '')) {
                                group.name = newVal;
                                saveState();
                                nameSpan.textContent = newVal;
                                
                                const tagEl = document.getElementById('quick-tags')?.querySelector(`[data-symbol="${group.symbol}"]`);
                                if (tagEl) {
                                    const cleanName = newVal.replace(/\s+/g, '');
                                    const hasChinese = /[\u4e00-\u9fa5]/.test(cleanName);
                                    tagEl.textContent = hasChinese
                                        ? (cleanName.length <= 3 ? cleanName : cleanName.substring(0, 2))
                                        : group.symbol;
                                }
                            } else {
                                nameSpan.textContent = group.name || '';
                            }
                        });
                    }, 250);
                }
            });

            if (!group.name && !group.nameFetched) {
                group.nameFetched = true;
                fetchStockName(group.symbol).then(name => {
                    if (name) {
                        group.name = name;
                        saveState();
                        nameSpan.textContent = name;
                        
                        const tagEl = document.getElementById('quick-tags')?.querySelector(`[data-symbol="${group.symbol}"]`);
                        if (tagEl) {
                            const cleanName = name.replace(/\s+/g, '');
                            const hasChinese = /[\u4e00-\u9fa5]/.test(cleanName);
                            tagEl.textContent = hasChinese
                                ? (cleanName.length <= 3 ? cleanName : cleanName.substring(0, 2))
                                : group.symbol;
                        }
                    }
                });
            }
        } else {
            titleEl.textContent = group.symbol;
        }
            
        const deleteGroupBtn = document.createElement('button');
        deleteGroupBtn.className = 'delete-btn';
        deleteGroupBtn.title = 'Delete Group';
        deleteGroupBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        deleteGroupBtn.onclick = () => {
            const currentGroupIndex = historyRecords.indexOf(group);
            if (currentGroupIndex > -1) {
                historyRecords.splice(currentGroupIndex, 1);
            }
            groupEl.remove();
            const tagEl = document.getElementById('quick-tags')?.querySelector(`[data-symbol="${group.symbol}"]`);
            if (tagEl) tagEl.remove();
            saveState();
        };
        
        const urgencyContainer = document.createElement('div');
        urgencyContainer.className = 'urgency-dots';
        
        const colors = ['green', 'orange', 'red'];
        colors.forEach((color) => {
            const dot = document.createElement('button');
            dot.className = `urgency-dot ${color}`;
            // If the first record has urgency, they all do, or group.records[0].urgency
            if (group.records[0].urgency === color) {
                dot.classList.add('selected');
            }
            dot.onclick = (e) => {
                e.stopPropagation();
                const isSelected = dot.classList.contains('selected');
                group.records.forEach(r => r.urgency = isSelected ? null : color);
                
                const allDots = urgencyContainer.querySelectorAll('.urgency-dot');
                allDots.forEach(d => d.classList.remove('selected'));
                if (!isSelected) {
                    dot.classList.add('selected');
                }
                
                const tagEl = document.getElementById('quick-tags')?.querySelector(`[data-symbol="${group.symbol}"]`);
                if (tagEl) {
                    if (isSelected) {
                        tagEl.style.color = '';
                        tagEl.style.borderColor = '';
                    } else {
                        const colors = {
                            'green': '#32d74b',
                            'orange': '#ff9f0a',
                            'red': '#ff453a'
                        };
                        tagEl.style.color = colors[color];
                        tagEl.style.borderColor = colors[color];
                    }
                }
                
                saveState();
            };
            urgencyContainer.appendChild(dot);
        });

        const headerActions = document.createElement('div');
        headerActions.className = 'header-actions';
        headerActions.appendChild(urgencyContainer);
        headerActions.appendChild(deleteGroupBtn);
        
        headerEl.appendChild(titleEl);
    
    const statsEl = document.createElement('div');
    statsEl.className = 'group-stats';
    
    
    
    
    
    statsEl.innerHTML = `
        <span style="margin-left:10px;">C:</span>
        <input type="text" placeholder="--" class="stat-input group-cost-input" value="${group.cost || ''}" />
        <span style="margin-left:10px;">Q:</span>
        <input type="text" placeholder="--" class="stat-input group-qty-input" value="${group.qty || ''}" />
    `;
    headerEl.insertBefore(statsEl, titleEl.nextSibling); // Insert right after titleEl

    const costInput = statsEl.querySelector('.group-cost-input');
    const qtyInput = statsEl.querySelector('.group-qty-input');

    costInput.addEventListener('input', (e) => {
        group.cost = e.target.value;
        saveState();
    });
    qtyInput.addEventListener('input', (e) => {
        group.qty = e.target.value;
        saveState();
    });

    // Pause drag during input hover
    const pauseDrag = () => { groupEl.setAttribute('draggable', 'false'); };
    const resumeDrag = () => { groupEl.setAttribute('draggable', 'true'); };
    
    statsEl.addEventListener('mouseenter', pauseDrag);
    statsEl.addEventListener('mouseleave', resumeDrag);
    
    headerEl.appendChild(headerActions);
            
        const listEl = document.createElement('div');
        listEl.className = 'group-list';
        
        group.records.forEach((record, itemIndex) => {
            const item = document.createElement('div');
            item.className = 'list-row history-item' + animClass;
            item.style.animationDelay = `${(baseDelay + (3 + itemIndex) * 0.1).toFixed(2)}s`;
            if (record.highlighted) {
                item.classList.add('highlighted');
            }
            item.draggable = true;
            item.dataset.groupIndex = groupIndex;
            item.dataset.itemIndex = itemIndex;
            
            const recCurrency = record.currency || (record.result && record.result.includes('$') ? '$' : '¥');
            const upColor = recCurrency === '¥' ? '#ff453a' : '#32d74b';
            const downColor = recCurrency === '¥' ? '#32d74b' : '#ff453a';
            const resultColor = record.isUp ? upColor : downColor;

            if (applyDynamicBindings(group, record)) {
                recalculateRecord(record);
            }
            
            let formattedDetails = record.details;
            
            if (!record.inputs) {
                if (record.type === 'Target Price' || record.type === 'Target Projection' || (record.details && (record.details.includes('Up ') || record.details.includes('Down ')))) {
                    const baseMatch = record.details && record.details.match(/Base:\s*.\s*([\d.]+)/);
                    const percMatch = record.details && record.details.match(/(Up|Down)\s+([\d.]+)%/);
                    if (baseMatch && percMatch) {
                        record.inputs = {
                            base: parseFloat(baseMatch[1]),
                            perc: parseFloat(percMatch[2]),
                            isUp: percMatch[1] === 'Up'
                        };
                    }
                } else {
                    const initialMatch = record.details && record.details.match(/Base:\s*.\s*([\d.]+)/);
                    const finalMatch = record.details && record.details.match(/Target:\s*.\s*([\d.]+)/);
                    if (initialMatch && finalMatch) {
                        record.inputs = {
                            initial: parseFloat(initialMatch[1]),
                            final: parseFloat(finalMatch[2])
                        };
                    }
                }
            }

            if (record.inputs && record.inputs.base !== undefined) {
                const upDownText = record.inputs.isUp ? 'Up' : 'Down';
                formattedDetails = `<span>Base: ${recCurrency}<span class="edit-trigger-val" data-field="base"><span class="edit-container-val">${record.inputs.base}</span></span></span><span><span class="editable-toggle" data-field="isUp">${upDownText}</span> <span class="edit-trigger-val" data-field="perc"><span class="edit-container-val">${record.inputs.perc}</span>%</span></span>`;
            } else if (record.inputs && record.inputs.initial !== undefined) {
                formattedDetails = `<span>Base: ${recCurrency}<span class="edit-trigger-val" data-field="initial"><span class="edit-container-val">${record.inputs.initial}</span></span></span><span>Target: ${recCurrency}<span class="edit-trigger-val" data-field="final"><span class="edit-container-val">${record.inputs.final}</span></span></span>`;
            } else {
                if (formattedDetails && formattedDetails.includes(' | ')) {
                    const parts = formattedDetails.split(' | ');
                    formattedDetails = `<span>${parts[0]}</span><span>${parts[1]}</span>`;
                }
            }

            item.innerHTML = `
                <div class="row-content">
                    <div class="col-details">
                        <span class="type">${record.type}</span>
                        <span class="info">${formattedDetails}</span>
                    </div>
                    <div class="col-result-group">
                        <div class="col-result mono" style="color: ${resultColor};">
                            ${record.result}
                        </div>
                        <input type="number" class="shares-inline-input mono" placeholder="Shares" value="${record.shares || ''}">
                    </div>
                    <div class="row-delete">
                        <button class="delete-btn item-delete-btn" title="Delete">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
            
            item.addEventListener('dragstart', (e) => {
                stripAnimationsForDrag();
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            
            item.addEventListener('dragover', (e) => {
                const draggingLabel = document.querySelector('.dragging-label');
                if (draggingLabel) {
                    e.preventDefault();
                    item.style.border = '2px dashed var(--accent-color)';
                }
            });
            
            item.addEventListener('dragleave', (e) => {
                item.style.border = '';
            });
            
            item.addEventListener('drop', (e) => {
                item.style.border = '';
                const draggingLabel = document.querySelector('.dragging-label');
                if (draggingLabel) {
                    e.preventDefault();
                    e.stopPropagation();
                    const text = draggingLabel.textContent;
                    if (text) {
                        record.type = text;
                        saveState();
                        const titleEl = item.querySelector('.type');
                        if (titleEl) titleEl.textContent = text;
                    }
                }
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                updateArrayFromDOM();
                saveState();
            });

            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-btn') || e.target.closest('.row-delete')) return;
                
                const editableToggle = e.target.closest('.editable-toggle');
                if (editableToggle && record.inputs) {
                    record.inputs.isUp = !record.inputs.isUp;
                    record.isUp = record.inputs.isUp;
                    recalculateRecord(record);
                    saveState();
                    
                    const infoSpan = item.querySelector('.info');
                    if (infoSpan) infoSpan.innerHTML = record.details;
                    const resultDiv = item.querySelector('.col-result');
                    if (resultDiv) {
                        const recCurrency = record.currency || (record.result && record.result.includes('$') ? '$' : '¥');
                        const upColor = recCurrency === '¥' ? '#ff453a' : '#32d74b';
                        const downColor = recCurrency === '¥' ? '#32d74b' : '#ff453a';
                        resultDiv.style.color = record.isUp ? upColor : downColor;
                        resultDiv.innerHTML = record.result;
                    }
                    return;
                }

                const editTrigger = e.target.closest('.edit-trigger-val');
                if (editTrigger && record.inputs) {
                    const editContainer = editTrigger.querySelector('.edit-container-val');
                    if (!editContainer || editContainer.querySelector('.edit-val-input')) return;
                    
                    const field = editTrigger.dataset.field;
                    const originalVal = record.inputs[field];
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.step = 'any';
                    input.className = 'edit-val-input mono';
                    input.value = originalVal;
                    input.style.fontSize = 'inherit';
                    input.style.fontWeight = 'inherit';
                    input.style.color = 'inherit';
                    input.style.background = 'transparent';
                    input.style.border = 'none';
                    input.style.outline = 'none';
                    input.style.width = Math.max(30, originalVal.toString().length * 8 + 10) + 'px';
                    input.style.padding = '0';
                    input.style.margin = '0';
                    
                    editContainer.innerHTML = '';
                    editContainer.appendChild(input);
                    input.focus();
                    input.select();
                    
                    let saved = false;
                    const saveNewVal = () => {
                        if (saved) return;
                        saved = true;
                        const newVal = parseFloat(input.value);
                        if (!isNaN(newVal) && newVal !== originalVal) {
                            record.inputs[field] = newVal;
                            recalculateRecord(record);
                            saveState();
                            
                            const infoSpan = item.querySelector('.info');
                            if (infoSpan) infoSpan.innerHTML = record.details;
                            const resultDiv = item.querySelector('.col-result');
                            if (resultDiv) {
                                const recCurrency = record.currency || (record.result && record.result.includes('$') ? '$' : '¥');
                                const upColor = recCurrency === '¥' ? '#ff453a' : '#32d74b';
                                const downColor = recCurrency === '¥' ? '#32d74b' : '#ff453a';
                                resultDiv.style.color = record.isUp ? upColor : downColor;
                                resultDiv.innerHTML = record.result;
                            }
                        } else {
                            recalculateRecord(record);
                            const infoSpan = item.querySelector('.info');
                            if (infoSpan) infoSpan.innerHTML = record.details;
                        }
                    };
                    
                    input.addEventListener('blur', saveNewVal);
                    input.addEventListener('keydown', (ke) => {
                        if (ke.key === 'Enter') input.blur();
                        if (ke.key === 'Escape') {
                            input.value = originalVal;
                            input.blur();
                        }
                    });
                    return;
                }
                const typeSpan = e.target.closest('.type');
                if (typeSpan) {
                    if (typeSpan.querySelector('.edit-type-input')) return;
                    
                    const originalText = record.type;
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'edit-type-input mono';
                    input.value = originalText;
                    input.style.fontSize = 'inherit';
                    input.style.fontWeight = 'inherit';
                    input.style.color = 'inherit';
                    input.style.background = 'transparent';
                    input.style.border = 'none';
                    input.style.outline = 'none';
                    input.style.width = Math.max(80, originalText.length * 8 + 10) + 'px';
                    input.style.padding = '0';
                    input.style.margin = '0';
                    
                    typeSpan.innerHTML = '';
                    typeSpan.appendChild(input);
                    input.focus();
                    input.select();
                    
                    let saved = false;
                    const saveNewType = () => {
                        if (saved) return;
                        saved = true;
                        record.type = input.value;
                        saveState();
                        typeSpan.textContent = record.type;
                    };
                    
                    input.addEventListener('blur', saveNewType);
                    input.addEventListener('keydown', (ke) => {
                        if (ke.key === 'Enter') input.blur();
                        if (ke.key === 'Escape') {
                            input.value = originalText;
                            input.blur();
                        }
                    });
                    return;
                }
                
                if (e.detail === 1) {
                    item.clickTimer = setTimeout(() => {
                        populateForm(record, group.symbol);
                    }, 200);
                }
            });

            // Prevent drag from input
            const sharesInput = item.querySelector('.shares-inline-input');
            sharesInput.addEventListener('mousedown', e => e.stopPropagation());
            sharesInput.addEventListener('click', e => e.stopPropagation());
            
            // Save shares value on change/blur
            sharesInput.addEventListener('change', () => {
                record.shares = sharesInput.value;
                saveState();
            });

            item.addEventListener('dblclick', (e) => {
                clearTimeout(item.clickTimer);
                if (e.target.closest('.row-delete')) return;
                if (e.target.closest('.edit-type-input')) return;
                
                if (e.target.closest('.editable-toggle') || e.target.closest('.edit-trigger-val')) {
                    return;
                }
                
                record.highlighted = !record.highlighted;
                item.classList.toggle('highlighted', record.highlighted);
                saveState();
            });

            item.querySelector('.item-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const currentRecordIndex = group.records.indexOf(record);
                if (currentRecordIndex > -1) {
                    group.records.splice(currentRecordIndex, 1);
                }
                
                if (group.records.length === 0) {
                    const currentGroupIndex = historyRecords.indexOf(group);
                    if (currentGroupIndex > -1) {
                        historyRecords.splice(currentGroupIndex, 1);
                    }
                    groupEl.remove();
                    const tagEl = document.getElementById('quick-tags')?.querySelector(`[data-symbol="${group.symbol}"]`);
                    if (tagEl) tagEl.remove();
                } else {
                    item.remove();
                }
                saveState();
            });
            
            listEl.appendChild(item);
        });
        
        listEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.dragging');
            if (!draggingItem || draggingItem.closest('.group-list') !== listEl) return;
            
            const afterElement = getDragAfterElement(listEl, e.clientY);
            if (afterElement == null) {
                listEl.appendChild(draggingItem);
            } else {
                listEl.insertBefore(draggingItem, afterElement);
            }
        });
        
        const newsPanel = document.createElement('div');
        newsPanel.className = 'group-news-panel' + animClass;
        newsPanel.style.animationDelay = `${(baseDelay + 1 * 0.1).toFixed(2)}s`;
        newsPanel.id = `news-panel-${group.symbol}`;
        
        newsPanel.addEventListener('mouseenter', () => { groupEl.draggable = false; });
        newsPanel.addEventListener('mouseleave', () => { groupEl.draggable = true; });
        
        if (NEWS_CACHE[group.symbol]) {
            newsPanel.innerHTML = NEWS_CACHE[group.symbol];
            const tabs = newsPanel.querySelectorAll('.news-tab');
            const contentAreas = newsPanel.querySelectorAll('.news-content-area');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    contentAreas.forEach(c => {
                        c.classList.remove('active');
                        c.classList.add('hidden');
                    });
                    tab.classList.add('active');
                    const targetId = tab.getAttribute('data-target');
                    const targetContent = newsPanel.querySelector(`#${targetId}`);
                    if (targetContent) {
                        targetContent.classList.remove('hidden');
                        targetContent.classList.add('active');
                    }
                });
            });
        } else {
            newsPanel.innerHTML = '<div style="font-size: 0.7rem; color: var(--fg-dim);">Loading insights...</div>';
            clearTimeout(group.newsTimeout);
            group.newsLoaded = false;
            group.newsTimeout = setTimeout(() => {
                if (!group.newsLoaded) {
                    loadStockNews(group.symbol, groupIndex);
                    group.newsLoaded = true;
                }
            }, 0);
        }
        
        setTimeout(() => {
            if (!group.klineMetrics) {
                loadKlineMetrics(group, groupIndex);
            }
        }, 0);

        const memoArea = document.createElement('div');
        memoArea.className = 'group-memo-area' + animClass;
        memoArea.style.animationDelay = `${(baseDelay + 2 * 0.1).toFixed(2)}s`;
        
        memoArea.innerHTML = `
            <div class="memo-timeframes">
                <label><span class="tf-label"><span>W</span><span>:</span></span> <input type="text" class="tf-input mono" data-tf="tf_w" value="${group.tf_w || ''}"></label>
                <label><span class="tf-label"><span>D</span><span>:</span></span> <input type="text" class="tf-input mono" data-tf="tf_d" value="${group.tf_d || ''}"></label>
                <label><span class="tf-label"><span>30</span><span>:</span></span> <input type="text" class="tf-input mono" data-tf="tf_30" value="${group.tf_30 || ''}"></label>
            </div>
            <textarea class="group-note mono" placeholder="Add notes...">${group.note || ''}</textarea>
        `;
        
        memoArea.addEventListener('mouseenter', () => { groupEl.draggable = false; });
        memoArea.addEventListener('mouseleave', () => { groupEl.draggable = true; });
        
        clearTimeout(group.newsTimeout);
        // Reset newsLoaded so news is always fetched on app start/re-render
        group.newsLoaded = false;
        group.newsTimeout = setTimeout(() => {
            if (!group.newsLoaded) {
                loadStockNews(group.symbol, groupIndex);
                group.newsLoaded = true;
            }
            if (!group.klineMetrics) {
                loadKlineMetrics(group, groupIndex);
            }
        }, 200);
        
        const tfInputs = memoArea.querySelectorAll('.tf-input');
        let memoSaveTimeout;
        const noteEl = memoArea.querySelector('textarea');
        
        // Auto-resize textarea
        const autoResizeNote = () => {
            noteEl.style.height = 'auto';
            noteEl.style.height = (noteEl.scrollHeight) + 'px';
        };
        noteEl.addEventListener('input', autoResizeNote);
        setTimeout(autoResizeNote, 0);

        const debouncedSave = () => {
            clearTimeout(memoSaveTimeout);
            memoSaveTimeout = setTimeout(() => {
                let changed = false;
                tfInputs.forEach(input => {
                    const tfKey = input.getAttribute('data-tf');
                    const newVal = input.value.trim();
                    if (newVal !== (group[tfKey] || '')) {
                        group[tfKey] = newVal;
                        changed = true;
                    }
                });
                const newNote = noteEl.value.trim();
                if (newNote !== (group.note || '')) {
                    group.note = newNote;
                    changed = true;
                }
                if (changed) saveState();
            }, 500);
        };

        tfInputs.forEach(input => {
            input.addEventListener('blur', debouncedSave);
            input.addEventListener('input', debouncedSave);
        });
        
        noteEl.spellcheck = false;
        
        noteEl.addEventListener('blur', debouncedSave);
        
        noteEl.addEventListener('input', () => {
            noteEl.style.height = 'auto';
            noteEl.style.height = (noteEl.scrollHeight) + 'px';
            debouncedSave();
        });
        
        setTimeout(() => {
            if (noteEl.scrollHeight > 0) {
                noteEl.style.height = 'auto';
                noteEl.style.height = (noteEl.scrollHeight) + 'px';
            }
        }, 0);

        groupEl.appendChild(headerEl);
        groupEl.appendChild(newsPanel);
        groupEl.appendChild(memoArea);
        groupEl.appendChild(listEl);
        historyListEl.appendChild(groupEl);
    });
        if (hasRenderedHistoryBefore) {
            historyListEl.scrollTop = prevScrollTop;
        }
        
        if (scrollToSymbol) {
            setTimeout(() => {
                const targetGroup = historyListEl.querySelector(`[data-symbol="${scrollToSymbol}"]`);
                if (targetGroup) {
                    targetGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 50);
        }
    } catch (error) {
        console.error('Error rendering history:', error);
    } finally {
        hasRenderedHistoryBefore = true;
        
        setTimeout(() => {
            isRenderingHistory = false;
        }, 100);
    }
}

function recalculateRecord(record) {
    if (record.inputs && record.inputs.base !== undefined) {
        const base = record.inputs.base;
        const perc = record.inputs.perc;
        const multiplier = record.inputs.isUp ? (1 + perc / 100) : (1 - perc / 100);
        const result = base * multiplier;
        record.result = `${record.currency || ''}${formatCurrency(result)}`;
        const recCurrency = record.currency || (record.result && record.result.includes('$') ? '$' : '¥');
        const upDownText = record.inputs.isUp ? 'Up' : 'Down';
        record.details = `<span>Base: ${recCurrency}<span class="edit-trigger-val" data-field="base"><span class="edit-container-val">${base}</span></span></span><span><span class="editable-toggle" data-field="isUp">${upDownText}</span> <span class="edit-trigger-val" data-field="perc"><span class="edit-container-val">${perc}</span>%</span></span>`;
    } else if (record.inputs && record.inputs.initial !== undefined) {
        const initial = record.inputs.initial;
        const final = record.inputs.final;
        const pctDecimal = (final - initial) / initial;
        record.result = `${Math.abs(pctDecimal * 100).toFixed(2)}%`;
        record.isUp = pctDecimal > 0;
        const recCurrency = record.currency || (record.result && record.result.includes('$') ? '$' : '¥');
        record.details = `<span>Base: ${recCurrency}<span class="edit-trigger-val" data-field="initial"><span class="edit-container-val">${initial}</span></span></span><span>Target: ${recCurrency}<span class="edit-trigger-val" data-field="final"><span class="edit-container-val">${final}</span></span></span>`;
    }
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.history-item:not(.dragging)')];
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

historyListEl.addEventListener('dragover', (e) => {
    const draggingGroup = document.querySelector('.dragging-group');
    if (!draggingGroup) return;
    
    e.preventDefault();
    const afterElement = getDragAfterGroup(historyListEl, e.clientY);
    if (afterElement == null) {
        historyListEl.appendChild(draggingGroup);
    } else {
        historyListEl.insertBefore(draggingGroup, afterElement);
    }
});

function getDragAfterGroup(container, y) {
    const draggableElements = [...container.querySelectorAll('.history-group:not(.dragging-group)')];
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

const quickTagsContainer = document.getElementById('quick-tags');
if (quickTagsContainer) {
    quickTagsContainer.addEventListener('dragover', (e) => {
        const draggingTag = document.querySelector('.dragging-tag');
        if (!draggingTag) return;
        
        e.preventDefault();
        const afterElement = getDragAfterTag(quickTagsContainer, e.clientX, e.clientY);
        if (afterElement == null) {
            quickTagsContainer.appendChild(draggingTag);
        } else {
            quickTagsContainer.insertBefore(draggingTag, afterElement);
        }
    });
}

function getDragAfterTag(container, x, y) {
    const draggableElements = [...container.querySelectorAll('.quick-tag:not(.dragging-tag)')];
    
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

async function fetchStockName(symbol) {
    if (!symbol || symbol === 'Uncategorized') return '';
    try {
        const url = `https://smartbox.gtimg.cn/s3/?v=2&q=${symbol}&t=all`;
        let text;
        if (window.electronAPI && window.electronAPI.fetchFinancialData) {
            text = await window.electronAPI.fetchFinancialData(url);
        } else {
            const res = await fetch(url);
            text = await res.text();
        }
        
        const match = text.match(/v_hint="(.*?)"/);
        if (match && match[1]) {
            const parts = match[1].split('^')[0].split('~');
            if (parts.length >= 3) {
                return JSON.parse('"' + parts[2] + '"');
            }
        }
    } catch (e) {
        console.error('Failed to fetch stock name', e);
    }
    return '';
}

function updateArrayFromDOMTags() {
    const tags = [...document.querySelectorAll('.quick-tag')];
    const newHistory = [];
    
    tags.forEach(tagEl => {
        const symbol = tagEl.dataset.symbol;
        const group = historyRecords.find(g => g.symbol === symbol);
        if (group) {
            newHistory.push(group);
        }
    });
    
    historyRecords.forEach(group => {
        if (!newHistory.find(g => g.symbol === group.symbol)) {
            newHistory.push(group);
        }
    });
    
    historyRecords = newHistory;
}

function updateArrayFromDOM() {
    const groups = [...historyListEl.querySelectorAll('.history-group')];
    const newHistory = [];
    
    groups.forEach((groupEl, groupIndex) => {
        const symbol = groupEl.dataset.symbol;
        const originalGroup = historyRecords.find(g => g.symbol === symbol) || {};
        
        const memoArea = groupEl.querySelector('.group-memo-area');
    if (memoArea) {
        memoArea.addEventListener('mouseenter', () => groupEl.setAttribute('draggable', 'false'));
        memoArea.addEventListener('mouseleave', () => groupEl.setAttribute('draggable', 'true'));
    }
    memoArea.addEventListener('mouseenter', () => groupEl.setAttribute('draggable', 'false'));
    memoArea.addEventListener('mouseleave', () => groupEl.setAttribute('draggable', 'true'));
        const note = memoArea ? memoArea.querySelector('textarea').value : originalGroup.note || '';
        const tf_w = memoArea ? memoArea.querySelector('[data-tf="tf_w"]').value : originalGroup.tf_w || '';
        const tf_d = memoArea ? memoArea.querySelector('[data-tf="tf_d"]').value : originalGroup.tf_d || '';
        const tf_30 = memoArea ? memoArea.querySelector('[data-tf="tf_30"]').value : originalGroup.tf_30 || '';

        const items = [...groupEl.querySelectorAll('.history-item')];
        const records = items.map((item, itemIndex) => {
            const originalItemIndex = parseInt(item.dataset.itemIndex, 10);
            const record = (originalGroup.records || [])[originalItemIndex];
            
            const sharesInput = item.querySelector('.shares-inline-input');
            if (sharesInput) {
                record.shares = sharesInput.value;
            }
            
            item.dataset.groupIndex = groupIndex;
            item.dataset.itemIndex = itemIndex;
            
            return record;
        });
        if (records.length > 0) {
            originalGroup.symbol = symbol;
            originalGroup.records = records;
            originalGroup.note = note;
            originalGroup.tf_w = tf_w;
            originalGroup.tf_d = tf_d;
            originalGroup.tf_30 = tf_30;
            newHistory.push(originalGroup);
        }
    });
    
    historyRecords = newHistory;
}



const clearAllHistoryBtn = document.getElementById('clear-all-history-btn');
if (clearAllHistoryBtn) {
    clearAllHistoryBtn.addEventListener('click', () => {
        historyRecords = [];
        saveState();
        renderHistory();
    });
}

const exportHistoryBtn = document.getElementById('export-history-btn');
if (exportHistoryBtn) {
    exportHistoryBtn.addEventListener('click', () => {
        if (historyRecords.length === 0) return;
        
        let htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset="utf-8">
            <title>Ticker History Export</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; }
                h1 { border-bottom: 2px solid #333; padding-bottom: 5px; }
                .group { margin-bottom: 30px; }
                .group-title { font-size: 20px; font-weight: bold; margin-bottom: 5px; color: #000; }
                .group-note { font-style: italic; color: #666; margin-bottom: 10px; white-space: pre-wrap; }
                .record-item { margin-bottom: 5px; }
                .record-type { font-weight: bold; margin-right: 10px; }
            </style>
        </head>
        <body>
            <h1>Ticker History Export</h1>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <hr>
        `;
        
        historyRecords.forEach(group => {
            htmlContent += `<div class="group">`;
            htmlContent += `<div class="group-title">${group.symbol}</div>`;
            if (group.tf_w || group.tf_d || group.tf_30) {
                htmlContent += `<div class="group-note" style="margin-bottom: 5px; font-weight: bold;">`;
                if (group.tf_w) htmlContent += `W: ${group.tf_w} &nbsp;&nbsp;`;
                if (group.tf_d) htmlContent += `D: ${group.tf_d} &nbsp;&nbsp;`;
                if (group.tf_30) htmlContent += `30: ${group.tf_30}`;
                htmlContent += `</div>`;
            }
            if (group.note) {
                htmlContent += `<div class="group-note">${group.note.replace(/\n/g, '<br>')}</div>`;
            }
            htmlContent += `<ul>`;
            group.records.forEach(record => {
                let detailsText = record.details.replace(/<\/span><span>/g, ' | ').replace(/<[^>]+>/g, '');
                let typeText = record.type;
                
                const recCurrency = record.currency || (record.result && record.result.includes('$') ? '$' : '¥');
                const upColor = recCurrency === '¥' ? '#ff453a' : '#32d74b';
                const downColor = recCurrency === '¥' ? '#32d74b' : '#ff453a';
                const resultColor = record.isUp ? upColor : downColor;
                
                htmlContent += `<li class="record-item">
                    <span class="record-type">[${typeText}]</span> 
                    <span>${detailsText}</span> 
                    <strong>&rarr; <span style="color: ${resultColor};">${record.result}</span></strong>
                </li>`;
            });
            htmlContent += `</ul></div>`;
        });
        
        htmlContent += `</body></html>`;
        
        const blob = new Blob(['\ufeff', htmlContent], {
            type: 'application/msword'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Ticker_Export_${new Date().toISOString().slice(0,10)}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

function addRecordToHistory(record) {
    const sym = record.symbol || 'Uncategorized';
    let group = historyRecords.find(g => g.symbol === sym);
    if (!group) {
        historyRecords.unshift({ symbol: sym, records: [record] });
    } else {
        if (group.records.length > 0 && group.records[0].urgency) {
            record.urgency = group.records[0].urgency;
        }
        group.records.unshift(record);
        // User requested: do NOT reorder historyRecords here. Just append to group.
    }
    saveState();
    renderHistory(sym);
}

saveTargetBtn.addEventListener('click', () => {
    const base = parseFloat(basePriceInput.value);
    const perc = parseFloat(percentageChangeInput.value);
    if (isNaN(base) || isNaN(perc)) return;

    addRecordToHistory({
        type: 'Target Projection',
        mode: 'target',
        symbol: stockSymbol1Input.value.trim().toUpperCase(),
        details: `<span>Base: ${currentCurrency}${base}</span><span>${currentTargetIsUp ? 'Up' : 'Down'} ${perc}%</span>`,
        result: `${currentCurrency}${formatCurrency(currentTargetPrice)}`,
        isUp: currentTargetIsUp,
        inputs: { base, perc, isUp: currentTargetIsUp },
        currency: currentCurrency
    });
});

savePercentageBtn.addEventListener('click', () => {
    const initial = parseFloat(initialPriceInput.value);
    const final = parseFloat(finalPriceInput.value);
    if (isNaN(initial) || isNaN(final) || initial === 0) return;

    const sym2 = stockSymbol2Input.value.trim().toUpperCase();
    const recCur2 = getMarketInfo(sym2).currency;
    addRecordToHistory({
        type: 'Percentage Delta',
        mode: 'percentage',
        symbol: sym2,
        details: `<span>Base: ${recCur2}${initial}</span><span>Target: ${recCur2}${final}</span>`,
        result: `${Math.abs(currentPercentage).toFixed(2)}%`,
        isUp: currentPercentage > 0,
        inputs: { initial, final },
        currency: recCur2
    });
});

function populateForm(record, symbol) {
    let isPercentage = false;
    if (record.mode === 'percentage') {
        isPercentage = true;
    } else if (record.inputs && record.inputs.initial !== undefined) {
        isPercentage = true;
    } else if (record.result && record.result.includes('%')) {
        isPercentage = true;
    } else if (record.type === 'Percentage Delta' || record.type === 'Percentage Change') {
        isPercentage = true;
    }

    if (!isPercentage) {
        stockSymbol1Input.value = symbol || record.symbol || '';
        if (record.inputs) {
            basePriceInput.value = record.inputs.base;
            percentageChangeInput.value = record.inputs.perc;
            document.getElementById(record.inputs.isUp ? 'move-up' : 'move-down').checked = true;
        } else {
            const baseMatch = record.details.match(/Base:\s*.\s*([\d.]+)/);
            const percMatch = record.details.match(/(Up|Down)\s+([\d.]+)%/);
            if (baseMatch) basePriceInput.value = baseMatch[1];
            if (percMatch) {
                percentageChangeInput.value = percMatch[2];
                document.getElementById(percMatch[1] === 'Up' ? 'move-up' : 'move-down').checked = true;
            }
        }
        handleInput();
    } else {
        stockSymbol2Input.value = symbol || record.symbol || '';
        if (record.inputs) {
            initialPriceInput.value = record.inputs.initial;
            finalPriceInput.value = record.inputs.final;
        } else {
            const initialMatch = record.details.match(/Base:\s*.\s*([\d.]+)/);
            const finalMatch = record.details.match(/Target:\s*.\s*([\d.]+)/);
            if (initialMatch) initialPriceInput.value = initialMatch[1];
            if (finalMatch) finalPriceInput.value = finalMatch[1];
        }
        handleInput();
    }

    // Auto-switch calculator currency & colors based on the stock symbol
    const popSymbol = symbol || record.symbol || '';
    if (popSymbol) {
        const mkt = getMarketInfo(popSymbol);
        currentCurrency = mkt.currency;
        
        // Update radio buttons
        if (mkt.currency === '¥') {
            document.getElementById('currency-cny').checked = true;
        } else {
            document.getElementById('currency-usd').checked = true;
        }
        
        // Update nav toggle
        const navToggle = document.getElementById('nav-currency-toggle');
        if (navToggle) navToggle.textContent = mkt.currency === '¥' ? 'CNY' : 'USD';
        
        // Update global colors for the calculator panel
        document.documentElement.style.setProperty('--up-color', mkt.upColor);
        document.documentElement.style.setProperty('--down-color', mkt.downColor);
        
        // Update currency symbols in the calculator
        currencySymbols.forEach(s => { s.textContent = mkt.currency; });
        
        calculateTargetPrice();
        calculatePercentage();
        saveState();
    }
}

// Initial Setup
async function initializeData() {
    let stateObj = null;
    
    // 1. Try to load from IPC file storage
    if (window.electronAPI && window.electronAPI.loadData) {
        try {
            const dataStr = await window.electronAPI.loadData();
            if (dataStr) {
                stateObj = JSON.parse(dataStr);
            }
        } catch (e) {
            console.error('[DATA] Failed to load/parse IPC data:', e);
        }
    }
    
    // 2. Fallback to localStorage for initial migration
    if (!stateObj) {
        historyRecords = JSON.parse(localStorage.getItem('calcHistory')) || [];
        historyVersion = localStorage.getItem('calcHistoryVersion');
        
        if (!historyVersion) {
            historyRecords.reverse();
            historyVersion = '2';
        }
        
        if (historyRecords.length > 0 && !historyRecords[0].records) {
            const grouped = {};
            historyRecords.forEach(record => {
                const sym = record.symbol || 'Uncategorized';
                if (!grouped[sym]) grouped[sym] = [];
                grouped[sym].push(record);
            });
            historyRecords = Object.keys(grouped).map(sym => ({
                symbol: sym,
                records: grouped[sym]
            }));
        }
        
        const savedInputs = JSON.parse(localStorage.getItem('calcInputs'));
        customLabels = JSON.parse(localStorage.getItem('customLabels')) || [];
        stateObj = {
            historyRecords: historyRecords,
            historyVersion: historyVersion,
            customLabels: customLabels,
            calcInputs: savedInputs
        };
        
        // Save immediately to migrate to file storage
        if (historyRecords.length > 0) {
            setTimeout(saveState, 500); 
        }
    } else {
        historyRecords = stateObj.historyRecords || [];
        historyVersion = stateObj.historyVersion;
        customLabels = stateObj.customLabels || [];
    }
    
    // Populate UI from calcInputs
    const saved = stateObj.calcInputs;
    if (saved) {
        if (saved.currency === '$') {
            document.getElementById('currency-usd').checked = true;
        } else {
            document.getElementById('currency-cny').checked = true;
        }
        
        stockSymbol1Input.value = saved.stock1 || '';
        basePriceInput.value = saved.basePrice || '';
        if (saved.moveDown) {
            document.getElementById('move-down').checked = true;
        } else {
            document.getElementById('move-up').checked = true;
        }
        percentageChangeInput.value = saved.percentChange || '';
        
        stockSymbol2Input.value = saved.stock2 || '';
        initialPriceInput.value = saved.initialPrice || '';
        finalPriceInput.value = saved.finalPrice || '';
    }

    updateCurrency();
    renderCustomLabels();
    renderHistory();
}

initializeData();

// Auto-select text in input fields on focus
document.querySelectorAll('input[type="number"], input[type="text"]').forEach(input => {
    input.addEventListener('focus', function() {
        this.select();
    });
});

// Theme Toggle Logic
const themeToggleBtn = document.getElementById('theme-toggle-btn');
if (themeToggleBtn) {
    const savedTheme = localStorage.getItem('ticker-theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }
    
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        if (document.body.classList.contains('light-theme')) {
            localStorage.setItem('ticker-theme', 'light');
        } else {
            localStorage.setItem('ticker-theme', 'dark');
        }
    });
}

// Split View Drag Logic
const resizer = document.getElementById('split-resizer');
const controlPanel = document.querySelector('.control-panel');

if (resizer && controlPanel) {
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    // Load saved width
    const savedLeftWidth = localStorage.getItem('calcLeftPanelWidth');
    if (savedLeftWidth) {
        controlPanel.style.setProperty('--left-flex', `0 0 ${savedLeftWidth}px`);
    } else {
        // Emulate 1fr / 1.2fr ratio
        controlPanel.style.setProperty('--left-flex', `0 0 45.45%`);
    }

    resizer.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startWidth = controlPanel.getBoundingClientRect().width;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        let newWidth = startWidth + dx;
        
        // Enforce left panel min width
        if (newWidth < 235) newWidth = 235;

        // Enforce right panel min width (281px)
        const splitView = document.querySelector('.split-view');
        const splitViewWidth = splitView.getBoundingClientRect().width;
        const resizerWidth = resizer.getBoundingClientRect().width;
        
        const maxLeftWidth = splitViewWidth - resizerWidth - 281;
        if (newWidth > maxLeftWidth) newWidth = maxLeftWidth;

        controlPanel.style.setProperty('--left-flex', `0 0 ${newWidth}px`);
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Save width
            const finalWidth = controlPanel.getBoundingClientRect().width;
            localStorage.setItem('calcLeftPanelWidth', finalWidth);
        }
    });
}

// Window Size Toggle Button
const sizeToggleBtn = document.getElementById('size-toggle-btn');
if (sizeToggleBtn && window.electronAPI) {
    sizeToggleBtn.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) {
            window.electronAPI.recordSize(1);
            alert("Current size saved as 'Size 1'!");
        } else if (e.shiftKey) {
            window.electronAPI.recordSize(2);
            alert("Current size saved as 'Size 2'!");
        } else {
            window.electronAPI.toggleWindowSize();
        }
    });
}

// Mobile Sync Modal Logic (Studio Noir)
const mobileSyncBtn = document.getElementById('mobile-sync-btn');
const mobileSyncModal = document.getElementById('mobile-sync-modal');
const closeSyncModalBtn = document.getElementById('close-sync-modal-btn');
const syncUrlText = document.getElementById('sync-url-text');
const copySyncUrlBtn = document.getElementById('copy-sync-url-btn');
const modalConnectedCount = document.getElementById('modal-connected-count');

if (mobileSyncBtn && mobileSyncModal) {
    mobileSyncBtn.addEventListener('click', async () => {
        mobileSyncModal.style.display = 'flex';
        if (window.electronAPI && window.electronAPI.getSyncServerInfo) {
            try {
                const info = await window.electronAPI.getSyncServerInfo();
                if (info && info.url) {
                    syncUrlText.textContent = info.url;
                    modalConnectedCount.textContent = `Sync Server Active · ${info.clientCount || 0} device(s) connected`;
                }
            } catch (e) {
                syncUrlText.textContent = 'http://localhost:7321';
            }
        }
    });

    if (closeSyncModalBtn) {
        closeSyncModalBtn.addEventListener('click', () => {
            mobileSyncModal.style.display = 'none';
        });
    }

    mobileSyncModal.addEventListener('click', (e) => {
        if (e.target === mobileSyncModal) {
            mobileSyncModal.style.display = 'none';
        }
    });

    if (copySyncUrlBtn && syncUrlText) {
        copySyncUrlBtn.addEventListener('click', () => {
            const url = syncUrlText.textContent;
            navigator.clipboard.writeText(url).then(() => {
                const originalText = copySyncUrlBtn.textContent;
                copySyncUrlBtn.textContent = 'COPIED!';
                setTimeout(() => {
                    copySyncUrlBtn.textContent = originalText;
                }, 2000);
            });
        });
    }
}

// Fetch and render stock news
async function loadStockNews(symbol, groupIndex) {
    const panel = document.getElementById(`news-panel-${symbol}`);
    if (!panel) return;
    
    const attachTabs = () => {
        const tabs = panel.querySelectorAll('.news-tab');
        const contentAreas = panel.querySelectorAll('.news-content-area');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                contentAreas.forEach(c => {
                    c.classList.remove('active');
                    c.classList.add('hidden');
                });
                tab.classList.add('active');
                const targetId = tab.getAttribute('data-target');
                const targetContent = panel.querySelector(`#${targetId}`);
                if (targetContent) {
                    targetContent.classList.remove('hidden');
                    targetContent.classList.add('active');
                }
            });
        });
    };
    
    if (NEWS_CACHE[symbol]) {
        panel.innerHTML = NEWS_CACHE[symbol];
        attachTabs();
        return;
    }
    
    panel.innerHTML = '<div style="font-size: 0.7rem; color: var(--fg-dim); padding: 1rem 0;">Loading...</div>';
    
    const match = symbol.match(/\d{4,6}/);
    if (!match) {
        if (window.electronAPI && window.electronAPI.fetchYahoo) {
            try {
                const yahooData = await window.electronAPI.fetchYahoo(symbol);
                if (yahooData.error) throw new Error(yahooData.error);
                
                const cal = yahooData.quoteSummary?.calendarEvents?.earnings;
                const fin = yahooData.quoteSummary?.financialData;
                
                const sum = yahooData.quoteSummary?.summaryDetail;
                
                let earningsDateHtml = '<div style="font-size: 0.8rem; color: var(--fg-dim); padding-bottom: 0.3rem;">未找到财报发布日期。 (No earnings date available)</div>';
                if (cal && cal.earningsDate && cal.earningsDate.length > 0) {
                    const dates = cal.earningsDate.map(d => new Date(d).toLocaleDateString()).join(' - ');
                    earningsDateHtml = `<div style="font-size: 0.85rem; color: var(--fg); padding-bottom: 0.3rem; font-weight: 500;">下次财报日期 (Next Earnings): ${dates}</div>`;
                }
                
                let researchHtml = '<div style="font-size: 0.7rem; color: var(--fg-dim); padding: 0.5rem 0;">未找到财务数据。 (No financial data available)</div>';
                if (fin) {
                    const formatPct = (val) => val != null ? (val * 100).toFixed(2) + '%' : 'N/A';
                    const formatNum = (val) => val != null ? val.toFixed(2) : 'N/A';
                    const formatLarge = (val) => {
                        if (!val) return 'N/A';
                        if (val >= 1e12) return (val / 1e12).toFixed(2) + 'T';
                        if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
                        if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
                        return val.toLocaleString();
                    };
                    
                    const revGrowth = formatPct(fin.revenueGrowth);
                    const earnGrowth = formatPct(fin.earningsGrowth);
                    const profitMargin = formatPct(fin.profitMargins);
                    const roe = formatPct(fin.returnOnEquity);
                    const debtToEquity = fin.debtToEquity ? fin.debtToEquity.toFixed(2) : 'N/A';
                    const analystRecom = fin.recommendationKey ? fin.recommendationKey.toUpperCase() : 'N/A';
                    const meanTarget = fin.targetMeanPrice ? fin.targetMeanPrice.toFixed(2) : 'N/A';
                    const pe = sum && sum.trailingPE ? sum.trailingPE.toFixed(2) : 'N/A';
                    const fwdPe = sum && sum.forwardPE ? sum.forwardPE.toFixed(2) : 'N/A';
                    const mktCap = sum && sum.marketCap ? formatLarge(sum.marketCap) : 'N/A';
                    const divYield = sum && sum.dividendYield ? formatPct(sum.dividendYield) : 'N/A';

                    // Report period label from defaultKeyStatistics
                    const keyStats = yahooData.quoteSummary?.defaultKeyStatistics;
                    let reportPeriodHtml = '';
                    if (keyStats && keyStats.mostRecentQuarter) {
                        const qDate = new Date(keyStats.mostRecentQuarter);
                        const qMonth = qDate.getMonth() + 1;
                        const qYear = qDate.getFullYear();
                        let qLabel = 'Q' + Math.ceil(qMonth / 3) + ' ' + qYear;
                        reportPeriodHtml = `<div style="font-size: 0.7rem; color: var(--fg-dim); margin-bottom: 0.3rem;">最新财报: ${qLabel} (TTM Data)</div>`;
                    }

                    researchHtml = `
                        ${reportPeriodHtml}
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.8rem; font-size: 0.75rem; color: var(--fg); margin-top: 0.3rem;">
                            <div><span style="color:var(--fg-dim); font-size:0.7rem;">市值 (Mkt Cap)</span><br><strong>${mktCap}</strong></div>
                            <div><span style="color:var(--fg-dim); font-size:0.7rem;">营收增长 (Rev)</span><br><strong style="color:${fin.revenueGrowth >= 0 ? 'var(--up-color)' : 'var(--down-color)'}">${revGrowth}</strong></div>
                            <div><span style="color:var(--fg-dim); font-size:0.7rem;">盈利增长 (Earn)</span><br><strong style="color:${fin.earningsGrowth >= 0 ? 'var(--up-color)' : 'var(--down-color)'}">${earnGrowth}</strong></div>

                            <div><span style="color:var(--fg-dim); font-size:0.7rem;">利润率 (Margin)</span><br><strong>${profitMargin}</strong></div>
                            <div><span style="color:var(--fg-dim); font-size:0.7rem;">ROE</span><br><strong>${roe}</strong></div>
                            <div><span style="color:var(--fg-dim); font-size:0.7rem;">债务股本 (D/E)</span><br><strong>${debtToEquity}</strong></div>

                            <div><span style="color:var(--fg-dim); font-size:0.7rem;">市盈率 (P/E)</span><br><strong>${pe}</strong></div>
                            <div><span style="color:var(--fg-dim); font-size:0.7rem;">预测PE (Fwd)</span><br><strong>${fwdPe}</strong></div>
                            <div><span style="color:var(--fg-dim); font-size:0.7rem;">股息率 (Yield)</span><br><strong>${divYield}</strong></div>

                            <div style="grid-column: span 3;"><span style="color:var(--fg-dim); font-size:0.7rem;">分析师目标价 (Target Price)</span><br><strong>$${meanTarget} (${analystRecom})</strong></div>
                        </div>
                    `;
                }

                const finalHtml = `
                    <div class="news-tabs">
                        <div class="news-tab active" data-target="tab-earnings-${symbol}">Earnings & Analysis (财报与分析)</div>
                    </div>
                    <div class="news-content-area active" id="tab-earnings-${symbol}">
                        <div style="padding-top: 0.3rem;">
                            ${earningsDateHtml}
                            <hr style="border: 0; border-bottom: 1px dashed var(--border); margin: 0.3rem 0;">
                            ${researchHtml}
                        </div>
                    </div>
                `;
                
                panel.innerHTML = finalHtml;
                NEWS_CACHE[symbol] = finalHtml;
                attachTabs();
            } catch (err) {
                panel.innerHTML = '<div style="font-size: 0.7rem; color: var(--fg-dim);">Failed to load Yahoo News.</div>';
                console.error(err);
            }
        } else {
            panel.innerHTML = '<div style="font-size: 0.7rem; color: var(--fg-dim);">No news available.</div>';
        }
        return;
    }
    const code = match[0];
    
    // Determine EastMoney specific code format (e.g. SH603618 or SZ300775)
    let emCode = code;
    if (symbol.includes('SH') || code.startsWith('6')) {
        emCode = `SH${code}`;
    } else if (symbol.includes('SZ') || code.startsWith('0') || code.startsWith('3')) {
        emCode = `SZ${code}`;
    }
    
    try {
        const noticesUrl = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=5&page_index=1&ann_type=A&client_source=WEB&stock_list=${code}&f_node=1`;
        const f10Url = `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${emCode}`;
        const forecastUrl = `https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=NOTICE_DATE&sortTypes=-1&pageSize=5&pageNumber=1&reportName=RPT_PUBLIC_OP_NEWPREDICT&columns=SECURITY_NAME_ABBR,NOTICE_DATE,PREDICT_CONTENT,PREDICT_TYPE,PREDICT_FINANCE_CODE,ADD_AMP_LOWER,ADD_AMP_UPPER&filter=(SECURITY_CODE%3D%22${code}%22)`;
        const researchUrl = `https://reportapi.eastmoney.com/report/list?pageSize=3&pageNo=1&qType=0&code=${code}&beginTime=2026-01-01&endTime=2026-12-31`;
        
        const secid = emCode.startsWith('SH') ? '1.' + code : '0.' + code;
        const push2Url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f127`;
        
        let [noticesJsonStr, f10JsonStr, forecastJsonStr, researchJsonStr, push2JsonStr] = await Promise.all([
            (window.electronAPI && window.electronAPI.fetchFinancialData) 
                ? window.electronAPI.fetchFinancialData(noticesUrl) : fetch(noticesUrl).then(r => r.text()),
            (window.electronAPI && window.electronAPI.fetchFinancialData)
                ? window.electronAPI.fetchFinancialData(f10Url) : fetch(f10Url).then(r => r.text()),
            (window.electronAPI && window.electronAPI.fetchFinancialData)
                ? window.electronAPI.fetchFinancialData(forecastUrl) : fetch(forecastUrl).then(r => r.text()),
            (window.electronAPI && window.electronAPI.fetchFinancialData)
                ? window.electronAPI.fetchFinancialData(researchUrl) : fetch(researchUrl).then(r => r.text()),
            (window.electronAPI && window.electronAPI.fetchFinancialData)
                ? window.electronAPI.fetchFinancialData(push2Url) : fetch(push2Url).then(r => r.text())
        ]);
        
        const emData = JSON.parse(noticesJsonStr);
        let noticesHtml = '';
        if (emData && emData.data && emData.data.list && emData.data.list.length > 0) {
            emData.data.list.forEach(item => {
                const tag = item.columns && item.columns[0] ? item.columns[0].column_name : '公告';
                const title = item.title;
                const link = `https://data.eastmoney.com/notices/detail/${code}/${item.art_code}.html`;
                const noticeDate = item.notice_date ? item.notice_date.substring(0, 10) : '';
                
                noticesHtml += `
                    <a href="${link}" class="news-item" target="_blank">
                        <span class="news-tag">【${tag}】</span>
                        <span class="news-text event-text">${title}<button class="send-to-chat-icon" title="Send to Chat" onclick="attachNewsToChat('${encodeURIComponent(title)}', '${encodeURIComponent(link)}'); event.preventDefault(); event.stopPropagation();">↗</button></span>
                        <span class="news-date">${noticeDate}</span>
                    </a>
                `;
            });
        } else {
            noticesHtml = '<div style="font-size: 0.7rem; color: var(--fg-dim);">No recent announcements.</div>';
        }
        
        let eventsHtml = '';
        let eventsList = [];
        
        // 1. Get the latest earnings forecasts (业绩预告)
        try {
            const forecastData = JSON.parse(forecastJsonStr);
            if (forecastData && forecastData.result && forecastData.result.data && forecastData.result.data.length > 0) {
                let seenDates = new Set();
                let addedCount = 0;
                
                // Group by date to avoid duplicates (e.g. net profit and deducted net profit on the same day)
                for (let forecast of forecastData.result.data) {
                    const date = forecast.NOTICE_DATE ? forecast.NOTICE_DATE.substring(0, 10) : '';
                    if (!date || seenDates.has(date)) continue;
                    
                    // Prefer 004 (net profit) if multiple exist for this date
                    let bestForecast = forecastData.result.data.find(d => d.NOTICE_DATE === forecast.NOTICE_DATE && d.PREDICT_FINANCE_CODE === '004') || forecast;
                    
                    seenDates.add(date);
                    
                    let tag = bestForecast.PREDICT_TYPE || '预告';
                    if (tag.length > 2) tag = tag.substring(0, 2);
                    
                    let text = bestForecast.PREDICT_CONTENT;
                    if (bestForecast.ADD_AMP_LOWER !== null && bestForecast.ADD_AMP_UPPER !== null && bestForecast.ADD_AMP_LOWER !== undefined) {
                        const lower = Math.round(bestForecast.ADD_AMP_LOWER);
                        const upper = Math.round(bestForecast.ADD_AMP_UPPER);
                        const name = bestForecast.SECURITY_NAME_ABBR || '该公司';
                        if (lower === upper) {
                            text = `${name}发布业绩预告。净利润同比${tag} ${lower}%。`;
                        } else {
                            text = `${name}发布业绩预告。净利润同比${tag} ${lower}% 到 ${upper}%。`;
                        }
                    }
                    
                    const link = `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/Index?type=web&code=${emCode}`;
                    if (date && date.startsWith('2026')) {
                        eventsList.push({ link, tag, text, date });
                    }
                    
                    addedCount++;
                    if (addedCount >= 2) break; // Limit to 2 recent forecasts
                }
            }
        } catch(e) {}
        
        // 2. Get the latest financial report summary (财报)
        try { 
            const f10Data = JSON.parse(f10JsonStr); 
            if (f10Data && f10Data.data && f10Data.data.length > 0) {
                f10Data.data.slice(0, 2).forEach(report => {
                    const reportName = report.REPORT_DATE_NAME || '财报';
                    const noticeDate = report.NOTICE_DATE ? report.NOTICE_DATE.substring(0, 10) : '';
                    
                    let summary = `${report.SECURITY_NAME_ABBR}发布${reportName}。`;
                    if (report.PARENTNETPROFITTZ !== null && report.PARENTNETPROFITTZ !== undefined) {
                        summary += `净利润同比${report.PARENTNETPROFITTZ >= 0 ? '增长' : '下降'}${Math.abs(report.PARENTNETPROFITTZ).toFixed(2)}%。`;
                    }
                    if (report.TOTALOPERATEREVETZ !== null && report.TOTALOPERATEREVETZ !== undefined) {
                        summary += `营收同比${report.TOTALOPERATEREVETZ >= 0 ? '增长' : '下降'}${Math.abs(report.TOTALOPERATEREVETZ).toFixed(2)}%。`;
                    }
                    
                    const f10Link = `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/Index?type=web&code=${emCode}`;
                    if (noticeDate && noticeDate.startsWith('2026')) {
                        eventsList.push({ link: f10Link, tag: '财报', text: summary, date: noticeDate });
                    }
                });
            }
        } catch(e) {}
        
        // 3. Get the latest research reports for industry/forecasts (研报)
        try {
            const researchData = JSON.parse(researchJsonStr);
            if (researchData && researchData.data && researchData.data.length > 0) {
                researchData.data.slice(0, 3).forEach(report => {
                    const date = report.publishDate ? report.publishDate.substring(0, 10) : '';
                    const text = `${report.orgSName}: ${report.title}`;
                    const link = `https://data.eastmoney.com/report/zw_stock.jshtml?infocode=${report.infoCode}`;
                    if (date && date.startsWith('2026')) {
                        eventsList.push({ link, tag: '研报', text, date });
                    }
                });
            }
        } catch(e) {}
        
        // Sort events by date descending (newest first)
        eventsList.sort((a, b) => {
            const dateA = new Date(a.date).getTime() || 0;
            const dateB = new Date(b.date).getTime() || 0;
            return dateB - dateA;
        });
        
        if (eventsList.length > 0) {
            eventsList.forEach(event => {
                eventsHtml += `
                    <a href="${event.link}" class="news-item" target="_blank">
                        <span class="news-tag">【${event.tag}】</span>
                        <span class="news-text event-text">${event.text}<button class="send-to-chat-icon" title="Send to Chat" onclick="attachNewsToChat('${encodeURIComponent(event.text)}', '${encodeURIComponent(event.link)}'); event.preventDefault(); event.stopPropagation();">↗</button></span>
                        <span class="news-date">${event.date}</span>
                    </a>
                `;
            });
        } else {
            eventsHtml = '<div style="font-size: 0.7rem; color: var(--fg-dim);">No recent events found.</div>';
        }

        // 4. Get Industry Reports based on f127 industry name
        let industryName = '行业研报';
        let indReportsHtml = '';
        try {
            const push2Data = JSON.parse(push2JsonStr);
            if (push2Data && push2Data.data && push2Data.data.f127) {
                industryName = push2Data.data.f127;
            }
        } catch (e) {}
        
        const indCode = INDUSTRY_MAPPING[industryName];
        if (indCode) {
            const indUrl = `https://reportapi.eastmoney.com/report/list?pageSize=5&pageNo=1&qType=1&industryCode=${indCode}&beginTime=2026-01-01&endTime=2026-12-31`;
            try {
                const indStr = (window.electronAPI && window.electronAPI.fetchFinancialData)
                     ? await window.electronAPI.fetchFinancialData(indUrl) : await fetch(indUrl).then(r => r.text());
                const indData = JSON.parse(indStr);
                let indList = [];
                if (indData && indData.data && indData.data.length > 0) {
                     indData.data.forEach(report => {
                         const date = report.publishDate ? report.publishDate.substring(0, 10) : '';
                         const text = `${report.orgSName}: ${report.title}`;
                         const link = `https://data.eastmoney.com/report/zw_industry.jshtml?infocode=${report.infoCode}`;
                         if (date && date.startsWith('2026')) {
                             indList.push({ link, tag: '研报', text, date });
                         }
                     });
                }
                if (indList.length > 0) {
                    indList.forEach(event => {
                        indReportsHtml += `
                            <a href="${event.link}" class="news-item" target="_blank">
                                <span class="news-tag">【${event.tag}】</span>
                                <span class="news-text event-text">${event.text}<button class="send-to-chat-icon" title="Send to Chat" onclick="attachNewsToChat('${encodeURIComponent(event.text)}', '${encodeURIComponent(event.link)}'); event.preventDefault(); event.stopPropagation();">↗</button></span>
                                <span class="news-date">${event.date}</span>
                            </a>
                        `;
                    });
                } else {
                    indReportsHtml = '<div style="font-size: 0.7rem; color: var(--fg-dim);">No recent industry reports found.</div>';
                }
            } catch (e) {
                indReportsHtml = '<div style="font-size: 0.7rem; color: var(--fg-dim);">Failed to load industry reports.</div>';
            }
        } else {
            indReportsHtml = '<div style="font-size: 0.7rem; color: var(--fg-dim);">Industry reports not available.</div>';
        }

        // Build 财报与分析 tab from already-fetched data
        let cnEarningsHtml = '<div style="font-size: 0.7rem; color: var(--fg-dim); padding-bottom: 0.3rem;">未找到财务数据。</div>';
        try {
            const f10Data = JSON.parse(f10JsonStr);
            const forecastData = JSON.parse(forecastJsonStr);

            // Latest earnings date from forecast
            let earningsDateHtml = '';
            if (forecastData && forecastData.result && forecastData.result.data && forecastData.result.data.length > 0) {
                const latest = forecastData.result.data[0];
                const d = latest.NOTICE_DATE ? latest.NOTICE_DATE.substring(0, 10) : '';
                const type = latest.PREDICT_TYPE || '业绩预告';
                if (d) earningsDateHtml = `<div style="font-size: 0.85rem; color: var(--fg); padding-bottom: 0.3rem; font-weight: 500;">最新业绩预告 (${type}): ${d}</div>`;
            }

            // Financial metrics from f10
            let metricsHtml = '<div style="font-size: 0.7rem; color: var(--fg-dim);">暂无详细财务数据。</div>';
            if (f10Data && f10Data.data && f10Data.data.length > 0) {
                const r = f10Data.data[0]; // most recent report

                const formatPct = (val) => val != null ? (val > 0 ? '+' : '') + parseFloat(val).toFixed(2) + '%' : 'N/A';
                const formatLarge = (val) => {
                    if (val == null) return 'N/A';
                    const n = parseFloat(val);
                    if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿';
                    if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + '万';
                    return n.toFixed(2);
                };

                const reportName = r.REPORT_DATE_NAME || '最新财报';
                const revenue = formatLarge(r.TOTALOPERATEREVE);
                const revGrowth = formatPct(r.TOTALOPERATEREVETZ);
                const netProfit = formatLarge(r.PARENTNETPROFIT);
                const netGrowth = formatPct(r.PARENTNETPROFITTZ);
                const roe = r.ROEJQ != null ? parseFloat(r.ROEJQ).toFixed(2) + '%' : 'N/A';
                const grossMargin = r.XSMLL != null ? parseFloat(r.XSMLL).toFixed(2) + '%' : 'N/A';
                const eps = r.BASICEPS != null ? '¥' + parseFloat(r.BASICEPS).toFixed(3) : 'N/A';
                // Additional fields
                const debtRatio = r.ZCFZL != null ? parseFloat(r.ZCFZL).toFixed(2) + '%' : 'N/A';
                const bvps = r.MGJZC != null ? '¥' + parseFloat(r.MGJZC).toFixed(3) : 'N/A';
                const netMargin = r.XSJLL != null ? parseFloat(r.XSJLL).toFixed(2) + '%' : 'N/A';

                metricsHtml = `
                    <div style="font-size: 0.7rem; color: var(--fg-dim); margin-bottom: 0.3rem;">${reportName}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.8rem; font-size: 0.75rem; color: var(--fg); margin-top: 0.3rem;">
                        <div><span style="color:var(--fg-dim); font-size:0.7rem;">营业收入</span><br><strong>${revenue}</strong></div>
                        <div><span style="color:var(--fg-dim); font-size:0.7rem;">营收增长</span><br><strong style="color:${r.TOTALOPERATEREVETZ >= 0 ? 'var(--up-color)' : 'var(--down-color)'}">${revGrowth}</strong></div>
                        <div><span style="color:var(--fg-dim); font-size:0.7rem;">净利润增长</span><br><strong style="color:${r.PARENTNETPROFITTZ >= 0 ? 'var(--up-color)' : 'var(--down-color)'}">${netGrowth}</strong></div>

                        <div><span style="color:var(--fg-dim); font-size:0.7rem;">毛利率</span><br><strong>${grossMargin}</strong></div>
                        <div><span style="color:var(--fg-dim); font-size:0.7rem;">净利率</span><br><strong>${netMargin}</strong></div>
                        <div><span style="color:var(--fg-dim); font-size:0.7rem;">ROE</span><br><strong>${roe}</strong></div>

                        <div><span style="color:var(--fg-dim); font-size:0.7rem;">资产负债率</span><br><strong>${debtRatio}</strong></div>
                        <div><span style="color:var(--fg-dim); font-size:0.7rem;">每股净资产 (BVPS)</span><br><strong>${bvps}</strong></div>
                        <div><span style="color:var(--fg-dim); font-size:0.7rem;">每股收益 (EPS)</span><br><strong>${eps}</strong></div>

                        <div style="grid-column: span 3;"><span style="color:var(--fg-dim); font-size:0.7rem;">净利润</span><br><strong>${netProfit}</strong></div>
                    </div>
                `;
            }

            cnEarningsHtml = `
                ${earningsDateHtml}
                ${earningsDateHtml ? '<hr style="border: 0; border-bottom: 1px dashed var(--border); margin: 0.3rem 0;">' : ''}
                ${metricsHtml}
            `;
        } catch(e) {
            cnEarningsHtml = '<div style="font-size: 0.7rem; color: var(--fg-dim);">财务数据加载失败。</div>';
        }

        let html = `
            <div class="news-section">
                <div class="news-tabs">
                    <div class="news-tab active" data-target="events-content-${symbol}">Events</div>
                    <div class="news-tab" data-target="industry-content-${symbol}">${industryName}</div>
                    <div class="news-tab" data-target="notices-content-${symbol}">最新公告</div>
                    <div class="news-tab" data-target="earnings-content-${symbol}">财报与分析</div>
                </div>
                
                <div class="news-content-area active" id="events-content-${symbol}">
                    <div class="news-list">
                        ${eventsHtml}
                    </div>
                </div>
                
                <div class="news-content-area hidden" id="industry-content-${symbol}">
                    <div class="news-list">
                        ${indReportsHtml}
                    </div>
                </div>
                
                <div class="news-content-area hidden" id="notices-content-${symbol}">
                    <div class="news-list">
                        ${noticesHtml}
                    </div>
                </div>

                <div class="news-content-area hidden" id="earnings-content-${symbol}">
                    <div style="padding-top: 0.3rem;">
                        ${cnEarningsHtml}
                    </div>
                </div>
            </div>
        `;
        
        NEWS_CACHE[symbol] = html;
        panel.innerHTML = html;
        
        attachTabs();
        
    } catch (e) {
        console.error('Error fetching news/events:', e);
        panel.innerHTML = '<div style="font-size: 0.7rem; color: var(--fg-dim);">Failed to load news.</div>';
    }
}


// ---------------------------------------------------------
// Background K-Line Metrics Fetching
// ---------------------------------------------------------

function getTencentSymbol(c) {
    let codeMatch = c.match(/[A-Za-z0-9]+/);
    if (!codeMatch) return null;
    let code = codeMatch[0].toLowerCase();
    if (/^\d{6}$/.test(code)) return (code.startsWith('6') || code.startsWith('9')) ? `sh${code}` : `sz${code}`;
    if (/^\d{5}$/.test(code)) return `hk${code}`; 
    return `us${code.toUpperCase()}`;
}

async function loadKlineMetrics(group, groupIndex) {
    const tsym = getTencentSymbol(group.symbol);
    if (!tsym) return;

    if (!group.klineMetrics) {
        group.klineMetrics = {
            m5: { high: null, low: null },
            m30: { high: null, low: null },
            day: { high: null, low: null },
            week: { high: null, low: null }
        };
    }

    const fetchKline = async (type, intervalParam) => {
        const isAShare = tsym.startsWith('sh') || tsym.startsWith('sz');
        
        if (isAShare) {
            let scale = 5;
            let datalen = 320;
            if (type === 'm5') { scale = 5; datalen = 320; }
            else if (type === 'm30') { scale = 30; datalen = 320; }
            else if (type === 'day') { scale = 240; datalen = 320; }
            else if (type === 'week') { scale = 1200; datalen = 320; }
            
            const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketData.getKLineData?symbol=${tsym}&scale=${scale}&ma=no&datalen=${datalen}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    let maxHigh = -Infinity;
                    let minLow = Infinity;
                    for (let i = 0; i < data.length; i++) {
                        const h = parseFloat(data[i].high);
                        const l = parseFloat(data[i].low);
                        if (h > maxHigh) maxHigh = h;
                        if (l < minLow) minLow = l;
                    }
                    return { high: maxHigh, low: minLow };
                }
            } catch (e) {
                console.error(`Failed to fetch Sina ${type} for ${tsym}`, e);
            }
        } else {
            const endpoint = (type === 'm5' || type === 'm30') ? 'mkline' : 'kline';
            const url = `https://ifzq.gtimg.cn/appstock/app/kline/${endpoint}?param=${tsym},${intervalParam},,,320,`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data && data.code === 0 && data.data && data.data[tsym] && data.data[tsym][intervalParam]) {
                    const arr = data.data[tsym][intervalParam];
                    if (arr.length > 0) {
                        let maxHigh = -Infinity;
                        let minLow = Infinity;
                        for (let i = 0; i < arr.length; i++) {
                            const h = parseFloat(arr[i][3]);
                            const l = parseFloat(arr[i][4]);
                            if (h > maxHigh) maxHigh = h;
                            if (l < minLow) minLow = l;
                        }
                        return { high: maxHigh, low: minLow };
                    }
                }
            } catch (e) {
                console.error(`Failed to fetch Tencent ${type} for ${tsym}`, e);
            }
        }
        return { high: null, low: null };
    };

    const [m5, m30, day, week] = await Promise.all([
        fetchKline('m5', 'm5'),
        fetchKline('m30', 'm30'),
        fetchKline('day', 'day'),
        fetchKline('week', 'week')
    ]);

    group.klineMetrics = { m5, m30, day, week };
    
    // Update any dynamically bound records in the UI now that data is fresh
    updateDynamicRecords(group, groupIndex);
}

// ---------------------------------------------------------
// Dynamic Record Bindings
// ---------------------------------------------------------

function applyDynamicBindings(group, record) {
    if (!group.klineMetrics) return false;
    
    // Rule 1: D线追踪 (D has fallen) -> Base = 30m High, Target = 5m Low
    if (record.type.includes('目前D已经跌') && group.klineMetrics.m30.high !== null && group.klineMetrics.m5.low !== null) {
        record.inputs = {
            initial: group.klineMetrics.m30.high,
            final: group.klineMetrics.m5.low
        };
        const diff = record.inputs.final - record.inputs.initial;
        record.isUp = diff >= 0;
        record.percentage = ((Math.abs(diff) / record.inputs.initial) * 100).toFixed(2) + '%';
        record.result = record.percentage;
        const recCurrency = record.currency || (record.result && record.result.includes('$') ? '$' : '¥');
        record.details = `Base: ${recCurrency}${record.inputs.initial.toFixed(2)} | Target: ${recCurrency}${record.inputs.final.toFixed(2)}`;
        return true;
    }
    
    return false;
}

function updateDynamicRecords(group, groupIndex) {
    if (!group.klineMetrics) return;
    const groupEl = document.getElementById(`group-${groupIndex}`);
    if (!groupEl) return;
    
    let hasUpdates = false;
    const recordEls = groupEl.querySelectorAll('.editorial-list > .item');
    recordEls.forEach((item, recIndex) => {
        const record = group.records[recIndex];
        const wasUpdated = applyDynamicBindings(group, record);
        
        if (wasUpdated) {
            hasUpdates = true;
            recalculateRecord(record);
            
            // Update the UI directly to avoid focus loss
            const recCurrency = record.currency || (record.result && record.result.includes('$') ? '$' : '¥');
            const infoSpan = item.querySelector('.info');
            if (infoSpan) {
                infoSpan.innerHTML = record.details;
            }
            
            const upColor = recCurrency === '¥' ? '#ff453a' : '#32d74b';
            const downColor = recCurrency === '¥' ? '#32d74b' : '#ff453a';
            
            const resultDiv = item.querySelector('.col-result');
            if (resultDiv) {
                resultDiv.style.color = record.isUp ? upColor : downColor;
                resultDiv.innerHTML = record.result;
            }
            
            // Seamlessly update top calculator if this record is currently selected
            if (typeof editingGroupIndex !== 'undefined' && editingGroupIndex === groupIndex && editingRecordIndex === recIndex) {
                const initialInput = document.getElementById('initial-input');
                const finalInput = document.getElementById('final-input');
                const resultEl = document.getElementById('result');
                if (initialInput && finalInput && resultEl) {
                    if (document.activeElement !== initialInput) initialInput.value = record.inputs.initial;
                    if (document.activeElement !== finalInput) finalInput.value = record.inputs.final;
                    resultEl.textContent = record.result;
                    resultEl.style.color = record.isUp ? upColor : downColor;
                }
            }
        }
    });
    
    if (hasUpdates) {
        saveState(); // Ensure the dynamically updated values are saved
    }
}

// Background polling for real-time updates
setInterval(() => {
    historyRecords.forEach((group, groupIndex) => {
        // Find if this group has any dynamic records before fetching
        const hasDynamic = group.records.some(r => r.type.includes('目前D已经跌') || r.type.includes('30卖点2') || r.type.includes('D卖点1'));
        if (hasDynamic) {
            loadKlineMetrics(group, groupIndex);
        }
    });
}, 3000); // Check for updates every 3 seconds


// ---------------------------------------------------------
// Custom Labels Logic
// ---------------------------------------------------------
const customLabelsContainer = document.getElementById('custom-labels-container');
const addCustomLabelBtn = document.getElementById('add-custom-label-btn');
const customLabelsTrash = document.getElementById('custom-labels-trash');

function renderCustomLabels() {
    if (!customLabelsContainer) return;
    customLabelsContainer.innerHTML = '';
    
    customLabels.forEach((label, index) => {
        const labelEl = document.createElement('div');
        labelEl.className = 'custom-label';
        labelEl.textContent = label;
        labelEl.draggable = true;
        labelEl.dataset.index = index;
        
        // Drag events for reordering and trash
        labelEl.addEventListener('dragstart', (e) => {
            labelEl.classList.add('dragging-label');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', label);
            if (customLabelsTrash) customLabelsTrash.style.display = 'flex';
        });
        
        labelEl.addEventListener('dragend', (e) => {
            labelEl.classList.remove('dragging-label');
            if (customLabelsTrash) {
                customLabelsTrash.style.display = 'none';
                customLabelsTrash.classList.remove('active');
            }
            // Update array from DOM order
            const currentDOM = [...customLabelsContainer.querySelectorAll('.custom-label')];
            customLabels = currentDOM.map(el => el.textContent);
            saveState();
        });
        
        // Click to Edit
        labelEl.addEventListener('click', () => {
            if (labelEl.querySelector('input')) return;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'custom-label-input';
            input.value = label;
            
            labelEl.textContent = '';
            labelEl.appendChild(input);
            input.focus();
            input.select();
            
            let saved = false;
            const finishEdit = () => {
                if (saved) return;
                saved = true;
                const newVal = input.value.trim();
                if (newVal) {
                    customLabels[index] = newVal;
                } else {
                    // Remove if empty
                    customLabels.splice(index, 1);
                }
                saveState();
                renderCustomLabels();
            };
            
            input.addEventListener('blur', finishEdit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') finishEdit();
                if (e.key === 'Escape') {
                    saved = true;
                    renderCustomLabels();
                }
            });
        });
        
        customLabelsContainer.appendChild(labelEl);
    });
}

if (addCustomLabelBtn) {
    addCustomLabelBtn.addEventListener('click', () => {
        customLabels.push('New Label');
        saveState();
        renderCustomLabels();
        
        // Auto-trigger edit mode on the last added element
        setTimeout(() => {
            const newEl = customLabelsContainer.lastElementChild;
            if (newEl) newEl.click();
        }, 0);
    });
}

if (customLabelsContainer) {
    customLabelsContainer.addEventListener('dragover', (e) => {
        const draggingLabel = document.querySelector('.dragging-label');
        if (!draggingLabel) return;
        
        e.preventDefault();
        const afterElement = getDragAfterCustomLabel(customLabelsContainer, e.clientX, e.clientY);
        if (afterElement == null) {
            customLabelsContainer.appendChild(draggingLabel);
        } else {
            customLabelsContainer.insertBefore(draggingLabel, afterElement);
        }
    });
}

function getDragAfterCustomLabel(container, x, y) {
    const draggableElements = [...container.querySelectorAll('.custom-label:not(.dragging-label)')];
    
    for (const child of draggableElements) {
        const box = child.getBoundingClientRect();
        if (y >= box.top && y <= box.bottom) {
            if (x < box.left + box.width / 2) {
                return child;
            }
        }
    }
    return null;
}

if (customLabelsTrash) {
    customLabelsTrash.addEventListener('dragover', (e) => {
        const draggingLabel = document.querySelector('.dragging-label');
        if (draggingLabel) {
            e.preventDefault();
            customLabelsTrash.classList.add('active');
        }
    });
    
    customLabelsTrash.addEventListener('dragleave', (e) => {
        customLabelsTrash.classList.remove('active');
    });
    
    customLabelsTrash.addEventListener('drop', (e) => {
        const draggingLabel = document.querySelector('.dragging-label');
        if (draggingLabel) {
            e.preventDefault();
            const indexToRemove = parseInt(draggingLabel.dataset.index, 10);
            if (!isNaN(indexToRemove)) {
                customLabels.splice(indexToRemove, 1);
                saveState();
                renderCustomLabels();
            }
        }
        customLabelsTrash.classList.remove('active');
        customLabelsTrash.style.display = 'none';
    });
}


// Middle Panel freeze logic
const splitView = document.querySelector('.split-view');
const ledgerPanel = document.querySelector('.ledger-panel');
const mql = window.matchMedia('(min-width: 1400px)');

function handleMediaQuery(e) {
    if (e.matches) {
        let savedResearch = localStorage.getItem('calcResearchPanelWidth');
        if (!savedResearch) {
            savedResearch = '450px'; 
        } else {
            savedResearch = savedResearch + 'px';
        }
        document.querySelector('.split-view').style.setProperty('--research-width', savedResearch);
    }
}
mql.addListener(handleMediaQuery);
handleMediaQuery(mql);

// Research Panel Resizer
const researchResizer = document.getElementById('research-resizer');
const researchPanel = document.querySelector('.research-panel');

if (researchResizer && researchPanel) {
    let isResearchDragging = false;
    let researchStartX = 0;
    let researchStartWidth = 0;

    

    researchResizer.addEventListener('mousedown', (e) => {
        isResearchDragging = true;
        researchStartX = e.clientX;
        researchStartWidth = researchPanel.getBoundingClientRect().width;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResearchDragging) return;
        const dx = researchStartX - e.clientX; // drag left increases width of right panel
        
        const splitView = document.querySelector('.split-view');
        const currentResearchWidth = parseFloat(getComputedStyle(splitView).getPropertyValue('--research-width')) || 450;
        let newResearchWidth = currentResearchWidth + dx;
        
        if (newResearchWidth < 300) newResearchWidth = 300;
        
        const splitViewWidth = splitView.getBoundingClientRect().width;
        if (newResearchWidth > splitViewWidth - 550) newResearchWidth = splitViewWidth - 550;
        
        splitView.style.setProperty('--research-width', `${newResearchWidth}px`);
        localStorage.setItem('calcResearchPanelWidth', newResearchWidth);
        
        researchStartX = e.clientX; // reset startX for continuous dragging
    });

    window.addEventListener('mouseup', () => {
        if (isResearchDragging) {
            isResearchDragging = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = '';
        }
    });
}

// Research Tabs Logic
const researchTabs = document.querySelectorAll('.research-tab');
const researchContents = document.querySelectorAll('.research-content-area');
const rightPanel = document.getElementById('research-panel');

researchTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        researchTabs.forEach(t => t.classList.remove('active'));
        researchContents.forEach(c => {
            c.classList.remove('active');
            c.classList.add('hidden');
        });
        
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-target');
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
            targetContent.classList.remove('hidden');
            targetContent.classList.add('active');
            
            targetContent.classList.add('disable-animations');
            targetContent.offsetHeight; // trigger reflow
            targetContent.classList.remove('disable-animations');
            
            if (targetId === 'domestic-view') {
                fetchDomesticMacroNews();
            } else if (targetId === 'watchlist-view') {
                // Re-trigger animation on watchlist items when switching to tab
                const items = document.querySelectorAll('#watchlist-feed .animate-stagger-row');
                items.forEach((el, i) => {
                    el.style.animation = 'none';
                    el.offsetHeight;
                    el.style.animation = '';
                    el.style.animationDelay = `${(0.1 + i * 0.08).toFixed(2)}s`;
                });
            } else if (targetId === 'gemini-view') {
                // Animate the main layout blocks of the Chat/Notebook view slowly
                const mainBlocks = [
                    document.getElementById('notebook-section'),
                    document.getElementById('notebook-v-resizer'),
                    document.getElementById('gemini-chat-history'),
                    document.querySelector('.gemini-input-area')
                ].filter(Boolean);

                mainBlocks.forEach(el => {
                    el.classList.remove('animate-slide-up-slow');
                    el.style.animation = 'none';
                    el.style.opacity = '0'; // prevent flash
                });
                
                setTimeout(() => {
                    mainBlocks.forEach((el, i) => {
                        el.style.opacity = ''; // remove inline opacity so animation takes over
                        el.style.animation = '';
                        el.classList.add('animate-slide-up-slow');
                        el.style.animationDelay = `${(i * 0.08).toFixed(2)}s`;
                    });
                }, 10);
            }
        }
        
        if (targetId === 'pdf-view') {
            if (rightPanel) rightPanel.style.width = '800px';
        } else {
            if (rightPanel) rightPanel.style.width = '320px';
        }
        
        const zoteroControls = document.getElementById('zotero-header-controls');
        if (zoteroControls) {
            zoteroControls.style.display = targetId === 'zotero-view' ? 'flex' : 'none';
        }
        const domesticStatus = document.getElementById('domestic-status');
        if (domesticStatus) {
            domesticStatus.style.display = targetId === 'domestic-view' ? 'block' : 'none';
        }
    });
});

// Settings Logic
const settingsZoteroPath = document.getElementById('settings-zotero-path');
const settingsZoteroUserid = document.getElementById('settings-zotero-userid');
const settingsZoteroKey = document.getElementById('settings-zotero-key');
const settingsGeminiKey = document.getElementById('settings-gemini-key');
const saveSettingsBtn = document.getElementById('save-settings-btn');

function loadSettings() {
    if (settingsZoteroPath) settingsZoteroPath.value = localStorage.getItem('zoteroPath') || '';
    if (settingsZoteroUserid) settingsZoteroUserid.value = localStorage.getItem('zoteroUserId') || '';
    if (settingsZoteroKey) settingsZoteroKey.value = localStorage.getItem('zoteroApiKey') || '';
    if (settingsGeminiKey) settingsGeminiKey.value = localStorage.getItem('geminiApiKey') || '';
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        localStorage.setItem('zoteroPath', settingsZoteroPath.value.trim());
        localStorage.setItem('zoteroUserId', settingsZoteroUserid.value.trim());
        localStorage.setItem('zoteroApiKey', settingsZoteroKey.value.trim());
        localStorage.setItem('geminiApiKey', settingsGeminiKey.value.trim());
        
        const originalText = saveSettingsBtn.innerText;
        saveSettingsBtn.innerText = 'Saved!';
        setTimeout(() => {
            saveSettingsBtn.innerText = originalText;
        }, 1500);
    });
}
loadSettings();

// --- Zotero Integration Logic ---
const zoteroSyncBtn = document.getElementById('zotero-sync-btn');
const zoteroList = document.getElementById('zotero-list');

async function fetchZoteroData() {
    const zoteroCollectionsList = document.getElementById('zotero-collections');
    const zoteroList = document.getElementById('zotero-list');
    
    zoteroList.innerHTML = '<div style="color: var(--fg-dim); font-size: 0.8rem;">Loading Zotero...</div>';
    if(zoteroCollectionsList) zoteroCollectionsList.innerHTML = '<div style="color: var(--fg-dim); font-size: 0.8rem;">Loading Folders...</div>';
    
    const localPath = localStorage.getItem('zoteroPath');
    const userId = localStorage.getItem('zoteroUserId');
    const apiKey = localStorage.getItem('zoteroApiKey');
    
    const renderItems = (items, isApi) => {
        zoteroList.innerHTML = '';
        if (!items || items.length === 0) {
            zoteroList.innerHTML = '<div style="color: var(--fg-dim); font-size: 0.8rem;">No items found.</div>';
            return;
        }
        let visibleIdx = 0;
        items.forEach((item) => {
            if (isApi && item.data && item.data.itemType === 'note') return;
            const el = document.createElement('div');
            el.className = 'zotero-item animate-stagger-row';
            el.style.animationDelay = `${(0.3 + visibleIdx * 0.1).toFixed(2)}s`;
            visibleIdx++;
            
            const title = isApi ? (item.data.title || 'Untitled') : (item.title || 'Untitled');
            const date = isApi ? (item.data.dateAdded ? item.data.dateAdded.substring(0, 10) : '') : (item.dateAdded ? item.dateAdded.substring(0, 10) : '');
            const typeStr = isApi ? ` - ${item.data.itemType}` : '';
            const itemKey = isApi ? (item.data ? item.data.key : item.key) : item.key;
            
            el.innerHTML = `
                <div class="zotero-item-title">${(item.pdfPath || (isApi && item.data && item.data.contentType === 'application/pdf')) ? '<span style="color: var(--fg-dim);">[PDF]</span> ' : ''}${title}</div>
                <div class="zotero-item-meta">${date}${typeStr}</div>
            `;
            el.addEventListener('click', async () => {
                try {
                    let fullPath = null;
                    if (window.electronAPI && window.electronAPI.openPDFByKey) {
                        fullPath = await window.electronAPI.openPDFByKey(itemKey);
                    }
                    if (fullPath) {
                        window.currentPdfPath = fullPath;
                        const webview = document.getElementById('pdf-webview');
                        webview.src = `pdf-viewer.html?file=${encodeURIComponent(fullPath)}`;
                        const pdfTab = document.getElementById('pdf-tab');
                        pdfTab.style.display = 'block';
                        pdfTab.click();
                    } else if (window.electronAPI && window.electronAPI.openExternal) {
                        window.electronAPI.openExternal(`zotero://select/library/items/${itemKey}`);
                        if (geminiInput) {
                            geminiInput.value = `[Citation: ${title}] `;
                            document.querySelector('[data-target="gemini-view"]').click();
                            geminiInput.focus();
                        }
                    }
                } catch (err) {
                    alert("Error: " + err.message);
                }
            });
            zoteroList.appendChild(el);
        });
    };

    const renderTree = (collections, parentEl, parentId, isApi) => {
        const children = collections.filter(c => isApi ? c.data.parentCollection === (parentId || false) : c.parent_id === parentId);
        
        // Guarantee alphabetical order
        children.sort((a, b) => {
            const nameA = isApi ? (a.data.name || '') : (a.name || '');
            const nameB = isApi ? (b.data.name || '') : (b.name || '');
            return nameA.localeCompare(nameB);
        });

        if (children.length === 0) return;
        
        children.forEach(col => {
            const wrapper = document.createElement('div');
            const itemEl = document.createElement('div');
            itemEl.className = 'zotero-collection-item';
            
            const colKey = isApi ? col.key : col.key; 
            const colId = isApi ? col.key : col.id;
            const hasChildren = collections.some(c => isApi ? c.data.parentCollection === colKey : c.parent_id === colId);
            const colName = isApi ? col.data.name : col.name;
            
            let toggleHtml = '<div class="zotero-collection-toggle" style="width: 20px;"></div>';
            if (hasChildren) toggleHtml = `<div class="zotero-collection-toggle" style="width: 20px;">[+]</div>`;
            
            itemEl.innerHTML = `${toggleHtml}<span>${colName}</span>`;
            wrapper.appendChild(itemEl);
            
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'zotero-collection-children';
            
            if (hasChildren) {
                const toggleBtn = itemEl.querySelector('.zotero-collection-toggle');
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (childrenContainer.classList.contains('expanded')) {
                        childrenContainer.classList.remove('expanded');
                        toggleBtn.innerText = '[+]';
                    } else {
                        childrenContainer.classList.add('expanded');
                        toggleBtn.innerText = '[-]';
                    }
                });
                renderTree(collections, childrenContainer, colId, isApi);
                wrapper.appendChild(childrenContainer);
            }
            
            itemEl.addEventListener('click', async () => {
                const sidebar = document.getElementById('zotero-sidebar');
                if (sidebar) sidebar.querySelectorAll('.zotero-collection-item').forEach(el => el.classList.remove('active'));
                itemEl.classList.add('active');
                
                zoteroList.innerHTML = '<div style="color: var(--fg-dim); font-size: 0.8rem;">Loading items...</div>';
                try {
                    if (isApi) {
                        const itemsUrl = `https://api.zotero.org/users/${userId}/collections/${colKey}/items?v=3&key=${apiKey}&limit=50&sort=dateAdded&direction=desc`;
                        let data;
                        if (window.electronAPI && window.electronAPI.fetchZoteroAPI) {
                            data = await window.electronAPI.fetchZoteroAPI(itemsUrl);
                        } else {
                            const response = await fetch(itemsUrl);
                            data = await response.json();
                        }
                        renderItems(data, true);
                    } else {
                        const res = await window.electronAPI.queryZotero(localPath, 'get_collection_items', colId);
                        if (res.error) throw new Error(res.error);
                        renderItems(res.data, false);
                    }
                } catch(e) {
                    zoteroList.innerHTML = `<div style="color: var(--fg-dim); font-size: 0.8rem;">Error: ${e.message}</div>`;
                }
            });
            parentEl.appendChild(wrapper);
        });
    };

    try {
        if (userId && apiKey) { // Cloud API
            const colsUrl = `https://api.zotero.org/users/${userId}/collections?v=3&key=${apiKey}&limit=100`;
            let colsData;
            if (window.electronAPI && window.electronAPI.fetchZoteroAPI) {
                colsData = await window.electronAPI.fetchZoteroAPI(colsUrl);
            } else {
                const response = await fetch(colsUrl);
                colsData = await response.json();
            }
            if (colsData.error) throw new Error(colsData.error);
            
            if (zoteroCollectionsList) {
                zoteroCollectionsList.innerHTML = '';
                const recentEl = document.createElement('div');
                recentEl.className = 'zotero-collection-item active';
                recentEl.innerHTML = `<div class="zotero-collection-toggle" style="width: 20px;"></div><span>RECENT ITEMS</span>`;
                recentEl.addEventListener('click', () => { fetchZoteroData(); });
                zoteroCollectionsList.appendChild(recentEl);
                renderTree(colsData, zoteroCollectionsList, false, true);
            }
            
            const url = `https://api.zotero.org/users/${userId}/items?v=3&key=${apiKey}&limit=50&sort=dateAdded&direction=desc`;
            let data;
            if (window.electronAPI && window.electronAPI.fetchZoteroAPI) {
                data = await window.electronAPI.fetchZoteroAPI(url);
            } else {
                const response = await fetch(url);
                data = await response.json();
            }
            renderItems(data, true);
        } else { // Local DB
            const colsRes = await window.electronAPI.queryZotero(localPath, 'get_collections');
            if (colsRes.error) throw new Error(colsRes.error);
            
            if (zoteroCollectionsList) {
                zoteroCollectionsList.innerHTML = '';
                const recentEl = document.createElement('div');
                recentEl.className = 'zotero-collection-item active';
                recentEl.innerHTML = `<div class="zotero-collection-toggle" style="width: 20px;"></div><span>RECENT ITEMS</span>`;
                recentEl.addEventListener('click', () => { fetchZoteroData(); });
                zoteroCollectionsList.appendChild(recentEl);
                renderTree(colsRes.data, zoteroCollectionsList, null, false);
            }
            
            const res = await window.electronAPI.queryZotero(localPath, 'get_items');
            if (res.error) throw new Error(res.error);
            renderItems(res.data, false);
        }
    } catch(e) {
        zoteroList.innerHTML = `<div style="color: var(--fg-dim); font-size: 0.8rem;">Error: ${e.message}</div>`;
        if (zoteroCollectionsList) zoteroCollectionsList.innerHTML = '';
    }
}


if (zoteroSyncBtn) {
    zoteroSyncBtn.addEventListener('click', fetchZoteroData);
}

// --- Gemini Integration Logic ---
const geminiInput = document.getElementById('gemini-input');
const geminiSendBtn = document.getElementById('gemini-send-btn');
const geminiChatHistory = document.getElementById('gemini-chat-history');

let chatContext = [];

try {
    const savedChat = localStorage.getItem('geminiChatHistoryContext');
    if (savedChat) {
        chatContext = JSON.parse(savedChat);
        // Defer rendering to allow DOM to be ready
        setTimeout(() => {
            if (chatContext.length > 0 && geminiChatHistory) {
                geminiChatHistory.innerHTML = ''; // clear welcome message
                chatContext.forEach(msg => {
                    const role = msg.role === 'model' ? 'assistant' : msg.role;
                    appendGeminiMessage(role, msg.parts[0].text, true);
                });
            }
        }, 100);
    }
} catch (e) {
    console.error('Failed to load chat history', e);
}

// Notebook initialized by notebook_tree.js

async function sendGeminiMessage() {
    const text = geminiInput.value.trim();
    if (!text) return;
    
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        appendGeminiMessage('system', 'Please enter your Gemini API Key in the Settings tab first.');
        return;
    }
    
    appendGeminiMessage('user', text);
    geminiInput.value = '';
    
    let finalPrompt = text;
    if (window.chatAttachments && window.chatAttachments.length > 0) {
        const attachedText = window.chatAttachments.map(a => `[News at ${a.time}]\n${a.content}`).join('\n\n');
        finalPrompt = `Attached News Context:\n${attachedText}\n\nMy Question:\n${text}`;
        
        // Clear attachments
        window.chatAttachments = [];
        window.renderChatAttachments();
    }
    
    chatContext.push({ role: 'user', parts: [{ text: finalPrompt }] });
    localStorage.setItem('geminiChatHistoryContext', JSON.stringify(chatContext));
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
    
    try {
        const loadingId = 'loading-' + Date.now();
        const loadingEl = document.createElement('div');
        loadingEl.className = 'gemini-message system animate-slide-up';
        loadingEl.id = loadingId;
        loadingEl.innerText = 'Thinking...';
        geminiChatHistory.appendChild(loadingEl);
        geminiChatHistory.scrollTop = geminiChatHistory.scrollHeight;
        
        let systemContext = "You are an intelligent financial AI assistant embedded inside a professional stock analysis application. Provide concise, insightful, and professional answers.";
        
        const notebookEl = document.getElementById('chat-notebook');
        if (notebookEl && notebookEl.value.trim()) {
            systemContext += "\n\n[USER NOTEBOOK CONTENT]\n" + notebookEl.value.trim();
        }
        
        if (document.body.classList.contains('domestic-active')) {
            const feedMain = document.getElementById('domestic-feed-main');
            const feedSide = document.getElementById('domestic-feed');
            const visibleText = (feedMain ? feedMain.innerText : "") + "\n" + (feedSide ? feedSide.innerText : "");
            if (visibleText.trim()) {
                systemContext += "\n\n[VISIBLE UI CONTEXT: DOMESTIC MACRO NEWS]\nThe user is currently looking at the following domestic macro news on their screen:\n" + visibleText.substring(0, 10000);
            }
        } else if (document.body.classList.contains('screener-active')) {
            const screenerResults = document.getElementById('screener-results');
            if (screenerResults && screenerResults.innerText.trim()) {
                systemContext += "\n\n[VISIBLE UI CONTEXT: STOCK SCREENER RESULTS]\nThe user is currently looking at the following stock screener results on their screen:\n" + screenerResults.innerText.substring(0, 10000);
            }
        } else if (document.body.classList.contains('reverse-active')) {
            const reverseResults = document.getElementById('reverse-results-side');
            if (reverseResults && reverseResults.innerText.trim()) {
                systemContext += "\n\n[VISIBLE UI CONTEXT: REVERSE LIST]\nThe user is currently looking at the following reverse-lookup list on their screen:\n" + reverseResults.innerText.substring(0, 10000);
            }
        }
        
        const requestBody = {
            systemInstruction: { parts: [{ text: systemContext }] },
            contents: chatContext
        };
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        document.getElementById(loadingId)?.remove();
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'API Error');
        }
        
        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (reply) {
            chatContext.push({ role: 'model', parts: [{ text: reply }] });
            localStorage.setItem('geminiChatHistoryContext', JSON.stringify(chatContext));
            appendGeminiMessage('assistant', reply);
        } else {
            appendGeminiMessage('system', 'Received empty response.');
        }
    } catch (e) {
        appendGeminiMessage('system', `Error: ${e.message}`);
    }
}

function appendGeminiMessage(role, text, isRestore = false) {
    const el = document.createElement('div');
    el.className = `gemini-message ${role}${isRestore ? '' : ' animate-slide-up'}`;
    
    // Replace newlines with <br> for simple formatting
    el.innerHTML = text.replace(/\n/g, '<br>');
    
    if (role === 'assistant') {
        const btnContainer = document.createElement('div');
        btnContainer.style.textAlign = 'right';
        btnContainer.style.marginTop = '0.8rem';
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '10px';
        
        const clearBtn = document.createElement('button');
        clearBtn.innerText = 'CLEAR CHAT';
        clearBtn.className = 'btn-minimal';
        clearBtn.style.fontSize = '0.55rem';
        clearBtn.style.padding = '3px 8px';
        clearBtn.style.opacity = '0.4';
        clearBtn.style.cursor = 'pointer';
        clearBtn.style.letterSpacing = '0.1em';
        clearBtn.style.color = '#ff6b6b'; // subtle red tint
        
        clearBtn.addEventListener('mouseenter', () => clearBtn.style.opacity = '1');
        clearBtn.addEventListener('mouseleave', () => clearBtn.style.opacity = '0.4');
        
        clearBtn.addEventListener('click', () => {
            chatContext = [];
            localStorage.removeItem('geminiChatHistoryContext');
            const chatHistory = document.getElementById('gemini-chat-history');
            if (chatHistory) {
                chatHistory.innerHTML = '<div class="gemini-message system">Chat history cleared.</div>';
            }
        });

        const btn = document.createElement('button');
        btn.innerText = 'CLIP TO NOTEBOOK';
        btn.className = 'btn-minimal';
        btn.style.fontSize = '0.55rem';
        btn.style.padding = '3px 8px';
        btn.style.opacity = '0.5';
        btn.style.cursor = 'pointer';
        btn.style.letterSpacing = '0.1em';
        
        btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
        btn.addEventListener('mouseleave', () => btn.style.opacity = '0.5');
        
        btn.addEventListener('click', () => {
            const notebook = document.getElementById('chat-notebook');
            if (notebook) {
                if (notebook.value.trim().length > 0) {
                    notebook.value += '\n\n----------------------------------------\n\n';
                }
                notebook.value += text;
                notebook.scrollTop = notebook.scrollHeight;
                
                // Save using the global function from notebook_tree.js
                if (typeof saveNotebookData === 'function' && typeof activeNoteId !== 'undefined' && activeNoteId) {
                    const info = typeof findNodeInfo === 'function' ? findNodeInfo(notebookData, activeNoteId) : null;
                    if (info && info.node.type === 'note') {
                        info.node.content = notebook.value;
                        saveNotebookData();
                    }
                }
                
                const origText = btn.innerText;
                btn.innerText = 'SAVED ✓';
                setTimeout(() => btn.innerText = origText, 1500);
            }
        });
        
        btnContainer.appendChild(clearBtn);
        btnContainer.appendChild(btn);
        el.appendChild(btnContainer);
    }
    
    geminiChatHistory.appendChild(el);
    geminiChatHistory.scrollTop = geminiChatHistory.scrollHeight;
}

if (geminiSendBtn) {
    geminiSendBtn.addEventListener('click', sendGeminiMessage);
}
if (geminiInput) {
    geminiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendGeminiMessage();
        }
    });
}

const popoutBtn = document.getElementById('pdf-popout-btn');
if (popoutBtn) {
    popoutBtn.addEventListener('click', () => {
        if (window.currentPdfPath && window.electronAPI && window.electronAPI.openPDFWindow) {
            window.electronAPI.openPDFWindow(window.currentPdfPath);
        }
    });
}

fetchZoteroData();

// Zotero Split View Resizer Logic
const zoteroResizer = document.getElementById('zotero-resizer');
let isZoteroResizing = false;

if (zoteroResizer) {
    zoteroResizer.addEventListener('mousedown', (e) => {
        isZoteroResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isZoteroResizing) return;
        
        const zoteroView = document.getElementById('zotero-view');
        const zoteroCollectionsList = document.getElementById('zotero-collections');
        if (!zoteroView || !zoteroCollectionsList) return;
        
        const containerRect = zoteroView.getBoundingClientRect();
        let newWidth = e.clientX - containerRect.left;
        
        if (newWidth < 120) newWidth = 120;
        if (newWidth > containerRect.width - 200) newWidth = containerRect.width - 200;
        
        zoteroCollectionsList.style.flex = `0 0 ${newWidth}px`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isZoteroResizing) {
            isZoteroResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}


// ==========================================
// Screener Logic
// ==========================================
{
const navItemsScreener = document.querySelectorAll('.nav-item');
const screenerBtn = document.getElementById('screener-execute-btn');
const screenerMin = document.getElementById('screener-min');
const screenerMax = document.getElementById('screener-max');
const screenerResults = document.getElementById('screener-results');

navItemsScreener.forEach(item => {
    item.addEventListener('click', (e) => {
        const text = e.target.innerText.trim().toUpperCase();
        const researchPanel = document.getElementById('research-panel');
        if (text === 'SCREENER') {
            if (researchPanel) {
                const rect = researchPanel.getBoundingClientRect();
                researchPanel.style.flex = `0 0 ${rect.width}px`;
                const sideBtn = document.querySelector('.research-tab[data-target="screener-view"]');
                if (sideBtn && sideBtn.classList.contains('active')) {
                    const geminiBtn = document.querySelector('.research-tab[data-target="gemini-view"]');
                    if (geminiBtn) geminiBtn.click();
                }
            }
            document.body.classList.add('screener-active');
            document.body.classList.remove('reverse-active', 'domestic-active');
            navItemsScreener.forEach(n => n.classList.remove('active'));
            e.target.classList.add('active');
            replayAllAnimations();
        } else if (text === 'REVERSE') {
            if (researchPanel) {
                const rect = researchPanel.getBoundingClientRect();
                researchPanel.style.flex = `0 0 ${rect.width}px`;
                const sideBtn = document.querySelector('.research-tab[data-target="reverse-view"]');
                if (sideBtn && sideBtn.classList.contains('active')) {
                    const geminiBtn = document.querySelector('.research-tab[data-target="gemini-view"]');
                    if (geminiBtn) geminiBtn.click();
                }
            }
            document.body.classList.add('reverse-active');
            document.body.classList.remove('screener-active', 'domestic-active');
            navItemsScreener.forEach(n => n.classList.remove('active'));
            e.target.classList.add('active');
            replayAllAnimations();
        } else if (text === 'DOMESTIC') {
            if (researchPanel) {
                const rect = researchPanel.getBoundingClientRect();
                researchPanel.style.flex = `0 0 ${rect.width}px`;
                
                // Always switch to Gemini when entering Global Domestic mode
                const geminiBtn = document.querySelector('.research-tab[data-target="gemini-view"]');
                if (geminiBtn) geminiBtn.click();
            }
            document.body.classList.add('domestic-active');
            document.body.classList.remove('screener-active', 'reverse-active');
            navItemsScreener.forEach(n => n.classList.remove('active'));
            e.target.classList.add('active');
            replayAllAnimations();
            
            // Trigger fetch for domestic news if not already loaded
            fetchDomesticMacroNews();
        } else if (text === 'INSIGHTS') {
            if (researchPanel) {
                researchPanel.style.flex = ''; // Restore original flex
            }
            document.body.classList.remove('screener-active', 'reverse-active', 'domestic-active');
            navItemsScreener.forEach(n => n.classList.remove('active'));
            e.target.classList.add('active');
            replayAllAnimations();
        }
    });
});

async function executeScreenerLogic(btn, minInput, maxInput, resultsContainer) {
    if (btn.disabled) return;
    btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerText = 'Processing...';
    resultsContainer.innerHTML = '';
    
    const minP = parseFloat(minInput.value) || 0;
    const maxP = parseFloat(maxInput.value) || 99999;
    
    try {
        const url = "http://82.push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5000&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f12,f14,f2,f3,f9,f23";
        let res;
        if (window.electronAPI && window.electronAPI.fetchFinancialData) {
            res = await window.electronAPI.fetchFinancialData(url);
        } else {
            const resp = await fetch(url);
            res = await resp.json();
        }
        
        let data = typeof res === 'string' ? JSON.parse(res) : res;
        let diff = data?.data?.diff || [];
        
        // Filter by price
        const filtered = diff.filter(row => {
            const price = parseFloat(row.f2);
            if (isNaN(price)) return false;
            return price >= minP && price <= maxP;
        }).slice(0, 100);
        
        // Render
        filtered.forEach((row, idx) => {
            const div = document.createElement('div');
            div.className = 'list-row animate-screener-row';
            // Stagger animation exactly like TrackPort: delayChildren=0.5, staggerChildren=0.1
            div.style.animationDelay = `${(0.5 + idx * 0.1).toFixed(2)}s`;
            
            const change = parseFloat(row.f3) || 0;
            const changeClass = change >= 0 ? 'positive' : 'negative';
            const changeSign = change > 0 ? '+' : '';
            
            div.innerHTML = `
                <div class="row-col col-code">${row.f12 || '-'}</div>
                <div class="row-col col-name">${row.f14 || '-'}</div>
                <div class="row-col col-price">${row.f2 === '-' ? '-' : row.f2}</div>
                <div class="row-col mono ${changeClass}">${changeSign}${row.f3 === '-' ? '0' : row.f3}%</div>
                <div class="row-col mono">${row.f9 === '-' ? '-' : row.f9}</div>
                <div class="row-col mono">${row.f23 === '-' ? '-' : row.f23}</div>
            `;
            resultsContainer.appendChild(div);
        });
        
    } catch(e) {
        console.error("Screener Error:", e);
        resultsContainer.innerHTML = `<div class="mono negative" style="padding: 2rem;">Error fetching data: ${e.message}</div>`;
    }
    
    btn.disabled = false;
    btn.innerText = originalText;
}

if (screenerBtn) {
    screenerBtn.addEventListener('click', () => executeScreenerLogic(screenerBtn, screenerMin, screenerMax, screenerResults));
}
const screenerBtnSide = document.getElementById('screener-execute-btn-side');
const screenerMinSide = document.getElementById('screener-min-side');
const screenerMaxSide = document.getElementById('screener-max-side');
const screenerResultsSide = document.getElementById('screener-results-side');
if (screenerBtnSide) {
    screenerBtnSide.addEventListener('click', () => executeScreenerLogic(screenerBtnSide, screenerMinSide, screenerMaxSide, screenerResultsSide));
}
}

const reverseBtn = document.getElementById('reverse-execute-btn');
const reverseSymbols = document.getElementById('reverse-symbols');
const reverseResults = document.getElementById('reverse-results');
// (Original executeReverse listener was removed and moved below executeReverseLogic)

async function executeReverseLogic(btn, symbolsInputEl, resultsContainer) {
    if (btn.disabled) return;
    const symbolsInput = symbolsInputEl.value.trim();
    if (!symbolsInput) return;
    
    const symbols = symbolsInput.split(',').map(s => s.trim()).filter(Boolean);
    if (symbols.length === 0) return;

    btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerText = 'Analyzing...';
    resultsContainer.innerHTML = '';
    
    try {
        const url = "http://82.push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5000&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f12,f14,f2,f3,f9,f23";
        let res;
        if (window.electronAPI && window.electronAPI.fetchFinancialData) {
            res = await window.electronAPI.fetchFinancialData(url);
        } else {
            const resp = await fetch(url);
            res = await resp.json();
        }
        
        let data = typeof res === 'string' ? JSON.parse(res) : res;
        let diff = data?.data?.diff || [];
        
        let validPE = [];
        let validPB = [];
        
        for (const item of diff) {
            if (symbols.includes(item.f12)) {
                if (item.f9 !== '-' && item.f9 != null) validPE.push(parseFloat(item.f9));
                if (item.f23 !== '-' && item.f23 != null) validPB.push(parseFloat(item.f23));
            }
        }
        
        if (validPE.length === 0 && validPB.length === 0) {
            resultsContainer.innerHTML = '<div class="negative mono animate-fade" style="margin-top: 2rem; font-size: 1.5rem; opacity: 0; animation-delay: 0.1s; animation-fill-mode: forwards;">未能在市场中找到指定的股票数据或无可用的估值数据</div>';
        } else {
            const avgPE = validPE.length > 0 ? (validPE.reduce((a,b) => a+b, 0) / validPE.length).toFixed(2) : 'N/A';
            const avgPB = validPB.length > 0 ? (validPB.reduce((a,b) => a+b, 0) / validPB.length).toFixed(2) : 'N/A';
            
            resultsContainer.innerHTML = `
                <div class="analysis-grid animate-slide-up" style="animation-delay: 0.1s; opacity: 0; animation-fill-mode: forwards;">
                  <div class="metric-card"><div class="metric-label">Average P/E Dynamic</div><div class="metric-value">${avgPE}</div></div>
                  <div class="metric-card"><div class="metric-label">Average P/B Ratio</div><div class="metric-value">${avgPB}</div></div>
                </div>
            `;
        }
    } catch (e) {
        console.error(e);
        resultsContainer.innerHTML = `<div class="negative mono animate-fade" style="margin-top: 2rem; font-size: 1.5rem; opacity: 0; animation-delay: 0.1s; animation-fill-mode: forwards;">请求失败: ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

if (reverseBtn) {
    reverseBtn.addEventListener('click', () => executeReverseLogic(reverseBtn, reverseSymbols, reverseResults));
}
const reverseBtnSide = document.getElementById('reverse-execute-btn-side');
const reverseSymbolsSide = document.getElementById('reverse-symbols-side');
const reverseResultsSide = document.getElementById('reverse-results-side');
if (reverseBtnSide) {
    reverseBtnSide.addEventListener('click', () => executeReverseLogic(reverseBtnSide, reverseSymbolsSide, reverseResultsSide));
}

// === New Tab Logic (Domestic & Watchlist) ===
const watchlistSymbolsInput = document.getElementById('watchlist-symbols-input');
const watchlistLoadBtn = document.getElementById('watchlist-load-btn');
const watchlistFeed = document.getElementById('watchlist-feed');
const domesticFeed = document.getElementById('domestic-feed');
let domesticLoaded = false;
let domesticRefreshInterval = null;

if (watchlistLoadBtn) {
    watchlistLoadBtn.addEventListener('click', loadWatchlistNews);
}

// Track the newest seen timestamp to detect new items on refresh
let domesticNewestTime = 0;

let savedDomesticNews = new Set(JSON.parse(localStorage.getItem('savedDomesticNews') || '[]'));
let currentDomesticFilter = 'all';

function getNewsCategories(text) {
    const categories = [];
    if (/(科技|芯片|半导体|苹果|微软|英伟达|AI|人工智能|互联网|算法|模型|大厂)/i.test(text)) categories.push('tech');
    if (/(能源|石油|原油|天然气|太阳能|电池|新能源|油价|电力|煤炭|风电)/i.test(text)) categories.push('energy');
    if (/(政治|大选|拜登|特朗普|总统|议会|政府|选举|法案|政策|外交|官员|地缘)/i.test(text)) categories.push('politics');
    if (/(投资|基金|股市|资本|投行|证券|融资|股票|财报|收益|分红|回购|A股|美股|外汇)/i.test(text)) categories.push('invest');
    if (/(贸易|关税|出口|进口|进出口|顺差|逆差|WTO|制裁|海关|电商)/i.test(text)) categories.push('trade');
    if (/(国内|中国|央行|沪指|深成指|人民币|国家|国务院|经济数据|统计局|发改委|内需|市场)/i.test(text)) categories.push('domestic');
    if (/(全球|美国|美联储|欧洲|海外|道指|纳指|标普|国际|日元|欧元|美元)/i.test(text)) categories.push('global');
    return categories;
}

document.addEventListener('dblclick', (e) => {
    const itemEl = e.target.closest('.macro-news-item');
    if (itemEl && itemEl.dataset.id) {
        const itemId = itemEl.dataset.id;
        if (savedDomesticNews.has(itemId)) {
            savedDomesticNews.delete(itemId);
            document.querySelectorAll(`.macro-news-item[data-id="${CSS.escape(itemId)}"]`).forEach(el => el.classList.remove('saved'));
        } else {
            savedDomesticNews.add(itemId);
            document.querySelectorAll(`.macro-news-item[data-id="${CSS.escape(itemId)}"]`).forEach(el => el.classList.add('saved'));
        }
        localStorage.setItem('savedDomesticNews', JSON.stringify([...savedDomesticNews]));
        applyDomesticFilter();
    }
});

// --- News Chat Attachments Logic ---
window.chatAttachments = [];

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('attach-news-btn')) {
        e.stopPropagation();
        const itemEl = e.target.closest('.macro-news-item');
        const content = itemEl.querySelector('.news-content').innerText;
        const time = e.target.dataset.time;
        
        if (!window.chatAttachments.find(a => a.time === time && a.content === content)) {
            window.chatAttachments.push({ time, content });
            window.renderChatAttachments();
        }
    }
});

window.renderChatAttachments = function() {
    const container = document.getElementById('chat-attachments-container');
    if (!container) return;
    
    container.innerHTML = '';
    window.chatAttachments.forEach((att, index) => {
        const pill = document.createElement('div');
        pill.style.display = 'flex';
        pill.style.alignItems = 'center';
        pill.style.gap = '0.5rem';
        pill.style.background = 'rgba(255,255,255,0.05)';
        pill.style.padding = '4px 8px';
        pill.style.borderRadius = '4px';
        pill.style.fontSize = '0.7rem';
        pill.style.color = 'var(--fg-dim)';
        
        const textSpan = document.createElement('span');
        textSpan.style.flex = '1';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.textContent = `[${att.time}] ${att.content}`;
        
        const rmBtn = document.createElement('button');
        rmBtn.textContent = '✕';
        rmBtn.style.background = 'transparent';
        rmBtn.style.border = 'none';
        rmBtn.style.color = 'var(--fg-dim)';
        rmBtn.style.cursor = 'pointer';
        rmBtn.onclick = () => {
            window.chatAttachments.splice(index, 1);
            window.renderChatAttachments();
        };
        
        pill.appendChild(textSpan);
        pill.appendChild(rmBtn);
        container.appendChild(pill);
    });
};

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-tab')) {
        document.querySelectorAll('#domestic-panel .filter-tab').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        currentDomesticFilter = e.target.dataset.filter;
        applyDomesticFilter();
    }
});

function applyDomesticFilter() {
    document.querySelectorAll('.macro-news-item').forEach(el => {
        if (!el.dataset.id) return;
        
        // Let's implement what the user asked: "把我点亮的news归档合适的tab"
        // This implies that clicking 'Tech' should ONLY show *saved* tech news.
        // Wait, what if they want to just browse all tech news? 
        // A middle ground: show all news that matches the filter, but if it is saved, it's easier to find.
        // Actually, if they strictly mean "classify my saved news into tabs", then a tab other than 'all' might only show saved news.
        // Let's just filter ALL news by category, and saved ones will naturally appear there with highlights.
        
        if (currentDomesticFilter === 'all') {
            el.style.display = '';
        } else if (currentDomesticFilter === 'saved') {
            el.style.display = el.classList.contains('saved') ? '' : 'none';
        } else {
            const cats = el.dataset.categories ? el.dataset.categories.split(' ') : [];
            // To ensure the user sees their "saved" news in the appropriate tab,
            // we filter by category matching. (Saved items that match will also show up).
            el.style.display = cats.includes(currentDomesticFilter) ? '' : 'none';
        }
    });
}

function updateDomesticStatusLabel(count) {
    const el = document.getElementById('domestic-status');
    const elMain = document.getElementById('domestic-status-main');
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const txt = `LAST 24H  ${count} ITEMS  ${h}:${m}`;
    if (el) el.textContent = txt;
    if (elMain) elMain.textContent = txt;
}

async function fetchDomesticMacroNews(force = false) {
    if (domesticLoaded && !force) {
        // Tab switched back: re-trigger animations on existing items
        const items = domesticFeed.querySelectorAll('.macro-news-item');
        items.forEach((el, i) => {
            el.style.animation = 'none';
            el.offsetHeight;
            el.style.animation = '';
            el.style.animationDelay = `${(0.05 + i * 0.05).toFixed(2)}s`;
        });
        return;
    }
    try {
        const now = Date.now();
        const cutoff = now - 24 * 60 * 60 * 1000;
        let list = [];
        let page = 1;
        
        while (true) {
            const url = `https://zhibo.sina.com.cn/api/zhibo/feed?page=${page}&page_size=100&zhibo_id=152`;
            let res;
            if (window.electronAPI && window.electronAPI.fetchFinancialData) {
                res = await window.electronAPI.fetchFinancialData(url);
            } else {
                const resp = await fetch(url);
                res = await resp.json();
            }
            const data = typeof res === 'string' ? JSON.parse(res) : res;
            const rawList = data?.result?.data?.feed?.list || [];
            
            if (rawList.length === 0) break;
            
            let reachedCutoff = false;
            for (const item of rawList) {
                const t = new Date(item.create_time.replace(' ', 'T')).getTime();
                if (!isNaN(t)) {
                    if (t >= cutoff) {
                        list.push(item);
                    } else {
                        reachedCutoff = true;
                    }
                }
            }
            if (reachedCutoff || page >= 10) break; // Fetch up to 10 pages (~1000 items)
            page++;
        }

        if (!domesticLoaded) {
            // === First Load: render everything with stagger animation ===
            const domesticFeedMain = document.getElementById('domestic-feed-main');
            domesticFeed.innerHTML = '';
            if (domesticFeedMain) domesticFeedMain.innerHTML = '';
            
            if (list.length === 0) {
                const emptyStr = `<div class="mono" style="color: var(--fg-dim);">No news in the last 24 hours.</div>`;
                domesticFeed.innerHTML = emptyStr;
                if (domesticFeedMain) domesticFeedMain.innerHTML = emptyStr;
            } else {
                const domesticFeedMain = document.getElementById('domestic-feed-main');
                list.forEach((item, i) => {
                    const delay = `${(0.05 + i * 0.05).toFixed(2)}s`;
                    const innerStr = `
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.4rem;">
                            <div class="news-time mono" style="margin-bottom: 0;">${item.create_time}</div>
                            <button class="attach-news-btn" data-time="${item.create_time}" title="Attach to Chat" style="background: transparent; border: 1px solid var(--border); color: var(--fg-dim); font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; cursor: pointer; opacity: 0; transition: opacity 0.2s, background 0.2s;">+ CHAT</button>
                        </div>
                        <div class="news-content">${item.rich_text}</div>
                    `;
                    const itemId = btoa(unescape(encodeURIComponent(item.create_time + item.rich_text.substring(0, 20)))).replace(/[^a-zA-Z0-9]/g, '');
                    const isSaved = savedDomesticNews.has(itemId);
                    const savedClass = isSaved ? ' saved' : '';
                    const itemCategories = getNewsCategories(item.rich_text).join(' ');
                    
                    const el1 = document.createElement('div');
                    el1.className = 'macro-news-item animate-stagger-row' + savedClass;
                    el1.style.animationDelay = delay;
                    el1.dataset.time = item.create_time;
                    el1.dataset.id = itemId;
                    el1.dataset.categories = itemCategories;
                    
                    if (currentDomesticFilter === 'saved' && !isSaved) el1.style.display = 'none';
                    else if (currentDomesticFilter !== 'all' && currentDomesticFilter !== 'saved' && !itemCategories.includes(currentDomesticFilter)) el1.style.display = 'none';
                    
                    el1.innerHTML = innerStr;
                    domesticFeed.appendChild(el1);
                    
                    if (domesticFeedMain) {
                        const el2 = document.createElement('div');
                        el2.className = 'macro-news-item animate-stagger-row' + savedClass;
                        el2.style.animationDelay = delay;
                        el2.dataset.time = item.create_time;
                        el2.dataset.id = itemId;
                        el2.dataset.categories = itemCategories;
                        
                        if (currentDomesticFilter === 'saved' && !isSaved) el2.style.display = 'none';
                        else if (currentDomesticFilter !== 'all' && currentDomesticFilter !== 'saved' && !itemCategories.includes(currentDomesticFilter)) el2.style.display = 'none';
                        
                        el2.innerHTML = innerStr;
                        domesticFeedMain.appendChild(el2);
                    }
                });
                // Track newest time
                const times = list.map(it => new Date(it.create_time.replace(' ', 'T')).getTime()).filter(t => !isNaN(t));
                if (times.length) domesticNewestTime = Math.max(...times);
            }
            domesticLoaded = true;
            updateDomesticStatusLabel(list.length);

            // Start auto-refresh every 2 minutes (only once)
            if (!domesticRefreshInterval) {
                domesticRefreshInterval = setInterval(() => {
                    fetchDomesticMacroNews(true);
                }, 2 * 60 * 1000);
            }
        } else {
            // === Refresh: only prepend genuinely new items ===
            const newItems = list.filter(item => {
                const t = new Date(item.create_time.replace(' ', 'T')).getTime();
                return !isNaN(t) && t > domesticNewestTime;
            });

            if (newItems.length > 0) {
                // Prepend new items with slide-down animation
                const firstExisting = domesticFeed.firstChild;
                const domesticFeedMain = document.getElementById('domestic-feed-main');
                const firstExistingMain = domesticFeedMain ? domesticFeedMain.firstChild : null;
                
                newItems.reverse().forEach((item, i) => {
                    const delay = `${(i * 0.12).toFixed(2)}s`;
                    const innerStr = `
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.4rem;">
                            <div class="news-time mono" style="margin-bottom: 0;">${item.create_time}</div>
                            <button class="attach-news-btn" data-time="${item.create_time}" title="Attach to Chat" style="background: transparent; border: 1px solid var(--border); color: var(--fg-dim); font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; cursor: pointer; opacity: 0; transition: opacity 0.2s, background 0.2s;">+ CHAT</button>
                        </div>
                        <div class="news-content">${item.rich_text}</div>
                    `;
                    
                    const itemId = btoa(unescape(encodeURIComponent(item.create_time + item.rich_text.substring(0, 20)))).replace(/[^a-zA-Z0-9]/g, '');
                    const isSaved = savedDomesticNews.has(itemId);
                    const savedClass = isSaved ? ' saved' : '';
                    const itemCategories = getNewsCategories(item.rich_text).join(' ');
                    
                    const el1 = document.createElement('div');
                    el1.className = 'macro-news-item animate-slide-down-new' + savedClass;
                    el1.style.animationDelay = delay;
                    el1.dataset.time = item.create_time;
                    el1.dataset.id = itemId;
                    el1.dataset.categories = itemCategories;
                    
                    if (currentDomesticFilter === 'saved' && !isSaved) el1.style.display = 'none';
                    else if (currentDomesticFilter !== 'all' && currentDomesticFilter !== 'saved' && !itemCategories.includes(currentDomesticFilter)) el1.style.display = 'none';
                    
                    el1.innerHTML = innerStr;
                    domesticFeed.insertBefore(el1, firstExisting);
                    
                    if (domesticFeedMain) {
                        const el2 = document.createElement('div');
                        el2.className = 'macro-news-item animate-slide-down-new' + savedClass;
                        el2.style.animationDelay = delay;
                        el2.dataset.time = item.create_time;
                        el2.dataset.id = itemId;
                        el2.dataset.categories = itemCategories;
                        
                        if (currentDomesticFilter === 'saved' && !isSaved) el2.style.display = 'none';
                        else if (currentDomesticFilter !== 'all' && currentDomesticFilter !== 'saved' && !itemCategories.includes(currentDomesticFilter)) el2.style.display = 'none';
                        
                        el2.innerHTML = innerStr;
                        domesticFeedMain.insertBefore(el2, firstExistingMain);
                    }
                });
                // Update newest tracker
                const times = newItems.map(it => new Date(it.create_time.replace(' ', 'T')).getTime()).filter(t => !isNaN(t));
                if (times.length) domesticNewestTime = Math.max(domesticNewestTime, ...times);
            }
            // Always silently update the label
            updateDomesticStatusLabel(list.length);
        }
    } catch (e) {
        console.error(e);
        if (domesticFeed) {
            domesticFeed.innerHTML = `<div class="mono negative">Error loading macro news: ${e.message}</div>`;
        }
    }
}

async function loadWatchlistNews() {
    if (!watchlistLoadBtn) return;
    const input = watchlistSymbolsInput.value.trim();
    if (!input) return;
    const symbols = input.split(',').map(s => s.trim()).filter(Boolean);
    if (symbols.length === 0) return;
    
    watchlistLoadBtn.disabled = true;
    watchlistLoadBtn.innerText = 'LOADING...';
    watchlistFeed.innerHTML = '';
    
    let globalIdx = 0;
    try {
        for (const sym of symbols) {
            const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=10&page_index=1&ann_type=A&client_source=web&stock_list=${sym}`;
            let res;
            if (window.electronAPI && window.electronAPI.fetchFinancialData) {
                res = await window.electronAPI.fetchFinancialData(url);
            } else {
                const resp = await fetch(url);
                res = await resp.json();
            }
            const data = typeof res === 'string' ? JSON.parse(res) : res;
            const list = data?.data?.list || [];
            
            const groupEl = document.createElement('div');
            groupEl.className = 'animate-stagger-row';
            groupEl.style.animationDelay = `${(0.05 + globalIdx * 0.08).toFixed(2)}s`;
            globalIdx++;
            
            groupEl.innerHTML = `<h3 class="mono" style="color: var(--fg-dim); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem;">${sym}</h3>`;
            
            if (list.length === 0) {
                groupEl.innerHTML += `<div class="mono" style="margin-bottom: 1rem;">No recent news.</div>`;
            } else {
                list.forEach(item => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'animate-stagger-row';
                    itemEl.style.cssText = `margin-bottom: 1rem; animation-delay: ${(0.05 + globalIdx * 0.08).toFixed(2)}s;`;
                    globalIdx++;
                    itemEl.innerHTML = `
                        <div class="mono" style="font-size: 0.75rem; color: var(--fg-dim);">${item.display_time}</div>
                        <div style="font-size: 1rem; font-weight: 300;">${item.title}</div>
                    `;
                    groupEl.appendChild(itemEl);
                });
            }
            watchlistFeed.appendChild(groupEl);
        }
    } catch (e) {
        console.error(e);
        watchlistFeed.innerHTML = `<div class="mono negative">Error loading watchlist news: ${e.message}</div>`;
    } finally {
        watchlistLoadBtn.disabled = false;
        watchlistLoadBtn.innerText = 'LOAD';
    }
}

// === Drag and Drop Tabs ===
const tabsContainer = document.querySelector('.research-tabs');
let draggedTab = null;

// Restore saved tab order
const savedTabOrder = JSON.parse(localStorage.getItem('researchTabOrder') || 'null');
if (savedTabOrder && Array.isArray(savedTabOrder) && tabsContainer) {
    savedTabOrder.forEach(id => {
        const tab = document.getElementById(id);
        if (tab) tabsContainer.appendChild(tab);
    });
}

function setupDragAndDrop() {
    const tabs = document.querySelectorAll('.research-tab');
    tabs.forEach(tab => {
        tab.setAttribute('draggable', true);
        
        // Remove old listeners if any by cloning (not really needed if we only run once, but safe)
        
        tab.addEventListener('dragstart', function(e) {
            draggedTab = this;
            setTimeout(() => this.style.opacity = '0.5', 0);
        });
        
        tab.addEventListener('dragend', function() {
            draggedTab = null;
            this.style.opacity = '1';
        });
        
        tab.addEventListener('dragover', function(e) {
            e.preventDefault();
        });
        
        tab.addEventListener('dragenter', function(e) {
            e.preventDefault();
            this.style.transform = 'scale(1.05)';
        });
        
        tab.addEventListener('dragleave', function() {
            this.style.transform = '';
        });
        
        tab.addEventListener('drop', function(e) {
            this.style.transform = '';
            if (draggedTab && draggedTab !== this) {
                const allTabs = [...tabsContainer.querySelectorAll('.research-tab')];
                const draggedIdx = allTabs.indexOf(draggedTab);
                const droppedIdx = allTabs.indexOf(this);
                
                if (draggedIdx < droppedIdx) {
                    this.parentNode.insertBefore(draggedTab, this.nextSibling);
                } else {
                    this.parentNode.insertBefore(draggedTab, this);
                }
                
                // Save new order
                const newOrder = [...tabsContainer.querySelectorAll('.research-tab')].map(t => t.id);
                localStorage.setItem('researchTabOrder', JSON.stringify(newOrder));
            }
        });
    });
}
setupDragAndDrop();
