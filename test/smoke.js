// 开发用冒烟测试：node test/smoke.js
// 以最小桩替换 DOM/UI，跑真实游戏逻辑若干帧，捕捉运行时错误。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
  console,
  performance: { now: () => Date.now() },
  setTimeout: (fn) => { fn(); return 0; }, // 同步执行，便于测试波末流程
  clearTimeout,
  localStorage: (() => { const m = {}; return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  }; })(),
  Math, JSON,
  // UI 桩：所有方法都是空函数
  UI: new Proxy({}, { get: () => () => {} }),
  Input: { keys: new Set(), has(code) { return this.keys.has(code); } },
  window: {},
};
vm.createContext(sandbox);

const files = ['utils.js', 'audio.js', 'data.js', 'weapons.js', 'skills.js', 'entities.js', 'game.js'];
for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}

vm.runInContext(`
  // 模拟按键：move=true 时按住 W 和 D 绕着跑
  function step(frames, move) {
    for (let i = 0; i < frames; i++) {
      const keys = new Set();
      if (move) { keys.add('KeyW'); keys.add('KeyD'); }
      Input.keys = keys;
      Game.update(0.016);
      if (Game.state === 'levelup') Game.chooseUpgrade(UPGRADES[0]);
    }
  }
  function drainLevelUps() {
    let guard = 30;
    while (Game.state === 'levelup' && guard--) Game.chooseUpgrade(UPGRADES[0]);
  }

  // 1. 开局跑 20 秒（波次时长 27s，尚在战斗中）
  Game.startRun(0);
  step(20 / 0.016, true);
  console.log('wave', Game.wave, 'enemies', Game.enemies.length, 'kills', Game.kills,
    'lv', Game.player.level, 'hp', Math.ceil(Game.player.hp), 'state', Game.state);

  // 1.5 技能系统：习得 3 个技能并跑一段时间
  const p0 = Game.player;
  p0.skills.push(
    { key: 'chain', level: 2, timer: 0.3 },
    { key: 'firefield', level: 1, timer: 0.3 },
    { key: 'barrier', level: 1, timer: 0.3 },
  );
  // 回旋镖专项回归：曾因折返速度逐帧 ×1.15 指数放大导致坐标溢出、网格查询死循环（游戏冻结）
  p0.weapons.push({ key: 'boomerang', tier: 4, timer: 0.1, aim: 0, recoil: 0 });
  Game.timeLeft = Math.max(Game.timeLeft, 60);
  step(2000, true);
  const boomBad = Game.bullets.some(b => !isFinite(b.x) || !isFinite(b.y) || Math.abs(b.x) > ARENA_W + 100);
  if (boomBad) throw new Error('回旋镖坐标溢出（卡死根因复发）');
  console.log('skills: chain/firefield/barrier cast ok, hazards:', Game.hazards.length,
    'shield:', p0.shield, 'boomerang finite: yes');
  if (Game.hazards.length === 0 && p0.shield <= 0) throw new Error('技能未生效');
  // 技能升级与新增路径（直接调用后恢复状态机现场）
  const savedState = Game.state, savedPending = Game.pendingLevels;
  Game.chooseUpgrade({ kind: 'skill-up', key: 'chain' });
  if (p0.skills.find(s => s.key === 'chain').level !== 3) throw new Error('技能升级失败');
  p0.skills = p0.skills.filter(s => s.key !== 'chain');
  Game.chooseUpgrade({ kind: 'skill-new', key: 'chain' });
  if (!p0.skills.find(s => s.key === 'chain')) throw new Error('新技能习得失败');
  Game.state = savedState; Game.pendingLevels = savedPending;

  // 2. 快进结束本波，应进入升级/商店
  Game.timeLeft = 0.01;
  step(40, false);
  setTimeout(() => {
    step(10, false);
    console.log('after sweep: state', Game.state, 'pendingLv', Game.pendingLevels);
    if (Game.state !== 'shop' && Game.state !== 'levelup') throw new Error('未进入商店/升级: ' + Game.state);
    drainLevelUps();
    if (Game.state !== 'shop') throw new Error('升级后未进入商店: ' + Game.state);

    // 3. 商店操作：全买、重抽、再全买、买面包
    Game.player.money += 500;
    Game.shopOffers.forEach((o, i) => Game.buyOffer(i));
    Game.doReroll();
    Game.shopOffers.forEach((o, i) => Game.buyOffer(i));
    Game.buyHeal();

    // 3.5 锁定功能：锁定的商品重抽后原样保留
    Game.doReroll();
    const lockIdx = 0;
    Game.toggleLock(lockIdx);
    if (!Game.shopOffers[lockIdx].locked) throw new Error('锁定失败');
    const lockedOffer = Game.shopOffers[lockIdx];
    Game.doReroll();
    const kept = Game.shopOffers[lockIdx];
    if (kept !== lockedOffer || !kept.locked) throw new Error('重抽未保留锁定商品');
    Game.toggleLock(lockIdx);
    if (Game.shopOffers[lockIdx].locked) throw new Error('解锁失败');
    console.log('shop lock ok; weapons:',
      Game.player.weapons.map(w => w.key + w.tier).join(','), 'money', Game.player.money);

    // 3.6 存档与继续：第 5 波开档应可恢复
    Game.nextWave(); // 进入第 2 波并保存
    if (!Game.loadProgress() || Game.loadProgress().wave !== 2) throw new Error('波次存档失败');
    Game.startWave(5); // 跳到第 5 波（会保存）
    Game.player.money += 77;
    Game.continueRun();
    if (Game.wave !== 5) throw new Error('继续后波次错误: ' + Game.wave);
    if (Game.state !== 'playing') throw new Error('继续后状态错误: ' + Game.state);
    console.log('save/continue ok: wave', Game.wave, 'money', Game.player.money,
      'weapons', Game.player.weapons.length, 'skills', Game.player.skills.length);
    Game.player.money += 300;

    // 4. 连打几波到第 5 波
    for (let k = 0; k < 3; k++) {
      Game.timeLeft = 0.01;
      step(60, true);
      drainLevelUps();
      step(10, true);
      if (Game.state === 'shop') Game.nextWave();
      else if (Game.state !== 'playing') throw new Error('波间状态异常: ' + Game.state);
    }
    step(1200, true); // 第 5 波打一会儿
    console.log('final: wave', Game.wave, 'kills', Game.kills, 'lv', Game.player.level,
      'hp', Math.ceil(Game.player.hp), 'state', Game.state);

    // 5. 击杀玩家验证结算（先摘掉圣盾，不然护盾会一直挡刀）
    Game.player.skills = []; Game.player.shield = 0;
    Game.player.hp = 1; Game.player.invuln = 0;
    Game.player.stats.dodge = -1; Game.player.stats.armor = -100;
    step(300, false);
    console.log('death state:', Game.state);
    if (Game.state !== 'over') throw new Error('未进入结算: ' + Game.state);
    if (Game.loadProgress()) throw new Error('死亡后未清除存档');
    console.log('SMOKE TEST PASSED');
  }, 600);
`, sandbox, { filename: 'test-inline.js' });
