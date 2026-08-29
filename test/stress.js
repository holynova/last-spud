// 压力测试：模拟中后期高强度战斗，捕捉导致卡死的异常/死循环/软锁。
// node test/stress.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
  console,
  performance: { now: () => Date.now() },
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  Math, JSON,
  UI: new Proxy({}, { get: () => () => {} }),
  Input: { keys: new Set(), has(code) { return this.keys.has(code); } },
  window: {},
};
vm.createContext(sandbox);

for (const f of ['utils.js', 'audio.js', 'data.js', 'weapons.js', 'skills.js', 'entities.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox, { filename: f });
}

vm.runInContext(`
  // 记录帧耗时，检测单帧卡死（死循环会表现为单帧超长或永不返回）
  let slowest = 0;
  function step(frames, move) {
    for (let i = 0; i < frames; i++) {
      const t0 = Date.now();
      Input.keys = new Set(move ? ['KeyW', 'KeyA'] : []);
      Game.update(0.016);
      const cost = Date.now() - t0;
      if (cost > slowest) { slowest = cost; }
      if (Game.state === 'levelup') Game.chooseUpgrade(levelupPick());
    }
  }
  function levelupPick() {
    const pool = UI.levelupPool ? [] : [];
    // 优先选技能，测满技能树
    return UPGRADES[0];
  }
  function drainLevelUps() {
    let guard = 60;
    while (Game.state === 'levelup' && guard--) Game.chooseUpgrade(UPGRADES[0]);
  }

  // 开局：满配压力（6 满阶武器 + 6 个 5 级技能 + 高属性）
  Game.startRun(0);
  const p = Game.player;
  p.money = 99999;
  p.stats.dmg += 1.5; p.stats.aspd += 1.0; p.stats.speed += 0.4; p.stats.maxHp += 200; p.hp = p.stats.maxHp;
  for (const k of ['smg', 'shotgun', 'knife', 'laser', 'flamer', 'boomerang'])
    p.weapons.push({ key: k, tier: 4, timer: rand(0, 0.3), aim: 0, recoil: 0 });
  for (const k in SKILLS) p.skills.push({ key: k, level: 5, timer: rand(0, 2) });

  // 连打 11 波（含最终 Boss 波），每波 5 秒战斗 + 快速收波
  try {
    for (let w = 1; w <= TOTAL_WAVES; w++) {
      step(5 / 0.016, true);              // 5 秒战斗
      if (Game.state === 'over') { console.log('第', w, '波死亡(合理)'); break; }
      // 强制灌满敌人制造极端压力
      for (let i = 0; i < 200 && Game.enemies.length < 230; i++) {
        Game.spawnAtEdge(i % 2 ? 'splitter' : 'boomling');
      }
      step(5 / 0.016, true);              // 5 秒极端战斗
      if (Game.state === 'over') { console.log('第', w, '波死亡(合理)'); break; }
      drainLevelUps();
      Game.timeLeft = 0.01;
      step(120, true);                    // 收波
      drainLevelUps();
      step(10, true);
      if (Game.state === 'shop') Game.nextWave();
      else if (Game.state === 'win') { console.log('第', w, '波通关 ✓'); break; }
      else if (Game.state === 'over') { console.log('第', w, '波死亡(合理)'); break; }
      else throw new Error('波间状态异常: ' + Game.state + ' (软锁!)');
      console.log('完成第', w, '波 | 敌人', Game.enemies.length, '| 帧耗时max', slowest, 'ms | 粒子', Game.particles.length, '| 特效', Game.fx.length, '| 子弹', Game.bullets.length);
      slowest = 0;
    }
    console.log('STRESS TEST PASSED');
  } catch (err) {
    console.log('STRESS TEST FAILED:', err && err.stack || err);
  }
`, sandbox, { filename: 'stress-inline.js' });
