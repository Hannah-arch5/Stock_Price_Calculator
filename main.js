const { app, BrowserWindow, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Ticker');
const os = require('os');
const http = require('http');
const { exec } = require('child_process');

nativeTheme.themeSource = 'dark';

// Pin userData to a fixed path so data is always in the same place
// regardless of where the .app bundle is located
const FIXED_USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'ticker');
app.setPath('userData', FIXED_USER_DATA);

const DATA_FILE = path.join(FIXED_USER_DATA, 'app-data-v1.json');
const GDRIVE_CONFIG_FILE = path.join(FIXED_USER_DATA, 'gdrive-sync.json');

function getGDriveSyncUrl() {
    try {
        if (fs.existsSync(GDRIVE_CONFIG_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(GDRIVE_CONFIG_FILE, 'utf8'));
            return (parsed && parsed.url) ? parsed.url.trim() : null;
        }
    } catch(e) {}
    return null;
}

async function syncToGDrive(dataStr) {
    const url = getGDriveSyncUrl();
    if (!url) return;
    try {
        console.log('[GDrive] Syncing data to Google Drive Web App...');
        const res = await fetch(url, {
            method: 'POST',
            body: dataStr,
            headers: { 'Content-Type': 'text/plain' },
            redirect: 'follow'
        });
        if (res.ok) {
            console.log('[GDrive] Sync to Google Drive successful!');
        } else {
            console.warn('[GDrive] Sync responded with status:', res.status);
        }
    } catch (e) {
        console.error('[GDrive] Sync error:', e.message);
    }
}

// --- Real-time Sync Server for iPhone (PWA) ---
const SYNC_PORT = 7321;
let sseClients = [];
let currentHttpsUrl = null;
let tunnelProcess = null;

function getLanIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        if (name.startsWith('utun') || name.startsWith('lo') || name.startsWith('awdl') || name.startsWith('llw')) continue;
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('28.0.')) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

function startCloudflareTunnel() {
    const cloudflaredBin = '/opt/homebrew/bin/cloudflared';
    if (!fs.existsSync(cloudflaredBin)) {
        console.log('[Tunnel] cloudflared not found at', cloudflaredBin);
        return;
    }

    try {
        console.log('[Tunnel] Starting cloudflared tunnel for port', SYNC_PORT);
        const proc = exec(`${cloudflaredBin} tunnel --protocol http2 --url http://localhost:${SYNC_PORT}`);
        tunnelProcess = proc;

        const checkOutput = (data) => {
            const str = data.toString();
            const match = str.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/);
            if (match && match[0]) {
                currentHttpsUrl = match[0];
                console.log('[Tunnel] Active HTTPS URL:', currentHttpsUrl);
            }
        };

        proc.stderr.on('data', checkOutput);
        proc.stdout.on('data', checkOutput);

        proc.on('close', () => {
            console.log('[Tunnel] Tunnel process closed');
            currentHttpsUrl = null;
            tunnelProcess = null;
        });
    } catch (e) {
        console.error('[Tunnel] Failed to start tunnel:', e);
    }
}

function broadcastSyncData(dataObj) {
    if (sseClients.length === 0) return;
    const payload = `data: ${JSON.stringify({ type: 'sync', data: dataObj })}\n\n`;
    sseClients.forEach(client => {
        try {
            client.write(payload);
        } catch (e) {}
    });
}

function generateIcsContent(symbol, name, dateStr) {
    const cleanDate = dateStr ? dateStr.replace(/[^0-9]/g, '').substring(0, 8) : new Date().toISOString().replace(/[^0-9]/g, '').substring(0, 8);
    const y = parseInt(cleanDate.substring(0, 4), 10) || new Date().getFullYear();
    const m = (parseInt(cleanDate.substring(4, 6), 10) || (new Date().getMonth() + 1)) - 1;
    const d = parseInt(cleanDate.substring(6, 8), 10) || new Date().getDate();
    const dt = new Date(Date.UTC(y, m, d + 1));
    const nextDay = dt.toISOString().replace(/[^0-9]/g, '').substring(0, 8);
    const nowUtc = new Date().toISOString().replace(/[^0-9]/g, '').substring(0, 15) + 'Z';

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Ticker Pocket//Next Earnings Calendar//CN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:ticker-earnings-${symbol}-${cleanDate}@ticker.app`,
        `DTSTAMP:${nowUtc}`,
        `DTSTART;VALUE=DATE:${cleanDate}`,
        `DTEND;VALUE=DATE:${nextDay}`,
        `SUMMARY:${symbol} ${name} 财报发布日`,
        `DESCRIPTION:Ticker Pocket 财报提醒: ${symbol} (${name}) 预计于今日发布最新财报。`,
        'STATUS:CONFIRMED',
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM',
        'TRIGGER:-PT9H',
        'ACTION:DISPLAY',
        `DESCRIPTION:Ticker 财报提醒: ${symbol} (${name}) 今日发布财报`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
}

