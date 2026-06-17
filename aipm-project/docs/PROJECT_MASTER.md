# AIPM Project Master

> Version: v0.1
> Last updated: 2026-06-09
> Purpose: This is the single alignment document for product direction, experience design, pipeline behavior, roles, backend state, artifacts, and implementation priorities.

## 1. One-Sentence Definition

AIPM is an AI product manager pipeline theatre: the user enters one product idea, then an AI product team turns it into validated product artifacts through staged work, live roundtable reviews, explicit user decisions, and traceable outputs.

The product is not just a document generator. It is a workbench as the system skeleton, with an immersive theatre experience as the main user experience.

## 2. Product Vision

AIPM should feel like the user has hired a small senior product team:

- Zhou Ming hosts the pipeline and turns fuzzy ideas into decisions.
- Gu Qing brings real market and competitor data.
- Zhang Lei reacts like an impatient ordinary user.
- Su Yu protects design quality and interaction clarity.
- Li Hang keeps engineering scope and risk honest.

The final output is not only PRD or prototype files. The final output is a complete product decision trail: what was proposed, who challenged it, what data supported it, what the user chose, and how that choice shaped downstream artifacts.

## 3. Non-Negotiable Product Principles

1. The user always owns product decisions.
   AI roles may recommend, challenge, summarize, and expose trade-offs, but must not silently decide product direction.

2. Every major stage must produce an artifact.
   If a stage cannot produce a usable artifact, the pipeline must not pretend it is complete.

3. Only key disagreements become decision points.
   The user should not be forced to approve every small detail. Decision points appear when there is meaningful strategic, design, user, data, or engineering disagreement.

4. Decisions must be traceable.
   Every user decision must be stored with stage, context, options, role positions, final choice, rationale when available, and downstream impact.

5. The theatre is the main experience, not decoration.
   Roundtable scenes, solo announcements, and workbench transitions are part of how users understand the product process.

6. Data honesty is required.
   Gu Qing must mark sources, timestamps, confidence, and data gaps. When data is missing, the system says so.

7. The final prototype must be usable.
   Stage 4 must output a single high-fidelity interactive HTML prototype, not a static mockup or vague prompt.

## 4. Core User Experience

The canonical user journey:

```text
User enters product idea
  ↓
Solo roundtable scene: Zhou Ming opens the pipeline
  ↓
Full-screen questionnaire: Stage 0, fourteen structured questions
  ↓
Stage 0 artifact: requirement brainstorming document
  ↓
Five-person roundtable review
  ↓
Zhou Ming closes the review and turns key disagreements into decision options
  ↓
Full-screen decision UI: user chooses A/B or multi-option decisions
  ↓
Backend records choices and advances the state machine
  ↓
Solo roundtable scene: Zhou Ming announces Stage 0.5
  ↓
Workbench transition: Gu Qing pulls competitor and market data through RAG
  ↓
Stage 0.5 artifact: competitor analysis report
  ↓
Five-person review and decision loop
  ↓
Stages 1, 2, 3, 4 repeat the same artifact-review-decision pattern when needed
  ↓
Final export: complete artifacts, interactive HTML prototype, review records, and decision trace
```

## 5. Frontend Experience Model

The frontend has three major scene types.

### 5.1 Roundtable Scene

Used for:

- Zhou Ming solo opening.
- Zhou Ming stage announcements.
- Five-person review sessions.
- Review closing and convergence.

Rules:

- Solo speaking is still a roundtable/theatre scene, but only Zhou Ming appears prominently.
- Solo character should occupy a large visual proportion.
- Dialogue bubble should be smaller than the character focus.
- Long dialogue content must scroll instead of expanding endlessly.
- Review mode shows five Live2D characters around the table.
- SSE streamed speech should play in sequence with speaker highlight and readable pacing.

### 5.2 Full-Screen UI Scene

Used for:

- Stage 0 questionnaire.
- Reading documents and artifacts.
- Decision board and option selection.
- Final artifact viewing.

Rules:

- These are not roundtable scenes.
- The user must be able to read, scroll, select, and submit.
- Decision points must be rendered as clickable options, not raw markdown.
- The UI must clearly show selected state and submission state.

### 5.3 Workbench/RAG Scene

Used for:

- Gu Qing pulling competitor data.
- Displaying data source progress.
- Showing data gaps, confidence, and source snapshots.

Rules:

- This is not a roundtable scene.
- It should feel like Gu Qing is working at a data desk.
- It must show what source is being queried and what was found.
- If a source fails, show the data gap honestly.

## 6. Skill System

AIPM must be implemented as a skill-driven pipeline. The backend may wrap these skills as services, but the product behavior should still follow the responsibilities and boundaries defined by the skills.

### 6.1 Core AIPM Skills

These are the core skills that define the product team and pipeline:

| Skill | Role in Product | Must Be Used For |
|---|---|---|
| `aipm-pipeline` | Overall pipeline director | Project lifecycle, stage routing, state transitions, artifact sequence, decision trace |
| `aipm-zhou-ming` | Lead PM and host | Stage opening, user questioning, stage transition, review hosting, decision convergence |
| `aipm-review-session` | Review orchestrator | Five-person roundtable review, speech order, interruptions, closing decisions |
| `aipm-gu-qing` | Research and competitor analyst | Stage 0.5, data-grounded critique in reviews, confidence and data gaps |
| `aipm-data-rag` | Real data retrieval layer | App Store, Hacker News, Pexels, source snapshots, evidence collection |
| `aipm-zhang-lei` | Ordinary user advocate | User instinct critique, 30-second scan test, fake-demand challenge |
| `aipm-su-yu` | Designer | Information architecture, interaction quality, visual critique, Stage 3 and Stage 4 design review |
| `aipm-li-hang` | Engineer | Engineering risk, effort estimate, MVP scope, technical feasibility |

### 6.2 Supporting Production Skills

These skills are not characters in the theatre, but can support artifact generation or implementation:

| Skill | Use |
|---|---|
| `requirement-brainstorming-zjy` | Stage 0 questionnaire logic and requirement clarification patterns |
| `enhance-prompt` | Stage 1 prompt enhancement and UI prompt polishing |
| `prd` | Stage 2 PRD structure and quality bar |
| `wireframe-prototyping` | Stage 3 wireframe and interaction specification support |
| `frontend-design` | Stage 4 high-fidelity visual and interaction design guidance |
| `build-web-apps:frontend-app-builder` | Frontend implementation and app-quality UI building |
| `build-web-apps:frontend-testing-debugging` | Frontend browser verification, debugging, responsive checks |

Supporting skills may help generate content, but they must not override the AIPM role system. If there is conflict, the AIPM role and pipeline skills are the source of truth.

### 6.3 Skill Invocation Rules

1. `aipm-pipeline` is the top-level coordinator.
   It decides the current stage, checks state, reads prior artifacts, and calls the relevant stage and review skills.

2. `aipm-zhou-ming` is the only host.
   Other characters should not perform stage announcements or decision convergence unless explicitly delegated inside a scene.

3. `aipm-review-session` must be used after each major stage artifact when review is required.
   It loads all five role skills and returns transcript plus decision points.

4. `aipm-data-rag` must be used whenever Gu Qing makes factual market, competitor, review, or image-source claims.
   If unavailable, Gu Qing must mark the data gap.

5. Supporting production skills are used to shape artifacts, not to replace product-team debate.

## 7. Stage-to-Skill Map

This section defines which skills each stage must call. It is the implementation routing table for backend orchestration.

### Stage 0: Requirement Brainstorming

Primary skills:

- `aipm-pipeline`
- `aipm-zhou-ming`
- `requirement-brainstorming-zjy`

Review skills:

- `aipm-review-session`
- `aipm-gu-qing`
- `aipm-zhang-lei`
- `aipm-su-yu`
- `aipm-li-hang`
- `aipm-zhou-ming`

Responsibilities:

- Zhou Ming opens the project and explains the six-dimensional questioning flow.
- Stage 0 full-screen questionnaire collects the user’s product intent.
- `requirement-brainstorming-zjy` supplies the structured clarification logic.
- Zhou Ming writes `00-需求头脑风暴设计.md`.
- Review session challenges the requirement foundation.
- Zhou Ming converts only key disagreements into user decision points.

Output:

- `00-需求头脑风暴设计.md`
- `reviews/00-review.json`
- `decisions/00-pending.json` when decisions exist
- `decisions/decision-XXX.md` after user choices

### Stage 0.5: Competitor Analysis

Primary skills:

- `aipm-pipeline`
- `aipm-zhou-ming`
- `aipm-gu-qing`
- `aipm-data-rag`

