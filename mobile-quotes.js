/* Verified mobile quotes. Never derive market prices from a user's ledger. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TickerQuotes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function identity(query, groups = []) {
    const input = String(query || '').trim().toUpperCase();
    const group = groups.find(g => [g.symbol, g.rawCode, g.name]
      .some(v => v != null && String(v).trim().toUpperCase() === input));
    const symbol = String(group ? (group.symbol || group.rawCode) : input).trim().toUpperCase();
    const cn = symbol.match(/^(?:(SH|SZ|BJ))?(\d{6})(?:\.(SH|SS|SZ|BJ))?$/);
    if (cn) {
      const code = cn[2];
      const inferred = code.startsWith('6') ? 'SH' : /^[489]/.test(code) ? 'BJ' : 'SZ';
      const explicit = (cn[1] || cn[3] || inferred).replace('SS', 'SH');
      if (explicit !== inferred) throw new Error('股票代码与交易所不匹配');
      return { symbol: explicit + code, rawCode: code, name: group?.name || code,
        market: 'CN', currency: '¥', secid: (explicit === 'SH' ? '1.' : '0.') + code };
    }
    const hk = symbol.match(/^(?:HK)?(\d{5})$/) || symbol.match(/^(\d{1,5})\.HK$/);
    if (hk) {
      const code = hk[1].padStart(5, '0');
      return { symbol: code + '.HK', rawCode: code, name: group?.name || code,
        market: 'HK', currency: 'HK$', secid: '116.' + code };
    }
    return { symbol, rawCode: symbol, name: group?.name || symbol, market: 'US', currency: '$', secid: '105.' + symbol };
  }

  function number(value) {
    if (value == null || typeof value === 'boolean' || String(value).trim() === '' || value === '-') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  // fltt=2 returns prices and percentage points already scaled. Do not divide by 100.
  function parse(payload, stock) {
    const d = payload?.data;
    if (payload?.rc !== 0 || !d || String(d.f57).toUpperCase() !== stock.rawCode.toUpperCase()) {
      throw new Error('行情响应的股票代码不匹配或不存在');
    }
    const price = number(d.f43);
    const stamp = number(d.f86);
    if (price == null || price <= 0 || stamp == null || stamp <= 0 || stamp * 1000 > Date.now() + 600000) {
      throw new Error('行情缺少有效价格或时间');
    }
    const decimals = number(d.f59);
    const precision = Number.isInteger(decimals) && decimals >= 0 && decimals <= 6 ? decimals : 2;
    const change = number(d.f170);
    return { ...stock, name: d.f58 || stock.name, currentPrice: price.toFixed(precision),
      changePercent: change == null ? null : change.toFixed(2),
      quoteSource: '东方财富', quoteTime: new Date(stamp * 1000).toISOString(),
      quoteFetchedAt: new Date().toISOString(), quoteStatus: 'available' };
  }

  function parseTencent(text, stock) {
    if (!text || !text.includes('=')) throw new Error('行情响应无效');
    const match = text.match(/="([^"]+)"/);
    if (!match) throw new Error('行情响应无效');
    const parts = match[1].split('~');
    if (parts.length < 33 || !parts[3]) throw new Error('行情数据不完整');
    const price = number(parts[3]);
    if (price == null || price <= 0) throw new Error('行情缺少有效价格');
    const change = number(parts[32]);
    const dateStr = parts[30];
    let quoteTime = null;
    if (dateStr && dateStr.includes('-')) {
      quoteTime = new Date(dateStr.replace(' ', 'T') + '+08:00').toISOString();
    } else if (dateStr && dateStr.length >= 14) {
      const y = dateStr.slice(0, 4), m = dateStr.slice(4, 6), d = dateStr.slice(6, 8);
      const h = dateStr.slice(8, 10), min = dateStr.slice(10, 12), s = dateStr.slice(12, 14);
      quoteTime = new Date(`${y}-${m}-${d}T${h}:${min}:${s}+08:00`).toISOString();
    }
    return {
      ...stock,
      name: parts[1] || stock.name,
      currentPrice: price.toFixed(2),
      changePercent: change == null ? null : change.toFixed(2),
      quoteSource: '实时行情',
      quoteTime: quoteTime || new Date().toISOString(),
      quoteFetchedAt: new Date().toISOString(),
      quoteStatus: 'available'
    };
  }

  function quoteUrl(stock, callbackName, host = 'push2delay.eastmoney.com') {
    const params = new URLSearchParams({ secid: stock.secid, fltt: '2', invt: '2',
      fields: 'f57,f58,f43,f170,f59,f86', _: String(Date.now()) });
    if (callbackName) params.set('cb', callbackName);
    return 'https://' + host + '/api/qt/stock/get?' + params;
  }

  async function fetchQuote(stock, fetcher = globalThis.fetch, timeoutMs = 8000, host = 'push2delay.eastmoney.com') {
    if (!stock.secid) throw new Error('此市场暂未接入独立网页行情，请连接电脑端行情服务');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(quoteUrl(stock, null, host),
        { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('行情服务暂不可用（HTTP ' + response.status + '）');
      return parse(await response.json(), stock);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchQuoteTencent(stock, fetcher = globalThis.fetch, timeoutMs = 8000) {
    let tSym = null;
    if (stock.market === 'CN') {
      const p = stock.symbol.startsWith('SH') ? 'sh' : (stock.symbol.startsWith('BJ') ? 'bj' : 'sz');
      tSym = p + stock.rawCode;
    } else if (stock.market === 'HK') {
      tSym = 'r_hk' + stock.rawCode;
    } else if (stock.market === 'US') {
      tSym = 'us' + stock.rawCode;
    }
    if (!tSym) throw new Error('当前市场不支持备用行情源');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetcher('https://qt.gtimg.cn/q=' + tSym, {
        signal: controller.signal, cache: 'no-store', credentials: 'omit'
      });
      if (!res.ok) throw new Error('行情服务暂不可用');
      let text;
      if (typeof res.arrayBuffer === 'function' && typeof TextDecoder !== 'undefined') {
        const buf = await res.arrayBuffer();
        text = new TextDecoder('gbk').decode(buf);
      } else {
        text = await res.text();
      }
      return parseTencent(text, stock);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchQuoteProxy(stock, proxyUrl, fetcher = globalThis.fetch, timeoutMs = 8000) {
    if (!stock.secid) throw new Error('此市场暂未接入独立网页行情，请连接电脑端行情服务');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(String(proxyUrl || ''))) {
      throw new Error('备用行情服务地址无效');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const separator = proxyUrl.includes('?') ? '&' : '?';
      const url = proxyUrl + separator + 'action=quote&symbol=' + encodeURIComponent(stock.symbol) + '&_=' + Date.now();
      const response = await fetcher(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'follow' });
      if (!response.ok) throw new Error('备用行情服务暂不可用（HTTP ' + response.status + '）');
      return parse(await response.json(), stock);
    } finally {
      clearTimeout(timer);
    }
  }

  // Some mobile browsers block cross-origin fetch even when the provider returns CORS headers.
  // EastMoney also exposes the same response as JSONP, so use it only as a transport fallback.
  let jsonpSequence = 0;
  function fetchQuoteJsonp(stock, documentRef = globalThis.document, timeoutMs = 8000) {
    if (!stock.secid) return Promise.reject(new Error('此市场暂未接入独立网页行情，请连接电脑端行情服务'));
    if (!documentRef?.createElement || !documentRef?.head) return Promise.reject(new Error('当前环境不支持备用行情通道'));
    return new Promise((resolve, reject) => {
      const callbackName = '__tickerQuote_' + Date.now() + '_' + (++jsonpSequence);
      const script = documentRef.createElement('script');
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        script.remove();
        try { delete globalThis[callbackName]; } catch (_) { globalThis[callbackName] = undefined; }
      };
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };
      globalThis[callbackName] = payload => {
        try { finish(resolve, parse(payload, stock)); }
        catch (error) { finish(reject, error); }
      };
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.src = quoteUrl(stock, callbackName);
      script.onerror = () => finish(reject, new Error('备用行情通道连接失败'));
      const timer = setTimeout(() => finish(reject, new Error('行情请求超时，请稍后重试')), timeoutMs);
      documentRef.head.appendChild(script);
    });
  }

  function friendlyQuoteError(error) {
    if (!error) return '行情暂不可用，请稍后重试';
    if (error.name === 'AbortError') return '行情请求超时，请稍后重试';
    if (error instanceof TypeError || error.message === 'Failed to fetch') return '行情网络连接失败，请稍后重试';
    return error.message || '行情暂不可用，请稍后重试';
  }

  function unavailableSections() {
    return {
      businessIndustry: { coreHeadline: '暂无已核实的公司深度分析', coreBullets: [] },
      investmentLogic: { coreHeadline: '暂无已核实的投资逻辑', coreBullets: [] },
      newsBrief: [{ title: '暂无已核实的新闻', time: '', summary: '不使用模板生成新闻。' }],
      institutionalView: [{ title: '暂无已核实的机构研报', body: '不根据当前价格推算机构目标价。' }],
      technicalAnalysis: { supportBand: '--', resistanceBand: '--', trendSignal: '--', rsiStatus: '--', bullets: [] }
    };
  }

  function unavailable(stock, error) {
    return { ...stock, currentPrice: null, changePercent: null, quoteSource: null,
      quoteTime: null, quoteStatus: 'unavailable',
      quoteError: error || '行情暂不可用，请稍后重试',
      nextEarnings: null, nextEarningsFormatted: '暂无已核实的披露排期',
      periodLabel: '财务数据暂不可用',
      companyProfile: { summary: '暂无已核实的公司资料', sector: '--', industry: '--', website: '' },
      metrics: Object.fromEntries(['marketCap', 'revenueGrowth', 'earningsGrowth', 'profitMargins',
        'grossMargin', 'returnOnEquity', 'debtToEquity', 'pe', 'forwardPe', 'dividendYield', 'targetMeanPrice']
        .map(k => [k, 'N/A'])),
      ...unavailableSections() };
  }

  function statusText(data) {
    if (data.quoteStatus !== 'available') return data.quoteError || '行情暂不可用，请稍后重试';
    if (!data.quoteTime) return (data.quoteSource || '行情来源') + ' · 行情时间未提供';
    const date = new Date(data.quoteTime);
    if (!Number.isFinite(date.getTime())) return '行情时间无效';
    return (data.quoteSource || '行情来源') + ' · 最近报价 ' +
      date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) + '（北京时间）';
  }

  async function load(query, groups = [], options = {}) {
    const stock = identity(query, groups);
    const fetcher = options.fetcher || globalThis.fetch;
    let quoteError = '行情暂不可用，请稍后重试';
    const quoteTask = stock.secid
      ? fetchQuote(stock, fetcher, options.timeoutMs || 8000)
          .catch(async () => {
            try {
              return await fetchQuote(stock, fetcher, options.timeoutMs || 8000, 'push2.eastmoney.com');
            } catch (_) {
              return await fetchQuoteTencent(stock, fetcher, options.timeoutMs || 8000);
            }
          })
          .catch(async firstError => {
            quoteError = friendlyQuoteError(firstError);
            if (options.proxyUrl) {
              try {
                return await fetchQuoteProxy(stock, options.proxyUrl, fetcher, options.timeoutMs || 8000);
              } catch (proxyError) {
                quoteError = friendlyQuoteError(proxyError);
              }
            }
            if (options.jsonp === false || (typeof document === 'undefined' && !options.jsonpFetcher)) return null;
            try {
              return options.jsonpFetcher
                ? await options.jsonpFetcher(stock, options.timeoutMs || 8000)
                : await fetchQuoteJsonp(stock, document, options.timeoutMs || 8000);
            } catch (secondError) {
              quoteError = friendlyQuoteError(secondError);
              return null;
            }
          })
      : Promise.resolve(null);
    const serverTask = options.standalone ? Promise.resolve(null) : (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const r = await fetcher('/api/stock-research?symbol=' + encodeURIComponent(stock.symbol),
          { signal: controller.signal, cache: 'no-store' });
        if (!r.ok) return null;
        const data = await r.json();
        if (!data || data.error || identity(data.symbol || data.rawCode).rawCode !== stock.rawCode) return null;
        return data;
      } catch (_) { return null; }
      finally { clearTimeout(timer); }
    })();
    const [quote, server] = await Promise.all([quoteTask, serverTask]);
    const missing = unavailable(stock, quoteError);
    const result = { ...missing, ...server, ...unavailableSections(),
      metrics: { ...missing.metrics, ...server?.metrics } };
    // Existing A-share server targets are price * 1.35, not sourced analyst targets.
    if (stock.market === 'CN') result.metrics.targetMeanPrice = 'N/A';
    if (quote) return { ...result, ...quote };
    // Only a real server quote is accepted for markets without a standalone source.
    if (!stock.secid && server && number(server.currentPrice) > 0) {
      return { ...result, currentPrice: String(server.currentPrice),
        changePercent: number(server.changePercent), quoteStatus: 'available',
        quoteSource: server.quoteSource || '电脑端行情服务', quoteTime: server.quoteTime || null };
    }
    return { ...result, currentPrice: null, changePercent: null, quoteTime: null,
      quoteSource: null, quoteStatus: 'unavailable',
      quoteError: stock.secid ? quoteError : '独立网页暂未接入此标的行情，请使用证券代码或连接电脑端服务' };
  }

  return { identity, number, parse, quoteUrl, fetchQuote, fetchQuoteProxy, fetchQuoteJsonp,
    friendlyQuoteError, unavailable, unavailableSections, statusText, load };
});
