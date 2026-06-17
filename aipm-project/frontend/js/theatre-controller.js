/**
 * theatre-controller.js
 * 统一圆桌舞台控制器，根据 URL 参数切换三种模式：
 *   - solo:    单人发言（如周明开场，气泡可点击跳转）
 *   - review:  五人评审会（SSE 流式接收发言，全自动播放）
 *   - transition: 过渡场景（如顾清在工位拉数据，简化版动画）
 *
 * URL 参数：
 *   ?mode=solo&speaker=zhou-ming&message=xxx&next=stage0.html?project=X
 *   ?mode=review&project=X&stage=00
 *   ?mode=transition&speaker=gu-qing&message=xxx&next=...
 */

const API_BASE = (location.protocol === 'file:' ? 'http://localhost:3000' : location.origin) + '/api';

// 简化的 dataLoader（只用于角色配置，不加载文件）
const dataLoader_ = {
  getAllCharacters: () => Object.values(window.CHARACTERS),
  getCharacter: (id) => window.CHARACTERS[id],
};

(async function main() {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || 'solo';
  const speaker = params.get('speaker') || 'zhou-ming';
  const stageCharacter = getStageCharacter(mode, speaker);

  const loadingEl = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  const setLoading = (msg) => { loadingText.textContent = msg; };
  let live2d = null;
  let stageModelIds = [];
  const loadingWatchdog = setTimeout(() => {
    if (!loadingEl.classList.contains('hide')) {
      console.warn('⚠️ 初始化超时，强制进入文字降级场景');
      loadingEl.classList.add('hide');
      showFatalFallback(params, stageCharacter);
    }
  }, 20000);

  try {
    // === 通用初始化 ===
    setLoading('搭建舞台...');
    if (mode === 'review') {
      try {
        await ensureLive2dAssets();
        live2d = new Live2DLoader('live2d-canvas');
        window.live2dLoader = live2d; // 暴露给 stage-manager 用作 portrait
        await live2d.init();

        setLoading('召唤数字人...');
        await live2d.loadAllModels();
        stageModelIds = Object.keys(live2d.models || {});
        console.log('[theatre] ✅ Live2D 圆桌 5 人加载完成');
      } catch (live2dErr) {
        console.warn('⚠️ Live2D 初始化失败，进入无模型降级模式:', live2dErr);
        setLoading('切换到文字场景...');
        live2d = createLive2dFallback();
        window.live2dLoader = live2d;
      }
    } else {
      try {
        await ensureLive2dAssets();
        live2d = new Live2DLoader('live2d-canvas');
        window.live2dLoader = live2d;
        await live2d.init();
        setLoading('召唤数字人...');
        await live2d.loadModel(speaker, stageCharacter);
      } catch (live2dErr) {
        console.warn('⚠️ Solo Live2D 初始化失败:', live2dErr);
        live2d = createLive2dFallback();
        window.live2dLoader = live2d;
      }
    }

    const stage = new StageManager();
    if (mode === 'review') {
      stage.createCharacterElements(dataLoader_.getAllCharacters());
      stage.setModelAvailability(stageModelIds || []);
    } else {
    }

    const player = new DialoguePlayer();

    // 隐藏加载遮罩
    setTimeout(() => loadingEl.classList.add('hide'), 400);
    clearTimeout(loadingWatchdog);

    // === 根据模式分支 ===
    if (mode === 'solo') {
      await runSoloMode(params, live2d, stage, player);
    } else if (mode === 'review') {
      await runReviewMode(params, live2d, stage, player);
    } else if (mode === 'transition') {
      await runTransitionMode(params, live2d, stage, player);
    } else {
      throw new Error(`未知模式: ${mode}`);
    }
  } catch (err) {
    console.error('❌ 初始化失败:', err);
    setLoading(`❌ ${err.message}`);
    loadingEl.classList.add('hide');
    clearTimeout(loadingWatchdog);
    showFatalFallback(params, stageCharacter);
  }
})();

// ============================================================
// Solo 模式：单人发言 + 大气泡可点击跳转
// ============================================================

