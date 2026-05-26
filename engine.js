const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const archiver = require('archiver');
const fs = require('fs-extra');
const path = require('path');

puppeteer.use(StealthPlugin());

/**
 * Enhanced Normalization: Removes UUIDs/IDs from URLs to group endpoints logically
 */
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.search = ''; 
    // Replaces trailing digits (IDs) with :id for better grouping
    return url.toString().replace(/\/\d+(?=\/|$)/g, '/:id');
  } catch { return u; }
}

async function runProMaxForensic(url, tempDir, log) {
  const requestId = `CINEFy_${Date.now()}`;
  const zipPath = path.join(tempDir, `${requestId}.zip`);
  
  // High-performance launch options
  const browser = await puppeteer.launch({ 
    headless: "new", 
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] 
  });

  const page = await browser.newPage();
  const endpoints = {};

  // Enable Request Interception to see outgoing headers/payloads
  await page.setRequestInterception(true);

  page.on('request', (req) => {
    const u = req.url();
    // Broaden detection to capture more API patterns
    const isApi = /[\/\.](api|graphql|v1|v2|v3|json|data)/i.test(u);
    
    if (isApi) {
      const key = normalizeUrl(u);
      if (!endpoints[key]) endpoints[key] = { url: key, interactions: [] };
      
      endpoints[key].interactions.push({
        method: req.method(),
        headers: req.headers(), // Capture Auth tokens/API keys
        postData: req.postData() || null,
        timestamp: new Date().toISOString()
      });
      
      log({ type: 'log', msg: `🔍 DETECTED: ${req.method()} -> ${u.substring(0, 60)}...` });
    }
    req.continue();
  });

  page.on("response", async (res) => {
    const u = res.url();
    const key = normalizeUrl(u);
    if (endpoints[key]) {
      const lastIdx = endpoints[key].interactions.length - 1;
      endpoints[key].interactions[lastIdx].status = res.status();
      endpoints[key].interactions[lastIdx].type = res.headers()['content-type'];
    }
  });

  try {
    log({ type: 'step', msg: `Forensic analysis started on ${url}` });
    
    // Set a realistic viewport for responsive content
    await page.setViewport({ width: 1280, height: 800 });
    
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // ✨ NEW: Auto-scroll to trigger Lazy Loading / Infinite Scroll APIs
    log({ type: 'step', msg: 'Simulating user scroll for lazy-loaded APIs...' });
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let distance = 100;
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if(totalHeight >= scrollHeight) { clearInterval(timer); resolve(); }
        }, 100);
      });
    });

    // Capture final state
    const html = await page.content();
    const screenshot = await page.screenshot({ fullPage: true });

    await browser.close();

    log({ type: 'step', msg: 'Finalizing Forensic Archive...' });

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip');
    archive.pipe(output);

    archive.append(html, { name: 'source_dump.html' });
    archive.append(screenshot, { name: 'visual_evidence.png' });
    archive.append(JSON.stringify(endpoints, null, 2), { name: 'Endpoint_Intelligence.json' });

    await archive.finalize();

    return { requestId, zipPath, report: endpoints };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

module.exports = { runProMaxForensic };