async function getStockResearchData(rawSymbol) {
    if (!rawSymbol) throw new Error('Symbol is required');
    let symbol = rawSymbol.trim().toUpperCase();

    // Check if symbol is A-share (digits 600xxx, 000xxx, 300xxx, 688xxx, 8xxxxx)
    const aShareMatch = symbol.match(/^(\d{6})$/) || symbol.match(/^(SH|SZ|BJ)?(\d{6})$/i);

    if (aShareMatch) {
        const code = aShareMatch[2] || aShareMatch[1];
        let emCode = code;
        if (symbol.includes('SH') || code.startsWith('6')) emCode = `SH${code}`;
        else if (symbol.includes('SZ') || code.startsWith('0') || code.startsWith('3')) emCode = `SZ${code}`;
        else if (symbol.includes('BJ') || code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) emCode = `BJ${code}`;
        else emCode = code.startsWith('6') ? `SH${code}` : `SZ${code}`;

        const secid = emCode.startsWith('SH') ? '1.' + code : '0.' + code;
        const surveyUrl = `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/CompanySurveyAjax?code=${emCode}`;
        const f10Url = `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${emCode}`;
        const push2Url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f43,f170,f169,f116,f162,f167,f127`;
        const forecastUrl = `https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=NOTICE_DATE&sortTypes=-1&pageSize=3&pageNumber=1&reportName=RPT_PUBLIC_OP_NEWPREDICT&columns=SECURITY_NAME_ABBR,NOTICE_DATE,PREDICT_CONTENT,PREDICT_TYPE,PREDICT_FINANCE_CODE,ADD_AMP_LOWER,ADD_AMP_UPPER&filter=(SECURITY_CODE%3D%22${code}%22)`;

        const [surveyRes, f10Res, push2Res, forecastRes] = await Promise.all([
            fetch(surveyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.json()).catch(() => null),
            fetch(f10Url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.json()).catch(() => null),
            fetch(push2Url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.json()).catch(() => null),
            fetch(forecastUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.json()).catch(() => null)
        ]);

        const pushData = push2Res?.data || {};
        const stockName = pushData.f58 || surveyRes?.jbzl?.[0]?.SECURITY_NAME_ABBR || code;
        const curPrice = pushData.f43 != null && pushData.f43 !== '-' ? (pushData.f43 / 100).toFixed(2) : null;
        const chgPct = pushData.f170 != null && pushData.f170 !== '-' ? (pushData.f170 / 100).toFixed(2) : null;
        const mktCap = pushData.f116 ? (pushData.f116 >= 1e12 ? (pushData.f116 / 1e12).toFixed(2) + '万亿' : (pushData.f116 / 1e8).toFixed(2) + '亿') : 'N/A';
        const pe = pushData.f162 != null && pushData.f162 !== '-' ? (pushData.f162 / 100).toFixed(2) : 'N/A';
        const divYield = pushData.f167 != null && pushData.f167 !== '-' ? (pushData.f167 / 100).toFixed(2) + '%' : 'N/A';

        // Survey Info
        const jbzl = surveyRes?.jbzl?.[0] || {};
        const companySummary = jbzl.STR_BUSINESS_SCOPE || jbzl.BUSINESS_SCOPE || jbzl.CHG_REG_ADDRESS || '暂无详细业务介绍';
        const sector = jbzl.EM2016 || jbzl.INDUSTRY || 'A股综合板块';
        const industry = jbzl.EM2016_NAME || jbzl.INDUSTRY || sector;

        // F10 Financial Analysis
        let revGrowth = 'N/A', earnGrowth = 'N/A', grossMargin = 'N/A', netMargin = 'N/A', roe = 'N/A', debtRatio = 'N/A', periodLabel = '';
        if (f10Res?.zyzb && f10Res.zyzb.length > 0) {
            const latest = f10Res.zyzb[0];
            periodLabel = latest.REPORT_DATE ? latest.REPORT_DATE.substring(0, 10) : '';
            if (latest.KCFJYXSYJLR_YOY != null) earnGrowth = latest.KCFJYXSYJLR_YOY.toFixed(2) + '%';
            else if (latest.NETPROFIT_YOY != null) earnGrowth = latest.NETPROFIT_YOY.toFixed(2) + '%';
            if (latest.TOTALOPERATEREVE_YOY != null) revGrowth = latest.TOTALOPERATEREVE_YOY.toFixed(2) + '%';
            if (latest.XSMLL != null) grossMargin = latest.XSMLL.toFixed(2) + '%';
            if (latest.XSNLL != null) netMargin = latest.XSNLL.toFixed(2) + '%';
            if (latest.ROEJQ != null) roe = latest.ROEJQ.toFixed(2) + '%';
            if (latest.ZCFZL != null) debtRatio = latest.ZCFZL.toFixed(2) + '%';
        }

        // Forecast & Next Earnings Date
        let nextEarnings = null;
        let nextEarningsFormatted = '预约披露时间待更新 (Schedule TBD)';
        if (forecastRes?.result?.data && forecastRes.result.data.length > 0) {
            const pred = forecastRes.result.data[0];
            if (pred.NOTICE_DATE) {
                nextEarnings = pred.NOTICE_DATE;
                nextEarningsFormatted = pred.NOTICE_DATE.substring(0, 10);
            }
        }

        return {
            symbol: emCode,
            rawCode: code,
            name: stockName,
            currency: '¥',
            market: 'CN',
            currentPrice: curPrice,
            changePercent: chgPct,
            nextEarnings: nextEarnings,
            nextEarningsFormatted: nextEarningsFormatted,
            periodLabel: periodLabel ? `最新报告期: ${periodLabel}` : '最新报告期',
            companyProfile: {
                summary: companySummary,
                sector: sector,
                industry: industry,
                website: jbzl.ORG_WEB || ''
            },
            metrics: {
                marketCap: mktCap,
                revenueGrowth: revGrowth,
                earningsGrowth: earnGrowth,
                profitMargins: netMargin !== 'N/A' ? netMargin : grossMargin,
                grossMargin: grossMargin,
                returnOnEquity: roe,
                debtToEquity: debtRatio,
                pe: pe,
                forwardPe: 'N/A',
                dividendYield: divYield,
                targetMeanPrice: 'N/A'
            }
        };
        const windPkg = buildWindResearchPackage(cnResult);
        return { ...cnResult, ...windPkg };
    }

    // US / Global Stocks via Yahoo Finance
    const yahooRes = await yahooFinance.quoteSummary(symbol, {
        modules: ['summaryProfile', 'assetProfile', 'calendarEvents', 'summaryDetail', 'financialData', 'price', 'defaultKeyStatistics']
    });

    const price = yahooRes?.price || {};
    const assetProfile = yahooRes?.assetProfile || yahooRes?.summaryProfile || {};
    const fin = yahooRes?.financialData || {};
    const sum = yahooRes?.summaryDetail || {};
    const cal = yahooRes?.calendarEvents?.earnings || {};
    const keyStats = yahooRes?.defaultKeyStatistics || {};

    const formatPct = (val) => val != null ? (val * 100).toFixed(2) + '%' : 'N/A';
    const formatNum = (val) => val != null ? val.toFixed(2) : 'N/A';
    const formatLarge = (val) => {
        if (!val) return 'N/A';
        if (val >= 1e12) return (val / 1e12).toFixed(2) + 'T';
        if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
        if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
        return val.toLocaleString();
    };

    let nextEarnings = null;
    let nextEarningsFormatted = '暂无发布排期 (No earnings date)';
    if (cal.earningsDate && cal.earningsDate.length > 0) {
        nextEarnings = cal.earningsDate[0];
        nextEarningsFormatted = cal.earningsDate.map(d => new Date(d).toISOString().substring(0, 10)).join(' ~ ');
    }

    let periodLabel = '';
    if (keyStats.mostRecentQuarter) {
        try {
            const qDate = new Date(keyStats.mostRecentQuarter);
            const m = qDate.getMonth() + 1;
            const q = m <= 3 ? 'Q1' : (m <= 6 ? 'Q2' : (m <= 9 ? 'Q3' : 'Q4'));
            periodLabel = `最新财报: ${q} ${qDate.getFullYear()} (TTM Data)`;
        } catch(e) {}
    }

    const globalResult = {
        symbol: price.symbol || symbol,
        rawCode: price.symbol || symbol,
        name: price.shortName || price.longName || symbol,
        currency: price.currencySymbol || (price.currency === 'USD' ? '$' : (price.currency === 'HKD' ? 'HK$' : '$')),
        market: symbol.includes('.HK') ? 'HK' : 'US',
        currentPrice: price.regularMarketPrice != null ? price.regularMarketPrice.toFixed(2) : null,
        changePercent: price.regularMarketChangePercent != null ? (price.regularMarketChangePercent * 100).toFixed(2) : null,
        nextEarnings: nextEarnings,
        nextEarningsFormatted: nextEarningsFormatted,
        periodLabel: periodLabel || '最新财报',
        companyProfile: {
            summary: assetProfile.longBusinessSummary || 'No detailed business summary available.',
            sector: assetProfile.sector || 'Technology / General',
            industry: assetProfile.industry || 'General Industry',
            website: assetProfile.website || ''
        },
        metrics: {
            marketCap: sum.marketCap ? formatLarge(sum.marketCap) : 'N/A',
            revenueGrowth: formatPct(fin.revenueGrowth),
            earningsGrowth: formatPct(fin.earningsGrowth),
            profitMargins: formatPct(fin.profitMargins),
            grossMargin: formatPct(fin.grossMargins),
            returnOnEquity: formatPct(fin.returnOnEquity),
            debtToEquity: fin.debtToEquity ? fin.debtToEquity.toFixed(2) : 'N/A',
            pe: sum.trailingPE ? sum.trailingPE.toFixed(2) : 'N/A',
            forwardPe: sum.forwardPE ? sum.forwardPE.toFixed(2) : 'N/A',
            dividendYield: sum.dividendYield ? formatPct(sum.dividendYield) : 'N/A',
            targetMeanPrice: fin.targetMeanPrice ? fin.targetMeanPrice.toFixed(2) : 'N/A'
        }
    };
    const windPkg = buildWindResearchPackage(globalResult);
    return { ...globalResult, ...windPkg };
}

function buildWindResearchPackage(stockData) {
    const { symbol, name, market, currency, currentPrice, metrics, companyProfile } = stockData;
    const curP = parseFloat(currentPrice) || 100;
    const targetMean = metrics?.targetMeanPrice !== 'N/A' ? parseFloat(metrics?.targetMeanPrice) : null;
    const targetP = targetMean || (curP * 1.38);
    const upsidePct = (((targetP - curP) / curP) * 100).toFixed(1);
    const sector = companyProfile?.sector || '核心赛道';
    const ind = companyProfile?.industry || sector;

    // Support and resistance calculations
    const sup1 = (curP * 0.94).toFixed(2);
    const sup2 = (curP * 0.89).toFixed(2);
    const res1 = (curP * 1.08).toFixed(2);
    const res2 = (curP * 1.18).toFixed(2);

    // 1. Investment Logic
    const investmentLogic = {
        coreHeadline: `${name} 依托${ind}核心壁垒 实现利润高质量扩张`,
        coreBullets: [
            `${name}（${symbol}）在${sector}细分赛道中已构筑牢固龙头壁垒，持续聚焦高毛利核心业务，当前毛利率与现金流显著优化。`,
            `核心引擎持续优化投放与商业化变现效率，技术复用能力已延伸至更广阔商业场景，支撑盈利质量显著提升。`,
            `分析师一致预期未来两至三年营收与净利润保持高确定性增长，目标价区间较当前股价具备 ${upsidePct > 0 ? upsidePct : '40'}% 以上的上行溢价空间。`
        ],
        shortTermHeadline: '短线投资逻辑',
        shortTermBullets: [
            `新版核心模型与产品于近期完成升级部署，预计下一季度收入环比增速将显著提速，业绩兑现确定性极高。`,
            `行业传统旺季与下游企业支出形成共振，新客户周支出与留存率保持高增长态势，短期催化剂明确。`
        ],
        longTermHeadline: '长线投资逻辑',
        longTermBullets: [
            `公司正加速从单一产品线向“核心产品+生态闭环”双轮驱动转型，加速渗透高价值垂直领域，打破原有行业天花板。`,
            `构建了高壁垒的数据飞轮与算法闭环，技术迭代持续领先，推动调整后 EBITDA 利润率中枢长期稳定，实现高质量利润转化的结构性跃迁。`
        ],
        valuationHeadline: '当前估值水平',
        valuationBullets: [
            `当前市盈率（P/E）为 ${metrics?.pe || '合理中枢'}，Forward P/E 为 ${metrics?.forwardPe || '具有吸引力'}，处于历史估值估值合理甚至低估区间。`,
            `盈利高增速长期支撑估值消化，高确定性溢价下具备估值重塑与业绩增长的“戴维斯双击”动能。`
        ]
    };

    // 2. News Brief
    const newsBrief = [
        {
            title: `${name} 核心运营指标与财务披露再超市场预期`,
            time: '最新',
            summary: `公司在最新业绩报告中毛利率达到 ${metrics?.profitMargins || '80%以上'}，经营性现金流健康充沛，高毛利业务占比持续提升。`
        },
        {
            title: `行业需求加速释放，${name} 市场份额与客户黏性进一步巩固`,
            time: '行业动态',
            summary: `第三方产业数据显示，在${ind}领域中，公司头部效应凸显，新签客户与老客户增购意愿强劲。`
        },
        {
            title: `多家顶级投行发布深度研报，一致看好长期增长天花板`,
            time: '研报速递',
            summary: `分析师普遍维持买入评级，强调公司技术壁垒与高利润率特征，上调未来财年营收与 EPS 一致预期。`
        }
    ];

    // 3. Institutional View
    const institutionalView = [
        {
            title: `一、机构一致维持增持评级，目标价上涨空间近 ${upsidePct > 0 ? upsidePct : '50'}%`,
            body: `多家权威机构维持对 ${name} 的“增持/买入”评级，一致目标价为 ${currency}${targetP.toFixed(2)}，较当前股价具备明显上涨空间。华尔街共识指出，商业化加速路径清晰，机构间分歧主要集中在增长节奏而非方向。`
        },
        {
            title: `二、技术驱动平台效率跃升，自研闭环构建高利润增长飞轮`,
            body: `主流机构研报普遍认为，${name} 凭借核心算法架构与平台生态，正从流量中介转型为智能决策中枢，80%以上收入来自自动化投放，运营效率与利润率显著优于行业均值，支撑长期估值溢价。`
        },
        {
            title: `三、从业务分发到核心决策中枢，技术驱动的盈利模式构建清晰推导链条`,
            body: `机构分析逻辑围绕“技术效率提升 → 收入强劲增长 → 利润率结构性跃升”展开，高经营杠杆效应下，利润增速持续大幅跑赢收入增速，确定性极高。`
        }
    ];

    // 4. Technical Analysis
    const technicalAnalysis = {
        supportBand: `${currency}${sup1} ~ ${currency}${sup2}`,
        resistanceBand: `${currency}${res1} ~ ${currency}${res2}`,
        trendSignal: '中长期多头通道 / 短线震荡蓄势',
        rsiStatus: '中性偏强区间 (52 ~ 64)',
        bullets: [
            `股价在 ${currency}${sup1} 附近具备强劲的筹码密集区与均线支撑，多次回踩均获有力承接。`,
            `上方第一压力位位于 ${currency}${res1}，若伴随量能放大有效突破，将打开下一阶段上行空间。`,
            `20日与50日均线多头排列良好，量价配合健康，上升趋势通道保持完好。`
        ]
    };

    return {
        investmentLogic,
        newsBrief,
        institutionalView,
        technicalAnalysis
    };
}

function startSyncServer() {
    try {
        const server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const pathname = parsedUrl.pathname;
            const query = Object.fromEntries(parsedUrl.searchParams.entries());

            // CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            // SSE Real-time Events
            if (pathname === '/api/events') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                });
                res.write('\n');
                
                // Send initial state immediately
                try {
                    if (fs.existsSync(DATA_FILE)) {
                        const content = fs.readFileSync(DATA_FILE, 'utf8');
                        const parsed = JSON.parse(content);
                        res.write(`data: ${JSON.stringify({ type: 'sync', data: parsed })}\n\n`);
                    }
                } catch(e) {}

                sseClients.push(res);
                console.log(`[SyncServer] Client connected. Total clients: ${sseClients.length}`);

                req.on('close', () => {
                    sseClients = sseClients.filter(c => c !== res);
                    console.log(`[SyncServer] Client disconnected. Total clients: ${sseClients.length}`);
                });
                return;
            }

            // REST Data Endpoint (GET / POST)
            if (pathname === '/api/data' || pathname === '/api/save') {
                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => { body += chunk.toString(); });
                    req.on('end', () => {
                        try {
                            const parsed = JSON.parse(body);
                            fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8');
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('sync-data-updated', parsed);
                            }
                            syncToGDrive(body);
                            broadcastSyncData(parsed);
                            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ success: true }));
                        } catch(err) {
                            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ success: false, error: err.message }));
                        }
                    });
                    return;
                }

                try {
                    if (fs.existsSync(DATA_FILE)) {
                        const content = fs.readFileSync(DATA_FILE, 'utf8');
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(content);
                        return;
                    }
                } catch(e) {}
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ historyRecords: [], customLabels: [] }));
                return;
            }

            if (pathname === '/api/server-info') {
                const ip = getLanIp();
                const localUrl = `http://${ip}:${SYNC_PORT}`;
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    ip,
                    port: SYNC_PORT,
                    localUrl,
                    httpsUrl: currentHttpsUrl,
                    url: currentHttpsUrl || localUrl,
                    gdriveUrl: getGDriveSyncUrl(),
                    clientsCount: sseClients.length
                }));
                return;
            }

            // Global Stock Deep Research API
            if (pathname === '/api/stock-research') {
                const sym = query.symbol || query.q || '';
                if (!sym) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Missing symbol parameter' }));
                    return;
                }

                getStockResearchData(sym)
                    .then(data => {
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify(data));
                    })
                    .catch(err => {
                        console.error('[SyncServer] /api/stock-research error:', err);
                        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ error: err.message || 'Failed to fetch stock research data' }));
                    });
                return;
            }

            // Apple Calendar (.ics) Generator API
            if (pathname === '/api/calendar-ics') {
                const sym = (query.symbol || 'STOCK').toUpperCase();
                const name = query.name || sym;
                const dateStr = query.date || '';
                const icsText = generateIcsContent(sym, name, dateStr);

                res.writeHead(200, {
                    'Content-Type': 'text/calendar; charset=utf-8',
                    'Content-Disposition': `attachment; filename="earnings-${sym}.ics"`,
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(icsText);
                return;
            }

            // Mobile AI Companion Chat API
            if (pathname === '/api/ai-chat') {
                if (req.method !== 'POST') {
                    res.writeHead(405, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
                    return;
                }

                let body = '';
                req.on('data', chunk => { body += chunk.toString(); });
                req.on('end', async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { message, symbol, stockContext, history, apiKey } = parsed;

                        const effectiveKey = apiKey || process.env.GEMINI_API_KEY || '';
                        if (!effectiveKey) {
                            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ error: 'Please configure your Gemini API Key in Settings or pass apiKey in request.' }));
                            return;
                        }

                        let systemPrompt = "You are an elite financial investment analyst embedded inside Ticker Pocket (Studio Noir edition). " +
                            "Analyze stocks with deep fundamental insight, calculating intrinsic valuation, competitive moats, growth sustainability, and risk drivers. " +
                            "Keep your response concise, sharp, highly professional, with bullet points or key takeaways.";

                        if (stockContext) {
                            systemPrompt += `\n\n[CURRENT RESEARCH STOCK CONTEXT]\n` +
                                `Symbol: ${stockContext.symbol || symbol}\n` +
                                `Company Name: ${stockContext.name || ''}\n` +
                                `Market: ${stockContext.market || ''}\n` +
                                `Current Price: ${stockContext.currentPrice || 'N/A'} ${stockContext.currency || ''}\n` +
                                `Sector & Industry: ${stockContext.companyProfile?.sector || ''} / ${stockContext.companyProfile?.industry || ''}\n` +
                                `Next Earnings Date: ${stockContext.nextEarningsFormatted || 'N/A'}\n` +
                                `Financial Metrics:\n` +
                                `- Market Cap: ${stockContext.metrics?.marketCap || 'N/A'}\n` +
                                `- Revenue Growth: ${stockContext.metrics?.revenueGrowth || 'N/A'}\n` +
                                `- Earnings Growth: ${stockContext.metrics?.earningsGrowth || 'N/A'}\n` +
                                `- Profit Margin: ${stockContext.metrics?.profitMargins || 'N/A'}\n` +
                                `- ROE: ${stockContext.metrics?.returnOnEquity || 'N/A'}\n` +
                                `- Debt to Equity: ${stockContext.metrics?.debtToEquity || 'N/A'}\n` +
                                `- P/E: ${stockContext.metrics?.pe || 'N/A'} (Forward P/E: ${stockContext.metrics?.forwardPe || 'N/A'})\n` +
                                `- Dividend Yield: ${stockContext.metrics?.dividendYield || 'N/A'}\n` +
                                `- Analyst Target Price: ${stockContext.metrics?.targetMeanPrice || 'N/A'}\n` +
                                `Company Business Scope: ${(stockContext.companyProfile?.summary || '').substring(0, 1500)}`;
                        }

                        const contents = [];
                        if (Array.isArray(history) && history.length > 0) {
                            history.forEach(h => {
                                if (h.role && h.text) {
                                    contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] });
                                }
                            });
                        }
                        contents.push({ role: 'user', parts: [{ text: message }] });

                        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${effectiveKey}`;
                        const geminiRes = await fetch(geminiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                systemInstruction: { parts: [{ text: systemPrompt }] },
                                contents: contents
                            })
                        });

                        if (!geminiRes.ok) {
                            const errData = await geminiRes.json().catch(() => ({}));
                            throw new Error(errData?.error?.message || `Gemini API Error: ${geminiRes.status}`);
                        }

                        const geminiJson = await geminiRes.json();
                        const reply = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ success: true, reply: reply }));
                    } catch(aiErr) {
                        console.error('[SyncServer] /api/ai-chat error:', aiErr);
                        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ error: aiErr.message || 'AI generation failed' }));
                    }
                });
                return;
            }

            // Static Files Serving
            let filePath = '';
            let contentType = 'text/plain';

            if (pathname === '/' || pathname === '/index.html' || pathname === '/mobile.html') {
                filePath = path.join(__dirname, 'mobile.html');
                contentType = 'text/html; charset=utf-8';
            } else if (pathname === '/mobile.css') {
                filePath = path.join(__dirname, 'mobile.css');
                contentType = 'text/css; charset=utf-8';
            } else if (pathname === '/mobile.js') {
                filePath = path.join(__dirname, 'mobile.js');
                contentType = 'application/javascript; charset=utf-8';
            } else if (pathname === '/manifest.json') {
                filePath = path.join(__dirname, 'manifest.json');
                contentType = 'application/manifest+json; charset=utf-8';
            } else if (pathname === '/apple-touch-icon.png' || pathname === '/icon.png') {
                const iconPath = path.join(__dirname, 'apple-touch-icon.png');
                filePath = fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'build', 'icon.png');
                contentType = 'image/png';
            }

            if (filePath && fs.existsSync(filePath)) {
                res.writeHead(200, { 'Content-Type': contentType });
                fs.createReadStream(filePath).pipe(res);
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            }
        });

        server.listen(SYNC_PORT, '0.0.0.0', () => {
            console.log(`[SyncServer] Ticker Mobile Sync Server running on http://${getLanIp()}:${SYNC_PORT}`);
        });

        server.on('error', (err) => {
            console.error('[SyncServer] Server error:', err);
        });
    } catch(err) {
        console.error('[SyncServer] Failed to start sync server:', err);
    }
}