async function runSoloMode(params, live2d, stage, player) {
  const speaker = params.get('speaker') || 'zhou-ming';
  const message = params.get('message') || '...';
  const next = params.get('next') || '';
  const stageNum = params.get('stage') || '';

  console.log('🎬 Solo 模式:', { speaker, next });

  // 顶栏显示
  if (stageNum) {
    document.getElementById('stage-num').textContent = `No. ${stageNum}`;
    const stageNames = {
      '00': '需求头脑风暴', '00.5': '竞品分析', '01': '提示增强',
      '02': 'PRD', '03': '线框图', '04': '高保真原型',
    };
    document.getElementById('stage-name').textContent = stageNames[stageNum] || '准备中';
  } else {
    document.getElementById('stage-num').textContent = 'INTRO';
    document.getElementById('stage-name').textContent = '主持人开场';
  }

  // 只让该角色高亮，其他变灰
  const character = getStageCharacter('solo', speaker);
  if (!character) throw new Error(`未知角色: ${speaker}`);

  stage.highlightSpeaker(speaker, character);
  live2d.startSpeaking(speaker);

  // 显示大气泡（带打字机）
  const bubbleEl = document.getElementById('solo-bubble');
  const contentEl = document.getElementById('solo-bubble-content');

  // 决定文字（如果传了 message 用，否则用默认）
  const displayMessage = decodeURIComponent(message);

  bubbleEl.classList.add('show');

  // 打字机效果
  contentEl.textContent = '';
  let i = 0;
  const typingSpeed = 40;
  const typeInterval = setInterval(() => {
    if (i >= displayMessage.length) {
      clearInterval(typeInterval);
      live2d.stopSpeaking(speaker);
      // 启用点击跳转
      bubbleEl.style.pointerEvents = 'auto';
      bubbleEl.addEventListener('click', () => {
        if (next) {
          location.href = decodeURIComponent(next);
        }
      });
      return;
    }
    contentEl.textContent += displayMessage[i];
    i++;
  }, typingSpeed);

  // 同时启动 TTS（如果用户开启）
  bubbleEl.style.pointerEvents = 'none'; // 打字机期间禁止点击
}

// ============================================================
// Review 模式：五人评审会（SSE 流式）
// ============================================================

