const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '_shots');
const URL = process.env.TARGET_URL || 'http://127.0.0.1:8899/index.html';

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'shell', args: ['--no-sandbox','--hide-scrollbars'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await p.setViewport({ width: 1360, height: 950, deviceScaleFactor: 2 });
  await p.goto(URL + '#quiz', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  // 全部答对（答案索引 1,2,1,1,2,1,0,1,1,1,1,0）
  const A = [1,2,1,1,2,1,0,1,1,1,1,0];
  await p.evaluate(ans => {
    [...document.querySelectorAll('#quizList .q')].forEach((q, i) => {
      q.querySelectorAll('.opt')[ans[i]].click();
    });
  }, A);
  await new Promise(r => setTimeout(r, 1200));
  const full = await p.evaluate(() => ({
    hidden: document.getElementById('quizResult').hidden,
    score: document.getElementById('qrScore').textContent,
    title: document.getElementById('qrTitle').textContent
  }));
  console.log('all-correct', JSON.stringify(full));
  const el = await p.$('#quizResult');
  await el.screenshot({ path: path.join(OUT, 'quiz_full.png') });

  // 重做一遍
  await p.evaluate(() => document.getElementById('quizReset').click());
  await new Promise(r => setTimeout(r, 900));
  const reset = await p.evaluate(() => ({
    hidden: document.getElementById('quizResult').hidden,
    q: document.querySelectorAll('#quizList .q').length,
    shown: document.querySelectorAll('#quizList .q-expl.show').length,
    disabled: document.querySelectorAll('#quizList .opt:disabled').length
  }));
  console.log('after-reset', JSON.stringify(reset));

  // 图片全错 → 0 分档
  await p.evaluate(ans => {
    [...document.querySelectorAll('#quizList .q')].forEach((q, i) => {
      q.querySelectorAll('.opt')[(ans[i] + 1) % 4].click();
    });
  }, A);
  await new Promise(r => setTimeout(r, 1200));
  const zero = await p.evaluate(() => ({
    score: document.getElementById('qrScore').textContent,
    title: document.getElementById('qrTitle').textContent,
    pct: document.querySelector('.qr-ring').style.getPropertyValue('--pct')
  }));
  console.log('all-wrong', JSON.stringify(zero));

  console.log('ERRORS', errs.length ? JSON.stringify(errs) : 'none');
  await b.close();
})();
