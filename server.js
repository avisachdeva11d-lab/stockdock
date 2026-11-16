const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const ROOT = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'datasets');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8' };

const GROUPS = {
  'NIFTY 50': 'Broad',
  'NIFTY 100': 'Broad',
  'NIFTY 500': 'Broad',
  'NIFTY NEXT 50': 'Broad',
  'NIFTY BANK': 'Sector',
  'NIFTY AUTO': 'Sector',
  'NIFTY FMCG': 'Sector',
  'NIFTY IT': 'Sector',
  'NIFTY METAL': 'Sector',
  'NIFTY PHARMA': 'Sector',
  'NIFTY MIDCAP 150': 'Size',
  'NIFTY SMALLCAP 250': 'Size',
  'NIFTY MICROCAP 250': 'Size',
  'INDIAVIX': 'Volatility'
};
const SYMBOLS = {
  'NIFTY 50': 'N50',
  'NIFTY 100': '100',
  'NIFTY 500': '500',
  'NIFTY NEXT 50': 'NX',
  'NIFTY BANK': 'BNK',
  'NIFTY AUTO': 'AUT',
  'NIFTY FMCG': 'FMC',
  'NIFTY IT': 'IT',
  'NIFTY METAL': 'MET',
  'NIFTY PHARMA': 'PHA',
  'NIFTY MIDCAP 150': 'MID',
  'NIFTY SMALLCAP 250': 'SML',
  'NIFTY MICROCAP 250': 'MIC',
  'INDIAVIX': 'VIX'
};
const GROUP_ORDER = { Broad: 0, Sector: 1, Size: 2, Volatility: 3, Other: 4 };

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

function headerIndex(headers, names) {
  const wanted = names.map(name => name.toLowerCase());
  return headers.findIndex(header => wanted.includes(String(header).trim().toLowerCase()));
}

function loadSeries() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter(file => file.toLowerCase().endsWith('.csv'))
    .map(file => {
      const name = path.basename(file, path.extname(file));
      const table = parseCsv(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
      if (table.length < 2) return null;
      const headers = table[0];
      const dateIdx = headerIndex(headers, ['date']);
      const closeIdx = headerIndex(headers, ['close']);
      const peIdx = headerIndex(headers, ['p/e', 'pe']);
      const volumeIdx = headerIndex(headers, ['volume']);
      if (dateIdx < 0 || closeIdx < 0) return null;
      const points = table.slice(1).map(cells => {
        const close = Number(cells[closeIdx]);
        const date = String(cells[dateIdx] || '').trim();
        if (!date || !Number.isFinite(close)) return null;
        const point = { date, close };
        if (peIdx >= 0) {
          const pe = Number(cells[peIdx]);
          if (Number.isFinite(pe)) point.pe = pe;
        }
        if (volumeIdx >= 0) {
          const volume = Number(cells[volumeIdx]);
          if (Number.isFinite(volume)) point.volume = volume;
        }
        return point;
      }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
      if (!points.length) return null;
      const last = points[points.length - 1];
      const previous = points.length > 1 ? points[points.length - 2] : null;
      const change = previous && previous.close ? ((last.close - previous.close) / previous.close) * 100 : null;
      return {
        name,
        group: GROUPS[name] || 'Other',
        symbol: SYMBOLS[name] || name.slice(0, 3).toUpperCase(),
        date: last.date,
        close: last.close,
        previousClose: previous ? previous.close : null,
        change,
        pe: last.pe ?? null,
        volume: last.volume ?? null,
        observations: points.length,
        sparkline: points.slice(-12).map(point => point.close),
        points
      };
    })
    .filter(Boolean)
    .sort((a, b) => (GROUP_ORDER[a.group] - GROUP_ORDER[b.group]) || a.name.localeCompare(b.name));
}

const series = loadSeries();
const byName = new Map(series.map(item => [item.name.toLowerCase(), item]));
const asOf = series.reduce((latest, item) => item.date > latest ? item.date : latest, '');

function summary(item) {
  return {
    name: item.name,
    group: item.group,
    symbol: item.symbol,
    date: item.date,
    close: item.close,
    previousClose: item.previousClose,
    change: item.change,
    pe: item.pe,
    volume: item.volume,
    observations: item.observations,
    sparkline: item.sparkline
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      providerConfigured: Boolean(API_KEY),
      mode: series.length ? 'historical' : 'demo',
      seriesCount: series.length,
      asOf: asOf || null
    });
  }
  if (url.pathname === '/api/indices') {
    return sendJson(res, 200, {
      asOf: asOf || null,
      source: 'datasets/*.csv',
      note: 'Historical NSE index closes from the datasets folder. Dates differ by file and these are not live prices.',
      series: series.map(summary)
    });
  }
  if (url.pathname === '/api/series') {
    const name = (url.searchParams.get('name') || '').trim();
    const item = byName.get(name.toLowerCase());
    if (!item) return sendJson(res, 404, { error: 'Unknown index series.' });
    const requested = Number(url.searchParams.get('points') || 90);
    const points = Number.isFinite(requested) ? Math.min(5000, Math.max(1, Math.floor(requested))) : 90;
    return sendJson(res, 200, {
      name: item.name,
      asOf: item.date,
      points: item.points.slice(-points).map(point => ({ date: point.date, close: point.close }))
    });
  }
  if (url.pathname === '/api/quote') {
    const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
    if (!/^[A-Z0-9.^_-]{1,20}$/.test(symbol)) return sendJson(res, 400, { error: 'Enter a valid ticker symbol.' });
    if (!API_KEY) return sendJson(res, 503, { error: 'Live data is not configured. Add ALPHA_VANTAGE_API_KEY to your environment and restart the container.' });
    try {
      const apiUrl = new URL('https://www.alphavantage.co/query');
      apiUrl.searchParams.set('function', 'GLOBAL_QUOTE');
      apiUrl.searchParams.set('symbol', symbol);
      apiUrl.searchParams.set('apikey', API_KEY);
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
      const data = await response.json();
      if (data.Note || data.Information) return sendJson(res, 429, { error: data.Note || data.Information });
      const q = data['Global Quote'];
      if (!q || !q['05. price']) return sendJson(res, 404, { error: 'No quote returned. Check the ticker symbol and provider coverage.' });
      return sendJson(res, 200, {
        symbol: q['01. symbol'] || symbol,
        price: Number(q['05. price']),
        change: Number(q['09. change']),
        changePercent: Number(String(q['10. change percent'] || '0').replace('%','')),
        latestTradingDay: q['07. latest trading day'] || null,
        source: 'Alpha Vantage Global Quote',
        note: 'Quote freshness depends on your provider plan and exchange entitlements.'
      });
    } catch (err) {
      return sendJson(res, 502, { error: `Could not fetch quote: ${err.message}` });
    }
  }
  let requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(ROOT, requested));
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, body) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
});
function sendJson(res, status, data) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(data)); }
server.listen(PORT, '0.0.0.0', () => console.log(`StockDock listening on port ${PORT} (${series.length} index series, as of ${asOf || 'n/a'})`));
