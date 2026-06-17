/**
 * main.js
 * 入口：编排整个评审会演示流程（剧院风新版）
 */

(async function main() {
  const loadingEl = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');

  const setLoading = (msg) => { loadingText.textContent = msg; };

  try {
    // === 1. 加载评审会数据 ===
    setLoading('翻阅议程...');
    const dataLoader = new DataLoader();
    await dataLoader.load('data/review-sample.json');

    const stageInfo = dataLoader.getStageInfo();
    document.getElementById('stage-num').textContent = `No. ${stageInfo.stage}`;
    const stageNames = {
      '00': '需求头脑风暴', '00.5': '竞品分析', '01': '提示增强',
      '02': 'PRD', '03': '线框图', '04': '高保真原型'
    };
    const stageName = stageNames[stageInfo.stage] || '未知阶段';
    document.getElementById('stage-name').textContent = stageName;
    document.getElementById('curtain-stage').textContent = `阶段 ${stageInfo.stage} · ${stageName}`;

    // === 2. 初始化 Live2D 舞台 ===
    setLoading('搭建舞台...');
    const live2d = new Live2DLoader('live2d-canvas');
    await live2d.init();

    setLoading('召唤五位评委...');
    await live2d.loadAllModels();

    // === 3. 初始化舞台名牌 ===
    setLoading('就位...');
    const stage = new StageManager();
    stage.createCharacterElements(dataLoader.getAllCharacters());

    // === 4. 初始化对话播放器 ===
    const player = new DialoguePlayer();

    // === 5. 隐藏加载遮罩 ===
    setLoading('开场');
    setTimeout(() => loadingEl.classList.add('hide'), 400);

    // === 6. 控制状态 ===
    const transcript = dataLoader.getTranscript();
    let currentIdx = -1;
    let isPlaying = false;
    let autoNext = true;

    const elPlay = document.getElementById('btn-play');
    const elPrev = document.getElementById('btn-prev');
    const elNext = document.getElementById('btn-next');
    const elProgressBar = document.getElementById('progress-bar');
    const elProgressCurrent = document.getElementById('progress-current');
    const elProgressTotal = document.getElementById('progress-total');
    const elProgressLabel = document.getElementById('progress-label');
    const elTtsBtn = document.getElementById('btn-tts');
    const elSpeedBtn = document.getElementById('btn-speed');
    const elRestartBtn = document.getElementById('btn-restart');
    const elDecisionModal = document.getElementById('decision-modal');
    const elDecisionList = document.getElementById('decision-list');
    const elCloseDecision = document.getElementById('btn-close-decision');

    elProgressTotal.textContent = String(transcript.length).padStart(2, '0');

    /** 更新进度条 */
    function updateProgress() {
      const total = transcript.length;
      const cur = Math.max(0, currentIdx + 1);
      elProgressCurrent.textContent = String(cur).padStart(2, '0');
      elProgressBar.style.width = `${(cur / total) * 100}%`;
      elPrev.disabled = currentIdx <= 0;
      elNext.disabled = currentIdx >= total - 1;

      if (currentIdx >= 0 && transcript[currentIdx]) {
        elProgressLabel.textContent = window.PHASE_LABELS[transcript[currentIdx].type] || 'PRELUDE';
      } else {
        elProgressLabel.textContent = 'PRELUDE';
      }
    }

    /** 播放某一条发言 */
    async function playEntry(idx) {
      if (idx < 0 || idx >= transcript.length) return;
      currentIdx = idx;
      const entry = transcript[idx];
      const character = dataLoader.getCharacter(entry.speaker);

      if (!character) {
        console.warn('未找到角色:', entry.speaker);
        return;
      }

      // 高亮 + 聚光灯 + Live2D 说话
      stage.highlightSpeaker(entry.speaker, character);
      live2d.resetAll();
      live2d.startSpeaking(entry.speaker);

      // 创建气泡
      const bubbleContent = stage.createBubble(entry, character);

      updateProgress();

      // 等气泡弹入动画完成
      await new Promise(r => setTimeout(r, 400));

      // 打字机播放
      await player.play(bubbleContent, entry.content, character);

      // 停止说话动作
      live2d.stopSpeaking(entry.speaker);

      // 自动播放下一条
      if (autoNext && isPlaying && currentIdx < transcript.length - 1) {
        await new Promise(r => setTimeout(r, 1800));
        if (autoNext && isPlaying) {
          await playEntry(currentIdx + 1);
        }
      } else if (currentIdx >= transcript.length - 1) {
        // 评审会结束
        isPlaying = false;
        elPlay.querySelector('.podium-main-text').textContent = '重听一遍';
        stage.finalShot();
        showDecisions();
      }
    }

    /** 显示决策点弹窗 */
    function showDecisions() {
      const decisions = dataLoader.getDecisions();
      elDecisionList.innerHTML = decisions.map((d, i) => `
        <div class="verdict-item">
          <div class="verdict-id">DECISION · ${String(i + 1).padStart(2, '0')}</div>
          <div class="verdict-question">${d.question}</div>
        </div>
      `).join('');
      setTimeout(() => elDecisionModal.classList.add('show'), 1200);
    }

    /** 重置 */
    function reset() {
      isPlaying = false;
      currentIdx = -1;
      player.stop();
      live2d.resetAll();
      stage.clearHighlight();
      stage.removeBubble();
      stage.showCurtain();
      elDecisionModal.classList.remove('show');
      elPlay.querySelector('.podium-main-text').textContent = '主持开场';
      updateProgress();
    }

    // === 7. 事件绑定 ===
    elPlay.addEventListener('click', async () => {
      if (currentIdx >= transcript.length - 1) {
        reset();
        await new Promise(r => setTimeout(r, 200));
      }
      // 第一次播放：隐藏开场幕布
      stage.hideCurtain();
      isPlaying = true;
      autoNext = true;
      elPlay.querySelector('.podium-main-text').textContent = '暂停';
      // 给幕布动画时间
      await new Promise(r => setTimeout(r, 600));
      await playEntry(currentIdx + 1);
    });

    elPrev.addEventListener('click', () => {
      isPlaying = false;
      autoNext = false;
      player.stop();
      playEntry(currentIdx - 1);
    });

    elNext.addEventListener('click', () => {
      isPlaying = false;
      autoNext = false;
      player.stop();
      playEntry(currentIdx + 1);
    });

    elTtsBtn.addEventListener('click', () => {
      const enabled = player.toggleTTS();
      elTtsBtn.classList.toggle('active', enabled);
    });

    let speedLevel = 0;
    const SPEEDS = [{ label: '1×', ms: 30 }, { label: '2×', ms: 15 }, { label: '½×', ms: 60 }];
    elSpeedBtn.addEventListener('click', () => {
      speedLevel = (speedLevel + 1) % SPEEDS.length;
      const s = SPEEDS[speedLevel];
      player.setSpeed(s.ms);
      elSpeedBtn.querySelector('.ctrl-icon').textContent = s.label;
    });

    elRestartBtn.addEventListener('click', reset);
    elCloseDecision.addEventListener('click', () => elDecisionModal.classList.remove('show'));

    // 点击气泡区域跳过当前打字机
    document.getElementById('bubbles').addEventListener('click', () => {
      player.skipTyping();
    });

    updateProgress();
    console.log('🎬 评审会舞台就绪');
  } catch (err) {
    console.error('❌ 初始化失败:', err);
    setLoading(`❌ ${err.message}`);
  }
})();
