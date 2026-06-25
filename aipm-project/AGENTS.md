# 蒸馏分身，替我开会！Agent Handoff Guide

This file is the required first-read document for any AI coding agent working on this repository.

Read this before editing code:

1. `AGENTS.md`
2. `docs/PROJECT_MASTER.md`
3. The specific files related to the requested change

Do not redesign the project from scratch unless the user explicitly asks for a rewrite.

## Product Summary

蒸馏分身，替我开会！is an AI product manager pipeline theatre.

The user enters one product idea. A five-person AI product team turns it into product artifacts through staged work, theatre-style review meetings, explicit user decisions, and traceable outputs.

The workbench is the system skeleton. The theatre is the main experience.

## Core UX Model

There are three scene types.

Roundtable theatre:

- Zhou Ming solo opening and stage announcements.
- Five-person review sessions.
- Review closing and decision convergence.
- Solo mode still belongs to the theatre, but only Zhou Ming is prominent.
- Multi-person review mode shows five characters around the table.
- Long dialogue should scroll instead of growing endlessly.

Full-screen UI:

- Stage 0 chat/questionnaire.
- Artifact reading.
- Decision selection.
- Final review and export surfaces.
- Decision options must be clickable UI, not raw markdown.

Workbench/RAG:

- Gu Qing pulling competitor data.
- Source progress, confidence, and data gaps.
- This is not a roundtable scene.

## Pipeline Stages

The canonical flow is:

```text
Start idea
-> Zhou Ming solo theatre opening
-> Stage 00 requirement brainstorming
-> Stage 00 review
-> user decision board
-> Zhou Ming announces Stage 00.5
-> Gu Qing workbench/RAG competitor analysis
-> Stage 00.5 review
-> user decision board
-> Stage 01 prompt enhancement
-> Stage 02 PRD
-> Stage 03 wireframe and interaction spec
-> Stage 04 high-fidelity interactive HTML prototype
-> final export
```

Every major stage should produce an artifact before review.

## Skill Orchestration

The backend source of truth for stage-to-skill routing is:

`backend-pipeline/src/services/stage-orchestrator-service.js`

All services must call `stageOrchestratorService.buildSystemPrompt(stage, instruction)` or `stageOrchestratorService.loadStageSkills(stage)` to get skill content. Do not call `loadSkill()` or `loadSkillWithRef()` directly from routes or services — those are internal helpers for the orchestrator and skill-loader only.

Skill loading has a per-skill 5-second timeout. Missing skills are logged as `(missing)` and generation continues with whatever skills loaded successfully.

Current required skill map:

| Stage | Skills |
|---|---|
| `00` | `aipm-pipeline`, `aipm-zhou-ming`, `requirement-brainstorming-zjy` |
| `00.5` | `aipm-pipeline`, `aipm-zhou-ming`, `aipm-gu-qing`, `aipm-data-rag`, `competitors-zjy` |
| `01` | `aipm-pipeline`, `aipm-zhou-ming`, `aipm-gu-qing`, `enhance-prompt` |
| `02` | `aipm-pipeline`, `aipm-zhou-ming`, `aipm-gu-qing`, `aipm-zhang-lei`, `aipm-li-hang`, `prd` |
| `03` | `aipm-pipeline`, `aipm-su-yu`, `aipm-zhang-lei`, `aipm-li-hang`, `wireframe-prototyping` |
| `04` | `aipm-pipeline`, `aipm-su-yu`, `aipm-li-hang`, `aipm-gu-qing`, `frontend-design` |
| `review` | `aipm-review-session`, all five role skills |

Do not hard-code new skill combinations inside random services. Add or change the matrix in `stage-orchestrator-service.js`, then consume it from services.

## Character Rules

Zhou Ming:

- Lead PM and host.
- Owns stage opening, requirement questioning, review convergence, and decision framing.
- Should not silently decide product direction for the user.

Gu Qing:

- Research and competitor analyst.
- Must mark source, confidence, and data gaps.
- Stage `00.5` is her main stage.

Zhang Lei:

