# 演示模式（Demo Mode）使用说明

## 用途
演示客户/同事时，让 AIPM 完整 SPA 流程跑得**稳定可控**——
不论用户在 `start.html` 输入什么项目名，都会按预设剧本走完整的度小满项目演示。
对用户完全透明（网站界面无任何痕迹）。

## 切换开关

| 操作 | 双击 |
|---|---|
| 开启演示 | `demo-on.bat` |
| 关闭演示（恢复真实流程） | `demo-off.bat` |

切换不需要重启后端，每个请求实时检查。

## 标记文件
开关靠 `.demo-mode` 文件存在与否：
- 文件存在 → 演示模式
- 文件不存在 → 真实模式

## 演示模式行为

| 接口 | 演示行为 |
|---|---|
| `POST /api/projects` | 不论用户输入什么项目名，都会**复制 `dxm-conversation-intel` 整个项目**到新项目目录，状态机重置为 stage 00 in_progress |
| `POST /api/projects/:id/stage/00/chat` | 周明按 7 段预设脚本回复（每段约 100-200 字，逐字流式输出） |
| `POST /api/projects/:id/stage/00/chat/finish` | 直接标记文档已生成（文件已预置） |
| `POST /api/projects/:id/stage/:n/run` | 直接标记产物已生成（文件已预置） |
| `POST /api/projects/:id/review/:n` | 触发评审会，从已预置 JSON 重放 |
| `GET .../review/:n/stream` | 按 transcript 顺序流式推送，每条间隔 1-2 秒 |
| `GET /api/projects/:id/decisions` | 返回预置决策点 |
| `POST /api/projects/:id/decisions/:id` | 接受任何选择都成功（决策追溯走真实持久化） |

## 用户视角

1. 打开 `http://localhost:3000/app/start.html`
2. 输入任意项目名（比如"演示123"）+ 任意想法
3. 点击"开始流水线"
4. 自动跳到 `stage0.html`，周明开始聊天
5. 用户回答 7 轮（任意内容都能推进），第 7 轮后出现"生成需求文档"按钮
6. 点击 → 跳到 `theatre.html`，五人评审会开始流式播放
7. 评审结束，跳到 `decisions.html`，3 个决策点拍板（任意选择）
8. 进入 stage 0.5、01、02、03、04，每阶段都有评审 + 决策（如果有）
9. 最终看到 stage 04 高保真原型

整个流程**与真实流程完全一致**，但内容固定为度小满那个高质量版本。

## 关闭演示后

- 已创建的演示项目会保留在 `workspace/projects/` 下
- 每个演示项目的 meta.json 中有 `_demoMode: true` 标记
- 关闭演示模式后，已存在的演示项目仍然按演示行为运行（避免半路切换坏掉）
- **真实模式只影响新创建的项目**

## 清理演示项目

```powershell
# 删除所有演示项目（保留 dxm-conversation-intel 这个源项目）
cd C:\Users\zhangjinyao01_dxm\aipm-project\workspace\projects
Get-ChildItem -Directory | Where-Object {
  $meta = Get-Content "$($_.FullName)\meta.json" -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
  $meta._demoMode -eq $true -and $meta.projectId -ne 'dxm-conversation-intel'
} | Remove-Item -Recurse -Force
```
