# 工作区结构与文件命名规范

## 顶层结构

```
workspace/
└── projects/
    ├── [项目1]/
    ├── [项目2]/
    └── _archive/        # 归档项目（用户主动归档的）
        └── [旧项目]/
```

## 单项目结构

```
[项目名]/
├── meta.json                       # 项目元数据（必有）
│
├── stage-artifacts/                # 各阶段产物（用扁平结构便于浏览）
│   ├── 00-需求头脑风暴设计.md
│   ├── 00.5-竞品分析报告.md
│   ├── 01-增强提示词.md
│   ├── 02-产品需求文档.md
│   ├── 03-线框图与交互规范.md
│   └── 04-UI交互原型.html
│
├── reviews/                        # 评审会纪要
│   ├── 00-评审会纪要.md
│   ├── 00.5-评审会纪要.md
│   ├── 01-评审会纪要.md
│   ├── 02-评审会纪要.md
│   ├── 03-评审会纪要.md
│   └── 04-评审会纪要.md
│
├── decisions/                      # 决策追溯
│   ├── decision-001.md
│   ├── decision-002.md
│   └── ...
│
├── data-snapshots/                 # 真实数据快照（顾清调用 RAG 后备份）
│   ├── 00.5-app-store-comments.json
│   ├── 00.5-zhihu-discussions.json
│   └── 04-pexels-results.json
│
├── intermediate/                   # 中间产物（可清理）
│   ├── 04-UI交互原型-frame.html
│   ├── 04-page1-fragment.html
│   └── ...
│
└── exports/                        # 用户导出的最终交付物
    ├── 大学生兼职App-final-2026-06-05.zip
    └── ...
```

## 文件命名规则

### 阶段产物
**格式：** `{阶段编号}-{中文名}.{扩展名}`

| 阶段 | 文件名 |
|------|--------|
| 0 | `00-需求头脑风暴设计.md` |
| 0.5 | `00.5-竞品分析报告.md` |
| 1 | `01-增强提示词.md` |
| 2 | `02-产品需求文档.md` |
| 3 | `03-线框图与交互规范.md` |
| 4 | `04-UI交互原型.html` |

**重做版本**：`{原文件名}.v{版本号}.md`，如 `00-需求头脑风暴设计.v2.md`

### 评审会纪要
**格式：** `{阶段编号}-评审会纪要.md`

### 决策点
**格式：** `decision-{3位编号}.md`，如 `decision-001.md`，全局递增、不分阶段。

### 数据快照
**格式：** `{阶段编号}-{数据源}.json`

| 数据源 | 文件名 |
|--------|--------|
| App Store | `00.5-app-store-comments.json` |
| 知乎 | `00.5-zhihu-discussions.json` |
| Reddit | `00.5-reddit-threads.json` |
| 小红书 | `00.5-xhs-notes.json`（如可用） |
| Pexels 图片 | `04-pexels-results.json` |

## 项目命名规则

```
- 中文名优先（用户友好）
- 不允许空格、特殊字符（用 - 或 _）
- 长度 2-30 字符
- 不区分大小写
```

**示例：**
- ✅ `大学生兼职App`
- ✅ `coffee-shop-finder`
- ✅ `理财助手_v2`
- ❌ `My Project`（含空格）
- ❌ `Project!@#`（特殊字符）

如果用户起名冲突，自动加序号：`大学生兼职App-2`。

## 自动归档规则

```
项目 30 天未更新 → 提示是否归档
项目 90 天未更新 → 自动归档到 _archive/
```

归档不删除文件，只移动目录。可通过 `/aipm-pipeline list --archived` 查看。

## 导出格式

`exports/[项目名]-final-{日期}.zip` 包含：

```
[项目名]-final/
├── README.md                       # 项目总览（自动生成）
├── 00-需求头脑风暴设计.md
├── 00.5-竞品分析报告.md
├── 01-增强提示词.md
├── 02-产品需求文档.md
├── 03-线框图与交互规范.md
├── 04-UI交互原型.html
├── 完整决策追溯.md                 # 所有 decision 合并成一份
├── 完整评审会纪要.md               # 所有评审会合并
└── 数据来源.md                     # 真实数据来源说明
```

## 路径常量

实现时统一使用以下常量（避免魔法字符串）：

```yaml
WORKSPACE_ROOT: workspace/
PROJECTS_DIR: workspace/projects/
ARCHIVE_DIR: workspace/projects/_archive/
META_FILE: meta.json
STAGES: ['00', '00.5', '01', '02', '03', '04']
```