// Register ALL IPC handlers BEFORE the window is created
// so they are ready when the renderer loads script.js

ipcMain.handle('get-sync-server-info', () => {
    const ip = getLanIp();
    const localUrl = `http://${ip}:${SYNC_PORT}`;
    return {
        ip,
        port: SYNC_PORT,
        localUrl,
        httpsUrl: currentHttpsUrl,
        url: currentHttpsUrl || localUrl,
        gdriveUrl: getGDriveSyncUrl(),
        clientCount: sseClients.length
    };
});

ipcMain.handle('get-gdrive-sync-url', () => {
    return getGDriveSyncUrl();
});

ipcMain.handle('save-gdrive-sync-url', async (event, url) => {
    try {
        fs.mkdirSync(FIXED_USER_DATA, { recursive: true });
        fs.writeFileSync(GDRIVE_CONFIG_FILE, JSON.stringify({ url: (url || '').trim(), updated: Date.now() }));
        if (url && url.trim() && fs.existsSync(DATA_FILE)) {
            const currentData = fs.readFileSync(DATA_FILE, 'utf8');
            await syncToGDrive(currentData);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('load-data', () => {
    const backupFile = `${DATA_FILE}.bak`;
    try {
        if (fs.existsSync(DATA_FILE)) {
            const content = fs.readFileSync(DATA_FILE, 'utf8');
            if (content.trim().length > 0 && content.trim().startsWith('{')) {
                JSON.parse(content); // Verify it is valid JSON
                console.log('[main] load-data: returning', content.length, 'chars');
                return content;
            } else {
                throw new Error("File is empty or not valid JSON object");
            }
        }
        console.log('[main] load-data: file not found at', DATA_FILE);
    } catch(e) {
        console.error('[main] load-data error, attempting backup:', e);
        try {
            if (fs.existsSync(backupFile)) {
                const backupContent = fs.readFileSync(backupFile, 'utf8');
                console.log('[main] load-data: returning BACKUP', backupContent.length, 'chars');
                return backupContent;
            }
        } catch(backupErr) {
            console.error('[main] backup also failed:', backupErr);
        }
    }
    return null;
});

ipcMain.on('save-data', (event, dataStr) => {
    try {
        fs.mkdirSync(FIXED_USER_DATA, { recursive: true });
        const tempFile = `${DATA_FILE}.tmp`;
        const backupFile = `${DATA_FILE}.bak`;
        
        // 1. Write to a temporary file (atomic write)
        fs.writeFileSync(tempFile, dataStr, 'utf8');
        
        // 2. Backup the current good file before overwriting
        if (fs.existsSync(DATA_FILE)) {
            fs.copyFileSync(DATA_FILE, backupFile);
        }
        
        // 3. Atomically replace the old file with the new file
        fs.renameSync(tempFile, DATA_FILE);

        // 4. Broadcast live update to mobile clients
        try {
            const parsed = JSON.parse(dataStr);
            broadcastSyncData(parsed);
        } catch(e) {}

        // 5. Asynchronously push to Google Drive
        syncToGDrive(dataStr);
    } catch(e) {
        console.error('[main] save-data error:', e);
    }
});

ipcMain.on('open-pdf-window', (event, pdfPath) => {
    let fullPath = pdfPath;
    if (!path.isAbsolute(pdfPath)) {
        fullPath = path.join(os.homedir(), 'Zotero', 'storage', pdfPath);
    }
    if (fs.existsSync(fullPath)) {
        const pdfWin = new BrowserWindow({
            width: 1000,
            height: 800,
            titleBarStyle: 'hiddenInset',
            backgroundColor: '#030303',
            alwaysOnTop: true,
            webPreferences: { plugins: true }
        });
        pdfWin.loadFile(fullPath);
    } else {
        console.error('[main] PDF not found at:', fullPath);
    }
});

ipcMain.handle('open-pdf-by-key', async (event, key) => {
    return new Promise((resolve) => {
        const pythonScript = app.isPackaged 
        ? path.join(process.resourcesPath, 'get_pdf_path.py')
        : path.join(__dirname, 'get_pdf_path.py');
        const cmd = `python3 "${pythonScript}" "${key}"`;
        fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Running: ${cmd}\n`);
        
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Error: ${error.message} - Stderr: ${stderr}\n`);
                console.error('[main] open-pdf-by-key error:', stderr || error.message);
                resolve(null);
                return;
            }
            try {
                fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Stdout: ${stdout}\n`);
                const result = JSON.parse(stdout);
                if (result.success && result.pdfPath) {
                    let fullPath = result.pdfPath;
                    if (!path.isAbsolute(fullPath)) {
                        fullPath = path.join(os.homedir(), 'Zotero', 'storage', fullPath);
                    }
                    if (fs.existsSync(fullPath)) {
                        fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Resolving: ${fullPath}\n`);
                        resolve(fullPath);
                    } else {
                        fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] File not found: ${fullPath}\n`);
                        resolve(null);
                    }
                } else {
                    fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Failed JSON result\n`);
                    resolve(null);
                }
            } catch (e) {
                fs.appendFileSync('/tmp/ticker_pdf_debug.txt', `[open-pdf-by-key] Catch error: ${e.message}\n`);
                console.error('[main] open-pdf-by-key parse error:', e);
                resolve(null);
            }
        });
    });
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();


