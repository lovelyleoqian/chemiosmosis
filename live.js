const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '_shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.TARGET_URL || 'https://lovelyleoqian.github.io/chemiosmosis/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => errs.push('REQFAIL: ' + r.url() + ' ' + (r.failure() || {}).errorText));

  await page.setViewport({ width: 1360, height: 950, deviceScaleFactor: 2 });
  const resp = await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log('HTTP', resp.status(), URL);
  await new Promise(r => setTimeout(r, 3000));

  const sizes = await page.evaluate(() => {
    const o = {};
    document.querySelectorAll('canvas').forEach(c => {
      o[c.id] = c.width + 'x' + c.height;
    });
    o.__title = document.title;
    o.__quiz = document.querySelectorAll('#quiz .q').length;
    o.__nav = document.querySelectorAll('#navLinks a').length;
    o.__h = document.documentElement.scrollHeight;
    return o;
  });
  console.log('DOM', JSON.stringify(sizes));

  // 模拟一次交互：切 FADH2 + 加 DNP
  await page.evaluate(() => {
    document.querySelector('.seg[data-group="substrate"] button[data-val="FADH2"]').click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => { document.getElementById('dnp').value = 60; document.getElementById('dnp').dispatchEvent(new Event('input', {bubbles:true})); });
  await new Promise(r => setTimeout(r, 2500));

  const reads = await page.evaluate(() => ({
    dp: document.getElementById('rmDp').textContent,
    o2: document.getElementById('rmO2v').textContent,
    atp: document.getElementById('rmAtp').textContent,
    dnpOut: document.getElementById('dnpOut').textContent,
    vesMsg: document.getElementById('vesMsg').textContent
  }));
  console.log('READS', JSON.stringify(reads));

  await page.screenshot({ path: path.join(OUT, 'live_full.png'), fullPage: true });
  const shot = async (sel, name) => {
    const el = await page.$(sel);
    if (!el) return console.log('missing', sel);
    await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
    await new Promise(r => setTimeout(r, 900));
    await el.screenshot({ path: path.join(OUT, name) });
  };
  await shot('#lab', 'live_lab.png');
  await shot('#motor', 'live_motor.png');
  await shot('#evidence', 'live_evidence.png');

  console.log('ERRORS', errs.length ? JSON.stringify(errs, null, 1) : 'none');
  await browser.close();
})();
