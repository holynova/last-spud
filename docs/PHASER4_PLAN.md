# Phaser 4 重构计划

> 分支：`feature/phaser4`（main 分支完整保留原生 JS 版本 v1.3）
> 技术栈：**TypeScript + Vite + Phaser 4 + Vitest + Playwright**，包管理 pnpm
> 原则：领域层（纯逻辑）与表现层（Phaser）严格分离 —— 领域层零 Phaser 依赖，可用 Vitest 无头测试；
> 每个任务一个 commit，每个阶段跑完「单测 + 类型检查 + 构建 + E2E」全绿才进入下一阶段。

## 目录结构（目标）

```
index.html            Vite 入口
vite.config.ts        publicDir=assets（沿用现有 PNG 素材，路径不变）
src/
  main.ts             Phaser 游戏实例与装配
  config.ts           常量（画布/世界尺寸等）
  data/               内容配置（自 data.js 平移 + 类型定义）
    weapons.ts skills.ts enemies.ts items.ts upgrades.ts characters.ts waves.ts
  domain/             纯逻辑（零 Phaser 依赖，可 Vitest 直测）
    GameState.ts      运行时状态（玩家属性/经济/波次）
    SpatialGrid.ts    空间网格（含边界防御）
    DamageSystem.ts   伤害结算/暴击/护甲/闪避
    WeaponSystem.ts   武器开火与目标获取
    SkillSystem.ts    技能施放
    WaveDirector.ts   波次刷怪导演
    ShopSystem.ts     商店（购买/合成/重抽/锁定/治疗）
    SaveSystem.ts     每波存档/继续（localStorage 适配器注入）
    EventBus.ts       事件总线
  scenes/             Phaser 场景（薄壳，调 domain + 画渲染）
    BootScene.ts PreloadScene.ts MenuScene.ts BattleScene.ts ShopScene.ts ...
  render/             精灵工厂/伤害飘字池/粒子/震屏
  infra/              audio（WebAudio 合成音效移植）/ input（键鼠+摇杆）/ storage
tests/
  unit/*.test.ts      Vitest
  e2e/smoke.mjs       Playwright 无头冒烟（构建产物 + 控制台零报错 + 截图）
```

## 阶段与任务

### P0 脚手架与基建
- [x] T0.1 建分支 + 本计划文档
- [x] T0.2 Vite+TS+Phaser 脚手架：删除旧 js/css/test（保留于 main），建 src/ 结构，`pnpm dev/build` 可跑
- [x] T0.3 Playwright E2E 冒烟：加载页面零控制台报错 + 截图 + 游戏实例可访问
- 验收：`pnpm typecheck && pnpm test && pnpm e2e` 全绿

### P1 场景与渲染基座
- [x] T1.1 资源加载（Boot/Preload 场景 + 加载进度）
- [x] T1.2 战斗场景：2000×1300 世界、地面 TileSprite、边界墙、装饰物
- [x] T1.3 摄像机跟随 + 世界边界钳制 + pixelArt
- [x] T1.4 单测：摄像机钳制 / 地面尺寸
- 验收：E2E 截图可见完整地牢画面

### P2 玩家与武器系统
- [x] T2.1 GameState（属性/经济/波次状态）
- [x] T2.2 玩家实体：精灵 + WASD/摇杆移动 + 场地钳制
- [x] T2.3 SpatialGrid 移植 + 单测
- [x] T2.4 武器框架：10 武器 × 4 阶数值、最近目标获取、开火冷却
- [x] T2.5 弹道（gun/shotgun/throw/boomerang/beam/melee/aura 全 kind）
- [x] T2.6 伤害系统：暴击/护甲/闪避、伤害飘字池、受击闪白（tint）、击退
- 验收：单测覆盖 weaponStats/grid/damage；E2E 可见射怪与飘字

### P3 敌人与波次导演
- [x] T3.1 9 类敌人（追击/疾风蝠/毒蛛远程/爆爆蟹自爆/怨灵/分裂/血祭司精英/鼠王 Boss）
- [x] T3.2 波次导演：时长曲线/刷怪表/精英概率/最终 Boss 波/收波清场
- [x] T3.3 死亡掉落（材料/治疗包）与玩家受伤（接触/无敌帧/死亡）
- 验收：单测波次曲线与掉落数量；E2E 跑完第 1-2 波有击杀

### P4 掉落、经验与升级
- [x] T4.1 材料磁吸拾取 + 经验曲线 + 金钱
- [x] T4.2 升级四选一界面（属性/新技能/技能升级混合池）
- [x] T4.3 多级排队升级
- 验收：单测经验曲线与去重抽卡；E2E 走通升级流程

### P5 技能系统
- [x] T5.1 震荡波/闪电链/烈火结界/圣盾/狂化/荆棘 全部施放与表现
- 验收：单测 skillStats 成长与命中；E2E 可见全部技能特效

### P6 商店
- [x] T6.1 波间商店：4 槽商品（武器/道具）+ 价格曲线
- [x] T6.2 购买/同名同阶合成/治疗泉水/重抽/锁定
- 验收：单测商店全操作；E2E 完整购买流程

### P7 完整 UI/UX 与存档
- [x] T7.1 HUD（血/经验/金钱/倒计时/武器技能槽）
- [x] T7.2 主菜单（4 角色选择/继续上局/最佳纪录）
- [x] T7.3 暂停属性面板 / 死亡与通关结算
- [x] T7.4 每波自动存档 + 继续 + 死亡清档
- 验收：单测存档往返；E2E 菜单→战斗→死亡→重开

### P8 音效与手感
- [ ] T8.1 WebAudio 合成音效移植（含节流闸门）
- [ ] T8.2 粒子/震屏/低血闪烁
- 验收：E2E 无控制台报错

### P9 移动端与性能
- [ ] T9.1 虚拟摇杆 + 响应式缩放
- [ ] T9.2 对象池（子弹/飘字/粒子）+ 满载性能预算（渲染 ≤ 8ms/帧）
- 验收：E2E + 性能数字记录进本文档

### P10 OPTIMIZATION.md 新特性（每特性一个 commit）
- [ ] Boss 顶部血条 → [ ] 连击系统+宝箱 → [ ] 精英词缀 → [ ] 可破坏木桶 →
      [ ] 低血量反馈 → [ ] 武器流派标签+协同道具 → [ ] 召唤系武器 → [ ] 角色初始技能 →
      [ ] 技能 5 级觉醒 → [ ] 事件波次 → [ ] 局外解锁 → [ ] 多地图换皮 →
      [ ] 本局战斗统计 → [ ] 图鉴页
- 验收：每特性附单测/E2E；最终完整通关 E2E

## 测试策略
- `pnpm typecheck`：tsc --noEmit
- `pnpm test`：Vitest 单测（领域层无 Phaser 依赖，node 环境直测）
- `pnpm build`：Vite 产物
- `pnpm e2e`：构建 → vite preview → Playwright（零报错 + 截图 + 状态断言）
- 每阶段验收 = 以上四项全绿 + 截图人工复核
