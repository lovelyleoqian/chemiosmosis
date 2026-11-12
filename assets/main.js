/* ============================================================
   main.js —— 页面交互：主题、滚动、导览、计算器、自测题
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ============================================================
     1. 主题
     ============================================================ */
  var themeBtn = $('themeBtn');
  var root = document.documentElement;

  function setTheme(t, save) {
    root.dataset.theme = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#ffffff' : '#070b14');
    if (themeBtn) themeBtn.textContent = t === 'light' ? '☀' : '☾';
    if (save) {
      try { localStorage.setItem('chemiosmosis-theme', t); } catch (e) { }
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  }

  (function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem('chemiosmosis-theme'); } catch (e) { }
    if (stored === 'light' || stored === 'dark') { setTheme(stored, false); return; }
    var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    setTheme(prefersLight ? 'light' : 'dark', false);
  })();

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      setTheme(root.dataset.theme === 'light' ? 'dark' : 'light', true);
    });
  }

  /* ============================================================
     2. Toast
     ============================================================ */
  var toast = $('toast');
  var toastTimer = 0;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2400);
  }

  /* ============================================================
     3. 分享链接
     ============================================================ */
  function shareLink() {
    var url = location.href.split('#')[0];
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      showToast(ok ? '链接已复制，发给同学就能一起看 ✓' : '复制失败，请手动复制地址栏');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showToast('链接已复制，发给同学就能一起看 ✓');
      }).catch(fallback);
    } else {
      fallback();
    }
  }

  ['shareBtn', 'shareBtn2'].forEach(function (id) {
    var b = $(id);
    if (b) b.addEventListener('click', shareLink);
  });

  /* ============================================================
     4. 滚动：进度条 / 导航高亮 / 回到顶部 / reveal
     ============================================================ */
  var progressBar = $('progressBar');
  var navLinks = $$('#navLinks a');
  var sectionIds = ['lab', 'mechanism', 'motor', 'evidence', 'math', 'microbe', 'exam', 'quiz'];
  var sections = sectionIds.map(function (id) { return $(id); }).filter(Boolean);

  var backTop = $('backTop');
  if (backTop) {
    backTop.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var doc = document.documentElement;
      var scrolled = window.scrollY || doc.scrollTop;
      var max = (doc.scrollHeight - window.innerHeight) || 1;
      var pct = Math.min(100, Math.max(0, scrolled / max * 100));
      if (progressBar) progressBar.style.width = pct + '%';

      var current = null;
      var probe = scrolled + window.innerHeight * 0.32;
      for (var i = 0; i < sections.length; i++) {
        var s = sections[i];
        if (s.offsetTop <= probe) current = s.id;
      }
      navLinks.forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === '#' + current);
      });
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* reveal */
  var reveals = $$('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ============================================================
     5. 实验台控件
     ============================================================ */
  /* 分段按钮 */
  $$('.seg').forEach(function (seg) {
    var group = seg.dataset.group;
    seg.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-val]');
      if (!btn) return;
      $$('button', seg).forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      if (group === 'substrate' && window.ETC) {
        window.ETC.setSubstrate(btn.dataset.val);
        updateCaption('substrate', btn.dataset.val);
      }
      if (group === 'model' && window.ETC) {
        window.ETC.setModel(btn.dataset.val);
        updateCaption('model', btn.dataset.val);
      }
    });
  });

  /* 速度 */
  var speed = $('speed'), speedOut = $('speedOut');
  if (speed) {
    speed.addEventListener('input', function () {
      var v = +speed.value;
      if (speedOut) speedOut.textContent = v.toFixed(1) + '×';
      if (window.ETC) window.ETC.setSpeed(v);
    });
  }

  /* 暂停 / 重置 */
  var pauseBtn = $('pauseBtn');
  var paused = false;
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      paused = !paused;
      pauseBtn.textContent = paused ? '继续' : '暂停';
      pauseBtn.classList.toggle('on', paused);
      if (window.ETC) window.ETC.setPaused(paused);
    });
  }
  var resetBtn = $('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      if (window.ETC) window.ETC.reset();
      if (window.VESICLE) window.VESICLE.reset();
      showToast('已重置，重新开始一次呼吸');
    });
  }

  /* DNP 滑块 */
  var dnp = $('dnp'), dnpOut = $('dnpOut');
  if (dnp) {
    dnp.addEventListener('input', function () {
      var v = +dnp.value;
      if (dnpOut) dnpOut.textContent = v + '%';
      var f = v / 100;
      if (window.ETC) window.ETC.setDnp(f);
      document.dispatchEvent(new CustomEvent('etc:dnp', { detail: f }));
      if (v >= 95) showToast('DNP 拉满：梯度被短路，能量全变热');
    });
  }

  /* 加药 */
  $$('.chip[data-drug]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      if (!window.ETC) return;
      var name = chip.dataset.drug;
      var on = window.ETC.toggleDrug(name);
      chip.classList.toggle('on', on);
      chip.classList.toggle('danger', on && (name === 'cyanide' || name === 'antimycin'));
      if (name === 'oligomycin') {
        document.dispatchEvent(new CustomEvent('etc:oligomycin', { detail: on }));
      }
      showToast(chip.textContent.trim() + (on ? '：已加入' : '：已移除'));
    });
  });

  /* 导览 */
  var tourSteps = $('tourSteps');
  var TOUR_CAPS = [
    { t: '① 筑坝', d: '磷脂双分子层 + 致密膜蛋白把 H⁺ 挡在里面。没有这层「不透水」的膜，后面全是白搭。' },
    { t: '② 泵质子', d: '电子在复合体 I、III、IV 里往下走，把 H⁺ 从基质泵到膜间隙。一对电子走完，泵出 10 个（NADH）或 6 个（琥珀酸）。' },
    { t: '③ 存梯度', d: '泵上来的 H⁺ 堆在膜间隙一侧，既带来正电荷（Δψ）又降低 pH（ΔpH）。两种能量叠加成 Δp。' },
    { t: '④ 回流', d: 'H⁺ 只能从 F₀ 的通道回去。这一条路是「唯一的泄洪道」，能量就此交给合酶。' },
    { t: '⑤ 拧出 ATP', d: '质子流推着 c 环转，γ 轴带着 F₁ 的三个 β 亚基轮流转：L 结合 → T 合成 → O 释放，每转一圈出 3 个 ATP。' }
  ];
  var etcCaption = $('etcCaption');

  function updateCaption(kind, val) {
    if (!etcCaption) return;
    var b = etcCaption.querySelector('b');
    var s = etcCaption.querySelector('span');
    if (!b || !s) return;
    if (kind === 'substrate') {
      if (val === 'FADH2') {
        b.textContent = '琥珀酸（FADH₂）路线';
        s.textContent = '电子从复合体 II 进入，绕过复合体 I，少泵 4 个 H⁺。ATP 产量降到 NADH 路线的六成。';
      } else {
        b.textContent = 'NADH 路线';
        s.textContent = '电子从复合体 I 进入，四个复合体接力，共泵出 10 个 H⁺。';
      }
    } else {
      if (val === 'bact') {
        b.textContent = '细菌质膜模式';
        s.textContent = 'P 侧是胞外/周质，N 侧是细胞质。F₁ 朝向细胞质，ATP 在细胞质里生成。';
      } else {
        b.textContent = '线粒体内膜模式';
        s.textContent = 'P 侧是膜间隙，N 侧是基质。F₁ 朝向基质，ATP 在基质里生成。';
      }
    }
  }

  if (tourSteps) {
    tourSteps.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-step]');
      if (!btn) return;
      var step = +btn.dataset.step;
      $$('button', tourSteps).forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      if (window.ETC) window.ETC.setTour(step);
      if (etcCaption) {
        var b = etcCaption.querySelector('b');
        var s = etcCaption.querySelector('span');
        if (step < 0) {
          if (b) b.textContent = '自由模式';
          if (s) s.textContent = '四种复合体在传递电子，质子在向右「上坡」；右边的 ATP 合酶靠回流的质子转动。';
        } else {
          var c = TOUR_CAPS[step];
          if (b) b.textContent = c.t;
          if (s) s.textContent = c.d;
        }
      }
    });
  }

  /* 移动端提示：canvas 可横向滑动 */
  var stageScroll = $('stageScroll');
  if (stageScroll && window.innerWidth < 900) {
    var hint = stageScroll.parentNode.querySelector('.stage-hint');
    if (hint) hint.classList.add('show');
  }

  /* ============================================================
     6. 计算器
     ============================================================ */
  var iPsi = $('iPsi'), iPh = $('iPh'), iC = $('iC');
  var vPsi = $('vPsi'), vPh = $('vPh'), vC = $('vC');
  var oDp = $('oDp'), oDpBar = $('oDpBar'), oG = $('oG');
  var oRatio = $('oRatio'), oRatioReal = $('oRatioReal'), oCost = $('oCost');
  var oVerdict = $('oVerdict');

  var F_CONST = 96485, R_CONST = 8.314, T_K = 298.15;
  var ATP_DG = 50;   // 生理条件下 ATP 水解 ΔG，kJ/mol

  function calc() {
    if (!iPsi || !iPh || !iC) return;
    var psi = +iPsi.value;
    var dph = +iPh.value;
    var n = +iC.value;

    var factor = 2.303 * R_CONST * T_K / F_CONST * 1000;   // ≈ 59 mV
    var dp = psi + factor * dph;                            // mV

    var dG = Math.abs(dp) / 1000 * F_CONST / 1000;          // kJ/mol
    var ratio = n / 3;
    var ratioReal = ratio + 1;
    var cost = ratioReal * dG;

    if (vPsi) vPsi.textContent = psi;
    if (vPh) vPh.textContent = dph.toFixed(2);
    if (vC) vC.textContent = n;
    if (oDp) oDp.textContent = Math.round(dp);
    if (oDpBar) oDpBar.style.width = Math.min(100, Math.max(0, Math.abs(dp) / 280 * 100)) + '%';
    if (oG) oG.textContent = dG.toFixed(1);
    if (oRatio) oRatio.textContent = ratio.toFixed(2);
    if (oRatioReal) oRatioReal.textContent = ratioReal.toFixed(2);
    if (oCost) oCost.textContent = cost.toFixed(0);

    if (oVerdict) {
      var bEl = oVerdict.querySelector('b');
      var sEl = oVerdict.querySelector('span');
      var verdict, cls;
      if (dp <= 0) {
        verdict = 'Δp ≤ 0：梯度方向反了，质子不会往里流，ATP 合酶不转。';
        cls = 'bad';
      } else if (cost < ATP_DG * 0.8) {
        verdict = '能量不够（' + cost.toFixed(0) + ' < 50 kJ/mol）：勉强转，但做不满一个 ATP。';
        cls = 'warn';
      } else if (cost < ATP_DG * 1.15) {
        verdict = '刚好够（' + cost.toFixed(0) + ' ≈ 50 kJ/mol）：生理条件下的实际工作点。';
        cls = 'ok';
      } else {
        verdict = '富余（' + cost.toFixed(0) + ' > 50 kJ/mol）：梯度绰绰有余，可驱动其它耗能过程。';
        cls = 'ok';
      }
      if (bEl) bEl.textContent = '结论';
      if (sEl) sEl.textContent = verdict;
      oVerdict.className = 'calc-verdict ' + cls;
    }
  }

  [iPsi, iPh, iC].forEach(function (el) {
    if (el) el.addEventListener('input', calc);
  });
  calc();

  /* ============================================================
     7. 自测题
     ============================================================ */
  var QUESTIONS = [
    {
      q: '化学渗透学说中，驱动 ATP 合成的直接能源是什么？',
      opts: ['电子传递释放的自由能', '跨膜质子电化学梯度（Δp）', '高能中间物 A~B', '底物分子中的高能磷酸键'],
      a: 1,
      ex: '电子传递只是「泵质子」的功源，真正推动 ATP 合酶的是已经建立起来的 Δp。这正是米切尔学说的核心：能量以物理形式（梯度）中转。'
    },
    {
      q: '一对电子沿 NADH 呼吸链传递到 O₂，共泵出多少个 H⁺？',
      opts: ['4 个', '6 个', '10 个', '12 个'],
      a: 2,
      ex: '复合体 I 泵 4 个、III 泵 4 个、IV 泵 2 个，合计 10 个。若从琥珀酸（FADH₂）进入，绕过复合体 I，只有 4 + 2 = 6 个。'
    },
    {
      q: '25 ℃ 下，若 Δψ = 150 mV、ΔpH = 1.0（内碱外酸），Δp 约为多少？',
      opts: ['150 mV', '209 mV', '91 mV', '59 mV'],
      a: 1,
      ex: 'Δp = Δψ + 59·ΔpH = 150 + 59 × 1.0 = 209 mV。系数 59 mV 由 2.303RT/F 在 25 ℃ 下算得。'
    },
    {
      q: '加入 2,4-二硝基苯酚（DNP）后，最典型的变化是？',
      opts: ['ATP 合成下降，耗氧量也下降', 'ATP 合成下降，耗氧量上升', 'ATP 合成上升，耗氧量上升', 'ATP 合成与耗氧量都不变'],
      a: 1,
      ex: 'DNP 是解偶联剂：它给质子开了旁路，梯度塌陷 → ATP 停；同时失去反压，电子传递链反而全速运转 → 耗氧上升、产热增加。这是「解偶联」与「抑制剂」最关键的区别。'
    },
    {
      q: '寡霉素抑制氧化磷酸化，它的作用部位是？',
      opts: ['复合体 I', '复合体 III', 'ATP 合酶的 F₀', '腺苷酸转运体'],
      a: 2,
      ex: '寡霉素结合在 F₀ 的 c 环，堵死质子通道。结果是质子无法回流、梯度越堆越高，最终把电子传递链「憋停」，耗氧量下降。'
    },
    {
      q: 'ATP 合酶 F₁ 部位三个 β 亚基的构象变化顺序是？',
      opts: ['O → T → L', 'L → T → O', 'T → L → O', 'L → O → T'],
      a: 1,
      ex: '结合改变机制（Boyer, 1997 诺奖）：L（松散）结合 ADP + Pi → T（紧密）催化生成 ATP → O（开放）释放 ATP。三个位点相差 120°，协同轮转。'
    },
    {
      q: 'c 环有 8 个亚基时，理论上合成 1 个 ATP 最少需要几个 H⁺？',
      opts: ['2.67 个', '3 个', '8 个', '4 个'],
      a: 0,
      ex: '转一圈通过 8 个 H⁺，产出 3 个 ATP，所以 8 ÷ 3 ≈ 2.67。注意这是「理论值」；若计入 Pi 同向转运消耗的 1 个 H⁺，实际约 3.67。'
    },
    {
      q: '关于细菌的氧化磷酸化，下列说法正确的是？',
      opts: ['在细胞质中进行，质子泵入细胞质', '在细胞膜上进行，质子泵出细胞外', '在细胞膜上进行，质子泵入细胞质', '细菌没有氧化磷酸化'],
      a: 1,
      ex: '细菌没有线粒体，呼吸链在质膜上，质子被泵到胞外（或周质空间），形成 P 侧在外、N 侧在内的梯度。F₁ 朝向细胞质，ATP 在细胞质中生成。'
    },
    {
      q: '按现行 P/O = 2.5 / 1.5 口径，1 分子葡萄糖彻底氧化净生成多少 ATP？',
      opts: ['36 或 38', '30 或 32', '24 或 26', '38 或 40'],
      a: 1,
      ex: '10 NADH × 2.5 + 2 FADH₂ × 1.5 + 4 底物水平 = 25 + 3 + 4 = 32。若胞质 2 个 NADH 走甘油磷酸穿梭变成 FADH₂，则少 2 个，得 30。老教材按 3/2 折算才得 36~38。'
    },
    {
      q: '细菌视紫红质能证明化学渗透学说，最关键的原因是？',
      opts: ['它能水解 ATP', '它只泵质子、完全不传递电子', '它是一种色素，能吸收光', '它本身就是 ATP 合酶'],
      a: 1,
      ex: '把细菌视紫红质（纯光驱动质子泵，无电子传递）与 F₀F₁ 一起重组进脂质体，光照即可合成 ATP。这就把「电子传递」这个变量彻底排除，只剩梯度。'
    },
    {
      q: '缬氨霉素加入线粒体后，主要影响哪一部分？',
      opts: ['ΔpH 分量', 'Δψ 分量', '质子泵本身', 'ATP 合酶的催化位点'],
      a: 1,
      ex: '缬氨霉素是 K⁺ 载体，把 K⁺ 运进基质，正电荷进入抵消了外正内负的电位差，因此主要削掉 Δψ。它属于「部分解偶联」，效果比 DNP 温和。'
    },
    {
      q: '关于「化学偶联假说」与「化学渗透假说」，正确的比较是？',
      opts: ['前者认为存在高能中间物，后者认为能量以质子梯度形式存在', '两者都认为需要跨膜梯度', '前者已被完全否定，没有任何历史价值', '后者认为 ATP 由电子直接转移给 ADP 生成'],
      a: 0,
      ex: '化学偶联假说假设电子传递产生高能中间物 A~B，再由它直接磷酸化 ADP；但几十年未能分离出该中间物。化学渗透假说改用可测量的物理量（梯度）作中转，得到了大量实验支持。'
    }
  ];

  var quizRoot = $('quiz');
  var quizResult = $('quizResult');
  var qrScore = $('qrScore');
  var qrTitle = $('qrTitle');
  var qrMsg = $('qrMsg');
  var quizReset = $('quizReset');
  var answered = [];
  var correctCount = 0;

  function renderQuiz() {
    if (!quizRoot) return;
    answered = new Array(QUESTIONS.length).fill(false);
    correctCount = 0;
    quizRoot.innerHTML = '';

    QUESTIONS.forEach(function (item, qi) {
      var card = document.createElement('article');
      card.className = 'q';
      card.dataset.qi = qi;

      var head = document.createElement('div');
      head.className = 'q-head';
      head.innerHTML = '<span class="q-num">' + (qi + 1) + '</span>';
      var h = document.createElement('h3');
      h.className = 'q-title';
      h.textContent = item.q;
      head.appendChild(h);
      card.appendChild(head);

      var opts = document.createElement('div');
      opts.className = 'q-opts';
      item.opts.forEach(function (text, oi) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'opt';
        btn.dataset.oi = oi;
        btn.innerHTML = '<span class="opt-k">' + 'ABCD'[oi] + '</span><span class="opt-t"></span>';
        btn.querySelector('.opt-t').textContent = text;
        btn.addEventListener('click', function () { answer(qi, oi, card); });
        opts.appendChild(btn);
      });
      card.appendChild(opts);

      var ex = document.createElement('div');
      ex.className = 'q-expl';
      ex.innerHTML = '<b>解析</b><span></span>';
      ex.querySelector('span').textContent = item.ex;
      card.appendChild(ex);

      quizRoot.appendChild(card);
    });

    if (quizResult) quizResult.hidden = true;
  }

  function answer(qi, oi, card) {
    if (answered[qi]) return;
    answered[qi] = true;
    var item = QUESTIONS[qi];
    var correct = oi === item.a;

    Array.prototype.forEach.call(card.querySelectorAll('.opt'), function (btn) {
      var idx = +btn.dataset.oi;
      btn.disabled = true;
      if (idx === item.a) btn.classList.add('correct');
      if (idx === oi && !correct) btn.classList.add('incorrect');
    });

    if (correct) correctCount++;
    card.classList.add(correct ? 'right' : 'wrong');
    card.querySelector('.q-expl').classList.add('show');

    if (answered.every(Boolean)) finishQuiz();
  }

  function finishQuiz() {
    if (!quizResult) return;
    quizResult.hidden = false;
    var total = QUESTIONS.length;
    if (qrScore) qrScore.textContent = correctCount;

    var title, msg;
    var pct = correctCount / total;
    if (pct === 1) {
      title = '全对，这块可以放下了';
      msg = '质子梯度、Δp 公式、抑制剂与解偶联剂的区别都清楚了。考前只看一眼本页的抑制剂表就够。';
    } else if (pct >= 0.75) {
      title = '基本掌握，补两个细节';
      msg = '把错题对应的段落再翻一遍，特别是「DNP 与抑制剂在耗氧上的差别」和「P/O 比的换算口径」。';
    } else if (pct >= 0.5) {
      title = '骨架有了，还需要过一遍公式';
      msg = '建议回到 03 和 05 两节：先弄懂 c 环齿数与 H⁺/ATP 的关系，再自己手算一次 Δp。';
    } else {
      title = '建议从实验台重新走一遍';
      msg = '别急着背结论。回到 01 节把 DNP 和寡霉素各拉一次，亲眼看到梯度和耗氧的变化，比背十遍有效。';
    }
    if (qrTitle) qrTitle.textContent = title;
    if (qrMsg) qrMsg.textContent = msg;

    var ring = quizResult.querySelector('.qr-ring');
    if (ring) {
      ring.style.setProperty('--pct', (pct * 360).toFixed(0) + 'deg');
    }
    quizResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (quizReset) {
    quizReset.addEventListener('click', function () {
      renderQuiz();
      if (quizRoot) quizRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  renderQuiz();

  /* ============================================================
     8. 滑块填充色（--pct）
     ============================================================ */
  function syncRangePct(el) {
    var min = +el.min || 0, max = +el.max || 100, v = +el.value;
    var pct = max > min ? (v - min) / (max - min) * 100 : 0;
    el.style.setProperty('--pct', pct.toFixed(1) + '%');
  }
  $$('input[type="range"]').forEach(function (el) {
    syncRangePct(el);
    el.addEventListener('input', function () { syncRangePct(el); });
  });

  /* ============================================================
     9. 快捷键：空格暂停
     ============================================================ */
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (pauseBtn) pauseBtn.click();
    }
  });

  /* ============================================================
     10. 首次访问提示
     ============================================================ */
  (function firstVisitHint() {
    var key = 'chemiosmosis-visited';
    var seen = false;
    try { seen = !!localStorage.getItem(key); } catch (e) { }
    if (!seen) {
      try { localStorage.setItem(key, '1'); } catch (e) { }
      setTimeout(function () {
        showToast('试试把「解偶联剂 DNP」拉到 100%，看梯度怎么塌掉');
      }, 1800);
    }
  })();
})();
