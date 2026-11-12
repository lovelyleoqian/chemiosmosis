const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '_shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.TARGET_URL || 'http://127.0.0.1:8899/index.html';

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'shell', args: ['--no-sandbox','--disable-gpu','--hide-scrollbars'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await p.setViewport({ width: 1360, height: 950, deviceScaleFactor: 2 });
  await p.goto(URL + '#quiz', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1800));

  const qres = await p.evaluate(() => {
    const qs = [...document.querySelectorAll('#quiz .q')];
    qs.forEach((q, i) => {
      const opts = q.querySelectorAll('.opt');
      if (opts[i % 4]) opts[i % 4].click();
    });
    return { n: qs.length };
  });
  await new Promise(r => setTimeout(r, 1500));
  const state = await p.evaluate(() => {
    const r = document.getElementById('quizResult');
    return {
      hidden: r ? r.hidden : 'missing',
      score: (document.getElementById('qrScore') || {}).textContent,
      title: (document.getElementById('qrTitle') || {}).textContent,
      expl: document.querySelectorAll('#quiz .q-expl.show').length,
      correct: document.querySelectorAll('#quiz .opt.correct').length,
      incorrect: document.querySelectorAll('#quiz .opt.incorrect').length
    };
  });
  console.log('quiz', JSON.stringify(qres), JSON.stringify(state));
  const qel = await p.$('#quizResult');
  if (qel) { await qel.screenshot({ path: path.join(OUT,'quiz_result.png') }); }
  const qel2 = await p.$('#quiz');
  if (qel2) { await p.evaluate(()=>document.querySelector('#quiz').scrollIntoView({block:'start'})); await new Promise(r=>setTimeout(r,800)); await qel2.screenshot({ path: path.join(OUT,'quiz_answered.png') }); }

  // 主题留存
  await p.evaluate(() => document.getElementById('themeBtn').click());
  await new Promise(r => setTimeout(r, 600));
  const t1 = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem('chemiosmosis-theme') }));
  await p.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));
  const t2 = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem('chemiosmosis-theme') }));
  console.log('theme', JSON.stringify(t1), '->', JSON.stringify(t2));

  console.log('ERRORS', errs.length ? JSON.stringify(errs) : 'none');
  await b.close();
})();
