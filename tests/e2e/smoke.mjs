// E2E 冒烟测试：构建产物 + 控制台零报错 + 游戏实例可访问 + 截图
// 用法：pnpm e2e（需先 pnpm build）
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;
const SHOT_DIR = 'tests/e2e/screenshots';
rmSync(SHOT_DIR, { recursive: true, force: true });
mkdirSync(SHOT_DIR, { recursive: true });

const server = spawn('pnpm', ['exec', 'vite', 'preview'], { stdio: 'pipe' });
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (serverOut.includes(String(PORT))) return;
    await sleep(200);
  }
  throw new Error('preview 服务器启动超时: ' + serverOut);
}

const errors = [];
let failed = false;
try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__ds, null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const g = window.__ds;
    const scene = g?.scene?.getScenes(true)?.[0];
    return scene?.scene?.key === 'Menu';
  }, null, { timeout: 15000 });
  await sleep(400);

  // 菜单：选第一个角色并开始
  await page.evaluate(() => {
    const g = window.__ds;
    const menu = g.scene.getScene('Menu');
    menu.scene.start('Battle', { charIdx: 0 });
  });
  await page.waitForFunction(() => {
    const g = window.__ds;
    const scene = g?.scene?.getScenes(true)?.[0];
    return scene?.scene?.key === 'Battle';
  }, null, { timeout: 15000 });
  await sleep(1500); // 等敌人进场与开火

  const info = await page.evaluate(() => {
    const game = window.__ds;
    const scene = game?.scene?.getScenes(true)?.[0];
    const battle = game?.scene?.getScene('Battle');
    return {
      booted: !!game,
      activeScene: scene?.scene?.key ?? null,
      children: scene ? scene.children.length : 0,
      hasWorld: !!battle?.world,
      enemies: battle?.world?.enemies?.length ?? 0,
      canvasSize: game?.canvas?.width + 'x' + game?.canvas?.height,
    };
  });

  await page.screenshot({ path: `${SHOT_DIR}/smoke.png` });

  // 断言
  const assert = (cond, msg) => { if (!cond) { failed = true; errors.push('[断言失败] ' + msg); } };
  assert(info.booted, 'Phaser 实例未启动');
  assert(info.activeScene === 'Battle', '活动场景应为 Battle，实际: ' + info.activeScene);
  assert(info.children > 10, '场景对象过少: ' + info.children);
  assert(info.hasWorld, '战斗世界未装配');
  assert(errors.length === 0, '存在控制台错误');

  console.log('E2E 信息:', JSON.stringify(info));
  console.log(errors.length ? 'E2E 失败:\n' + errors.join('\n') : 'E2E 冒烟通过 ✅');
  await browser.close();
} catch (e) {
  failed = true;
  errors.push(String(e));
  console.error('E2E 异常:', e);
} finally {
  server.kill();
}

// 失败时保留服务器输出辅助排查
if (serverOut && failed) writeFileSync('tests/e2e/preview.log', serverOut);
process.exit(failed ? 1 : 0);