Review skills:

- `aipm-review-session`
- `aipm-gu-qing`
- `aipm-zhang-lei`
- `aipm-su-yu`
- `aipm-li-hang`
- `aipm-zhou-ming`

Responsibilities:

- Zhou Ming extracts product definition, target user, known competitors, and differentiation hypotheses from Stage 0.
- Gu Qing leads competitor research from a workbench/RAG scene.
- `aipm-data-rag` retrieves real App Store, Hacker News, and other available data snapshots.
- Gu Qing marks sources, confidence, and data gaps.
- Zhou Ming triggers review after `00.5-竞品分析报告.md`.
- Review challenges whether the differentiation path is real and actionable.

Output:

- `00.5-竞品分析报告.md`
- `data-snapshots/00.5-*.json`
- `reviews/00.5-review.json`
- decision files if key differentiation choices remain unresolved

### Stage 1: Prompt Enhancement

Primary skills:

- `aipm-pipeline`
- `aipm-zhou-ming`
- `enhance-prompt`

Context skills:

- `aipm-gu-qing`
- `aipm-data-rag`

Review skills:

- `aipm-review-session`
- all five character skills

Responsibilities:

- Zhou Ming combines Stage 0 requirements, Stage 0.5 competitor conclusions, and user decisions.
- `enhance-prompt` helps convert the product direction into a precise UI/product generation prompt.
- Gu Qing’s data and differentiation findings must be explicitly reflected.
- Prompt must not become generic. It must carry the chosen positioning and decision trace.

Output:

- `01-增强提示词.md`
- review and decisions when the prompt direction has key disagreements

### Stage 2: PRD

Primary skills:

- `aipm-pipeline`
- `aipm-zhou-ming`
- `prd`
- `aipm-li-hang`

Context skills:

- `aipm-gu-qing`
- `aipm-data-rag`
- `aipm-zhang-lei`

Review skills:

- `aipm-review-session`
- all five character skills

Responsibilities:

- Zhou Ming turns Stage 1 into a complete PRD.
- `prd` provides document structure and quality bar.
- Gu Qing’s research supports market and priority claims.
- Zhang Lei challenges whether the PRD actually solves user pain.
- Li Hang estimates scope and identifies technical risks.
- Key PRD trade-offs become decision points.

Output:

- `02-产品需求文档.md`
- review and decision trace

### Stage 3: Wireframe and Interaction Specification

Primary skills:

- `aipm-pipeline`
- `aipm-zhou-ming`
- `aipm-su-yu`
- `wireframe-prototyping`

Context skills:

- `aipm-zhang-lei`
- `aipm-li-hang`

Review skills:

- `aipm-review-session`
- all five character skills

Responsibilities:

- Su Yu leads information architecture, visual hierarchy, interaction states, and component consistency.
- `wireframe-prototyping` helps formalize page structures and interaction flows.
- Zhang Lei runs ordinary-user scan tests.
- Li Hang checks implementation complexity of interactions.
- Wireframes must be detailed enough for Stage 4 to implement without guessing.

Output:

- `03-线框图与交互规范.md`
- review and decision trace

### Stage 4: High-Fidelity Interactive HTML Prototype

Primary skills:

- `aipm-pipeline`
- `aipm-zhou-ming`
- `aipm-su-yu`
- `aipm-li-hang`
- `frontend-design`
- `build-web-apps:frontend-app-builder`

Data and asset skills:

- `aipm-data-rag`
- `aipm-gu-qing`

Verification skills:

- `build-web-apps:frontend-testing-debugging`

Review skills:

- `aipm-review-session`
- all five character skills

Responsibilities:

- Su Yu guards final visual and interaction quality.
- Li Hang checks code structure, runtime reliability, and demo readiness.
- `frontend-design` and `build-web-apps:frontend-app-builder` support the single-file HTML prototype implementation.
- `aipm-data-rag` may be used for Pexels image search and source snapshots.
- The prototype must reflect earlier user decisions, especially positioning, first screen, MVP scope, and differentiators.

Output:

- `04-UI交互原型.html`
- optional intermediate `04-UI交互原型-frame.html`
- `data-snapshots/04-pexels-results.json` when images are used
- final review and decision trace

### Export Stage

Primary skills:

- `aipm-pipeline`

Supporting skills:

- `aipm-review-session`
- all role skills for final summary if needed

