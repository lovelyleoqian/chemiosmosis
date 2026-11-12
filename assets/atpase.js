/* ============================================================
   atpase.js —— ATP 合酶旋转马达（F0F1）特写动画
   #atpCanvas 1100 x 640
   侧视桶状 c 环旋转 + γ 轴 + F1 三个 β 的 L/T/O 三态轮转
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('atpCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = +canvas.dataset.w || 1100;
  var H = +canvas.dataset.h || 640;
  var TAU = Math.PI * 2;

  /* ---------------- 几何布局 ---------------- */
  var CX = 550;                        // 主轴 x
  var P_TOP = 16, P_BOT = 112;         // P 侧区域
  var MEM_TOP = 120, MEM_BOT = 300;    // 膜
  var RING = { cy: 210, rx: 122, hh: 60, r: 21 };  // c 环（桶状）
  var SHAFT = { top: 270, bot: 392, w: 13 };
  var F1 = { cx: CX, cy: 470, rx: 132, ry: 54, sub: 27 };
  var ENTRY = { x: CX - 168, y: 108 };
  var EXIT = { x: CX + 168, y: 312 };

  /* ---------------- 状态 ---------------- */
  var S = {
    n: 8,
    flow: 1,
    flowTarget: 1,
    oligo: false,
    rotor: 0,          // 弧度
    lastPush: 0
  };

  var HFLUX_MAX = 8;   // 满流速时每秒通过 c 环的质子数
  var protons = [];    // 视觉质子
  var atps = [];
  var spinAccum = 0;

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
  var C;
  function palette() {
    var light = document.documentElement.dataset.theme === 'light';
    C = light ? {
      ink: '#12233d', dim: '#4b6382', mute: '#8399b4',
      proton: '#d97706', atp: '#16a34a', heat: '#dc2626',
      mem: 'rgba(18,35,61,0.05)', head: 'rgba(18,35,61,0.24)',
      ring: '#dbe6f6', ringEdge: 'rgba(18,35,61,0.30)',
      beta: '#c7d9f5', alpha: '#e8eef8', edge: 'rgba(18,35,61,0.18)',
      bgTop: '#ffffff', bgBot: '#f2f7fd',
      sL: '#7c93b3', sT: '#16a34a', sO: '#d97706'
    } : {
      ink: '#e8eef8', dim: '#9fb0c9', mute: '#6c7f99',
      proton: '#ff9f45', atp: '#4ade80', heat: '#f8636b',
      mem: 'rgba(255,255,255,0.05)', head: 'rgba(255,255,255,0.20)',
      ring: '#182742', ringEdge: 'rgba(255,255,255,0.20)',
      beta: '#1d3355', alpha: '#14203a', edge: 'rgba(255,255,255,0.15)',
      bgTop: '#0c1424', bgBot: '#070c16',
      sL: '#7c93b3', sT: '#4ade80', sO: '#ff9f45'
    };
  }

  /* ---------------- 背景（离屏） ---------------- */
  var bgCanvas = null, dpr = 1;

  function buildBG() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = W * dpr; bgCanvas.height = H * dpr;
    var c = bgCanvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bgTop);
    g.addColorStop(1, C.bgBot);
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // 膜的磷脂双分子层
    c.fillStyle = C.mem;
    c.fillRect(0, MEM_TOP, W, MEM_BOT - MEM_TOP);
    var n = Math.floor(W / 17);
    for (var i = 0; i < n; i++) {
      var x = 8 + i * 17;
      c.beginPath(); c.arc(x, MEM_TOP + 12, 5.2, 0, TAU);
      c.fillStyle = C.head; c.fill();
      c.strokeStyle = C.head; c.lineWidth = 1.7;
      c.beginPath();
      c.moveTo(x - 1.7, MEM_TOP + 17); c.lineTo(x - 2.8, MEM_TOP + 48);
      c.moveTo(x + 1.7, MEM_TOP + 17); c.lineTo(x + 2.8, MEM_TOP + 48);
      c.stroke();
      c.beginPath(); c.arc(x, MEM_BOT - 12, 5.2, 0, TAU);
      c.fillStyle = C.head; c.fill();
      c.beginPath();
      c.moveTo(x - 1.7, MEM_BOT - 17); c.lineTo(x - 2.8, MEM_BOT - 48);
      c.moveTo(x + 1.7, MEM_BOT - 17); c.lineTo(x + 2.8, MEM_BOT - 48);
      c.stroke();
    }
    c.strokeStyle = C.edge; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, MEM_TOP); c.lineTo(W, MEM_TOP);
    c.moveTo(0, MEM_BOT); c.lineTo(W, MEM_BOT);
    c.stroke();

    // 区域文字
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = C.ink;
    c.font = '700 13.5px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText('P 侧（膜间隙 / 胞外）', 40, 50);
    c.fillStyle = C.mute;
    c.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText('H⁺ 多 · pH 低', 40, 70);

    c.fillStyle = C.ink;
    c.font = '700 13.5px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText('N 侧（基质 / 细胞质）', 40, 352);
    c.fillStyle = C.mute;
    c.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText('H⁺ 少 · pH 高', 40, 372);

    // 进入 / 离开 的固定箭头轨道
    c.strokeStyle = 'rgba(255,159,69,0.30)';
    c.lineWidth = 2; c.setLineDash([5, 5]);
    c.beginPath();
    c.moveTo(ENTRY.x, P_BOT - 4); c.lineTo(ENTRY.x, RING.cy - RING.hh + 6);
    c.stroke();
    c.beginPath();
    c.moveTo(EXIT.x, RING.cy + RING.hh - 6); c.lineTo(EXIT.x, MEM_BOT + 14);
    c.stroke();
    c.setLineDash([]);

    c.fillStyle = C.proton;
    c.font = '600 11.5px "PingFang SC",sans-serif';
    c.textAlign = 'center';
    c.fillText('H⁺ 进入', ENTRY.x, P_BOT + 4);
    c.fillText('H⁺ 离开', EXIT.x, MEM_BOT + 32);
    c.textAlign = 'left';
  }

  /* ---------------- 亚基位置 ---------------- */
  function subunitAt(i, rotate) {
    var ang = i * TAU / S.n + rotate;       // 0 = 正前
    return {
      ang: ang,
      x: CX + Math.sin(ang) * RING.rx,
      depth: Math.cos(ang),                  // >0 在前
      scale: 0.82 + 0.18 * Math.cos(ang)
    };
  }

  /* ---------------- 物理步进 ---------------- */
  function step(dt) {
    var want = S.oligo ? 0 : S.flowTarget;
    S.flow += (want - S.flow) * Math.min(1, dt * 5);
    if (S.flow < 0.004) S.flow = 0;

    var flux = S.flow * HFLUX_MAX;           // 质子/秒
    if (flux > 0.001) {
      // 每通过一个质子，c 环前进 1/n 圈
      var dAng = (flux / S.n) * TAU * dt;
      S.rotor = (S.rotor + dAng) % TAU;
    }

    // 生成视觉质子：一个从 P 侧进 c 环，一个从 c 环底部出到 N 侧
    spinAccum += dt;
    if (flux > 0.05 && protons.length < 46) {
      if (Math.random() < dt * flux * 0.9) {
        protons.push({
          st: 'in',
          x: ENTRY.x + rnd(-16, 16), y: P_TOP + rnd(18, 62),
          t: 0, dur: rnd(0.9, 1.3),
          sx: 0, sy: 0
        });
        protons[protons.length - 1].sx = protons[protons.length - 1].x;
        protons[protons.length - 1].sy = protons[protons.length - 1].y;
      }
      if (Math.random() < dt * flux * 0.85) {
        protons.push({
          st: 'out',
          x: EXIT.x + rnd(-16, 16), y: RING.cy + RING.hh - 6,
          t: 0, dur: rnd(0.7, 1.0),
          sx: EXIT.x + rnd(-10, 10), sy: RING.cy + RING.hh - 6
        });
      }
    }

    // 更新视觉质子
    for (var i = protons.length - 1; i >= 0; i--) {
      var p = protons[i];
      p.t += dt / p.dur;
      if (p.t >= 1) { protons.splice(i, 1); continue; }
      var e = p.t * p.t * (3 - 2 * p.t);
      if (p.st === 'in') {
        p.x = p.sx + (ENTRY.x - p.sx) * e;
        p.y = p.sy + (RING.cy - RING.hh + 6 - p.sy) * e;
      } else {
        p.x = p.sx + (EXIT.x - p.sx) * e;
        p.y = p.sy + (MEM_BOT + 16 - p.sy) * e;
      }
    }

    // ATP 粒子
    for (var k = atps.length - 1; k >= 0; k--) {
      var a = atps[k];
      a.life += dt;
      if (a.life > a.max) { atps.splice(k, 1); continue; }
      a.x += a.vx * dt; a.y += a.vy * dt;
      a.vy += 14 * dt;
    }
  }

  /* ---------------- 绘制 ---------------- */
  var time = 0;

  function draw(dt) {
    time += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);

    drawRing();
    drawShaft();
    drawF1();
    drawProtons();
    drawATP();
    drawHud();
    if (S.oligo) drawBlock();
  }

  function drawRing() {
    var items = [];
    for (var i = 0; i < S.n; i++) items.push(subunitAt(i, S.rotor));
    items.sort(function (a, b) { return a.depth - b.depth; });

    // 环的中空内圈
    ctx.beginPath();
    ctx.ellipse(CX, RING.cy, RING.rx - 14, RING.hh - 8, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fill();

    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var front = it.depth > 0;
      var hw = RING.r * it.scale;
      var hh = RING.hh * it.scale;
      var x = it.x, y = RING.cy;

      // 亚基本体
      rr(ctx, x - hw, y - hh, hw * 2, hh * 2, hw * 0.7);
      ctx.fillStyle = front ? C.ring : 'rgba(120,150,200,0.16)';
      ctx.fill();
      ctx.strokeStyle = C.ringEdge;
      ctx.lineWidth = front ? 1.5 : 1;
      ctx.stroke();

      // 亚基内的羧基结合位点（靠近 P 侧）
      if (front) {
        var dotY = y - hh * 0.42;
        ctx.beginPath(); ctx.arc(x, dotY, 3.4, 0, TAU);
        ctx.fillStyle = 'rgba(255,159,69,0.45)';
        ctx.fill();
      }
    }

    // 环的上下边缘轮廓
    ctx.strokeStyle = C.ringEdge; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(CX, RING.cy - RING.hh, RING.rx, 16, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(CX, RING.cy + RING.hh, RING.rx, 16, 0, 0, TAU); ctx.stroke();

    // 环旁边旋转方向箭头
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = C.proton;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(CX, RING.cy - RING.hh - 26, RING.rx * 0.82, 14, 0, 0.25, Math.PI - 0.25);
    ctx.stroke();
    ctx.restore();

    // 标签
    ctx.fillStyle = C.dim;
    ctx.font = '11.5px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('c 环（' + S.n + ' 个亚基）', CX, RING.cy + RING.hh + 46);
    ctx.textAlign = 'left';
  }

  function drawShaft() {
    // γ 轴
    var wob = Math.sin(S.rotor * 1.0) * 6;
    var g = ctx.createLinearGradient(CX - SHAFT.w, 0, CX + SHAFT.w, 0);
    g.addColorStop(0, 'rgba(150,175,210,0.35)');
    g.addColorStop(0.4, 'rgba(190,210,235,0.95)');
    g.addColorStop(1, 'rgba(120,145,180,0.45)');
    ctx.strokeStyle = g;
    ctx.lineWidth = SHAFT.w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CX, SHAFT.top);
    ctx.quadraticCurveTo(CX + wob * 0.5, (SHAFT.top + SHAFT.bot) / 2, CX + wob, SHAFT.bot);
    ctx.stroke();

    ctx.fillStyle = C.mute;
    ctx.font = '11px "PingFang SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('γ 轴', CX + 16, (SHAFT.top + SHAFT.bot) / 2 + 4);
  }

  function drawF1() {
    // 头部底盘
    var g = ctx.createRadialGradient(F1.cx - 20, F1.cy - 26, 8, F1.cx, F1.cy, F1.rx);
    g.addColorStop(0, document.documentElement.dataset.theme === 'light' ? '#f7fafe' : '#1b2a44');
    g.addColorStop(1, document.documentElement.dataset.theme === 'light' ? '#dfe8f6' : '#0e1729');
    ctx.beginPath();
    ctx.ellipse(F1.cx, F1.cy, F1.rx, F1.ry, 0, 0, TAU);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = C.edge; ctx.lineWidth = 1.4; ctx.stroke();

    // 6 个亚基：α β 交替；β 分别处于 L / T / O
    var phase = S.rotor * 3 / TAU;   // 每圈 3 次状态切换
    for (var k = 0; k < 6; k++) {
      var isBeta = k % 2 === 0;
      var a = k * TAU / 6 + 0.52;
      var sx = F1.cx + Math.sin(a) * (F1.rx - F1.sub - 8);
      var sy = F1.cy + Math.cos(a) * (F1.ry - 14);
      var depth = Math.cos(a);

      if (!isBeta) {
        ctx.beginPath(); ctx.ellipse(sx, sy, F1.sub, F1.sub * 0.72, 0, 0, TAU);
        ctx.fillStyle = C.alpha; ctx.fill();
        ctx.strokeStyle = C.edge; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = C.mute;
        ctx.font = '600 12px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('α', sx, sy);
        continue;
      }

      var bi = k / 2;                            // 0,1,2
      var st = ((phase + bi / 3) % 1 + 1) % 1;   // 0..1
      var state = st < 1 / 3 ? 'L' : st < 2 / 3 ? 'T' : 'O';
      var col = state === 'L' ? C.sL : state === 'T' ? C.sT : C.sO;
      var rad = F1.sub * (0.94 + 0.06 * depth);

      ctx.save();
      // 外发光
      if (state !== 'L' && S.flow > 0.02) {
        ctx.beginPath(); ctx.arc(sx, sy, rad + 7, 0, TAU);
        ctx.fillStyle = state === 'T' ? 'rgba(74,222,128,0.13)' : 'rgba(255,159,69,0.10)';
        ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * 0.78, 0, 0, TAU);
      ctx.fillStyle = C.beta; ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = state === 'L' ? 1.4 : 2.6;
      ctx.stroke();

      ctx.fillStyle = state === 'L' ? C.dim : col;
      ctx.font = '700 13px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('β', sx - 6, sy);

      ctx.fillStyle = col;
      ctx.font = '700 11px system-ui,sans-serif';
      ctx.fillText(state, sx + 9, sy);

      // T 态里画一个小 ATP
      if (state === 'T' && S.flow > 0.02) {
        ctx.beginPath(); ctx.arc(sx + 4, sy - rad - 9, 3.6, 0, TAU);
        ctx.fillStyle = C.atp; ctx.fill();
      }
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';

    // 标注
    ctx.fillStyle = C.dim;
    ctx.font = '11.5px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('F₁（α₃β₃ 催化部）', F1.cx, F1.cy + F1.ry + 26);
    ctx.textAlign = 'left';
  }

  function drawProtons() {
    for (var i = 0; i < protons.length; i++) {
      var p = protons[i];
      if (!p.st) continue;
      drawProtonDot(p.x, p.y, p.st === 'in' ? 0.9 : 0.75);
    }
    // P 侧背景漂浮质子（表示浓度高）
    var count = 7;
    for (var j = 0; j < count; j++) {
      var seed = j * 97.3;
      var x = 120 + ((seed * 13 + time * 16) % (W - 260));
      var y = P_TOP + 22 + Math.sin(time * 0.9 + seed) * 12 + (j % 3) * 20;
      drawProtonDot(x, y, 0.32);
    }
    // N 侧稀疏几个
    for (var m = 0; m < 3; m++) {
      var seed2 = m * 151.7;
      var x2 = 140 + ((seed2 * 7 + time * 12) % (W - 300));
      var y2 = MEM_BOT + 34 + Math.sin(time * 0.7 + seed2) * 10 + m * 14;
      drawProtonDot(x2, y2, 0.2);
    }
  }

  function drawProtonDot(x, y, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    var g = ctx.createRadialGradient(x, y, 0, x, y, 11);
    g.addColorStop(0, 'rgba(255,159,69,0.85)');
    g.addColorStop(1, 'rgba(255,159,69,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.fillStyle = C.proton;
    ctx.beginPath(); ctx.arc(x, y, 4.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '700 8px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', x, y + 0.4);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  function drawATP() {
    ctx.save();
    for (var i = 0; i < atps.length; i++) {
      var a = atps[i];
      var t = a.life / a.max;
      ctx.globalAlpha = 1 - t * t;
      ctx.beginPath(); ctx.arc(a.x, a.y, 8, 0, TAU);
      ctx.fillStyle = 'rgba(74,222,128,0.20)'; ctx.fill();
      ctx.strokeStyle = C.atp; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = C.atp;
      ctx.font = '700 7.5px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('ATP', a.x, a.y + 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawHud() {
    var x = W - 250, y = 28;
    ctx.save();
    rr(ctx, x, y, 216, 96, 12);
    ctx.fillStyle = document.documentElement.dataset.theme === 'light'
      ? 'rgba(255,255,255,0.86)' : 'rgba(14,22,38,0.86)';
    ctx.fill();
    ctx.strokeStyle = C.edge; ctx.lineWidth = 1; ctx.stroke();

    var turn = clamp(S.rotor / TAU, 0, 1);
    ctx.fillStyle = C.mute;
    ctx.font = '11px "PingFang SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('当前这一圈', x + 14, y + 22);

    // 进度条
    rr(ctx, x + 14, y + 30, 188, 6, 3);
    ctx.fillStyle = C.mem; ctx.fill();
    rr(ctx, x + 14, y + 30, Math.max(2, 188 * turn), 6, 3);
    ctx.fillStyle = C.proton; ctx.fill();

    var cnt = Math.floor(turn * S.n);
    ctx.fillStyle = C.ink;
    ctx.font = '700 13px "SFMono-Regular",Consolas,monospace';
    ctx.fillText('H⁺ ' + cnt + ' / ' + S.n, x + 14, y + 62);
    ctx.fillStyle = C.dim;
    ctx.font = '11.5px "PingFang SC",sans-serif';
    ctx.fillText('ATP ' + Math.floor(turn * 3) + ' / 3', x + 110, y + 62);

    var stateLbl = S.oligo ? '寡霉素：F₀ 被堵死，转子停转'
      : S.flow < 0.02 ? '无质子流，转子静止' : '质子流正在推动转子';
    ctx.fillStyle = S.oligo ? C.heat : (S.flow < 0.02 ? C.mute : C.atp);
    ctx.font = '600 11.5px "PingFang SC",sans-serif';
    ctx.fillText(stateLbl, x + 14, y + 84);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function drawBlock() {
    ctx.save();
    var bx = CX + RING.rx + 34, by = RING.cy;
    ctx.strokeStyle = C.heat;
    ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx - 22, by - 16); ctx.lineTo(bx + 10, by + 14);
    ctx.moveTo(bx + 10, by - 16); ctx.lineTo(bx - 22, by + 14);
    ctx.stroke();
    ctx.fillStyle = C.heat;
    ctx.font = '600 11.5px "PingFang SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('寡霉素结合 F₀', bx + 18, by - 2);
    ctx.fillText('H⁺ 无法回流', bx + 18, by + 16);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  /* ---------------- 读数 ---------------- */
  var elPerTurn = document.getElementById('aPerTurn');
  var elC = document.getElementById('aC');
  var elRatio = document.getElementById('aRatio');
  var elReal = document.getElementById('aRatioReal');

  function paintStats() {
    var n = S.n;
    if (elPerTurn) elPerTurn.textContent = n;
    if (elC) elC.textContent = n;
    if (elRatio) elRatio.textContent = (n / 3).toFixed(2);
    if (elReal) elReal.textContent = (n / 3 + 1).toFixed(2);
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
  var last = 0, lastSpawn = 0;

  function loop(ts) {
    if (!last) last = ts;
    var dt = clamp((ts - last) / 1000, 0, 0.05);
    last = ts;

    step(dt);
    draw(dt);
    requestAnimationFrame(loop);
  }

  /* ---------------- ATP 生成：由 β 进入 T 态触发 ---------------- */
  var prevBetaState = ['L', 'L', 'L'];
  function checkSynthesis() {
    var phase = S.rotor * 3 / TAU;
    for (var k = 0; k < 3; k++) {
      var st = ((phase + k / 3) % 1 + 1) % 1;
      var state = st < 1 / 3 ? 'L' : st < 2 / 3 ? 'T' : 'O';
      if (prevBetaState[k] === 'T' && state === 'O' && S.flow > 0.02) {
        // 从对应 β 亚基外缘朝外飘散，避免堆在 F₁ 上糊成一团
        var a = k * TAU / 6 + 0.52;
        var ux = Math.sin(a), uy = Math.cos(a);
        if (atps.length > 9) atps.shift();
        atps.push({
          x: F1.cx + ux * (F1.rx + 6),
          y: F1.cy + uy * (F1.ry + 8),
          vx: ux * 30 + rnd(-8, 8),
          vy: uy * 20 + rnd(-8, 8) + 8,
          life: 0, max: 1.6
        });
      }
      prevBetaState[k] = state;
    }
  }

  /* 把 checkSynthesis 挂进循环 */
  var _step = step;
  step = function (dt) {
    _step(dt);
    checkSynthesis();
  };

  /* ---------------- 控件 ---------------- */
  var rngN = document.getElementById('cRing');
  var outN = document.getElementById('cRingOut');
  var rngF = document.getElementById('hFlow');
  var outF = document.getElementById('hFlowOut');
  var chipO = document.getElementById('oligoChip');

  if (rngN) {
    S.n = +rngN.value || 8;
    rngN.addEventListener('input', function () {
      S.n = clamp(+rngN.value, 8, 15);
      if (outN) outN.textContent = S.n;
      paintStats();
    });
  }
  if (rngF) {
    S.flowTarget = (+rngF.value || 100) / 100;
    rngF.addEventListener('input', function () {
      S.flowTarget = (+rngF.value || 0) / 100;
      if (outF) outF.textContent = rngF.value + '%';
    });
  }
  if (chipO) {
    chipO.addEventListener('click', function () {
      S.oligo = !S.oligo;
      chipO.classList.toggle('on', S.oligo);
      chipO.textContent = S.oligo ? '已关闭 F₀' : '关闭 / 开启';
    });
  }

  /* 与主实验台的寡霉素联动 */
  document.addEventListener('etc:oligomycin', function (e) {
    S.oligo = !!e.detail;
    if (chipO) {
      chipO.classList.toggle('on', S.oligo);
      chipO.textContent = S.oligo ? '已关闭 F₀' : '关闭 / 开启';
    }
  });

  /* ---------------- 启动 ---------------- */
  resize();
  window.addEventListener('resize', function () {
    clearTimeout(resize._t);
    resize._t = setTimeout(resize, 200);
  });
  document.addEventListener('themechange', function () { palette(); buildBG(); });

  paintStats();
  requestAnimationFrame(loop);

  window.ATPASE = {
    state: S,
    setN: function (v) { S.n = clamp(v, 8, 15); if (rngN) rngN.value = S.n; if (outN) outN.textContent = S.n; paintStats(); },
    setFlow: function (v) { S.flowTarget = clamp(v, 0, 1); if (rngF) rngF.value = Math.round(v * 100); },
    setOligo: function (v) { S.oligo = !!v; }
  };
})();
