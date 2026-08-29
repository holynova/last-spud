# 地牢幸存者 · 架构分析与演进方案

> 分析基于当前代码（v1.3，~2900 行 JS，12 个文件）。文中度量数据来自静态统计。

## 一、现状架构

### 1.1 架构图

```mermaid
flowchart TB
    subgraph 浏览器页面
        HTML[index.html<br/>UI 骨架 + 脚本加载顺序] --> CSS[style.css<br/>样式]
    end

    subgraph 全局命名空间 window（68 个顶层符号，无模块系统）
        MAIN[main.js 131 行<br/>画布/输入/rAF 主循环/看门狗/启动]

        subgraph GAME[god object：game.js 870 行]
            direction TB
            SM[状态机 menu/playing/levelup/shop/pause/over/win]
            DIR[波次刷怪导演]
            BIZ[商店经济 / 升级流程 / 存档读写]
            CAM[摄像机 + 震屏]
            R[渲染器：8 个 draw 方法<br/>约 400 行 canvas 绘制]
            GRID[SpatialGrid 空间网格]
        end

        ENT[entities.js 372 行<br/>Player/Enemy/Bullet/Pickup/<br/>Particle/DamageText 类]
        WEP[weapons.js 194 行<br/>武器开火 + 伤害结算 + 击杀掉落]
        SKL[skills.js 134 行<br/>6 种技能施放]
        DATA[data.js 242 行<br/>武器/技能/敌人/道具/角色/波次曲线]
        UI[ui.js 380 行<br/>DOM：HUD/菜单/升级/商店/结算]
        SFX[audio.js<br/>WebAudio 合成音效]
        AST[assets.js<br/>图片加载器]
        UTL[utils.js<br/>工具函数]
    end

    MAIN -->|每帧调 update/render| GAME
    MAIN --> INPUT[Input / TouchInput<br/>键盘 + 虚拟摇杆]
    INPUT -->|Player.update 直读| ENT
    GAME -->|refreshHud 每帧| UI
    UI -->|买/选/继续 回调| GAME
    ENT -->|dealDamage/killEnemy| WEP
    WEP --> SKL
    ENT --> SKL
    GAME --> ENT
    GAME --> AST
    R --> AST
    WEP --> SFX
    ENT --> SFX
    SKL --> SFX
    UI --> SFX
    GAME --> SFX
    BIZ --> LS[(localStorage<br/>存档/纪录)]
```

### 1.2 耦合度量（grep 统计）

| 依赖方向 | 次数 | 说明 |
|---|---|---|
| ui.js → Game | 32 | UI 直接读写游戏内部状态 |
| game.js → UI | 28 | 游戏逻辑直接操纵 DOM 展示 |
| game.js → Sfx | 17 | 逻辑层直接发声 |
| weapons/skills/entities → Sfx | 21 | 同上，战斗全链路散布音效调用 |
| main.js → Game | 15 | 主循环持有全局 |
| entities.js 内 `g.`/`Sfx.`/全局函数 | 22 | 实体层反向依赖引擎与规则层 |

### 1.3 回答：是“所有逻辑放一个地方”吗？

**不是单文件，但实质上是“单命名空间 + 上帝对象”**：

1. **68 个顶层全局符号**，文件只是物理切分，没有模块边界；加载顺序即依赖顺序（`index.html` 里 script 标签的排列就是隐形的依赖声明）。
2. **game.js 是上帝对象**：状态机、刷怪导演、商店经济、升级流程、存档持久化、摄像机、震屏、全部渲染（约 400 行）8 种职责在一个对象上（30 个状态字段 + 35 个方法）。
3. **双向耦合**：`Game ↔ UI` 互相直接调用（28/32 次），逻辑与展示无法分开测试。
4. **实体反向依赖引擎**：`Bullet/Enemy` 直接调用 `dealDamage/killEnemy`、读 `g.grid`、`g.player`、发 `Sfx` —— 规则层、引擎层、表现层搅在一起。
5. 好的一面：`data.js` 是干净的纯数据配置层；`utils.js` 无依赖；冒烟/压力测试能通过全局打桩运行。

这个架构在当前规模（~3k 行）**还能维护**——我们已经用打桩测试抓出过 5 个真 bug——但它接近临界点：每加一个功能（技能、存档、锁定）都在给 Game 增重。

## 二、重构方案（保持网页、渐进式）

### 2.1 目标架构：分层 + 事件总线

```mermaid
flowchart TB
    subgraph 表现层 Presentation
        RENDER[render/<br/>Renderer 接口<br/>Arena/Entity/Fx/Hud 渲染器]
        SCREENS[ui/screens/<br/>Menu/Shop/LevelUp/GameOver]
    end
    subgraph 领域层 Domain（纯逻辑，零 DOM/Canvas 依赖）
        SM[StateMachine]
        WAVE[WaveDirector]
        BATTLE[battle/<br/>Player/Enemy/Bullet/<br/>DamageSystem/SpawnDirector]
        ECON[Shop/Upgrade/SaveData]
        BUS[[EventBus<br/>enemy:killed / player:hurt /<br/>wave:started / level:up]]
    end
    subgraph 基础设施 Infra
        INPUT[InputService]
        AUDIO[AudioService]
        ASSETS[AssetStore]
        STORE[StorageAdapter]
        LOOP[GameLoop<br/>固定步长更新 + 渲染]
    end
    DATA[data/ 内容配置]

    LOOP --> SM
    SM --> WAVE & BATTLE & ECON
    BATTLE --> BUS
    WAVE --> BUS
    ECON --> BUS
    BUS -.订阅.-> AUDIO
    BUS -.订阅.-> RENDER
    BUS -.订阅.-> SCREENS
    RENDER --> ASSETS
    SCREENS --> STORE
    BATTLE --> DATA
    INPUT --> BATTLE
```