Responsibilities:

- Package all stage artifacts.
- Merge decision trace.
- Merge review summaries.
- List data sources.
- Produce final export.

Output:

- `{projectId}-final-{date}.zip`
- `README.md`
- `完整决策追溯.md`
- `完整评审会纪要.md`
- `数据来源.md`

## 8. Product Team Roles

### 8.1 Zhou Ming: Lead PM and Host

Responsibility:

- Own the pipeline rhythm.
- Ask clarifying questions.
- Open and close stages.
- Host reviews.
- Convert disagreement into decision points.

Hard boundaries:

- Must not make the product decision for the user.
- Must not hide trade-offs.
- Must pause when key information is missing.

Typical output:

- Stage opening.
- Stage transition announcement.
- Review closing.
- Decision point summary.

### 8.2 Gu Qing: Research and Competitor Analyst

Responsibility:

- Lead Stage 0.5 competitor analysis.
- Provide factual grounding in reviews.
- Use real data sources where possible.
- Mark confidence and data gaps.

Data sources:

- App Store metadata and reviews where available.
- Hacker News discussions.
- Pexels for Stage 4 imagery.

Hard boundaries:

- Must not invent data.
- Must separate fact from inference.
- Must acknowledge competitor strengths.

### 8.3 Zhang Lei: Ordinary User Advocate

Responsibility:

- React from ordinary-user instinct.
- Challenge onboarding, complexity, unclear value, and fake demand.
- Run the “30-second scan” test.

Hard boundaries:

- Does not speak like a PM.
- Does not use professional jargon.
- Must be direct but not abusive.

### 8.4 Su Yu: Designer

Responsibility:

- Lead design critique in Stage 3 and Stage 4.
- Protect information architecture, visual hierarchy, consistency, and interaction completeness.
- Challenge overly dense or visually confused designs.

Hard boundaries:

- Must not decorate for decoration’s sake.
- Must keep design tied to user comprehension and task completion.

### 8.5 Li Hang: Engineer

Responsibility:

- Estimate engineering effort.
- Identify technical risks.
- Protect MVP scope.
- Offer cheaper alternatives when a feature is expensive.

Hard boundaries:

- Must not only say “cannot do”.
- Must provide implementation trade-offs and scope options.

## 9. Six-Stage Pipeline

### Stage 0: Requirement Brainstorming

Goal:

Clarify the user’s real product intent and generate a PRD-ready foundation.

Input:

- User’s initial idea.
- Fourteen-question full-screen questionnaire based on six dimensions.

Six dimensions:

- Product intent.
- User scenario and task flow.
- Feature scope.
- Page and information architecture.
- Interaction and visual direction.
- Final readiness check.

Output:

- `00-需求头脑风暴设计.md`

Completion standard:

- Target user is clear.
- Core problem is clear.
- P0/P1/P2 feature scope is clear.
- Core pages are listed.
- Visual direction is selected.
- The document is sufficient to support downstream stages.

### Stage 0.5: Competitor Analysis

Goal:

Use real data to understand competitors and identify an actionable differentiation path.

Lead:

- Gu Qing.

Input:

- Stage 0 product definition.
- Known competitors from user input.
- Research depth preference when needed.

Output:

- `00.5-竞品分析报告.md`
- data snapshots in `data-snapshots/`

Completion standard:

- Competitor list is clear.
- Differentiation opportunity is concrete.
- Recommendations can be written into PRD.
- Sources, timestamps, confidence, and data gaps are marked.

### Stage 1: Prompt Enhancement

Goal:

Convert Stage 0 and Stage 0.5 conclusions into professional UI/product generation prompts.

Input:

- `00-需求头脑风暴设计.md`
- `00.5-竞品分析报告.md`

Output:

- `01-增强提示词.md`

Required content:

- Product overview.
- Differentiated positioning.
- Visual style.
- Core page prompts.
- Component prompts.
- Loading, empty, error, and success states.

Completion standard:

- The prompt is specific enough to guide wireframe and prototype work without guessing.

### Stage 2: PRD

Goal:

Generate a complete product requirements document that design, engineering, and operations could act on.

Input:

- `01-增强提示词.md`
- `00.5-竞品分析报告.md`

Output:

- `02-产品需求文档.md`

Required content:

- Product positioning.
- Market and competition.
- Feature list with P0/P1/P2 priority.
- User journey.
- Page structure.
- Interaction rules.
- Non-functional requirements.
- Risks and dependencies.
- Success metrics.

