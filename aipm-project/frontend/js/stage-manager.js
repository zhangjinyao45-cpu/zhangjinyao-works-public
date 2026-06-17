/**
 * stage-manager.js
 * 圆桌舞台管理：角色名牌定位、聚光灯、对话气泡动态弹出
 */

class StageManager {
  constructor() {
    this.charactersContainer = document.getElementById('characters');
    this.bubblesContainer = document.getElementById('bubbles');
    this.spotlight = document.getElementById('spotlight');

    this.elements = {};      // { id: nameplateEl }
    this.currentBubble = null;
    this.currentSpeaker = null;
  }

  /**
   * 创建 5 个角色的名牌（铜牌风）
   */
  createCharacterElements(characters) {
    characters.forEach(c => {
      const el = document.createElement('div');
      el.className = 'character';
      el.id = `char-${c.id}`;
      el.style.setProperty('--character-color', c.color || '#c89943');
      // 名牌位置（在角色脚下）
      el.style.left = `${c.nameplate.x}%`;
      el.style.top = `${c.nameplate.y}%`;
      el.innerHTML = `
        <div class="character-nameplate">
          <span class="character-name">${c.name}</span>
          <span class="character-role">${c.role}</span>
        </div>
      `;
      this.charactersContainer.appendChild(el);
      this.elements[c.id] = el;
    });
  }

  /**
   * 高亮发言者 + 移动聚光灯到 ta 头顶
   */
  highlightSpeaker(characterId, character) {
    Object.entries(this.elements).forEach(([id, el]) => {
      if (id === characterId) {
        el.classList.add('speaking');
        el.classList.remove('dimmed');
      } else {
        el.classList.add('dimmed');
        el.classList.remove('speaking');
      }
    });

    // 移动聚光灯
    if (character && this.spotlight) {
      this.spotlight.style.left = `${character.position.x}%`;
      this.spotlight.style.top = `${character.position.y}%`;
      this.spotlight.classList.add('active');
    }

    this.currentSpeaker = characterId;
  }

  setModelAvailability(loadedIds = []) {
    const loaded = new Set(loadedIds);
    Object.entries(this.elements).forEach(([id, el]) => {
      el.classList.toggle('model-loaded', loaded.has(id));
    });
  }

  /**
   * 取消所有高亮
   */
  clearHighlight() {
    Object.values(this.elements).forEach(el => {
      el.classList.remove('speaking', 'dimmed');
    });
    if (this.spotlight) this.spotlight.classList.remove('active');
    this.currentSpeaker = null;
  }

  /**
   * 评审会结束的全景镜头
   */
  finalShot() {
    Object.values(this.elements).forEach(el => {
      el.classList.remove('dimmed');
      el.classList.add('speaking');
    });
    if (this.spotlight) {
      this.spotlight.style.left = '50%';
      this.spotlight.style.top = '50%';
      this.spotlight.classList.add('active');
    }
    setTimeout(() => {
      Object.values(this.elements).forEach(el => {
        el.classList.remove('speaking');
      });
    }, 2000);
  }

  /**
   * 在角色身边创建对话气泡
   * @param {object} entry - 发言条目
   * @param {object} character - 角色配置
   * @returns {HTMLElement} - 气泡 DOM（用于打字机往里写）
   */
  createBubble(entry, character) {
    // 移除旧气泡（动画淡出）
    this.removeBubble();

    const bubble = document.createElement('div');
    bubble.className = `bubble bubble-${entry.type || 'main_speech'}`;
    bubble.style.setProperty('--bubble-color', character.color);

    // 决定气泡位置（基于角色站位）
    const pos = this._calculateBubblePosition(character, entry.type);
    bubble.classList.add(`arrow-${pos.arrowDir}`);
    bubble.style.left = `${pos.x}%`;
    bubble.style.top = `${pos.y}%`;
    bubble.style.transform = `translate(${pos.translateX}, ${pos.translateY})`;

    // 收敛气泡居中显示（特殊处理）
    if (entry.type === 'closing') {
      bubble.style.left = '50%';
      bubble.style.top = '50%';
      bubble.style.transform = 'translate(-50%, -50%)';
      bubble.classList.remove('arrow-down', 'arrow-up', 'arrow-left', 'arrow-right');
    }

    const typeLabel = window.TYPE_LABELS[entry.type] || entry.type;

    bubble.innerHTML = `
      <div class="bubble-arrow"></div>
      <div class="bubble-header">
        <span class="bubble-speaker">${character.name}</span>
        <span class="bubble-type">${typeLabel}</span>
      </div>
      <div class="bubble-content"></div>
    `;

    this.bubblesContainer.appendChild(bubble);
    this.currentBubble = bubble;

    // 触发动画
    requestAnimationFrame(() => {
      bubble.classList.add('show');
    });

    return bubble.querySelector('.bubble-content');
  }

