const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '_shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'https://lovelyleoqian.github.io/chemiosmosis/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
  });

  // ---- A. 鑴傝川浣撳厜鐓у疄楠?----
  let page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.setViewport({ width: 1360, height: 950, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => document.getElementById('lightBtn').click());
  await new Promise(r => setTimeout(r, 6000));
  const after = await page.evaluate(() => ({
    ph: document.getElementById('vesPh').textContent,
    dph: document.getElementById('vesDph').textContent,
    atp: document.getElementById('vesAtp').textContent,
    msg: document.getElementById('vesMsg').textContent
  }));
  console.log('LIGHT ON ->', JSON.stringify(after));
  const ves = await page.$('#vesCanvas');
  await page.evaluate(() => document.querySelector('#vesCanvas').scrollIntoView({block:'center'}));
  await new Promise(r => setTimeout(r, 1200));
  await ves.screenshot({ path: path.join(OUT, 'light_on.png') });

  // ---- B. 浜壊涓婚 ----
  await page.evaluate(() => document.getElementById('themeBtn').click());
  await new Promise(r => setTimeout(r, 1800));
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  console.log('THEME', theme);
  const lab = await page.$('#lab');
  await page.evaluate(() => document.querySelector('#lab').scrollIntoView({block:'center'}));
  await new Promise(r => setTimeout(r, 1200));
  await lab.screenshot({ path: path.join(OUT, 'light_theme_lab.png') });
  await page.close();

  // ---- C. 鎵嬫満瑙嗗彛 ----
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return { sw: de.scrollWidth, cw: de.clientWidth, bodyW: document.body.scrollWidth };
  });
  console.log('MOBILE', JSON.stringify(overflow));
  await page.screenshot({ path: path.join(OUT, 'mobile_hero.png') });
  await page.evaluate(() => document.querySelector('#lab').scrollIntoView({block:'start'}));
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT, 'mobile_lab.png') });
  await page.close();

  console.log('ERRORS', errs.length ? JSON.stringify(errs) : 'none');
  await browser.close();
})();