async function runReviewMode(params, live2d, stage, player) {
  const projectId = params.get('project');
  const stageNum = params.get('stage') || '00';

  if (!projectId) throw new Error('缺少 project 参数');

  console.log('🎬 Review 模式:', { projectId, stage: stageNum });

  // 顶栏
  document.getElementById('stage-num').textContent = `No. ${stageNum}`;
  const stageNames = {
    '00': '需求头脑风暴', '00.5': '竞品分析', '01': '提示增强',
    '02': 'PRD', '03': '线框图', '04': '高保真原型',
  };
  document.getElementById('stage-name').textContent = stageNames[stageNum] || '评审会';

  // 显示底部播放控制
  document.getElementById('podium').style.display = 'grid';

  if (params.get('static') === '1') {
    const staticPlay = document.getElementById('btn-play');
    staticPlay.querySelector('.podium-main-text').textContent = '等待发言...';
    staticPlay.disabled = true;
    return;
  }

  // === 触发评审会 ===
  console.log('📡 触发评审会...');
  try {
    const triggerRes = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/review/${stageNum}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    );
    const triggerResult = await triggerRes.json();
    if (!triggerResult.success) {
      console.warn('触发评审会:', triggerResult.error?.message || '可能已存在');
    }
  } catch (err) {
    console.warn('触发评审会请求失败:', err.message);
  }

  // === SSE 监听评审会流 ===
  const transcript = [];
  let totalCount = 0;
  let currentIdx = 0;
  let isPlayingFromBuffer = false;

  const elProgressBar = document.getElementById('progress-bar');
  const elProgressCurrent = document.getElementById('progress-current');
  const elProgressTotal = document.getElementById('progress-total');
  const elProgressLabel = document.getElementById('progress-label');
  const elPlay = document.getElementById('btn-play');
  const elPlayText = elPlay.querySelector('.podium-main-text');

  elPlayText.textContent = '等待发言...';
  elPlay.disabled = true;

  const streamUrl = `${API_BASE}/projects/${encodeURIComponent(projectId)}/review/${stageNum}/stream`;
  const eventSource = new EventSource(streamUrl);

  // 如果 5 分钟内没收到任何事件，显示错误提示
  const sseTimeoutId = setTimeout(() => {
    if (buffer.length === 0 && !allReceived) {
      eventSource.close();
      elPlayText.textContent = '评审会加载超时，请返回状态页重试';
      elPlay.disabled = false;
      elPlay.onclick = () => location.href = `status.html?project=${encodeURIComponent(projectId)}`;
    }
  }, 300000);

  // 缓存收到的发言（先播放第一条，后续等用户点"下一句"）
  const buffer = [];
  let allReceived = false;
  let finalDecisions = [];

  function updateProgress() {
    const cur = currentIdx;
    const tot = totalCount || transcript.length;
    elProgressCurrent.textContent = String(cur).padStart(2, '0');
    elProgressTotal.textContent = String(tot).padStart(2, '0');
    elProgressBar.style.width = `${(cur / Math.max(tot, 1)) * 100}%`;
  }

  async function showRoundtableBeat(nextSpeakerId = null, duration = 900) {
    const theatreEl = document.querySelector('.theatre');
    const dialogEl = document.getElementById('cine-dialog');
    const needsReset = theatreEl?.classList.contains('cine-zoom') || dialogEl?.classList.contains('show');
    if (needsReset) {
      await stage.endCinematicShot();
    }
    if (typeof live2d.restoreStage === 'function') {
      live2d.restoreStage();
    }
    live2d.resetAll();
    if (nextSpeakerId) {
      const nextCharacter = dataLoader_.getCharacter(nextSpeakerId);
      if (nextCharacter) {
        stage.highlightSpeaker(nextSpeakerId, nextCharacter);
        live2d.startSpeaking(nextSpeakerId);
      } else {
        stage.clearHighlight();
      }
    } else {
      stage.clearHighlight();
    }
    await new Promise(r => setTimeout(r, duration));
  }

  async function playEntry(entry) {
    const character = dataLoader_.getCharacter(entry.speaker);
    if (!character) {
      console.warn('未知角色:', entry.speaker);
      return;
    }

    // 高亮 + 聚光灯 + Live2D
    stage.highlightSpeaker(entry.speaker, character);
    live2d.resetAll();
    live2d.startSpeaking(entry.speaker);

    const cinematic = await stage.startCinematicShot(entry, character);
    console.log('[playEntry] startCinematicShot 返回:', cinematic ? 'OK' : 'NULL', '| speaker:', entry.speaker);
    if (!cinematic) {
      // 异常兜底：回退原小气泡链路
      const bubbleContent = stage.createBubble(entry, character);
      elProgressLabel.textContent = window.PHASE_LABELS[entry.type] || 'IN PROGRESS';
      await new Promise(r => setTimeout(r, 400));
      await player.play(bubbleContent, entry.content, character);
      stage.finalizeBubbleLayout(entry, bubbleContent);
      live2d.stopSpeaking(entry.speaker);
      return;
    }

    elProgressLabel.textContent = window.PHASE_LABELS[entry.type] || 'IN PROGRESS';

    // 大对话框打字机播放
    await player.play(cinematic.contentEl, entry.content, character);
    cinematic.enableContinue();
    live2d.stopSpeaking(entry.speaker);

    // 等用户点"继续"，然后镜头复位回到圆桌
    await cinematic.waitForContinue();
    await stage.endCinematicShot();
  }

  async function playNextFromBuffer() {
    if (isPlayingFromBuffer) return;
    if (buffer.length === 0) return;
    isPlayingFromBuffer = true;
    while (buffer.length > 0) {
      const entry = buffer.shift();
      transcript.push(entry);
      currentIdx++;
      updateProgress();
      await showRoundtableBeat(entry.speaker, transcript.length === 1 ? 1200 : 900);
      await playEntry(entry);
      await new Promise(r => setTimeout(r, 400)); // 镜头已复位，仅留少量喘息
    }
    isPlayingFromBuffer = false;

    // 如果已收完且都播完 → 显示决策点
    if (allReceived && buffer.length === 0) {
      stage.finalShot();
      setTimeout(() => openDecisionBoard(finalDecisions), 1200);
    }
  }

  // SSE 事件
  eventSource.addEventListener('ready', (e) => {
    clearTimeout(sseTimeoutId);
    console.log('📡 SSE ready');
    elPlayText.textContent = '播放中';
  });

  ['opening', 'main_speech', 'interrupt', 'response', 'closing'].forEach(eventType => {
    eventSource.addEventListener(eventType, (e) => {
      const data = JSON.parse(e.data);
      buffer.push(data);
      totalCount = transcript.length + buffer.length;
      updateProgress();
      // 收到第一条就开始自动播放
      playNextFromBuffer();
    });
  });

  eventSource.addEventListener('complete', (e) => {
    const data = JSON.parse(e.data);
    console.log('📡 SSE complete:', data);
    allReceived = true;
    elPlayText.textContent = '收尾中...';

    // 拉取完整 review JSON 拿决策点
    fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/review/${stageNum}`)
      .then(r => r.json())
      .then(result => {
        if (result.success) {
          finalDecisions = result.data.decisions || [];
        }
      })
      .catch(err => console.warn('拉取决策点失败:', err));

    eventSource.close();
  });

  eventSource.addEventListener('error', (e) => {
    let msg = 'SSE 连接错误';
    if (e.data) {
      try { msg = JSON.parse(e.data).message || msg; } catch {}
    }
    console.error('SSE error:', msg);
    if (transcript.length === 0) {
      elPlayText.textContent = '加载失败';
    }
  });

  function openDecisionBoard(decisions) {
    const url = `decisions.html?project=${encodeURIComponent(projectId)}&stage=${stageNum}`;
    location.href = decisions && decisions.length > 0
      ? url
      : `status.html?project=${encodeURIComponent(projectId)}`;
  }
}

// ============================================================
// Transition 模式：过渡场景（暂用 solo 风格简化版）
// ============================================================

async function runTransitionMode(params, live2d, stage, player) {
  // 当前简化为 solo 模式
  await runSoloMode(params, live2d, stage, player);
}

function createLive2dFallback() {
  return {
    init: async () => {},
    loadAllModels: async () => {},
    loadModel: async () => null,
    startSpeaking: () => {},
    stopSpeaking: () => {},
    resetAll: () => {},
    showPortrait: async () => null,
    hidePortrait: () => {},
  };
}

async function ensureLive2dAssets() {
  if (window.PIXI?.live2d) return;

  await loadScriptOnce('live2d-core', 'live2d-sdk/live2dcubismcore.min.js');
  await loadScriptOnce('pixi', 'vendor/pixi.min.js');
  await loadScriptOnce('pixi-live2d', 'vendor/pixi-live2d-display-cubism4.min.js');

  if (!window.PIXI?.live2d) {
    throw new Error('Live2D 运行库未加载完成');
  }
}

function loadScriptOnce(id, src) {
  const existing = document.querySelector(`script[data-aipm-script="${id}"]`);
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`脚本加载失败: ${src}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.aipmScript = id;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`脚本加载失败: ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

function getStageCharacter(mode, speaker) {
  const base = dataLoader_.getCharacter(speaker);
  if (!base) return null;
  if (mode === 'review') return base;

  return {
    ...base,
    position: { x: 36, y: 53 },
    nameplate: { x: 36, y: 86 },
    scale: base.soloScale || Math.max(base.scale, 0.58),
  };
}

function decisionPreselectKey(projectId, stageNum) {
  return `aipm-decision-preselect:${projectId}:${stageNum}`;
}

function parseDecisionOptionsFromClosing(content) {
  const decisions = [];
  const decisionPattern = /\*\*决策点(\d+)：([^*]+)\*\*([\s\S]*?)(?=\n\*\*决策点\d+：|$)/g;
  let match;

  while ((match = decisionPattern.exec(content)) !== null) {
    const [, decisionNo, question, body] = match;
    const options = [];
    const optionPattern = /-\s*选项([A-Z])：([^\n]+)/g;
    let optionMatch;

    while ((optionMatch = optionPattern.exec(body)) !== null) {
      options.push({
        id: optionMatch[1],
        label: optionMatch[2].trim(),
        description: optionMatch[2].trim(),
      });
    }

    if (options.length === 0) continue;

    const recommendationMatch = body.match(/-\s*建议：([^\n]+)/);
    decisions.push({
      id: `decision-${String(decisionNo).padStart(3, '0')}`,
      question: question.trim(),
      options,
      recommendation: recommendationMatch ? recommendationMatch[1].trim().replace(/^选\s*/u, '') : null,
    });
  }

  return decisions;
}

function showFatalFallback(params, stageCharacter) {
  const speaker = params.get('speaker') || 'zhou-ming';
  const next = params.get('next') || '';
  const message = decodeURIComponent(params.get('message') || '我们先继续。');
  const bubbleEl = document.getElementById('solo-bubble');
  const contentEl = document.getElementById('solo-bubble-content');
  const stageNum = params.get('stage') || '';

  if (stageNum) {
    document.getElementById('stage-num').textContent = `No. ${stageNum}`;
  }
  document.getElementById('stage-name').textContent = '文字场景';

  bubbleEl.classList.add('show');
  bubbleEl.style.pointerEvents = 'auto';
  contentEl.textContent = message;
  bubbleEl.onclick = () => {
    if (next) location.href = decodeURIComponent(next);
  };

  const spotlight = document.getElementById('spotlight');
  if (spotlight) spotlight.classList.remove('active');

  document.getElementById('characters')?.replaceChildren();
}
