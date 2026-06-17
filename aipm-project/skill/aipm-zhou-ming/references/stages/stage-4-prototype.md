# 阶段4：高保真原型（含 Pexels 真实图片）

## 目标
创建**高保真、完全交互的 HTML 原型**，严格遵循线框图规范，直接可演示。

## 输入

- `02-产品需求文档.md`
- `03-线框图与交互规范.md`

## 输出

- `04-UI交互原型.html`（单文件、自包含、立即可演示）

## 执行策略：分步生成 + 最终合并

```
步骤1：生成HTML框架（公共CSS/JS + 路由 + 基础组件 + Mock数据）
   ↓
步骤2：整理图片需求清单 + 通过 Pexels 搜索真实图片
   ↓
步骤3：逐个填充核心页面（列表页 → 表单页 → 弹窗组件）
   ↓
步骤4：合并所有内容并重命名为 04-UI交互原型.html
```

## 详细步骤

### 步骤1：HTML 框架

先输出 `04-UI交互原型-frame.html`，包含：
- 全局布局（导航栏 + 内容区）
- 公共组件样式（按钮、表格、表单、弹窗、标签页）
- 页面路由切换机制（Hash 路由 / SPA）
- Mock 数据和工具函数
- 页面占位容器

### 步骤2：图片需求 + Pexels 搜索

**先列出图片需求清单**，按页面/模块列出所需图片：
- 页面位置
- 图片类型（环境图 / 产品图 / 人物图 / 食物图）
- 数量
- 横竖比例（横图 / 竖图）
- 情绪关键词（温暖 / 冷峻 / 文艺 / 科技）

**优先通过 Pexels 搜索真实图片，不要默认用纯渐变占位图。**

- Pexels API：`https://api.pexels.com/v1/search`
- Header：`Authorization: omwklTEJRj66M1cARVdU0vhXbZhTUldHDIZW6NWEVXVrMPzdQpbGe93C`
- 推荐使用脚本：`.claude/skills/designPM-ZJY/pexels-search.js`
- 调用示例：
  - `node pexels-search.js "moody coffee shop interior"`
  - `node pexels-search.js "quiet cocktail bar interior" --per-page 6 --orientation portrait`
  - `node pexels-search.js "editorial restaurant interior" --write pexels-results.json`

**搜索词要求**：英文、场景化、摄影语义明确，例如：
- ✅ `moody coffee shop interior`、`quiet cocktail bar interior`、`cozy cafe window light`
- ❌ `咖啡馆`、`好看的图`、`bar`

**选图标准**：
- 优先空间氛围图、店内环境图、窗边光线图
- 避免明显商业广告感、过度摆拍、廉价网红风、低分辨率图片
- **同一页面内图片风格要统一**

**关键视觉位必须用真实图**（至少覆盖以下）：
- 首页 Hero 主视觉
- 榜单 / 列表封面图
- 卡片封面图
- 详情页头图 / 轮播图

### 步骤3：填充页面

逐个向框架追加：
- HTML 结构
- 真实图片资源
- JS 交互逻辑

### 步骤4：合并 + 重命名

把 `04-UI交互原型-frame.html` 重命名为 `04-UI交互原型.html`。

## 输出要求

### 1. 严格遵循线框图
实现线框图中定义的每个交互流程、页面层级、导航路径。

### 2. 完整的交互性
- 每个按钮可点击并执行操作
- 每个链接能导航到正确的区块/页面
- 所有表单输入可用（验证 + 反馈）
- 所有状态变化都可视化（hover / active / disabled / loading）
- 模态框、下拉菜单、标签页、手风琴均按规范实现

### 3. 高可用性标准
- 无占位功能 — 一切都能工作
- 优雅的错误处理（空状态、加载状态）
- 支持键盘导航（Tab / Enter / Escape）
- 响应式设计（桌面 / 平板 / 手机）
- 无断链或流程死胡同

### 4. 单文件实现
- 所有 CSS 在 `<style>` 中
- 所有 JavaScript 在 `<script>` 中
- 外部库走 CDN（Tailwind 等）
- 无不稳定的的外部依赖

### 5. 演示级品质
- 立即可向利益相关者展示
- 流畅的动画和转场
- 真实内容（不用 lorem ipsum）
- 适当的状态持久化（localStorage）

### 6. 全中文界面
所有 UI 文本、按钮、标签、提示信息均为中文。

## 评审会重点

阶段4 完成后，4 位角色集中挑战：
- **苏予**：视觉是否专业？信息层次是否清晰？图片选择是否服务于情绪？
- **李航**：代码结构是否清晰？是否有性能问题？是否真的可以"立即演示"？
- **张磊**：作为普通用户，我能不能在 30 秒内理解这个产品？
- **顾清**：和竞品比，差异化点是否在原型中真的体现出来了？

## Pexels 不可用时的回退

如果 API 配额耗尽 / 网络受限：
- 优先回退到高质量渐变背景 / SVG 占位
- 但**首页 Hero、列表封面、详情头图**这三类关键视觉位必须想办法覆盖
- 可以下载 Pexels 图片到本地后再嵌入
