const { test } = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../mobile-quotes.js');
const fixture = () => ({ rc: 0, data: { f57: '300775', f58: '三角防务', f43: 21.84,
  f170: 0.51, f59: 2, f86: 1788507240 } });
const response = data => ({ ok: true, json: async () => data });
const ledger = [{ symbol: '300775', name: '三角防务', currentPrice: '999',
  latestPrice: '888', records: [{ inputs: { base: 777 } }] }];

test('code, exchange prefix, suffix and ledger name resolve to the same security', () => {
  for (const query of ['300775', 'sz300775', '300775.SZ', '三角防务']) {
    assert.equal(Q.identity(query, ledger).secid, '0.300775');
  }
  assert.equal(Q.identity('600519').secid, '1.600519');
  assert.equal(Q.identity('00700').secid, '116.00700');
  assert.equal(Q.identity('700.HK').secid, '116.00700');
  assert.throws(() => Q.identity('SH300775'), /不匹配/);
});
test('fltt=2 decimal price is not scaled a second time', () => {
  const q = Q.parse(fixture(), Q.identity('300775'));
  assert.equal(q.currentPrice, '21.84');
  assert.equal(q.changePercent, '0.51');
  assert.equal(q.quoteSource, '东方财富');
  assert.match(Q.statusText(q), /2026.*北京时间/);
});
test('zero percentage is retained and different precision is honored', () => {
  const f = fixture(); f.data.f170 = 0; f.data.f59 = 3;
  assert.equal(Q.parse(f, Q.identity('300775')).changePercent, '0.00');
  assert.equal(Q.parse(f, Q.identity('300775')).currentPrice, '21.840');
});
test('invalid, absent, mismatched and nonfinite quotes are rejected', () => {
  for (const value of [null, '-', '', 0, -1, Infinity, true]) {
    const f = fixture(); f.data.f43 = value;
    assert.throws(() => Q.parse(f, Q.identity('300775')));
  }
  const wrong = fixture(); wrong.data.f57 = '600519';
  assert.throws(() => Q.parse(wrong, Q.identity('300775')));
  const missingTime = fixture(); delete missingTime.data.f86;
  assert.throws(() => Q.parse(missingTime, Q.identity('300775')));
});
test('standalone mobile obtains real quote, never calls nonexistent local API', async () => {
  const calls = [];
  const data = await Q.load('三角防务', ledger, { standalone: true, fetcher: async (url, opts) => {
    calls.push(url);
    assert.match(url, /secid=0.300775/);
    assert.match(url, /fltt=2/);
    assert.equal(opts.cache, 'no-store');
    assert.equal(opts.credentials, 'omit');
    return response(fixture());
  } });
  assert.equal(calls.length, 1);
  assert.equal(data.currentPrice, '21.84');
  assert.equal(data.name, '三角防务');
  assert.equal(data.metrics.targetMeanPrice, 'N/A');
  assert.equal(data.metrics.marketCap, 'N/A');
  assert.equal(data.technicalAnalysis.supportBand, '--');
});
test('network failure never substitutes ledger prices, default 100 or fixed +1.85%', async () => {
  const data = await Q.load('300775', ledger, { standalone: true, fetcher: async () => { throw new Error('offline'); } });
  assert.equal(data.currentPrice, null);
  assert.equal(data.changePercent, null);
  assert.equal(data.quoteStatus, 'unavailable');
  assert.equal(data.quoteTime, null);
  assert.ok(!JSON.stringify(data).includes('999'));
  assert.equal(ledger[0].currentPrice, '999');
});
test('blocked cross-origin fetch falls back to the same verified quote parser', async () => {
  const data = await Q.load('300775', ledger, {
    standalone: true,
    fetcher: async () => { throw new TypeError('Failed to fetch'); },
    jsonpFetcher: async stock => Q.parse(fixture(), stock)
  });
  assert.equal(data.currentPrice, '21.84');
  assert.equal(data.quoteSource, '东方财富');
});
test('existing Google sync service can act as the verified mobile quote fallback', async () => {
  const calls = [];
  const data = await Q.load('300775', ledger, {
    standalone: true,
    proxyUrl: 'https://script.google.com/macros/s/testDeployment/exec',
    jsonp: false,
    fetcher: async url => {
      calls.push(url);
      if (url.startsWith('https://push2') || url.startsWith('https://qt.')) throw new TypeError('Failed to fetch');
      assert.match(url, /action=quote/);
      assert.match(url, /symbol=SZ300775/);
      return response(fixture());
    }
  });
  assert.ok(calls.length >= 2);
  assert.equal(data.currentPrice, '21.84');
  assert.equal(data.quoteSource, '东方财富');
});
test('tencent quote acts as direct realtime fallback when eastmoney fails', async () => {
  const data = await Q.load('300775', ledger, {
    standalone: true,
    fetcher: async url => {
      if (url.startsWith('https://push2')) throw new TypeError('Failed to fetch');
      if (url.startsWith('https://qt.gtimg.cn')) {
        return {
          ok: true,
          text: async () => 'v_sz300775="51~三角防务~300775~21.84~21.73~21.78~139694~74278~65416~21.83~106~21.82~443~21.81~251~21.80~390~21.79~25~21.84~103~21.85~102~21.86~54~21.87~68~21.88~80~~20260904161400~0.11~0.51~22.23~21.70~21.84/139694/306877543~139694~30688~2.63~75.12~~22.23~21.70~2.44~116.11~119.59~2.04~26.08~17.38~0.80~808~21.97~146.19~30.77~~~1.71~30687.7543~19.8744~91~ A A~GP-A-CYB~-27.92~-2.46~0.46~2.64~1.92~49.19~18.86~4.75~0.65~-1.40~531643401~547553365~49.82~-23.64~531643401~~~-11.07~0.14~~CNY~0~~21.78~194~";'
        };
      }
      throw new Error('Unknown URL: ' + url);
    }
  });
  assert.equal(data.currentPrice, '21.84');
  assert.equal(data.changePercent, '0.51');
  assert.equal(data.quoteSource, '实时行情');
});
test('failed fetch and failed fallback show a friendly error, not browser internals', async () => {
  const data = await Q.load('300775', ledger, {
    standalone: true,
    fetcher: async () => { throw new TypeError('Failed to fetch'); },
    jsonpFetcher: async () => { throw new TypeError('Failed to fetch'); }
  });
  assert.equal(data.currentPrice, null);
  assert.equal(Q.statusText(data), '行情网络连接失败，请稍后重试');
});
test('timeout aborts instead of hanging forever', async () => {
  await assert.rejects(Q.fetchQuote(Q.identity('300775'), (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  }), 5), /timeout/);
});
test('local server cannot override verified quote or inject calculated A-share targets', async () => {
  const data = await Q.load('300775', ledger, { fetcher: async url => response(
    url.startsWith('/') ? { symbol: 'SZ300775', currentPrice: '999', metrics: { targetMeanPrice: '999' },
      institutionalView: [{ title: 'Buy!' }] } : fixture()) });
  assert.equal(data.currentPrice, '21.84');
  assert.equal(data.metrics.targetMeanPrice, 'N/A');
  assert.match(data.institutionalView[0].title, /暂无已核实/);
});
test('server failure plus absent quote is unavailable, not synthesized', async () => {
  const data = await Q.load('300775', ledger, { fetcher: async () => ({ ok: false, status: 503 }) });
  assert.equal(data.currentPrice, null);
  assert.equal(data.quoteStatus, 'unavailable');
});
test('unsupported standalone market is explicitly unavailable', async () => {
  const data = await Q.load('AAPL', [], { standalone: true, fetcher: async () => { throw new Error('must not call'); } });
  assert.equal(data.currentPrice, null);
  assert.match(Q.statusText(data), /暂未接入/);
});