核心原则：

| 原则 | 现状 → 目标 |
|---|---|
| 单向依赖 | 领域层不 import 任何表现层；表现层只读状态 + 订阅事件 |
| 事件解耦 | `killEnemy` 里直写掉落/飘字/音效/震屏 → 改为 emit `enemy:killed`，掉落属于领域、音效飘字属于订阅者 |
| 状态与控制分离 | `Game` 30 个字段抽成 `GameState`（纯数据），控制器只改状态 |
| 依赖注入 | 实体构造时传入 `world`（提供 grid/query/emit），不再摸全局 |
| 固定步长 | 更新（60Hz 逻辑）与渲染解耦，掉帧不影响手感 |

### 2.2 分四步渐进（每步之后游戏都可直接玩）

1. **抽事件总线 + 存档/音频出领域**（1 天）：`EventBus` ~30 行；`killEnemy/onLevelUp` 改发事件；audio/storage 变订阅者。收益：逻辑层不再摸 Sfx/localStorage。
2. **拆 Game**（2~3 天）：`GameState`（数据）、`WaveDirector`、`ShopController`、`StateMachine` 各归各位；`main.js` 只剩 loop + 装配。
3. **拆渲染**（2 天）：8 个 draw 方法移入 `render/`，渲染器只读 `GameState`；逻辑层从此可在 Node 无头跑完整战斗（现有测试不再需要 Proxy 打桩）。
4. **ES Modules 化**（0.5 天）：`<script type="module">` + import/export；代价是必须走本地服务器（失去双击打开），可用构建工具（Vite）顺带解决——见 2.3。

> 2.3 可选增强：**TypeScript + Vite**。`data.js` 的武器/技能/道具配置是这套游戏最值钱的数据，上类型后（如 `WeaponKind = 'gun'|'shotgun'|...`）配置错误在编译期报错；Vite 顺带给 HMR 与打包。

## 三、换游戏引擎的方案对比

### 3.1 网页系（迁移成本低，保留现有资产与思路）

| 方案 | 是什么 | 优势 | 代价 | 适合 |
|---|---|---|---|---|
| **A. Phaser 3/4** | 最流行的 HTML5 2D 引擎 | 场景管理、Arcade 物理碰撞、粒子、补间、输入、摄像机全内置；社区最大 | 需按 Scene 重写（~2-3 周量级）；框架约定较多 | **想继续做网页 2D 游戏的默认选择** |
| **B. PixiJS（渲染库）+ 自研架构** | 只替换渲染层为 WebGL | 数百精灵自动合批，性能优于裸 canvas；架构改造（第二节）照旧生效；迁移最小（~2-3 天） | 没有物理/场景/音频，仍自己写 | 想保留架构控制权、只要更强渲染 |
| **C. TypeScript + Vite + (B 或 A)** | 现代工程化组合 | 类型安全、HMR、单文件打包发布 | 引入构建步骤 | 团队开发 / 长期维护 |

### 3.2 引擎系（换技术栈，走向多平台）

| 方案 | 语言 | 优势 | 代价 | 适合 |
|---|---|---|---|---|
| **D. Godot 4** | GDScript/C# | 免费开源、编辑器完善、2D 特性强（瓦片/光照/着色器）、一套代码导出 Web/Windows/Mac/手机 | Web 导出体积 ~30-50MB；学习曲线 | **认真做一个可上桌面/商店的版本** |
| **E. Unity** | C# | 行业标准、生态/资产商店最大、主机/移动端发布成熟 | 2D 灵活性不如 Godot 直接、Web 导出重、个人项目偏重 | 团队开发、商业化、多平台发行 |
| **F. Defold** | Lua | 极轻量（Web 导出 ~2MB）、官方维护、适合 2D | 生态较小 | 网页为主 + 想要引擎 |
| **G. Construct 3 / GDevelop** | 可视化 | 几乎零代码、浏览器内开发、出原型极快 | 复杂逻辑（我们这套技能/合成系统）会绕远 | 非程序员快速验证玩法 |

### 3.3 针对本项目的建议

- **只解决卡顿/维护性，玩法继续迭代** → 留在原生 JS，做第二节重构；渲染瓶颈出现时加 **PixiJS**（方案 B）。这是投入产出比最高的一条路。
- **觉得这个玩法值得做成正式产品** → **Phaser**（方案 A/C）重写：现有 `data.js` 配置、素材、数值全部平移，逻辑结构按第二节分层在 Phaser Scene 里重实现。
- **想上 Steam/手机商店、要编辑器和动画工具** → **Godot 4**（方案 D）：像素游戏是其舒适区，本项目数据驱动的配置思路在 Godot 里用 Resource 承接。

## 四、决策树

```
是否继续以网页为主要平台？
├─ 是 → 是否需要引擎级功能（物理/瓦片/补间）？
│       ├─ 否 → 原生 JS 分层重构（第二节），渲染可选 PixiJS   ← 推荐的第一步
│       └─ 是 → Phaser（+TS/Vite）
└─ 否（要上商店/多平台）
    ├─ 个人/小团队、2D → Godot 4
    ├─ 团队/商业/主机 → Unity
    └─ 极致轻量网页导出 → Defold
```