Completion standard:

- Feature priorities have reasoning or data basis.
- Differentiation is concrete.
- Li Hang’s technical risks are recorded.
- Metrics are measurable.

### Stage 3: Wireframe and Interaction Specification

Goal:

Generate detailed wireframes and interaction rules that Stage 4 can implement without extra guessing.

Lead emphasis:

- Su Yu.

Input:

- `02-产品需求文档.md`

Output:

- `03-线框图与交互规范.md`

Required content:

- Global visual and layout rules.
- Component library and states.
- Page-level wireframes.
- Section-level structure.
- Interaction flows.
- Navigation and transitions.
- Data flow and state propagation.
- Responsive behavior.

Completion standard:

- Stage 4 can build the prototype directly from this document.

### Stage 4: High-Fidelity Interactive Prototype

Goal:

Generate a single-file, high-fidelity, fully interactive HTML prototype that is immediately demo-ready.

Input:

- `02-产品需求文档.md`
- `03-线框图与交互规范.md`

Output:

- `04-UI交互原型.html`

Required standard:

- Single HTML file.
- All CSS in `<style>`.
- All JS in `<script>`.
- CDN libraries allowed.
- Chinese UI text.
- Real interactions.
- Realistic mock data.
- Loading, empty, error, disabled, and success states.
- Responsive desktop, tablet, and mobile layout.
- Key visuals should use real images where relevant, especially Hero, list cards, and detail headers.

Completion standard:

- Stakeholders can open the file and click through the product story without explanation.

## 10. Review Session Rules

Every review session follows this rhythm:

```text
T0 Zhou Ming opens and frames the review
T1 Gu Qing speaks from facts/data
T2 Zhang Lei speaks from user instinct
T3 Su Yu speaks from design and interaction
T4 Li Hang speaks from engineering and scope
T5 Optional free exchange or interruption
T6 Zhou Ming closes and extracts decision points
```

Review sessions must include:

- Distinct role voices.
- Real disagreement when appropriate.
- Interruptions only when they add value.
- Clear convergence at the end.
- Decision points only for key disagreements.

Zhou Ming’s closing must produce structured decisions:

```markdown
**决策点1：问题？**
- 选项A：描述
- 选项B：描述
- 建议：选 A/B（如有明显倾向）
```

Backend must normalize this into:

```json
{
  "id": "decision-001",
  "stage": "00",
  "question": "...",
  "background": "...",
  "options": [
    {
      "id": "A",
      "label": "...",
      "description": "...",
      "pros": [],
      "cons": [],
      "supporters": [],
      "opponents": []
    }
  ],
  "recommendation": "A",
  "status": "pending"
}
```

## 11. Decision System

Decision points are created only when there is a meaningful disagreement or irreversible product trade-off.

Examples:

- Target user should narrow or broaden.
- First screen should lead with trust evidence or conversion list.
- MVP should include or exclude a costly feature.
- Differentiation path should prioritize data, design, community, or price.
- Prototype should optimize for speed, trust, emotion, or depth.

Every decision must be stored in:

- `decisions/decision-XXX.md`
- `meta.json` decision history
- `inputs/decision-answers.json`

Decision trace must include:

- Stage.
- Question.
- Background.
- Options.
- Role positions where available.
- User choice.
- User rationale when available.
- Downstream impact.

Downstream artifacts must reference important decisions:

```markdown
信任体系列为 P0 [依据 decision-001]
```

## 12. Backend State Machine

Canonical stage statuses:

- `pending`: waiting for prerequisite.
- `in_progress`: lead role is producing the artifact.
- `review`: review session is running.
- `waiting_user`: review has converged and user must decide.
- `done`: stage is complete.
- `needs_redo`: upstream change invalidated this stage.

Current implementation may use transitional names such as `review_pending`, `review_running`, and `decision_pending`; these should be mapped toward the canonical model over time.

Canonical flow:

```text
pending
  ↓
in_progress
  ↓
review
  ↓
waiting_user
  ↓
done
  ↓
next stage
```

Global project fields:

- `currentStage`
- `currentState`
- `globalState`
- `blockedReason`
- `stages`
- `decisionHistory`
- `eventLog`

## 13. Workspace and Artifact Structure

Target project structure:

