const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const url = 'https://skyblock.bz/flips';
        console.log(`Fetching ${url}...`);
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 10000
        });
        
        console.log(`Status: ${res.status}`);
        console.log(`Data length: ${res.data.length}`);
        
        const $ = cheerio.load(res.data);
        const cards = $('.card');
        console.log(`Found ${cards.length} .card elements`);
        
        if (cards.length === 0) {
            console.log('HTML Preview (first 1000 chars):');
            console.log(res.data.slice(0, 1000));
            console.log('HTML Preview (body tag):');
            const body = $('body').html();
            console.log(body ? body.slice(0, 1000) : 'No body found');
        }
    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) {
            console.log('Response status:', e.response.status);
        }
    }
}

test();