  finalizeBubbleLayout(entry, bubbleContent) {
    const bubble = bubbleContent.closest('.bubble');
    if (!bubble) return;

    const shouldEnableOverflow =
      entry.content.length > 210 ||
      bubble.offsetHeight > window.innerHeight * 0.42;

    if (!shouldEnableOverflow) return;

    bubbleContent.classList.add('overflowing');
    bubble.classList.add('draggable');
    this._makeBubbleDraggable(bubble);
  }

  /**
   * 计算气泡相对角色的位置和箭头方向
   * 策略：根据角色在圆桌的位置，气泡贴在最不挡视野的一侧
   */
  _calculateBubblePosition(character, type) {
    const cx = character.position.x;  // 角色 x 百分比
    const cy = character.position.y;  // 角色 y 百分比

    // 默认配置
    let arrowDir = 'down';
    let bubbleX = cx;
    let bubbleY = cy - 8;
    let translateX = '-15%';  // 气泡左侧 15% 处对齐角色
    let translateY = '-100%'; // 气泡底部对齐 bubbleY

    // 中后方（周明）→ 气泡在角色头顶（箭头朝下指向他）
    if (cx >= 40 && cx <= 60) {
      arrowDir = 'down';
      bubbleX = cx;
      bubbleY = cy - 5;
      translateX = '-15%';
      translateY = '-100%';
    }
    // 左侧（顾清/苏予）→ 气泡在角色右侧（箭头朝左指向他）
    else if (cx < 40) {
      arrowDir = 'left';
      bubbleX = cx + 8;
      bubbleY = cy - 2;
      translateX = '0';
      translateY = '-30%';
    }
    // 右侧（李航/张磊）→ 气泡在角色左侧（箭头朝右指向他）
    else {
      arrowDir = 'right';
      bubbleX = cx - 8;
      bubbleY = cy - 2;
      translateX = '-100%';
      translateY = '-30%';
    }

    return { x: bubbleX, y: bubbleY, arrowDir, translateX, translateY };
  }

  /**
   * 移除当前气泡（淡出动画）
   */
  removeBubble() {
    if (!this.currentBubble) return;
    const old = this.currentBubble;
    old.classList.remove('show');
    setTimeout(() => {
      if (old.parentNode) old.parentNode.removeChild(old);
    }, 400);
    this.currentBubble = null;
  }

