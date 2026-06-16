---
name: video-to-html-prototype
description: Use when a user provides a product demo, screen recording, or UI walkthrough video and wants it reconstructed as an HTML prototype, especially when the work depends on extracting dense keyframes, identifying UI states, and translating timeline actions into front-end interactions.
---

# Video To HTML Prototype

## Overview

Turn a UI video into a clickable HTML prototype by first converting the timeline into dense keyframes and page states, then converting those states into a minimal front-end state machine.

Default output: a single HTML prototype with CSS and vanilla JavaScript unless the user explicitly wants a framework or multi-page split.

## When to Use

- The user gives a product demo video and asks to "还原原型", "做成 HTML", "照着这个录屏做页面", or similar
- The UI appears in multiple states across one recording: chat, dashboard, modal, calendar, tabs, etc.
- The recording is short enough to inspect manually, but too rich to rely on one or two screenshots
- You need a repeatable process for extracting denser keyframes instead of eyeballing a few frames

Do not use this when the user only wants a transcript, a motion study, or pixel-perfect video editing.

## Workflow

### 1. Establish the reconstruction target

Figure out which of these the user really wants:

- `single-page prototype`: preferred default for demos
- `multi-page prototype`: only when pages are independently important
- `visual shell only`: layout and fake content
- `demo-grade interaction`: layout plus basic state transitions, modal open/close, fake data flow

If the user does not specify, default to `single-page prototype` with `demo-grade interaction`.

### 2. Extract dense keyframes before coding

Do not start by writing HTML. First convert the video into inspectable stills.

Use a two-pass strategy:

1. `structural pass`
   - sample every `4s` to `6s`
   - goal: identify major views and rough sequence
2. `dense pass`
   - sample every `1.5s` to `2.5s`
   - add manual timestamps around transitions:
     - just before click
     - immediately after page switch
     - modal opening
     - tab switch
     - content added
     - empty state replaced

For short UI demos around `20s` to `60s`, a good default dense sequence is every `2s`, then add `+0.5s` offsets near important transitions.

Use the bundled scripts:

- `scripts/extract-video-frames.ps1`
  - reads duration and resolution
  - exports one or many frames
- `scripts/make-contact-sheet.py`
  - turns the extracted frames into one scannable sheet

### 3. Build a state map from the frames

For each major frame, write down:

- timestamp
- active page or panel
- visible navigation state
- major components on screen
- what changed from the previous frame
- likely interaction that caused the change

Typical output:

| Time | View | Change | Implied Interaction |
|---|---|---|---|
| 04s | Chat | initial welcome message | app opened |
| 10s | Calendar | weekly grid visible | sidebar switch |
| 26s | Skill store | listing cards visible | sidebar switch |
| 34s | Skill modal | detail overlay open | clicked a skill card |

The goal is not to describe every pixel. The goal is to recover the state machine behind the video.

### 4. Collapse the video into reusable UI states

Before implementation, reduce the recording into a small set of states:

- top-level views
- overlays
- transient feedback
- data mutations that matter in a demo

Examples:

- `view = chat | calendar | shop`
- `modalOpen = true | false`
- `weekOffset = -1 | 0 | +1`
- `skillAdded = true | false`
- `calendarCreated = true | false`

If a behavior can be modeled as state, model it. Do not hardcode separate pages for every frame.

### 5. Reconstruct the prototype

Implementation defaults:

- use one HTML file unless the user asked for a different delivery shape
- inline CSS and JS if speed and portability matter
- recreate the recorded views, then fill missing in-between states with reasonable demo logic

What should be copied closely:

- layout hierarchy
- panel proportions
- visible labels
- navigation order
- visual weight of each section
- the sequence of state changes

What may be inferred:

- placeholder content not fully legible in the video
- score updates
- empty-to-filled state logic
- assistant replies
- button feedback that the video implies but does not fully expose

### 6. Validate the prototype against the video

Check these in order:

- top-level views match the recording
- important transitions exist
- if the video opens a modal, the prototype opens a modal
- if the video shows a created item later, the prototype can produce that item
- there are no broken loops where the UI jumps to the wrong state

If a previous action changes future context, explicitly test that branch. Example: if the user switched weeks before creating a calendar item, creating the item should still land on the correct week.

## Bundled Scripts

### Extract frames

```powershell
powershell -STA -ExecutionPolicy Bypass -File .\scripts\extract-video-frames.ps1 `
  -VideoPath "C:\path\demo.mp4" `
  -OutputDir ".\analysis\frames" `
  -Seconds 2,4,6,8,10
```

### Read video info

```powershell
powershell -STA -ExecutionPolicy Bypass -File .\scripts\extract-video-frames.ps1 `
  -VideoPath "C:\path\demo.mp4" `
  -InfoOnly
```

### Build a contact sheet

```powershell
C:\Users\67423\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe `
  .\scripts\make-contact-sheet.py `
  --input-dir .\analysis\frames `
  --output .\analysis\contact-sheet.png
```

## Common Mistakes

- Starting from HTML before you know the real state sequence
- Sampling too sparsely and missing a modal, switch, or intermediate page
- Treating every screenshot as its own page instead of modeling shared state
- Copying only visuals and forgetting the interaction order
- Trusting one extracted frame when the video actually changes again half a second later

## Heuristics That Help

- If the video is under one minute, over-sample first and compress later
- Use dense frames to find states; use the final HTML to merge states
- Preserve what the viewer would notice first, not hidden implementation details
- When in doubt, prioritize demo completeness over backend realism
