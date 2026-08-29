// ============ 入口：画布 / 输入 / 主循环 ============

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  Game.view.w = window.innerWidth;
  Game.view.h = window.innerHeight;
  canvas.width = Math.round(Game.view.w * dpr);
  canvas.height = Math.round(Game.view.h * dpr);
  canvas.style.width = Game.view.w + 'px';
  canvas.style.height = Game.view.h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// 输入
const Input = {
  keys: new Set(),
  has(code) { return this.keys.has(code); },
};
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  Input.keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyM') {
    const muted = Sfx.toggleMute();
    document.getElementById('mute-tip').textContent = muted ? 'M 已静音' : 'M 静音';
  }
  if (e.code === 'Escape' || e.code === 'KeyP') Game.togglePause();
});
window.addEventListener('keyup', e => Input.keys.delete(e.code));
window.addEventListener('blur', () => {
  Input.keys.clear();
  // 切走时自动暂停，避免回来时血量被磨光或看起来像卡死
  if (Game.state === 'playing') Game.togglePause();
});

// 触屏虚拟摇杆（Game.render 会在屏幕上画出它）
const TouchInput = {
  active: false,
  id: null,
  bx: 0, by: 0,   // 摇杆基点
  dx: 0, dy: 0,   // 归一化方向（长度 0~1）
};
const JOY_R = 56, JOY_DEAD = 8;
function joyUpdate(t) {
  let dx = t.clientX - TouchInput.bx;
  let dy = t.clientY - TouchInput.by;
  const len = Math.hypot(dx, dy);
  if (len < JOY_DEAD) { TouchInput.dx = 0; TouchInput.dy = 0; return; }
  const k = Math.min(1, len / JOY_R) / len;
  TouchInput.dx = dx * k;
  TouchInput.dy = dy * k;
}
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  Sfx.init(); Sfx.resume();
  if (TouchInput.active) return;
  const t = e.changedTouches[0];
  TouchInput.active = true;
  TouchInput.id = t.identifier;
  TouchInput.bx = t.clientX; TouchInput.by = t.clientY;
  TouchInput.dx = 0; TouchInput.dy = 0;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === TouchInput.id) joyUpdate(t);
  }
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === TouchInput.id) {
      TouchInput.active = false;
      TouchInput.id = null;
      TouchInput.dx = 0; TouchInput.dy = 0;
    }
  }
}
canvas.addEventListener('touchend', touchEnd);
canvas.addEventListener('touchcancel', touchEnd);

UI.init();

// ============ 主循环（带异常防护与看门狗自愈） ============
let last = performance.now();
let lastTick = performance.now();  // 最近一次成功帧
let errorStreak = 0;               // 连续异常帧数

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  try {
    if (Game.state === 'playing') Game.update(dt);
    ctx.clearRect(0, 0, Game.view.w, Game.view.h);
    ctx.imageSmoothingEnabled = false; // 像素风硬边缩放
    Game.render(ctx);
    errorStreak = 0;
    lastTick = performance.now();
  } catch (err) {
    // 单帧异常不再杀死整个循环：记录、提示、跳过该帧
    errorStreak++;
    console.error('[游戏帧异常]', err);
    if (errorStreak === 1) UI.toastMoney('发生异常，已自动恢复（详情见控制台）');
    if (errorStreak >= 30 && Game.state === 'playing') {
      // 持续异常时自动暂停，避免带病运行
      Game.togglePause();
      errorStreak = 0;
    }
  }
  requestAnimationFrame(loop);
}

// 看门狗：rAF 链条意外中断（极端情况）时重新拉起
setInterval(() => {
  if (Game.state === 'playing' && performance.now() - lastTick > 3000) {
    console.warn('[看门狗] 主循环失去响应，重新启动');
    last = performance.now();
    requestAnimationFrame(loop);
  }
}, 1500);

// 加载素材 → 显示主菜单 → 启动主循环
Assets.load().then(() => {
  document.getElementById('loading').classList.add('hidden');
  UI.showMenu(true);
  requestAnimationFrame(loop);
});
