const express = require('express');
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

const cache = new NodeCache({ stdTTL: 10 }); // cache 10 seconds to match Hypixel API refresh

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

const axios = require('axios');

async function getBazaarData(taxRate = 1.25) {
  const cacheKey = `flips_${taxRate}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get('https://api.hypixel.net/v2/skyblock/bazaar');
    if (!response.data.success) {
      throw new Error('Hypixel API failed');
    }

    const products = response.data.products;
    const cards = [];

    Object.values(products).forEach(product => {
      const { quick_status, product_id, buy_summary, sell_summary } = product;
      
      // Helper to get mean of top N prices
      const getMeanPrice = (summary, count = 5) => {
        if (!summary || !Array.isArray(summary) || summary.length === 0) return 0;
        const limit = Math.min(summary.length, count);
        let sum = 0;
        for (let i = 0; i < limit; i++) {
          sum += summary[i].pricePerUnit;
        }
        return sum / limit;
      };

      // buyPrice (High Price / Sell Offer) - calculated from top 1 sell offer (which are in buy_summary)
      const buyPrice = getMeanPrice(buy_summary, 1); // same as comment below but for buy
      
      // sellPrice (Low Price / Buy Order) - calculated from top 1 buy order (which are in sell_summary)
      const sellPrice = getMeanPrice(sell_summary, 1); // you can change the amount of orders that you want to be averaged to get the "sell price"
      
      if (buyPrice <= 0 || sellPrice <= 0) return;

      // Tax calculation
      // We buy at sellPrice (Low), Sell at buyPrice (High)
      // Margin = (High * tax) - Low
      const taxMultiplier = 1 - (taxRate / 100);
      const margin = (buyPrice * taxMultiplier) - sellPrice;
      
      // Volume estimation (items per week / 168 hours)
      // instabuy = buyMovingWeek (items bought instantly)
      // instasell = sellMovingWeek (items sold instantly)
      const instabuyHourly = Math.round(quick_status.buyMovingWeek / 168);
      const instasellHourly = Math.round(quick_status.sellMovingWeek / 168);
      
      // Coins per hour = lower of instabuy/instasell * margin
      const coinsPerHour = margin * Math.min(instabuyHourly, instasellHourly);

      // Filter out low volume or negative margin
      if (margin > 0 && Math.min(instabuyHourly, instasellHourly) > 10) {
        cards.push({
          id: product_id,
          title: product_id.replace(/_/g, ' '),
          buy: sellPrice, // Buy Order (Low)
          sell: buyPrice, // Sell Offer (High)
          instabuy: instabuyHourly, 
          instasell: instasellHourly,
          margin: margin,
          coinsPerHour: coinsPerHour,
          href: `https://skyblock.bz/product/${product_id}`,
          img: `https://sky.coflnet.com/static/icon/${product_id}`, 
          raw: JSON.stringify(quick_status)
        });
      }
    });

    // Sort by coins per hour
    cards.sort((a, b) => b.coinsPerHour - a.coinsPerHour);
    
    // Top 100
    const topCards = cards.slice(0, 100);

    cache.set(cacheKey, topCards);
    return topCards;

  } catch (e) {
    console.error('Bazaar API Error:', e);
    throw e;
  }
}

app.get('/api/flips', async (req, res) => {
  try {
    const tax = req.query.tax ? parseFloat(req.query.tax) : 1.25;
    const data = await getBazaarData(tax);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auto-scrape on startup
(async () => {
  console.log('Initial fetch starting...');
  try {
    await getBazaarData();
    console.log('Initial fetch successful!');
  } catch (err) {
    console.error('Initial fetch failed:', err.message);
  }
})();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Scraper backend listening on ${PORT}`));