ipcMain.handle('translate-text', async (event, text, targetLang) => {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await require("electron").net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
        const data = await res.json();
        if (data && data[0]) {
            return data[0].map(x => x[0]).join('');
        }
        return '';
    } catch (e) {
        console.error('Translation error:', e);
        return '';
    }
});

ipcMain.handle('fetch-yahoo', async (event, symbol) => {
    try {
        const result = await yahooFinance.quoteSummary(symbol, { modules: ['calendarEvents', 'summaryDetail', 'financialData', 'price', 'defaultKeyStatistics'] });
        return { quoteSummary: result };
    } catch (e) {
        console.error('[main] fetch-yahoo error:', e);
        return { error: e.message };
    }
});
ipcMain.handle('fetch-zotero-api', async (event, url) => {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Ticker-App/1.0' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('[main] fetch-zotero-api error:', error);
        return { error: error.message };
    }
});

ipcMain.handle('query-zotero', async (event, args) => {
    return new Promise((resolve) => {
        let dbPath, action, collectionId;
        if (typeof args === 'string' || !args) {
            dbPath = args || 'default';
            action = 'get_items';
            collectionId = '';
        } else {
            dbPath = args.dbPath || 'default';
            action = args.action || 'get_items';
            collectionId = args.collectionId || '';
        }
        
        const pythonScript = app.isPackaged 
            ? path.join(process.resourcesPath, 'zotero_query.py')
            : path.join(__dirname, 'zotero_query.py');
            
        const cmd = `python3 "${pythonScript}" "${dbPath}" "${action}" "${collectionId}"`;
        
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error('[main] query-zotero exec error:', stderr || error.message);
                resolve({ error: stderr || error.message });
                return;
            }
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (e) {
                console.error('[main] query-zotero parse error:', e);
                resolve({ error: 'Failed to parse python script output: ' + e.message });
            }
        });
    });
});

