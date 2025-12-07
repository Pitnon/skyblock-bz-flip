const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const cors = require('cors');

const app = express();
app.use(cors({
    origin: function (origin, callback) {
        // Allow all origins, but reflect the request origin to support credentials
        callback(null, true);
    },
    credentials: true
}));
app.use(express.json());

const cache = new NodeCache({ stdTTL: 30 }); // cache 30 seconds to avoid spamming the target site

function parseNum(str) {
  if (!str) return null;
  str = str.toString().trim().toLowerCase().replace(/,/g, '');
  if (str === '-') return null;
  const suffix = str.slice(-1);
  if (suffix === 'k') return parseFloat(str) * 1e3;
  if (suffix === 'm') return parseFloat(str) * 1e6;
  if (suffix === 'b') return parseFloat(str) * 1e9;
  const n = parseFloat(str);
  return Number.isNaN(n) ? null : n;
}

async function scrapeFlips() {
  const cached = cache.get('flips');
  if (cached) return cached;

  const url = 'https://skyblock.bz/flips';
  
  let html = '';
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', 
        '--disable-gpu'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Go to URL and wait for network idle or selector
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    try {
      await page.waitForSelector('.card', { timeout: 10000 });
    } catch (e) {
      console.log('Warning: Timeout waiting for .card selector, proceeding with current content...');
    }
    
    html = await page.content();
  } catch (e) {
    console.error('Scraping error:', e);
    throw e;
  } finally {
    if (browser) await browser.close();
  }

  const $ = cheerio.load(html);

  // Relaxed selector to avoid svelte hash issues
  if (!html || !$('.card').length) {
    // Fallback: log but don't crash if we can't find cards immediately, 
    // though we should probably throw if it's truly empty.
    // Let's try to proceed if we find at least one .card
    if (!$('.card').length) {
       console.log('HTML dump:', html.slice(0, 500)); // Debug log
       throw new Error('Unexpected flips markup. No .card elements found.');
    }
  }

  const labelRegexCache = new Map();
  function findMetric(cardHtml, label) {
    if (!labelRegexCache.has(label)) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      labelRegexCache.set(label, new RegExp(`<b>\\s*${escaped}\\s*<\\/b>:\\s*([^<]+)`, 'i'));
    }
    const regex = labelRegexCache.get(label);
    const match = cardHtml.match(regex);
    if (!match) return null;
    const numericChunk = match[1].replace(/coins?|one-hour instabuys?|one-hour instasells?/gi, '');
    const numericMatch = numericChunk.match(/[-\d.,kKmMbB]+/);
    return numericMatch ? parseNum(numericMatch[0]) : null;
  }

  const cards = [];
  $('.card').each((i, el) => {
    const card = $(el);
    if (!card.find('a').length) return; // skip spacer divs
    const title = card.find('.item-name').text().trim() || card.find('h3, h2').first().text().trim();
    const cardHtml = card.html() || '';
    const text = card.text().replace(/\s+/g, ' ').trim();

    const buy = findMetric(cardHtml, 'Buy Price');
    const sell = findMetric(cardHtml, 'Sell Price');
    const instabuy = findMetric(cardHtml, 'One-Hour Instabuys');
    const instasell = findMetric(cardHtml, 'One-Hour Instasells');
    const margin = findMetric(cardHtml, 'Margin');
    const coinsPerHour = findMetric(cardHtml, 'Coins per Hour');

    const hrefRaw = card.find('a').attr('href') || null;
    const href = hrefRaw ? new URL(hrefRaw, 'https://skyblock.bz').toString() : null;
    const imgRaw = card.find('img').attr('src') || null;
    const img = imgRaw ? new URL(imgRaw, 'https://skyblock.bz').toString() : null;

    cards.push({
      id: cards.length,
      title: title || 'Unknown Item',
      buy,
      sell,
      instabuy,
      instasell,
      margin,
      coinsPerHour,
      href,
      img,
      raw: text,
    });
  });

  if (!cards.length) {
    throw new Error('No flip cards parsed. Inspect selectors.');
  }

  cache.set('flips', cards);
  return cards;
}

app.get('/api/flips', async (req, res) => {
  try {
    const data = await scrapeFlips();
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auto-scrape on startup
(async () => {
  console.log('Initial scrape starting...');
  try {
    await scrapeFlips();
    console.log('Initial scrape successful!');
  } catch (err) {
    console.error('Initial scrape failed:', err.message);
  }
})();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Scraper backend listening on ${PORT}`));