  /**
   * 推镜头 + 全屏新画面（大对话框接管）
   * 流程：
   *  1) 锁定到说话人位置 → 推镜头 1.8 秒（cine-zoom）
   *  2) 圆桌画面被大对话框整个盖住（cine-dialog 全屏淡入）
   *  3) 大对话框左侧加载该角色的 Live2D 全身像（独立 canvas）
   *  4) 右侧打字机播放发言
   *  5) 用户点继续后调 endCinematicShot()
   */
  async startCinematicShot(entry, character) {
    console.log('[startCinematicShot] speaker:', entry.speaker, '| character:', character.name);
    const theatre = document.querySelector('.theatre');
    const dialog = document.getElementById('cine-dialog');
    if (!theatre || !dialog) {
      console.error('[startCinematicShot] theatre 或 dialog 元素缺失');
      return null;
    }

    // 1) 推镜头：origin 到说话人坐标，scale 适度
    const cx = character.position?.x ?? 50;
    const cy = character.position?.y ?? 35;
    console.log('[startCinematicShot] 推镜头到 (' + cx + '%, ' + cy + '%)');
    const zoom = 1.42;
    const shiftX = Math.max(-30, Math.min(30, (50 - cx) * 0.72));
    const shiftY = Math.max(-16, Math.min(18, (43 - cy) * 0.42));
    theatre.style.setProperty('--cam-x', `${cx}%`);
    theatre.style.setProperty('--cam-y', `${cy}%`);
    theatre.style.setProperty('--cam-shift-x', `${shiftX}%`);
    theatre.style.setProperty('--cam-shift-y', `${shiftY}%`);
    theatre.style.setProperty('--cam-zoom', String(zoom));
    theatre.style.setProperty('--cam-duration', '1800ms');
    theatre.classList.add('cine-zoom');

    // 等推镜头动画完成（2 秒）
    await new Promise(r => setTimeout(r, 1850));
    console.log('[startCinematicShot] 推镜头完成，准备弹大对话框');

    // 2) 准备大对话框内容
    const portraitName = document.getElementById('cine-portrait-name');
    const portraitRole = document.getElementById('cine-portrait-role');
    const overline = document.getElementById('cine-dialog-overline');
    const contentEl = document.getElementById('cine-dialog-content');
    const hintEl = document.getElementById('cine-dialog-hint');
    const btnEl = document.getElementById('cine-dialog-btn');

    portraitName.textContent = character.name || '';
    portraitRole.textContent = character.role || '';
    overline.textContent = (window.TYPE_LABELS && window.TYPE_LABELS[entry.type]) || (entry.type || '').toUpperCase();
    contentEl.textContent = '';
    contentEl.classList.add('typing');
    hintEl.textContent = '正在发言…';
    btnEl.disabled = true;

    dialog.dataset.speaker = entry.speaker || '';
    dialog.style.setProperty('--portrait-color', character.color || '#3a5f7d');
    dialog.classList.add('show');
    dialog.setAttribute('aria-hidden', 'false');
    console.log('[startCinematicShot] 大对话框已显示');

    // 3) 在左侧 canvas 加载该角色全身 Live2D（异步，不阻塞文字）
    if (window.live2dLoader && typeof window.live2dLoader.showPortrait === 'function') {
      console.log('[startCinematicShot] 准备加载左侧 Live2D:', entry.speaker);
      // 给 DOM 一点时间布局好 canvas 尺寸
      setTimeout(() => {
        window.live2dLoader.showPortrait(entry.speaker, character)
          .then(model => {
            console.log('[startCinematicShot] 左侧 Live2D 加载完成:', entry.speaker, model ? 'OK' : 'NULL');
          })
          .catch(err => {
            console.error('[startCinematicShot] 左侧 Live2D 加载失败:', err);
          });
      }, 80);
    } else {
      console.warn('[startCinematicShot] live2dLoader.showPortrait 不可用');
    }

    return {
      contentEl,
      enableContinue: () => {
        contentEl.classList.remove('typing');
        btnEl.disabled = false;
        hintEl.textContent = '已发言完毕';
      },
      waitForContinue: () => new Promise((resolve) => {
        const onClick = () => {
          btnEl.removeEventListener('click', onClick);
          resolve();
        };
        btnEl.addEventListener('click', onClick);
      }),
    };
  }

  /**
   * 结束推镜头：对话框淡出 + 镜头复位 + 关闭左侧 portrait Live2D
   */
  async endCinematicShot() {
    console.log('[endCinematicShot] 开始清场');
    const theatre = document.querySelector('.theatre');
    const dialog = document.getElementById('cine-dialog');

    if (dialog) {
      dialog.classList.remove('show');
      dialog.setAttribute('aria-hidden', 'true');
    }

    // 清理左侧 portrait
    if (window.live2dLoader && typeof window.live2dLoader.hidePortrait === 'function') {
      console.log('[endCinematicShot] 隐藏左侧 Live2D');
      window.live2dLoader.hidePortrait();
    }
    if (window.live2dLoader && typeof window.live2dLoader.restoreStage === 'function') {
      window.live2dLoader.restoreStage();
    }
    // 等对话框淡出
    await new Promise(r => setTimeout(r, 480));

    if (theatre) {
      console.log('[endCinematicShot] 镜头复位');
      theatre.style.setProperty('--cam-zoom', '1');
      theatre.style.setProperty('--cam-shift-x', '0%');
      theatre.style.setProperty('--cam-shift-y', '0%');
      theatre.style.setProperty('--cam-duration', '1100ms');
      theatre.classList.remove('cine-zoom');
    }

    // 等镜头复位
    await new Promise(r => setTimeout(r, 1100));
    if (window.live2dLoader && typeof window.live2dLoader.restoreStage === 'function') {
      window.live2dLoader.restoreStage();
    }
    console.log('[endCinematicShot] 清场完成');
  }

