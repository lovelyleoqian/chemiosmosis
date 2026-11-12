const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '_shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.TARGET_URL || 'http://127.0.0.1:8899/index.html';

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'shell', args: ['--no-sandbox','--hide-scrollbars'] });
  const errs = [];

  // ---- 桌面 ----
  const p = await b.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await p.setViewport({ width: 1360, height: 900, deviceScaleFactor: 2 });
  await p.goto(URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1600));

  let el = await p.$('#exam .acc');
  if (el) { await p.evaluate(() => document.querySelector('#exam .acc details').open = true); await new Promise(r=>setTimeout(r,400)); await el.screenshot({ path: path.join(OUT,'d_exam_acc.png') }); }
  el = await p.$('#microbe .grid2');
  if (el) { await p.evaluate(()=>document.querySelector('#microbe').scrollIntoView()); await new Promise(r=>setTimeout(r,600)); await el.screenshot({ path: path.join(OUT,'d_microbe.png') }); }

  // ---- 各宽度溢出检查 ----
  const widths = [360, 390, 430, 600, 820, 1024, 1280, 1600];
  for (const w of widths) {
    await p.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await new Promise(r => setTimeout(r, 500));
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    console.log('overflow', w, JSON.stringify(o), o.sw <= o.iw + 1 ? 'OK' : 'BUG');
  }

  // ---- 手机截图 ----
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1600));
  for (const [id, name] of [['top','m_hero'],['lab','m_lab'],['motor','m_motor'],['evidence','m_evidence'],['math','m_math'],['exam','m_exam'],['quiz','m_quiz']]) {
    await p.evaluate(x => { location.hash = ''; location.hash = '#' + x; }, id);
    await new Promise(r => setTimeout(r, 900));
    await p.screenshot({ path: path.join(OUT, name + '.png') });
  }

  console.log('ERRORS', errs.length ? JSON.stringify(errs) : 'none');
  await b.close();
})();
