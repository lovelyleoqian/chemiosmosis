const puppeteer = require('puppeteer-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.env.TARGET_URL || 'http://127.0.0.1:8899/index.html';
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'shell', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1360, height: 950 });
  const resp = await p.goto(URL, { waitUntil: 'domcontentloaded' });
  console.log('status', resp.status());
  const r = await p.evaluate(() => {
    const sec = document.getElementById('quiz');
    const kids = sec ? [...sec.children].map(e => e.tagName + '.' + e.className) : null;
    const main = document.querySelector('main');
    const mainKids = main ? [...main.children].map(e => e.tagName + '#' + e.id) : null;
    const bodyKids = [...document.body.children].map(e => e.tagName + '#' + e.id + '.' + e.className);
    return { kids, mainKids, bodyKids, bodyHTMLTail: document.body.innerHTML.slice(-900) };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