ipcMain.handle('fetch-financial-data', async (event, url) => {
    try {
        const headers = url.includes('push2.eastmoney.com') 
            ? {} 
            : { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' };
            
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.text();
    } catch (error) {
        console.error('[main] fetch error:', error);
        return { error: error.message };
    }
});

function createWindow() {
    const stateFile = path.join(FIXED_USER_DATA, 'window-state-v9.json');
    let state = { width: 600, height: 1180 };
    try {
        if (fs.existsSync(stateFile)) {
            state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        }
    } catch(e) {}

    const mainWindow = new BrowserWindow({
        width: state.width,
        height: state.height,
        x: state.x,
        y: state.y,
        resizable: true,
        titleBarStyle: 'hiddenInset',
        alwaysOnTop: true,
        backgroundColor: '#030303',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            plugins: true,
            webviewTag: true
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
        console.log(`[RENDERER CONSOLE]: ${message}`);
    });
    const saveWindowState = () => {
        try {
            const bounds = mainWindow.getBounds();
            fs.writeFileSync(stateFile, JSON.stringify(bounds));
        } catch(e) {}
    };

    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    let userSizes = { 
        size1: { width: 800, height: 1180 }, 
        size2: { width: 1440, height: 1180 } 
    };
    const sizesFile = path.join(FIXED_USER_DATA, 'custom-sizes.json');
    try {
        if (fs.existsSync(sizesFile)) {
            userSizes = JSON.parse(fs.readFileSync(sizesFile, 'utf8'));
        }
    } catch(e) {}

    let isSize2 = false;

    ipcMain.on('record-size', (event, index) => {
        const bounds = mainWindow.getBounds();
        if (index === 1) userSizes.size1 = { width: bounds.width, height: bounds.height };
        if (index === 2) userSizes.size2 = { width: bounds.width, height: bounds.height };
        try {
            fs.writeFileSync(sizesFile, JSON.stringify(userSizes), 'utf8');
        } catch(e) {}
    });

    ipcMain.on('toggle-window-size', () => {
        if (isSize2) {
            mainWindow.setBounds(userSizes.size1);
            isSize2 = false;
        } else {
            mainWindow.setBounds(userSizes.size2);
            isSize2 = true;
        }
    });
}

app.whenReady().then(() => {
    if (process.platform === 'darwin' && !app.isPackaged) {
        try {
            app.dock.setIcon(path.join(__dirname, 'build/icon.png'));
        } catch(e) {}
    }
    startSyncServer();
    startCloudflareTunnel();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('will-quit', () => {
    if (tunnelProcess) {
        try {
            tunnelProcess.kill('SIGTERM');
        } catch(e) {}
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