  /**
   * 隐藏开场幕布
   */
  hideCurtain() {
    const curtain = document.getElementById('curtain');
    if (curtain) curtain.classList.add('hide');
  }

  /**
   * 显示开场幕布
   */
  showCurtain() {
    const curtain = document.getElementById('curtain');
    if (curtain) curtain.classList.remove('hide');
  }

  async showReadingSheet(entry, character, actionLabel = '继续') {
    const sheet = document.getElementById('reading-sheet');
    const overline = document.getElementById('reading-sheet-overline');
    const title = document.getElementById('reading-sheet-title');
    const content = document.getElementById('reading-sheet-content');
    const button = document.getElementById('reading-sheet-btn');

    overline.textContent = (window.TYPE_LABELS[entry.type] || entry.type || '').toUpperCase();
    title.textContent = `${character.name} · ${window.TYPE_LABELS_ZH[entry.type] || '发言'}`;
    content.textContent = '';
    button.textContent = actionLabel;
    button.disabled = true;

    sheet.classList.add('show');

    return {
      contentEl: content,
      enableContinue: () => { button.disabled = false; },
      waitForContinue: () => new Promise((resolve) => {
        const handler = () => {
          button.removeEventListener('click', handler);
          sheet.classList.remove('show');
          resolve();
        };
        button.addEventListener('click', handler);
      }),
    };
  }

  async showDecisionSheet(entry, character, decisions, actionLabel = '进入拍板') {
    const sheet = document.getElementById('reading-sheet');
    const overline = document.getElementById('reading-sheet-overline');
    const title = document.getElementById('reading-sheet-title');
    const content = document.getElementById('reading-sheet-content');
    const button = document.getElementById('reading-sheet-btn');
    const selected = {};

    overline.textContent = 'VERDICT';
    title.textContent = `${character.name} · 收敛`;
    button.textContent = actionLabel;
    button.disabled = decisions.length > 0;

    content.innerHTML = `
      <div class="decision-sheet">
        ${decisions.map((decision, index) => `
          <section class="decision-sheet-item" data-decision-id="${decision.id}">
            <div class="decision-sheet-kicker">决策点 ${String(index + 1).padStart(2, '0')}</div>
            <h3>${decision.question}</h3>
            <div class="decision-sheet-options">
              ${decision.options.map(option => `
                <button class="decision-sheet-option" type="button" data-opt-id="${option.id}">
                  <span class="decision-sheet-option-id">${option.id}</span>
                  <span class="decision-sheet-option-label">${option.label}</span>
                </button>
              `).join('')}
            </div>
            ${decision.recommendation ? `<div class="decision-sheet-rec">建议：${decision.recommendation}</div>` : ''}
          </section>
        `).join('')}
      </div>
    `;

    const updateButton = () => {
      button.disabled = decisions.some(decision => !selected[decision.id]);
    };

    content.querySelectorAll('.decision-sheet-option').forEach(optionEl => {
      optionEl.addEventListener('click', () => {
        const item = optionEl.closest('.decision-sheet-item');
        const decisionId = item.dataset.decisionId;
        item.querySelectorAll('.decision-sheet-option').forEach(el => el.classList.remove('selected'));
        optionEl.classList.add('selected');
        selected[decisionId] = optionEl.dataset.optId;
        updateButton();
      });
    });

    sheet.classList.add('show');

    return {
      waitForContinue: () => new Promise((resolve) => {
        const handler = () => {
          button.removeEventListener('click', handler);
          sheet.classList.remove('show');
          resolve({ ...selected });
        };
        button.addEventListener('click', handler);
      }),
    };
  }

  _makeBubbleDraggable(bubble) {
    if (bubble.dataset.draggableBound === 'true') return;
    bubble.dataset.draggableBound = 'true';

    const header = bubble.querySelector('.bubble-header') || bubble;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    const onMove = (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      bubble.style.left = `${originX + deltaX}px`;
      bubble.style.top = `${originY + deltaY}px`;
      bubble.style.transform = 'none';
    };

    const onUp = () => {
      dragging = false;
      bubble.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    header.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.bubble-content')) return;
      dragging = true;
      bubble.classList.add('dragging');
      const rect = bubble.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      originX = rect.left;
      originY = rect.top;
      bubble.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }
}

window.StageManager = StageManager;