- Ordinary user advocate.
- Challenges fake demand and unclear value.

Su Yu:

- Designer.
- Challenges information architecture, visual hierarchy, interaction completeness, and prototype quality.

Li Hang:

- Engineer.
- Challenges feasibility, scope, risk, and implementation cost.

## Important Current Implementation

Backend:

- Main service: `backend-pipeline`
- Server entry: `backend-pipeline/src/server.js`
- Port: `3000`
- Health check: `http://localhost:3000/api/health`
- Stage routes: `backend-pipeline/src/routes/stages.js`
- Review routes: `backend-pipeline/src/routes/reviews.js`
- Decision routes: `backend-pipeline/src/routes/decisions.js`
- Project workspace: `workspace/projects/{projectId}`

Frontend:

- Static frontend served at `/app/`
- Start page: `frontend/start.html`
- Stage 0 chat: `frontend/stage0.html`
- Theatre: `frontend/theatre.html`
- Stage 0.5 workbench: `frontend/stage05.html`
- Status/workbench: `frontend/status.html`
- Decisions: `frontend/decisions.html`

Important current behavior:

- `USE_MOCK=false` is expected in runtime.
- Claude/Anthropic API may currently return `401 invalid x-api-key`.
- Because of that, Stage 00 chat and Stage 00 document generation have fallback behavior.
- Do not remove fallback behavior unless the user explicitly asks. It keeps the pipeline testable when external API calls fail.

## Stage 00 Details

Stage 00 uses a guided chat interface instead of a questionnaire form.

The flow is:

1. User opens `frontend/stage0.html`.
2. Zhou Ming types an opening question (client-side animation, no backend call).
3. User replies in the chat textarea.
4. Each reply calls `POST /api/projects/:id/stage/00/chat` (SSE stream).
5. Backend uses `stageOrchestratorService.buildSystemPrompt('00', ...)` to load all Stage 00 skills.
6. Zhou Ming streams a reply back character by character.
7. After 5+ turns the "生成需求文档" button appears.
8. Clicking it calls `POST /api/projects/:id/stage/00/chat/finish` with the full history.
9. Backend calls `brainstormingService.generateArtifactFromConversation()` which uses the Stage 00 skill orchestration and has a Claude fallback artifact.
10. On success, frontend redirects to `theatre.html?mode=review&project=...&stage=00`.

The finish call has a 60-second client-side timeout. If it fires, the user sees a retry prompt.

The chat endpoint has a fallback reply (`buildStage00FallbackReply`) if Claude fails, so the bubble is never empty.

## Stage 00.5 Details

Stage `00.5` output is a competitor analysis report.

Required skill combination:

- `aipm-pipeline`
- `aipm-zhou-ming`
- `aipm-gu-qing`
- `aipm-data-rag`
- `competitors-zjy`

The report should include source honesty, confidence, data gaps, competitor matrix, differentiation opportunities, and actionable product implications.

## Review Session Details

Real review orchestration is in `backend-pipeline/src/services/review-mock-service.js`.

Skills are loaded via `stageOrchestratorService.loadStageSkills('review')`, which uses the `review` plan in `stage-orchestrator-service.js` containing `aipm-review-session` plus all five role skills.

Review order:

```text
Gu Qing -> Zhang Lei -> Su Yu -> Li Hang -> Zhou Ming closes
```

The review stream (`GET /api/projects/:id/review/:stageNum/stream`) uses a streaming callback pattern. Each speech entry is sent to the frontend via SSE as soon as it is generated by Claude, not batched at the end. This prevents the frontend from appearing frozen during the 30-60 second generation time.

The stream has a 120-second server-side timeout. The frontend has a 30-second timeout before the first event; if nothing arrives it shows a retry prompt.

Zhou Ming closes by summarizing:

- consensus
- disagreements
- risks
- 2-4 user decision points when needed

If Claude fails at any point, the service falls back to `_runMock()` which produces scripted but contextually relevant speeches and decisions.

## State And Artifacts

Each project lives under:

`workspace/projects/{projectId}/`

Important files:

