/* ============================================================
   etc-sim.js —— 电子传递链 / 质子泵 / ATP 合酶 耦合仿真
   左侧：复合体 I~IV + Q + cyt c     右侧：ATP 合酶（F0F1）
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('etcCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = +canvas.dataset.w || 1180;
  var H = +canvas.dataset.h || 660;
  var TAU = Math.PI * 2;

  /* ---------------- 布局常量 ---------------- */
  var MEM = { top: 258, bottom: 402, left: 36, right: 1144 };
  var CX = {
    I:   { x: 96,  y: 214, w: 92, h: 232, name: '复合体 I',   pump: 4 },
    II:  { x: 214, y: 256, w: 74, h: 168, name: '复合体 II',  pump: 0 },
    III: { x: 392, y: 210, w: 96, h: 240, name: '复合体 III', pump: 4 },
    IV:  { x: 536, y: 214, w: 96, h: 232, name: '复合体 IV',  pump: 2 }
  };
  var ATP_X = 782, ATP_W = 96, F1 = { cx: 830, cy: 502, rx: 80, ry: 46 };
  var C_RING = 8;

  /* ---------------- 状态 ---------------- */
  var state = {
    substrate: 'NADH',
    model: 'mito',
    speed: 1,
    paused: false,
    tour: -1,
    dnp: 0,
    inh: { rotenone: false, antimycin: false, cyanide: false, oligomycin: false }
  };

  var phys = {
    H: 0, capacity: 100, dp: 0,
    flux: 0, fluxTarget: 0,
    atpRate: 0, atpTotal: 0,
    pumped: 0, returned: 0, leaked: 0,
    pumpRate: 0, synRate: 0, leakRate: 0,
    rotor: 0, atpAngle: 0,
    fluxSmooth: 0
  };

  var PAIR_SECONDS = 1.5;     // 一对电子走完全链所需时间（flux=1）
  var K_LEAK_BASE = 0.03;
  var K_SYN = 5.6;
  var DP_MAX_MV = 250;

  var protons = [];   // 质子粒子
  var electrons = []; // 电子令牌
  var atps = [];      // ATP 粒子

  /* ---------------- 工具 ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ---------------- 配色 ---------------- */
  var P;
  function palette() {
    var light = document.documentElement.dataset.theme === 'light';
    P = light ? {
      ink: '#12233d', dim: '#4b6382', mute: '#8399b4',
      proton: '#d97706', electron: '#0891b2', atp: '#16a34a', heat: '#dc2626',
      mem: 'rgba(18,35,61,0.045)', head: 'rgba(18,35,61,0.26)',
      cpx: '#dfe9f7', cpxEdge: 'rgba(18,35,61,0.18)', cpxInk: '#12233d',
      fps: '#ffffff', glow: 0.35
    } : {
      ink: '#e8eef8', dim: '#9fb0c9', mute: '#6c7f99',
      proton: '#ff9f45', electron: '#38d3e8', atp: '#4ade80', heat: '#f8636b',
      mem: 'rgba(255,255,255,0.045)', head: 'rgba(255,255,255,0.22)',
      cpx: '#16233a', cpxEdge: 'rgba(255,255,255,0.16)', cpxInk: '#dbe7f7',
      fps: '#121d31', glow: 0.75
    };
  }

  /* ---------------- 电子路径 ---------------- */
  function buildPath(sub) {
    var pts = [];
    if (sub === 'NADH') {
      pts.push({ x: 62, y: 452 }, { x: 142, y: 434 });
      pts.push({ x: 142, y: 236, pump: 4 });
      pts.push({ x: 200, y: 392 }, { x: 330, y: 398 });
      pts.push({ x: 440, y: 398 }, { x: 440, y: 236, pump: 4 });
      pts.push({ x: 512, y: 222 });
      pts.push({ x: 584, y: 398 }, { x: 584, y: 236, pump: 2 });
      pts.push({ x: 668, y: 300 });
    } else {
      pts.push({ x: 251, y: 452 }, { x: 251, y: 400 });
      pts.push({ x: 330, y: 398 });
      pts.push({ x: 440, y: 398 }, { x: 440, y: 236, pump: 4 });
      pts.push({ x: 512, y: 222 });
      pts.push({ x: 584, y: 398 }, { x: 584, y: 236, pump: 2 });
      pts.push({ x: 668, y: 300 });
    }
    return pts;
  }

  var path = [], pathLen = 0, segLen = [], segAcc = [];
  function rebuildPath() {
    path = buildPath(state.substrate);
    segLen = []; pathLen = 0;
    for (var i = 1; i < path.length; i++) {
      var d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      segLen.push(d); pathLen += d;
    }
    segAcc = []; var acc = 0;
    for (var j = 0; j < segLen.length; j++) { segAcc.push(acc); acc += segLen[j]; }
  }
  rebuildPath();

  /* ---------------- 粒子 ---------------- */
  function spawnProtonBurst(x, n, strength) {
    for (var i = 0; i < n; i++) {
      if (protons.length > 260) break;
      protons.push({
        st: 'up',
        x: x + rnd(-26, 26),
        y: MEM.bottom - rnd(2, 16),
        y0: MEM.bottom, y1: MEM.top - rnd(26, 70),
        t: 0, dur: rnd(0.62, 0.86),
        vx: 0, vy: 0, r: 4.2, a: 1, syn: false
      });
      phys.pumped++;
    }
  }

  function freeProton(p) {
    p.st = 'free';
    p.vx = rnd(-14, 14); p.vy = rnd(-10, 2);
  }

  function spawnATP() {
    if (atps.length > 40) atps.shift();
    atps.push({ x: F1.cx + rnd(-46, 46), y: F1.cy + rnd(18, 34), vx: rnd(6, 34), vy: rnd(8, 22), life: 0, max: 1.5 });
    phys.atpTotal++;
  }

  function reset() {
    protons.length = 0; electrons.length = 0; atps.length = 0;
    phys.H = 0; phys.dp = 0; phys.flux = 0; phys.atpRate = 0; phys.atpTotal = 0;
    phys.pumped = 0; phys.returned = 0; phys.leaked = 0;
    phys.rotor = 0; phys.atpAngle = 0; phys.fluxSmooth = 0;
    rebuildPath();
  }

  /* ---------------- 阻断判断 ---------------- */
  function isBlocked() {
    if (state.inh.antimycin || state.inh.cyanide) return true;
    if (state.inh.rotenone && state.substrate === 'NADH') return true;
    return false;
  }
  function pumpsPerPair() { return state.substrate === 'NADH' ? 10 : 6; }

  /* ---------------- 物理步进 ---------------- */
  function step(dt) {
    var blocked = isBlocked();
    var base = blocked ? 0 : 1;

    // 反压：Δp 越高，电子传递越慢（呼吸控制）
    var bp = 1 - 0.35 * phys.dp * phys.dp - 0.55 * clamp((phys.dp - 0.85) / 0.15, 0, 1);
    phys.fluxTarget = base * Math.max(0.015, bp);
    phys.flux += (phys.fluxTarget - phys.flux) * Math.min(1, dt * 2.6);

    var pumpRate = phys.flux * pumpsPerPair() / PAIR_SECONDS;
    var leakK = K_LEAK_BASE + state.dnp * 2.2;
    var leak = phys.H * leakK;
    var syn = state.inh.oligomycin ? 0 : K_SYN * Math.max(0, phys.dp - 0.2);

    phys.H = clamp(phys.H + (pumpRate - leak - syn) * dt, 0, phys.capacity);
    phys.dp = phys.H / phys.capacity;

    phys.pumpRate = pumpRate;
    phys.leakRate = leak;
    phys.synRate = syn;
    phys.atpRate = syn / 4;            // 4 H+ 合成 1 个 ATP（含 Pi 转运）
    phys.leaked += leak * dt;
    phys.returned += syn * dt;

    // 转子旋转角 + ATP 释放
    phys.rotor += (syn / C_RING) * TAU * dt;
    phys.atpAngle += (syn / C_RING) * TAU * dt;
    while (phys.atpAngle >= TAU / 3) {
      phys.atpAngle -= TAU / 3;
      if (syn > 0.02) spawnATP();
    }

    phys.fluxSmooth += (phys.flux - phys.fluxSmooth) * Math.min(1, dt * 3);

    // 电子令牌
    if (phys.flux > 0.06) {
      if (electrons.length === 0 || electrons[electrons.length - 1].dist > pathLen * 0.62) {
        if (Math.random() < dt * 2.4 * phys.flux) {
          electrons.push({ dist: 0, seg: 0, done: false, fade: 1 });
        }
      }
    }
    var v = pathLen / PAIR_SECONDS * phys.flux;
    for (var i = electrons.length - 1; i >= 0; i--) {
      var e = electrons[i];
      var prev = e.dist;
      e.dist += v * dt;
      // 触发泵质子（跨过泵点）
      for (var k = 1; k < path.length; k++) {
        if (!path[k].pump) continue;
        var at = segAcc[k - 1] + 1;
        if (prev < at && e.dist >= at) {
          spawnProtonBurst(path[k].x, path[k].pump, phys.flux);
        }
      }
      if (e.dist >= pathLen) { e.done = true; e.fade -= dt * 3; }
      if (e.done && e.fade <= 0) electrons.splice(i, 1);
      if (e.dist > pathLen * 1.2) electrons.splice(i, 1);
    }

    // 质子：上升 / 自由漂浮 / 进入合酶 / 通道下行
    var wantSyn = syn;
    for (var j = protons.length - 1; j >= 0; j--) {
      var p = protons[j];
      if (p.st === 'up') {
        p.t += dt / p.dur;
        if (p.t >= 1) { p.t = 1; p.y = p.y1; freeProton(p); }
        else {
          var e2 = 1 - Math.pow(1 - p.t, 2.2);
          p.y = p.y0 + (p.y1 - p.y0) * e2;
          p.x += Math.sin(p.t * 9 + p.x) * 0.35;
        }
      } else if (p.st === 'free') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < 44 || p.x > MEM.right - 8) { p.vx *= -1; p.x = clamp(p.x, 44, MEM.right - 8); }
        if (p.y < 70) { p.y = 70; p.vy = Math.abs(p.vy) * 0.6; }
        if (p.y > MEM.top - 14) { p.y = MEM.top - 14; p.vy = -Math.abs(p.vy) * 0.5; }
        // 进入合酶
        if (wantSyn > 0 && Math.random() < dt * wantSyn * 0.55) {
          p.st = 'toSyn'; p.t = 0;
          p.sx = p.x; p.sy = p.y;
          p.tx = ATP_X + ATP_W / 2 + rnd(-22, 22);
          p.ty = MEM.top - 10;
          p.dur = rnd(0.35, 0.55);
        }
      } else if (p.st === 'toSyn') {
        p.t += dt / p.dur;
        if (p.t >= 1) { p.st = 'down'; p.t = 0; p.dur = 0.42; p.y0 = MEM.top; p.y1 = MEM.bottom + 8; }
        else {
          var q = p.t * p.t * (3 - 2 * p.t);
          p.x = p.sx + (p.tx - p.sx) * q;
          p.y = p.sy + (p.ty - p.sy) * q;
        }
      } else if (p.st === 'down') {
        p.t += dt / p.dur;
        p.x += (ATP_X + ATP_W / 2 - p.x) * dt * 6;
        if (p.t >= 1) { protons.splice(j, 1); continue; }
        p.y = MEM.top + (MEM.bottom + 10 - MEM.top) * p.t;
      }
      if (p.st === 'free' && protons.length > 120 && j < protons.length - 120) protons.splice(j, 1);
    }

    // ATP 粒子
    for (var m = atps.length - 1; m >= 0; m--) {
      var a = atps[m];
      a.life += dt;
      if (a.life > a.max) { atps.splice(m, 1); continue; }
      a.x += a.vx * dt; a.y += a.vy * dt * 0.6;
    }
  }

  /* ---------------- 绘制：静态层 ---------------- */
  var staticCanvas = null, dpr = 1;

  function buildStatic() {
    staticCanvas = document.createElement('canvas');
    staticCanvas.width = W * dpr; staticCanvas.height = H * dpr;
    var c = staticCanvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P === undefined ? '#000' : (document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#0b1220'));
    g.addColorStop(0.5, document.documentElement.dataset.theme === 'light' ? '#f3f7fd' : '#0a101d');
    g.addColorStop(1, document.documentElement.dataset.theme === 'light' ? '#eef4fc' : '#070b14');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // 膜：脂双层
    c.fillStyle = P.mem;
    c.fillRect(MEM.left, MEM.top, MEM.right - MEM.left, MEM.bottom - MEM.top);

    var n = Math.floor((MEM.right - MEM.left - 10) / 15);
    for (var i = 0; i < n; i++) {
      var x = MEM.left + 10 + i * 15;
      // 上排
      c.beginPath(); c.arc(x, MEM.top + 11, 5, 0, TAU);
      c.fillStyle = P.head; c.fill();
      c.strokeStyle = P.head; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x - 1.6, MEM.top + 15); c.lineTo(x - 2.6, MEM.top + 42);
      c.moveTo(x + 1.6, MEM.top + 15); c.lineTo(x + 2.6, MEM.top + 42); c.stroke();
      // 下排
      c.beginPath(); c.arc(x, MEM.bottom - 11, 5, 0, TAU);
      c.fillStyle = P.head; c.fill();
      c.beginPath(); c.moveTo(x - 1.6, MEM.bottom - 15); c.lineTo(x - 2.6, MEM.bottom - 42);
      c.moveTo(x + 1.6, MEM.bottom - 15); c.lineTo(x + 2.6, MEM.bottom - 42); c.stroke();
    }

    // 膜边界
    c.strokeStyle = P.cpxEdge; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(MEM.left, MEM.top); c.lineTo(MEM.right, MEM.top);
    c.moveTo(MEM.left, MEM.bottom); c.lineTo(MEM.right, MEM.bottom);
    c.stroke();

    // 复合体
    ['I', 'II', 'III', 'IV'].forEach(function (k) {
      var b = CX[k];
      var gr = c.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      gr.addColorStop(0, P.cpx);
      gr.addColorStop(1, document.documentElement.dataset.theme === 'light' ? '#eaf1fb' : '#101a2c');
      rr(c, b.x, b.y, b.w, b.h, 13);
      c.fillStyle = gr; c.fill();
      c.strokeStyle = P.cpxEdge; c.lineWidth = 1.4; c.stroke();

      c.save();
      c.translate(b.x + b.w / 2, b.y + b.h / 2);
      c.fillStyle = P.cpxInk;
      c.font = '600 12.5px "PingFang SC","Microsoft YaHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      var nm = b.name.replace('复合体 ', '').trim();
      c.fillText('复合体', 0, -12);
      c.fillText(nm, 0, 6);
      c.restore();
    });

    // Q 池与 cyt c
    c.save();
    c.fillStyle = P.dim;
    c.font = '11.5px "PingFang SC","Microsoft YaHei",sans-serif';
    c.textAlign = 'center';
    c.fillText('Q', 330, 432);
    c.fillText('cyt c', 512, 200);
    c.restore();

    // 合酶 F0 底座
    var bx = ATP_X, bw = ATP_W;
    rr(c, bx, MEM.top, bw, MEM.bottom - MEM.top, 10);
    c.fillStyle = document.documentElement.dataset.theme === 'light' ? '#e6eefb' : '#101a2c';
    c.fill();
    c.strokeStyle = P.cpxEdge; c.lineWidth = 1.4; c.stroke();

    // 通道口
    c.fillStyle = 'rgba(255,159,69,0.12)';
    rr(c, bx + bw / 2 - 15, MEM.top + 6, 30, 18, 5); c.fill();
    rr(c, bx + bw / 2 - 15, MEM.bottom - 24, 30, 18, 5); c.fill();

    // 顶部标题
    c.textBaseline = 'alphabetic';
    c.font = '700 13px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = P.ink;
    c.fillText(state.model === 'mito' ? '膜间隙（P 侧）' : '胞外 / 周质空间（P 侧）', 46, 96);
    c.font = '11.5px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = P.mute;
    c.fillText('H⁺ 多 · pH 低 · 带正电', 46, 116);

    c.font = '700 13px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = P.ink;
    c.fillText(state.model === 'mito' ? '线粒体基质（N 侧）' : '细胞质（N 侧）', 46, 630);
    c.font = '11.5px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = P.mute;
    c.fillText('H⁺ 少 · pH 高 · 带负电', 46, 650);

    // 底物标签
    c.font = '600 12px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = P.electron;
    c.textAlign = 'center';
    if (state.substrate === 'NADH') c.fillText('NADH', 62, 640);
    else c.fillText('琥珀酸', 251, 640);

    // O2 标注
    c.textAlign = 'left';
    c.font = '11.5px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = P.dim;
    c.fillText('½O₂ + 2H⁺', 640, 292);
    c.fillText('+ 2e⁻ → H₂O', 640, 308);

    c.textAlign = 'left';
  }

  /* ---------------- 绘制：动态 ---------------- */
  var time = 0;

  function draw(dt) {
    time += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, W, H);

    drawMembraneGlow();
    drawProtons();
    drawElectrons();
    drawPumpingArrows();
    drawSynthase();
    drawATP();
    drawGauge();
    drawTour();
  }

  function drawMembraneGlow() {
    // 质子多了，膜间隙一侧泛橙光
    var a = phys.dp * 0.22;
    if (a < 0.005) return;
    var g = ctx.createLinearGradient(0, MEM.top - 120, 0, MEM.top);
    g.addColorStop(0, 'rgba(255,159,69,0)');
    g.addColorStop(1, 'rgba(255,159,69,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(MEM.left, MEM.top - 120, MEM.right - MEM.left, 120);
  }

  function drawPumpingArrows() {
    var rate = phys.flux;
    ['I', 'III', 'IV'].forEach(function (k) {
      var b = CX[k];
      var cx = b.x + b.w / 2;
      var act = rate > 0.05;
      ctx.save();
      ctx.globalAlpha = act ? 0.85 : 0.25;
      ctx.strokeStyle = P.proton;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      var y1 = MEM.bottom - 26, y2 = MEM.top + 26;
      ctx.beginPath();
      ctx.moveTo(cx - 8, y1); ctx.lineTo(cx - 8, y2);
      ctx.moveTo(cx + 8, y1); ctx.lineTo(cx + 8, y2);
      ctx.stroke();
      // 箭头
      ctx.fillStyle = P.proton;
      [-8, 8].forEach(function (off) {
        ctx.beginPath();
        ctx.moveTo(cx + off, y2 - 9); ctx.lineTo(cx + off - 4.5, y2 + 1); ctx.lineTo(cx + off + 4.5, y2 + 1);
        ctx.closePath(); ctx.fill();
      });
      // 标注
      ctx.font = '600 10.5px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = P.proton;
      ctx.fillText(b.pump + 'H⁺', cx, MEM.top - 8);
      ctx.restore();
    });
  }

  function drawElectrons() {
    for (var i = 0; i < electrons.length; i++) {
      var e = electrons[i];
      var pos = pointAt(e.dist);
      if (!pos) continue;
      ctx.save();
      ctx.globalAlpha = e.fade;
      var g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 13);
      g.addColorStop(0, 'rgba(56,211,232,0.95)');
      g.addColorStop(0.45, 'rgba(56,211,232,0.35)');
      g.addColorStop(1, 'rgba(56,211,232,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = P.electron;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 4.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function pointAt(d) {
    if (d < 0 || d > pathLen) return null;
    for (var i = 0; i < segLen.length; i++) {
      if (d <= segAcc[i] + segLen[i]) {
        var t = (d - segAcc[i]) / segLen[i];
        var a = path[i], b = path[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    var last = path[path.length - 1];
    return { x: last.x, y: last.y };
  }

  function drawProtons() {
    ctx.save();
    for (var i = 0; i < protons.length; i++) {
      var p = protons[i];
      var alpha = p.st === 'free' ? 0.92 : 1;
      // 光晕
      ctx.globalAlpha = alpha * 0.5;
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
      g.addColorStop(0, 'rgba(255,159,69,0.8)');
      g.addColorStop(1, 'rgba(255,159,69,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.fillStyle = P.proton;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.1, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = '700 8px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', p.x, p.y + 0.4);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  function drawSynthase() {
    var bx = ATP_X, bw = ATP_W, cx = bx + bw / 2;

    /* --- c 环（侧面看，滚筒状） --- */
    var phase = phys.rotor;
    var items = [];
    for (var i = 0; i < C_RING; i++) {
      var ang = i * TAU / C_RING - phase;
      items.push({ ang: ang, depth: Math.cos(ang) });
    }
    items.sort(function (a, b) { return a.depth - b.depth; });
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var x = cx + Math.sin(it.ang) * 34;
      var y = (MEM.top + MEM.bottom) / 2 + Math.cos(it.ang) * 60;
      var r = 8 + 1.6 * it.depth;
      var front = it.depth > 0;
      ctx.globalAlpha = front ? 1 : 0.35;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = front ? 'rgba(255,159,69,0.22)' : 'rgba(255,159,69,0.10)';
      ctx.fill();
      ctx.strokeStyle = P.proton; ctx.lineWidth = front ? 1.6 : 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* --- γ 轴 --- */
    var shaftTop = MEM.bottom;
    var shaftBot = F1.cy - 14;
    ctx.strokeStyle = P.dim; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, shaftTop); ctx.lineTo(cx, shaftBot); ctx.stroke();
    var wob = Math.sin(phys.rotor * 2) * 4;
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx + wob, shaftTop + 8); ctx.lineTo(cx + wob, shaftBot); ctx.stroke();

    /* --- F1 头部 --- */
    ctx.save();
    var g = ctx.createRadialGradient(F1.cx - 18, F1.cy - 18, 6, F1.cx, F1.cy, F1.rx);
    g.addColorStop(0, document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#1b2a44');
    g.addColorStop(1, document.documentElement.dataset.theme === 'light' ? '#e7eefb' : '#0f1a2c');
    ctx.beginPath();
    ctx.ellipse(F1.cx, F1.cy, F1.rx, F1.ry, 0, 0, TAU);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = P.cpxEdge; ctx.lineWidth = 1.4; ctx.stroke();

    // 六个亚基（α β 交替）
    for (var s = 0; s < 6; s++) {
      var a2 = s * TAU / 6 + phys.rotor * 0.5;
      var sx = F1.cx + Math.sin(a2) * 46;
      var sy = F1.cy + Math.cos(a2) * 24;
      var isBeta = s % 2 === 0;
      var topMost = Math.cos(a2) < -0.55;
      ctx.beginPath(); ctx.arc(sx, sy, 15, 0, TAU);
      if (isBeta && topMost && phys.synRate > 0.03) {
        ctx.fillStyle = 'rgba(74,222,128,0.30)';
        ctx.fill();
        ctx.strokeStyle = P.atp; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.fillStyle = isBeta ? 'rgba(120,170,255,0.16)' : 'rgba(150,170,200,0.10)';
        ctx.fill();
        ctx.strokeStyle = P.cpxEdge; ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.fillStyle = isBeta ? P.ink : P.mute;
      ctx.font = '600 11px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(isBeta ? 'β' : 'α', sx, sy);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';

    // F1 标签
    ctx.fillStyle = P.mute;
    ctx.font = '11px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('F₁（催化部）', F1.cx, F1.cy + F1.ry + 22);
    ctx.fillText('F₀（质子通道）', cx, MEM.top - 12);

    // 寡霉素标记
    if (state.inh.oligomycin) {
      ctx.save();
      ctx.strokeStyle = P.heat; ctx.lineWidth = 2.6;
      var ox = bx + bw + 6, oy = (MEM.top + MEM.bottom) / 2;
      ctx.beginPath(); ctx.moveTo(ox - 26, oy - 12); ctx.lineTo(ox + 2, oy + 12);
      ctx.moveTo(ox + 2, oy - 12); ctx.lineTo(ox - 26, oy + 12); ctx.stroke();
      ctx.fillStyle = P.heat;
      ctx.font = '600 10.5px "PingFang SC",sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('F₀ 被堵', ox + 6, oy + 4);
      ctx.restore();
    }
  }

  function drawATP() {
    for (var i = 0; i < atps.length; i++) {
      var a = atps[i];
      var t = a.life / a.max;
      ctx.globalAlpha = 1 - t * t;
      ctx.beginPath(); ctx.arc(a.x, a.y, 7, 0, TAU);
      ctx.fillStyle = 'rgba(74,222,128,0.22)';
      ctx.fill();
      ctx.strokeStyle = P.atp; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = P.atp;
      ctx.font = '700 8px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('ATP', a.x, a.y + 1);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawGauge() {
    var x = MEM.right - 34, y0 = 96, y1 = 600, hgt = y1 - y0;
    ctx.save();
    ctx.strokeStyle = P.cpxEdge; ctx.lineWidth = 1.2;
    rr(ctx, x - 11, y0, 22, hgt, 11);
    ctx.stroke();
    var fillH = hgt * clamp(phys.dp, 0, 1);
    var g = ctx.createLinearGradient(0, y1, 0, y0);
    g.addColorStop(0, 'rgba(255,159,69,0.35)');
    g.addColorStop(1, P.proton);
    ctx.fillStyle = g;
    rr(ctx, x - 9, y1 - fillH, 18, Math.max(fillH, 0.01), 9);
    ctx.fill();

    ctx.fillStyle = P.ink;
    ctx.font = '700 15px "SFMono-Regular",Consolas,monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(phys.dp * DP_MAX_MV), x, y0 - 26);
    ctx.font = '10.5px "PingFang SC",sans-serif';
    ctx.fillStyle = P.mute;
    ctx.fillText('mV', x, y0 - 10);
    ctx.save();
    ctx.translate(x, y1 + 26);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = P.mute;
    ctx.font = '11px "PingFang SC",sans-serif';
    ctx.fillText('Δp 质子动力势', 0, 0);
    ctx.restore();
    ctx.restore();
    ctx.textAlign = 'left';
  }

  var TOUR = [
    { name: '① 筑坝', cap: '磷脂双分子层 + 致密膜蛋白把 H⁺ 挡在里面。没有这层「不透水」的膜，后面全是白搭。',
      rect: { x: 36, y: 230, w: 1108, h: 200 } },
    { name: '② 泵质子', cap: '电子在复合体 I、III、IV 里往下走，把 H⁺ 从基质泵到膜间隙。一对电子走完，泵出 10 个（NADH）或 6 个（琥珀酸）。',
      rect: { x: 60, y: 190, w: 610, h: 300 } },
    { name: '③ 存梯度', cap: '泵上来的 H⁺ 堆在膜间隙一侧，既带来正电荷（Δψ）又降低 pH（ΔpH）。两种能量叠加成 Δp。',
      rect: { x: 36, y: 60, w: 1060, h: 200 } },
    { name: '④ 回流', cap: 'H⁺ 只能从 F₀ 的通道回去。这一条路是「唯一的泄洪道」，能量就此交给合酶。',
      rect: { x: 745, y: 240, w: 180, h: 180 } },
    { name: '⑤ 拧出 ATP', cap: '质子流推着 c 环转，γ 轴带着 F₁ 的三个 β 亚基轮流转：L 结合 → T 合成 → O 释放，每转一圈出 3 个 ATP。',
      rect: { x: 720, y: 430, w: 240, h: 160 } }
  ];

  function drawTour() {
    if (state.tour < 0) {
      // 顶部标签
      ctx.save();
      ctx.fillStyle = P.mute;
      ctx.font = '11.5px "PingFang SC",sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('电子下坡 · 质子爬坡', MEM.right - 60, H - 16);
      ctx.restore();
      return;
    }
    var t = TOUR[state.tour];
    var r = t.rect;
    ctx.save();
    ctx.fillStyle = document.documentElement.dataset.theme === 'light' ? 'rgba(240,245,252,0.72)' : 'rgba(5,8,15,0.72)';
    // 四块遮罩
    ctx.fillRect(0, 0, W, r.y);
    ctx.fillRect(0, r.y + r.h, W, H - r.y - r.h);
    ctx.fillRect(0, r.y, r.x, r.h);
    ctx.fillRect(r.x + r.w, r.y, W - r.x - r.w, r.h);
    // 边框
    ctx.strokeStyle = P.proton; ctx.lineWidth = 2;
    rr(ctx, r.x, r.y, r.w, r.h, 14); ctx.stroke();
    // 标题
    ctx.fillStyle = P.proton;
    ctx.font = '700 14px "PingFang SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t.name, r.x + 4, Math.max(30, r.y - 12));
    ctx.restore();
  }

  /* ---------------- 只读输出 ---------------- */
  function stats() {
    var total = phys.dp * DP_MAX_MV;
    var psi, dph;
    if (state.model === 'mito') { psi = total * 0.85; }
    else { psi = total * 0.55; }
    dph = (total - psi) / 59;

    var pump = phys.pumpRate, syn = phys.synRate, leak = phys.leakRate;
    var toStore = Math.max(0, pump - syn - leak);
    var sum = pump > 0.001 ? pump : 1;
    var pAtp = pump > 0.001 ? syn / sum * 100 : 0;
    var pHeat = pump > 0.001 ? leak / sum * 100 : 0;
    var pStore = pump > 0.001 ? toStore / sum * 100 : 0;
    var s2 = pAtp + pHeat + pStore;
    if (s2 > 0) { pAtp = pAtp / s2 * 100; pHeat = pHeat / s2 * 100; pStore = 100 - pAtp - pHeat; }

    return {
      dp: total, psi: psi, dph: dph,
      flux: phys.flux * 100,
      atpRate: phys.atpRate,
      atpTotal: phys.atpTotal,
      pumped: phys.pumped, returned: Math.round(phys.returned), leaked: Math.round(phys.leaked),
      pAtp: pAtp, pHeat: pHeat, pStore: pStore,
      po: pumpsPerPair() / 4,
      blocked: isBlocked()
    };
  }

  /* ---------------- 读数刷新 ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var vars = {
    dp: $('rmDp'), dpsig: $('rmDpsi'), dph: $('rmDph'), dpbar: $('rmDpBar'),
    flux: $('rmFlux'), fluxbar: $('rmFluxBar'), o2: $('rmO2v'),
    atp: $('rmAtp'), atpbar: $('rmAtpBar'), atptotal: $('rmAtpTotal'),
    stAtp: $('stAtp'), stHeat: $('stHeat'), stStore: $('stStore'),
    pAtp: $('rmPctAtp'), pHeat: $('rmPctHeat'), pStore: $('rmPctStore'),
    pumped: $('rmPumped'), returned: $('rmReturned'), leaked: $('rmLeaked'),
    po: $('rmPO')
  };
  var lastPaint = 0;

  function paintReadouts(s) {
    if (!vars.dp) return;
    vars.dp.textContent = Math.round(s.dp);
    vars.dpsig.textContent = 'Δψ ' + Math.round(s.psi) + ' mV';
    vars.dph.textContent = 'ΔpH ' + s.dph.toFixed(2);
    vars.dpbar.style.width = clamp(s.dp, 0, 100) + '%';

    vars.flux.textContent = Math.round(s.flux);
    vars.fluxbar.style.width = clamp(s.flux, 0, 100) + '%';
    vars.o2.textContent = (s.flux / 100 * 1.8).toFixed(1);

    vars.atp.textContent = s.atpRate.toFixed(1);
    vars.atpbar.style.width = clamp(s.atpRate / 2 * 100, 0, 100) + '%';
    vars.atptotal.textContent = s.atpTotal;

    vars.stAtp.style.width = s.pAtp + '%';
    vars.stHeat.style.width = s.pHeat + '%';
    vars.stStore.style.width = s.pStore + '%';
    vars.pAtp.textContent = Math.round(s.pAtp) + '%';
    vars.pHeat.textContent = Math.round(s.pHeat) + '%';
    vars.pStore.textContent = Math.round(s.pStore) + '%';

    vars.pumped.textContent = s.pumped;
    vars.returned.textContent = s.returned;
    vars.leaked.textContent = s.leaked;
    vars.po.textContent = s.po.toFixed(1);
  }

  /* ---------------- 尺寸 ---------------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    palette();
    buildStatic();
  }

  /* ---------------- 主循环 ---------------- */
  var last = 0;
  function loop(ts) {
    if (!last) last = ts;
    var raw = (ts - last) / 1000;
    last = ts;
    var dt = clamp(raw, 0, 0.05);
    var simDt = state.paused ? 0 : dt * state.speed;

    if (simDt > 0) step(simDt);
    draw(dt);

    lastPaint += raw;
    if (lastPaint > 0.18) { lastPaint = 0; paintReadouts(stats()); }
    requestAnimationFrame(loop);
  }

  /* ---------------- 对外 API ---------------- */
  window.ETC = {
    state: state,
    stats: stats,
    reset: function () { reset(); paintReadouts(stats()); },
    setSubstrate: function (v) {
      state.substrate = v; reset(); rebuildPath();
      buildStatic(); paintReadouts(stats());
    },
    setModel: function (v) { state.model = v; buildStatic(); },
    setSpeed: function (v) { state.speed = v; },
    setPaused: function (v) { state.paused = v; },
    setDnp: function (v) { state.dnp = v; },
    toggleDrug: function (name) {
      state.inh[name] = !state.inh[name];
      return state.inh[name];
    },
    setTour: function (v) { state.tour = v; },
    TOUR: TOUR
  };

  /* ---------------- 启动 ---------------- */
  var mq = window.matchMedia('(prefers-color-scheme: light)');
  resize();
  window.addEventListener('resize', function () {
    clearTimeout(resize._t);
    resize._t = setTimeout(resize, 200);
  });
  document.addEventListener('themechange', function () { palette(); buildStatic(); });

  paintReadouts(stats());
  requestAnimationFrame(loop);
})();
