/* ============================================================
   vesicle.js —— Racker 脂质体实验
   #vesCanvas 1100 x 470
   细菌视紫红质（光驱动质子泵）+ ATP 合酶，只靠光就造出 ATP
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('vesCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = +canvas.dataset.w || 1100;
  var H = +canvas.dataset.h || 470;
  var TAU = Math.PI * 2;

  /* ---------------- 几何 ---------------- */
  var VES = { cx: 430, cy: 250, r: 168 };
  var BR_X = VES.cx - 92;        // 细菌视紫红质位置
  var AT_X = VES.cx + 96;        // ATP 合酶位置
  var OUT_PH = 7.00;

  /* ---------------- 状态 ---------------- */
  var S = {
    light: false,
    dnp: false,
    inPH: 7.0,        // 内部 pH，光泵使其上升（变碱）
    atpTotal: 0,
    atpAngle: 0
  };

  var PH_MIN = 7.0, PH_MAX = 8.6;   // 内部 pH 上限（ΔpH 最大 1.6）
  var protons = [];                  // 内部漂浮质子（视觉）
  var photons = [];                  // 光子
  var atps = [];
  var rotor = 0;

  /* ---------------- 工具 ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------------- 配色 ---------------- */
  var C;
  function palette() {
    var light = document.documentElement.dataset.theme === 'light';
    C = light ? {
      ink: '#12233d', dim: '#4b6382', mute: '#8399b4',
      proton: '#d97706', atp: '#16a34a', light: '#eab308', heat: '#dc2626',
      ves: 'rgba(24,60,110,0.055)', vesEdge: 'rgba(18,35,61,0.28)',
      prot: '#b48a5c', atpase: '#5b7fb8',
      bg1: '#ffffff', bg2: '#f3f8fe'
    } : {
      ink: '#e8eef8', dim: '#9fb0c9', mute: '#6c7f99',
      proton: '#ff9f45', atp: '#4ade80', light: '#ffe066', heat: '#f8636b',
      ves: 'rgba(120,200,255,0.045)', vesEdge: 'rgba(160,200,255,0.34)',
      prot: '#c9925e', atpase: '#7aa0d8',
      bg1: '#0b1424', bg2: '#060a13'
    };
  }

  /* ---------------- 背景 ---------------- */
  var bgCanvas = null, dpr = 1;

  function buildBG() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = W * dpr; bgCanvas.height = H * dpr;
    var c = bgCanvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2);
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // 外部溶液
    c.fillStyle = document.documentElement.dataset.theme === 'light'
      ? 'rgba(18,35,61,0.02)' : 'rgba(120,180,255,0.025)';
    c.fillRect(0, 0, W, H);

    // 脂质体：双层脂膜圆环
    c.beginPath();
    c.arc(VES.cx, VES.cy, VES.r, 0, TAU);
    c.fillStyle = C.ves; c.fill();

    // 头基圈（内外两层）
    for (var ring = 0; ring < 2; ring++) {
      var rr2 = VES.r - ring * 15;
      var count = Math.floor(TAU * rr2 / 12);
      for (var i = 0; i < count; i++) {
        var a = i / count * TAU;
        var x = VES.cx + Math.cos(a) * rr2;
        var y = VES.cy + Math.sin(a) * rr2;
        c.beginPath(); c.arc(x, y, 3.4, 0, TAU);
        c.fillStyle = document.documentElement.dataset.theme === 'light'
          ? 'rgba(18,35,61,0.22)' : 'rgba(160,200,255,0.24)';
        c.fill();
      }
    }
    c.strokeStyle = C.vesEdge; c.lineWidth = 1.4;
    c.beginPath(); c.arc(VES.cx, VES.cy, VES.r, 0, TAU); c.stroke();
    c.beginPath(); c.arc(VES.cx, VES.cy, VES.r - 15, 0, TAU); c.stroke();

    // 细菌视紫红质（七次跨膜束）
    c.save();
    c.translate(BR_X, VES.cy);
    c.rotate(-0.10);
    for (var k = 0; k < 7; k++) {
      var ox = (k - 3) * 5.6;
      var hgt = 46 + (k % 2 ? 6 : -4);
      c.beginPath();
      c.roundRect ? c.roundRect(ox - 2.6, -hgt, 5.2, hgt * 2, 2.4)
        : c.rect(ox - 2.6, -hgt, 5.2, hgt * 2);
      c.fillStyle = C.prot;
      c.globalAlpha = 0.55 + (k % 3) * 0.14;
      c.fill();
    }
    c.globalAlpha = 1;
    // 视黄醛
    var rg = c.createRadialGradient(2, -14, 1, 2, -14, 10);
    rg.addColorStop(0, 'rgba(255,90,140,0.95)');
    rg.addColorStop(1, 'rgba(255,90,140,0)');
    c.fillStyle = rg;
    c.beginPath(); c.arc(2, -14, 10, 0, TAU); c.fill();
    c.restore();

    // ATP 合酶（F0 埋膜 + F1 球头朝内）
    c.save();
    c.translate(AT_X, VES.cy);
    c.rotate(0.10);
    // F0
    c.beginPath();
    c.roundRect ? c.roundRect(-11, -42, 22, 84, 8) : c.rect(-11, -42, 22, 84);
    c.fillStyle = C.atpase; c.globalAlpha = 0.7; c.fill();
    c.globalAlpha = 1;
    // 柄
    c.fillStyle = C.dim;
    c.fillRect(-3.5, -58, 7, 20);
    // F1 球
    var bg2 = c.createRadialGradient(-8, -76, 4, 0, -68, 30);
    bg2.addColorStop(0, document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#24405f');
    bg2.addColorStop(1, document.documentElement.dataset.theme === 'light' ? '#dce8f8' : '#132239');
    c.beginPath(); c.arc(0, -68, 26, 0, TAU);
    c.fillStyle = bg2; c.fill();
    c.strokeStyle = C.vesEdge; c.lineWidth = 1.3; c.stroke();
    c.restore();

    // 标注
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = C.ink;
    c.font = '700 13px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText('脂质体（人造磷脂囊泡）', 40, 40);
    c.fillStyle = C.mute;
    c.font = '11.5px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText('内部无电子传递链、无任何酶系，只装了两台膜蛋白', 40, 60);

    c.fillStyle = C.mute;
    c.font = '11.5px "PingFang SC",sans-serif';
    c.fillText('外部缓冲液 pH 7.00', 40, 448);

    // 细菌视紫红质标注
    c.fillStyle = C.prot;
    c.font = '600 11.5px "PingFang SC",sans-serif';
    c.textAlign = 'center';
    c.fillText('细菌视紫红质', BR_X, VES.cy + VES.r - 24);
    c.fillStyle = C.atpase;
    c.fillText('ATP 合酶 F₀F₁', AT_X, VES.cy + VES.r - 24);
    c.textAlign = 'left';
  }

  /* ---------------- 物理 ---------------- */
  function step(dt) {
    // 目标 pH：开灯且不解偶联 → 趋向 PH_MAX；否则回落
    var pumpOn = S.light && !S.dnp;
    var target = pumpOn ? PH_MAX - clamp(S.atpTotal * 0.004, 0, 0.35) : OUT_PH;

    if (pumpOn) {
      S.inPH += (PH_MAX - S.inPH) * Math.min(1, dt * 0.30);
    } else {
      S.inPH += (OUT_PH - S.inPH) * Math.min(1, dt * (S.dnp ? 1.9 : 0.55));
    }

    var dph = S.inPH - OUT_PH;
    // 质子回流 → 合成 ATP
    if (dph > 0.06) {
      var rate = dph * 2.4;
      S.atpAngle += rate * dt;
      rotor += rate * dt * 0.6;
      while (S.atpAngle >= 1) {
        S.atpAngle -= 1;
        S.atpTotal++;
        atps.push({
          x: AT_X + rnd(-8, 8), y: VES.cy - 74,
          vx: rnd(-16, 16), vy: rnd(-26, -12),
          life: 0, max: 1.9
        });
      }
      // 视觉质子回流
      if (Math.random() < dt * dph * 2.2) {
        protons.push({
          st: 'out', x: AT_X + rnd(-10, 10), y: VES.cy - 40,
          t: 0, dur: rnd(0.5, 0.9)
        });
      }
    }

    // 光子下落
    if (S.light && Math.random() < dt * 6) {
      photons.push({
        x: rnd(120, 420), y: -10,
        vx: rnd(-4, 4), vy: rnd(190, 270), life: 0
      });
    }
    for (var i = photons.length - 1; i >= 0; i--) {
      var ph = photons[i];
      ph.x += ph.vx * dt; ph.y += ph.vy * dt; ph.life += dt;
      if (ph.y > H || ph.life > 3) photons.splice(i, 1);
    }

    // 内部质子视觉
    if (pumpOn && Math.random() < dt * 3.2) {
      protons.push({
        st: 'in', x: BR_X + rnd(-10, 10), y: VES.cy + rnd(-14, 14),
        t: 0, dur: rnd(0.5, 0.9),
        tx: rnd(VES.cx - 90, VES.cx + 70), ty: rnd(VES.cy - 80, VES.cy + 90)
      });
    }
    for (var j = protons.length - 1; j >= 0; j--) {
      var p = protons[j];
      p.t += dt / p.dur;
      if (p.t >= 1) { protons.splice(j, 1); continue; }
      var e = p.t * p.t * (3 - 2 * p.t);
      if (p.st === 'in') {
        p.x = (p.sx === undefined ? (p.sx = p.x) : p.sx) + (p.tx - p.sx) * e;
        p.y = (p.sy === undefined ? (p.sy = p.y) : p.sy) + (p.ty - p.sy) * e;
      } else {
        p.y += 40 * dt;
        p.x += (AT_X - p.x) * dt * 2;
      }
    }

    // ATP 粒子
    for (var m = atps.length - 1; m >= 0; m--) {
      var a = atps[m];
      a.life += dt;
      if (a.life > a.max) { atps.splice(m, 1); continue; }
      a.x += a.vx * dt; a.y += a.vy * dt;
    }
  }

  /* ---------------- 绘制 ---------------- */
  var time = 0;

  function draw(dt) {
    time += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);

    drawLightBeam();
    drawPhotons();
    drawInnerGlow();
    drawProtons();
    drawRotor();
    drawATP();
    drawMeter();
    drawDnp();
  }

  function drawLightBeam() {
    if (!S.light) return;
    var g = ctx.createLinearGradient(140, 0, 300, VES.cy + VES.r);
    var a = document.documentElement.dataset.theme === 'light' ? 0.10 : 0.14;
    g.addColorStop(0, 'rgba(255,224,102,' + a + ')');
    g.addColorStop(1, 'rgba(255,224,102,0)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(150, 0); ctx.lineTo(330, 0);
    ctx.lineTo(BR_X + 60, VES.cy + 90); ctx.lineTo(BR_X - 40, VES.cy + 90);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  function drawPhotons() {
    ctx.save();
    for (var i = 0; i < photons.length; i++) {
      var p = photons[i];
      ctx.globalAlpha = clamp(1 - p.life / 2.4, 0, 1);
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
      g.addColorStop(0, 'rgba(255,235,130,0.95)');
      g.addColorStop(1, 'rgba(255,235,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = C.light;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawInnerGlow() {
    var dph = S.inPH - OUT_PH;
    if (dph < 0.02) return;
    var a = clamp(dph / 1.6, 0, 1) * 0.16;
    ctx.save();
    ctx.beginPath();
    ctx.arc(VES.cx, VES.cy, VES.r - 12, 0, TAU);
    ctx.clip();
    var g = ctx.createRadialGradient(VES.cx, VES.cy, 10, VES.cx, VES.cy, VES.r);
    g.addColorStop(0, 'rgba(90,140,255,' + a + ')');
    g.addColorStop(1, 'rgba(90,140,255,' + (a * 0.3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(VES.cx - VES.r, VES.cy - VES.r, VES.r * 2, VES.r * 2);
    ctx.restore();
  }

  function drawProtons() {
    ctx.save();
    for (var i = 0; i < protons.length; i++) {
      var p = protons[i];
      ctx.globalAlpha = clamp(1 - p.t * 0.6, 0, 1) * 0.9;
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
      g.addColorStop(0, 'rgba(255,159,69,0.8)');
      g.addColorStop(1, 'rgba(255,159,69,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = C.proton;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '700 8px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', p.x, p.y + 0.4);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  function drawRotor() {
    // F1 球位置绘制旋转的 β 亚基小点
    ctx.save();
    var cx = AT_X, cy = VES.cy - 68, r = 26;
    for (var k = 0; k < 6; k++) {
      var a = k * TAU / 6 + rotor;
      var x = cx + Math.cos(a) * (r - 9);
      var y = cy + Math.sin(a) * (r - 9) * 0.9;
      ctx.beginPath(); ctx.arc(x, y, 4.4, 0, TAU);
      ctx.fillStyle = (k % 2 === 0) ? 'rgba(122,160,216,0.9)' : 'rgba(122,160,216,0.4)';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawATP() {
    ctx.save();
    for (var i = 0; i < atps.length; i++) {
      var a = atps[i];
      var t = a.life / a.max;
      ctx.globalAlpha = 1 - t * t;
      ctx.beginPath(); ctx.arc(a.x, a.y, 9, 0, TAU);
      ctx.fillStyle = 'rgba(74,222,128,0.18)'; ctx.fill();
      ctx.strokeStyle = C.atp; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = C.atp;
      ctx.font = '700 7px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('ATP', a.x, a.y + 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawMeter() {
    // 右侧 pH 刻度尺
    var x = 852, y0 = 96, y1 = 400, hgt = y1 - y0;
    var dph = S.inPH - OUT_PH;

    ctx.save();
    // 刻度
    ctx.strokeStyle = C.vesEdge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.fillStyle = C.mute;
    ctx.font = '10.5px "SFMono-Regular",Consolas,monospace';
    ctx.textAlign = 'right';
    var lo = 6.8, hi = 8.8;
    for (var p = lo; p <= hi + 0.001; p += 0.2) {
      var yy = y1 - (p - lo) / (hi - lo) * hgt;
      ctx.beginPath(); ctx.moveTo(x - 5, yy); ctx.lineTo(x, yy); ctx.stroke();
      ctx.fillText(p.toFixed(1), x - 9, yy + 3.5);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = C.dim;
    ctx.font = '11.5px "PingFang SC",sans-serif';
    ctx.fillText('内部 pH', x - 4, y0 - 20);

    // 内部当前指针
    var py = y1 - (S.inPH - lo) / (hi - lo) * hgt;
    ctx.beginPath(); ctx.arc(x, py, 5.4, 0, TAU);
    ctx.fillStyle = C.proton; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = C.proton;
    ctx.font = '700 12px "SFMono-Regular",Consolas,monospace';
    ctx.fillText(S.inPH.toFixed(2), x + 12, py + 4);

    // 外部固定线
    var oy = y1 - (OUT_PH - lo) / (hi - lo) * hgt;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = C.dim; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - 46, oy); ctx.lineTo(x + 74, oy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.mute;
    ctx.font = '10.5px "PingFang SC",sans-serif';
    ctx.fillText('外部 7.00', x + 16, oy - 7);

    // ΔpH 大字
    ctx.fillStyle = C.ink;
    ctx.font = '700 22px "SFMono-Regular",Consolas,monospace';
    ctx.fillText('ΔpH', x - 46, y1 + 44);
    ctx.fillStyle = dph > 0.05 ? C.proton : C.mute;
    ctx.font = '700 26px "SFMono-Regular",Consolas,monospace';
    ctx.fillText(dph.toFixed(2), x + 12, y1 + 46);

    var dpsi = dph * 59;
    ctx.fillStyle = C.dim;
    ctx.font = '11.5px "PingFang SC",sans-serif';
    ctx.fillText('≈ ' + dpsi.toFixed(0) + ' mV（仅 ΔpH 一项）', x - 46, y1 + 70);
    ctx.restore();
  }

  function drawDnp() {
    if (!S.dnp) return;
    ctx.save();
    ctx.fillStyle = 'rgba(248,99,107,0.10)';
    ctx.beginPath(); ctx.arc(VES.cx, VES.cy, VES.r + 12, 0, TAU); ctx.fill();

    // 画几个"短路"通道
    for (var k = 0; k < 8; k++) {
      var a = -2.2 + k * 0.55;
      var x1 = VES.cx + Math.cos(a) * (VES.r - 18);
      var y1 = VES.cy + Math.sin(a) * (VES.r - 18);
      var x2 = VES.cx + Math.cos(a) * (VES.r + 14);
      var y2 = VES.cy + Math.sin(a) * (VES.r + 14);
      ctx.strokeStyle = C.heat; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.fillStyle = C.heat;
    ctx.font = '600 12px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DNP 带 H⁺ 穿膜 → 梯度被短路', VES.cx, VES.cy + VES.r + 52);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  /* ---------------- 读数 ---------------- */
  var elPh = document.getElementById('vesPh');
  var elDph = document.getElementById('vesDph');
  var elAtp = document.getElementById('vesAtp');
  var elMsg = document.getElementById('vesMsg');

  function paint() {
    var dph = S.inPH - OUT_PH;
    if (elPh) elPh.textContent = S.inPH.toFixed(2);
    if (elDph) elDph.textContent = dph.toFixed(2);
    if (elAtp) elAtp.textContent = S.atpTotal;
    if (elMsg) {
      elMsg.textContent = S.dnp ? 'DNP 短路：梯度塌陷，ATP 停止'
        : !S.light ? '等待开灯…'
        : dph < 0.1 ? '正在建立梯度…'
        : S.atpTotal > 0 ? '仅靠光能，正在合成 ATP'
        : '梯度已建立，等待回流';
    }
  }

  /* ---------------- 尺寸 ---------------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    palette();
    buildBG();
  }

  /* ---------------- 主循环 ---------------- */
  var last = 0, paintAcc = 0;

  function loop(ts) {
    if (!last) last = ts;
    var dt = clamp((ts - last) / 1000, 0, 0.05);
    last = ts;
    step(dt);
    draw(dt);
    paintAcc += dt;
    if (paintAcc > 0.15) { paintAcc = 0; paint(); }
    requestAnimationFrame(loop);
  }

  /* ---------------- 控件 ---------------- */
  var btnLight = document.getElementById('lightBtn');
  var chipDnp = document.getElementById('vesDnpChip');

  if (btnLight) {
    btnLight.addEventListener('click', function () {
      S.light = !S.light;
      btnLight.textContent = S.light ? '☾ 关灯' : '☀ 开灯 / 关灯';
      btnLight.classList.toggle('on', S.light);
    });
  }
  if (chipDnp) {
    chipDnp.addEventListener('click', function () {
      S.dnp = !S.dnp;
      chipDnp.classList.toggle('on', S.dnp);
      chipDnp.classList.toggle('danger', S.dnp);
    });
  }

  /* 与主实验台 DNP 联动 */
  document.addEventListener('etc:dnp', function (e) {
    S.dnp = (+e.detail || 0) > 0.5;
    if (chipDnp) {
      chipDnp.classList.toggle('on', S.dnp);
      chipDnp.classList.toggle('danger', S.dnp);
    }
  });

  /* ---------------- 启动 ---------------- */
  resize();
  window.addEventListener('resize', function () {
    clearTimeout(resize._t);
    resize._t = setTimeout(resize, 200);
  });
  document.addEventListener('themechange', function () { palette(); buildBG(); });

  paint();
  requestAnimationFrame(loop);

  window.VESICLE = {
    state: S,
    setLight: function (v) {
      S.light = !!v;
      if (btnLight) {
        btnLight.textContent = S.light ? '☾ 关灯' : '☀ 开灯 / 关灯';
        btnLight.classList.toggle('on', S.light);
      }
    },
    reset: function () { S.inPH = 7.0; S.atpTotal = 0; S.atpAngle = 0; protons.length = 0; atps.length = 0; }
  };
})();