- `meta.json`
- `stages/*.md`
- `reviews/*-review.json`
- `decisions/*.md`
- `inputs/*.json`
- `data-snapshots/*.json`

Do not manually edit generated project workspaces unless the task specifically asks for data repair or debugging.

## Development Commands

Run backend (auto-kills old process on same port):

```powershell
cd C:\Users\zhangjinyao01_dxm\aipm-project\backend-pipeline
node start.js
```

The `start.js` wrapper checks if the port is in use, kills the old process, and starts fresh. Always use this instead of `node src/server.js` directly.

Health check:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health
```

Syntax checks:

```powershell
node --check backend-pipeline\src\server.js
node --check backend-pipeline\src\routes\stages.js
node --check backend-pipeline\src\services\stage-orchestrator-service.js
```

Restart local backend on port 3000:

```powershell
$ownerIds = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($ownerId in $ownerIds) { Stop-Process -Id $ownerId -Force }
Start-Process -FilePath node -ArgumentList 'src/server.js' -WorkingDirectory 'C:\Users\zhangjinyao01_dxm\aipm-project\backend-pipeline' -WindowStyle Hidden
```

## Encoding Warning

Some older files may show mojibake in PowerShell output, while Node and browser still read UTF-8 correctly.

Do not rewrite large Chinese text blocks just to fix terminal display. Only fix encoding if it breaks runtime behavior or user-facing browser output.

Prefer small, scoped edits.

## Git And Collaboration Rules

This repository may be edited by Codex, Claude Code, Cursor, VS Code, or the user.

Before edits:

```powershell
git status --short --branch
```

Before switching AI tools:

```powershell
git add .
git commit -m "describe the completed change"
git push
```

Never commit secrets.

Must ignore:

- `.env`
- `backend-pipeline/.env`
- `node_modules/`
- generated project workspaces unless the user explicitly wants sample artifacts committed

## Do Not Break These

- Do not remove the theatre flow.
- Do not collapse everything into a plain document generator.
- Do not bypass user decision points.
- Do not remove data-gap honesty from Gu Qing.
- Do not make decision screens raw markdown.
- Do not let stage artifacts disappear when external APIs fail.
- Do not scatter new skill routing outside `stage-orchestrator-service.js`.
- Do not overwrite user changes or unrelated files.

## Timeout and Fallback Rules

These rules must not be removed. They keep the pipeline testable when Claude or skills are unavailable.

**Claude API calls** (`backend-pipeline/src/services/claude-service.js`):

- Default timeout: 50 seconds per call.
- If Claude fails or times out, callers must fall back to deterministic output, not crash.

**Skill loading** (`stage-orchestrator-service.js`):

- Each skill load has a 5-second timeout.
- Missing skills are marked `(missing)` in the system prompt but do not block generation.

**Review stream** (`backend-pipeline/src/routes/reviews.js`):

- Server-side timeout: 120 seconds for the full review session.
- Frontend timeout: 30 seconds before first SSE event (`frontend/js/theatre-controller.js`).
- If either fires, a user-visible error with retry prompt is shown.

**Stage 00 finish** (`frontend/stage0.html`):

- Client-side timeout: 60 seconds via AbortController.
- If it fires, the button re-enables with a "请重试" message.

**Decision ID deduplication** (`backend-pipeline/src/services/decision-service.js`):

- Decisions are keyed by `${stage}:${decisionId}`, not just `decisionId`.
- This prevents Stage 0 `decision-001` from hiding Stage 0.5 `decision-001`.

## Current Recommended Next Steps

1. Verify Stage 00 chat → document → review → decision transition end-to-end in browser.
2. Verify Stage 00.5 Gu Qing workbench with real RAG scripts (`skill/aipm-data-rag/scripts/`).
3. Verify Stage 01-04 artifact generation and review loop.
4. Integrate remaining missing skills: `competitors-zjy`, `requirement-brainstorming-zjy` (currently marked missing but do not block).
5. Implement export zip packaging (currently returns manifest JSON only).
6. Initialize Git and create `.gitignore` covering `.env`, `node_modules/`, and generated project workspaces.
