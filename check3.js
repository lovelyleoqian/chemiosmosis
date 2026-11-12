const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '_shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.TARGET_URL || 'http://127.0.0.1:8899/index.html';

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'shell', args: ['--no-sandbox','--disable-gpu','--hide-scrollbars'] });

  // 亮色主题
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await p.setViewport({ width: 1360, height: 950, deviceScaleFactor: 2 });
  await p.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  console.log('theme before', await p.evaluate(() => document.documentElement.dataset.theme));
  await p.evaluate(() => document.getElementById('themeBtn').click());
  await new Promise(r => setTimeout(r, 900));
  console.log('theme after ', await p.evaluate(() => document.documentElement.dataset.theme));
  await p.evaluate(() => document.getElementById('themeBtn').click());
  await new Promise(r => setTimeout(r, 900));
  console.log('theme after2', await p.evaluate(() => document.documentElement.dataset.theme));

  // 强制亮色后截几张
  await p.evaluate(() => { if (document.documentElement.dataset.theme !== 'light') document.getElementById('themeBtn').click(); });
  await new Promise(r => setTimeout(r, 1200));
  const secs = ['hero', 'lab', 'math', 'exam'];
  for (const s of secs) {
    const sel = '#' + s;
    const el = await p.$(sel);
    if (!el) { console.log('miss', sel); continue; }
    await p.evaluate(x => document.querySelector(x).scrollIntoView({ block: 'center' }), sel);
    await new Promise(r => setTimeout(r, 900));
    await el.screenshot({ path: path.join(OUT, 'lt_' + s + '.png') });
  }
  // 手机
  const m = await b.newPage();
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await m.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await m.screenshot({ path: path.join(OUT, 'm2_hero.png') });
  await m.evaluate(() => document.querySelector('#lab').scrollIntoView({ block: 'start' }));
  await new Promise(r => setTimeout(r, 1400));
  await m.screenshot({ path: path.join(OUT, 'm2_lab.png') });
  await m.evaluate(() => document.querySelector('#exam').scrollIntoView({ block: 'start' }));
  await new Promise(r => setTimeout(r, 1400));
  await m.screenshot({ path: path.join(OUT, 'm2_exam.png') });

  console.log('ERRORS', errs.length ? JSON.stringify(errs) : 'none');
  await b.close();
})();