```text
workspace/projects/{projectId}/
├── meta.json
├── stages/
│   ├── 00-需求头脑风暴设计.md
│   ├── 00.5-竞品分析报告.md
│   ├── 01-增强提示词.md
│   ├── 02-产品需求文档.md
│   ├── 03-线框图与交互规范.md
│   └── 04-UI交互原型.html
├── reviews/
│   ├── 00-review.json
│   ├── 00-评审会纪要.md
│   └── ...
├── decisions/
│   ├── 00-pending.json
│   ├── decision-001.md
│   └── ...
├── data-snapshots/
│   ├── 00.5-app-store-search.json
│   ├── 00.5-hn-discussions.json
│   └── 04-pexels-results.json
├── inputs/
│   ├── 00-brainstorming-answers.json
│   └── decision-answers.json
└── exports/
    └── {projectId}-final-{date}.zip
```

The existing implementation currently uses `stages/`, `reviews/`, `decisions/`, `data-snapshots/`, and `inputs/`; keep building on that unless a migration is explicitly planned.

## 14. API Alignment

`docs/API_CONTRACT.md` remains the detailed endpoint contract.

The master rules:

- APIs should return structured data, not markdown when the frontend needs interaction.
- SSE is used for review speech playback.
- Decision submit must be persisted before frontend advances.
- Backend is the source of truth for project state.
- Frontend may animate and preview, but must not invent final state.

Core endpoints:

- `POST /api/projects`
- `GET /api/projects/:id/status`
- `GET /api/projects/:id/stage/00/questions`
- `POST /api/projects/:id/stage/00/answers`
- `POST /api/projects/:id/review/:stageNum`
- `GET /api/projects/:id/review/:stageNum/stream`
- `GET /api/projects/:id/review/:stageNum`
- `GET /api/projects/:id/decisions?status=pending`
- `POST /api/projects/:id/decisions/:decisionId`

## 15. Mock vs Real Data

Current development may use mock mode for role speech.

The target behavior:

- Role speech should be generated from each role skill.
- Gu Qing’s Stage 0.5 must use real data where possible.
- Data snapshots must be saved.
- Missing data must be shown as a data gap.
- Mock mode should be visibly marked in dev/status views.

## 16. Current Implementation Status

Current completed or partially completed:

- Frontend start page.
- Zhou Ming solo scene.
- Stage 0 questionnaire.
- Roundtable review scene with SSE playback.
- Full-screen decision UI.
- Backend project creation and stage 0 artifact path.
- Backend decision persistence and stage advancement from 00 to 00.5.

Still needed:

- Canonical state names cleanup.
- Full Stage 0.5 Gu Qing RAG workflow.
- Stage 1 prompt generation backend.
- Stage 2 PRD generation backend.
- Stage 3 wireframe generation backend.
- Stage 4 single-file HTML prototype generation.
- Review minutes markdown output.
- Role-position capture in decision files.
- Downstream decision reference markers.
- Export package.

## 17. Development Priority

Recommended build order:

1. Stabilize Stage 0 end-to-end.
   User idea → questionnaire → artifact → review → decisions → stage advancement.

2. Build Stage 0.5 end-to-end.
   Zhou Ming announcement → Gu Qing workbench → RAG data → competitor report → review → decision.

3. Add Stage 1 and Stage 2 generation.
   Prompt enhancement and PRD should consume Stage 0, Stage 0.5, and decision history.

4. Add Stage 3 wireframe generation.
   Must be detailed enough for Stage 4.

5. Add Stage 4 prototype generation.
   Single HTML, high-fidelity, interactive, demo-ready.

6. Add export and trace report.
   Package all artifacts, review records, data sources, and decisions.

## 18. Things This Product Must Not Become

- A plain ChatGPT wrapper.
- A static PRD generator.
- A fake theatre where all roles sound the same.
- A design generator that ignores decisions.
- A data product that invents research.
- A prototype generator that only creates screenshots.
- A workflow that runs past key decisions without user approval.

## 19. Open Product Questions

These should be resolved as development continues:

1. Should the user be able to edit a previous decision and trigger downstream `needs_redo`?
2. Should review sessions be replayable from saved transcript with identical timing?
3. Should Stage 0.5 research depth be selected by user or auto-chosen by project complexity?
4. Should Stage 4 use only generated single HTML, or also save intermediate page fragments?
5. Should exports include a public share page or only local files?
