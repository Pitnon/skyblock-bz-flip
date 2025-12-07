const puppeteer = require('puppeteer');
const { execSync } = require('child_process');
const fs = require('fs');

(async () => {
  try {
    console.log('Locating Chrome...');
    const executablePath = puppeteer.executablePath();
    console.log(`Executable path: ${executablePath}`);

    if (!fs.existsSync(executablePath)) {
        console.error('ERROR: Executable does not exist at path!');
        return;
    }

    console.log('Running ldd to check for missing shared libraries...');
    try {
        const lddOutput = execSync(`ldd "${executablePath}"`).toString();
        const lines = lddOutput.split('\n');
        const missing = lines.filter(line => line.includes('not found'));
        
        if (missing.length > 0) {
            console.log('!!! MISSING DEPENDENCIES FOUND !!!');
            missing.forEach(m => console.log(m.trim()));
        } else {
            console.log('ldd reports all libraries are present.');
        }
    } catch (e) {
        console.error('Error running ldd:', e.message);
    }

    console.log('Attempting minimal launch...');
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      dumpio: true // Log stdout/stderr from chrome
    });
    console.log('Browser launched successfully!');
    await browser.close();

  } catch (err) {
    console.error('Launch failed:', err);
  }
})();
