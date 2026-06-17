/**
 * dialogue-player.js
 * 对话播放器：在指定 DOM（动态气泡内）做打字机 + TTS
 */

class DialoguePlayer {
  constructor() {
    this.ttsEnabled = false;
    this.typingSpeed = 30; // ms/char
    this.currentTimer = null;
    this.currentTargetEl = null;
    this.currentText = '';
    this.currentIdx = 0;

    if ('speechSynthesis' in window) {
      this.tts = window.speechSynthesis;
    }
  }

  /**
   * 在指定 DOM 元素中播放打字机效果
   * @param {HTMLElement} targetEl - 气泡内的 .bubble-content 元素
   * @param {string} text - 要打出的文字
   * @param {object} character - 角色配置（含 voice）
   */
  async play(targetEl, text, character) {
    this.stop();

    this.currentTargetEl = targetEl;
    this.currentText = text;
    this.currentIdx = 0;

    targetEl.textContent = '';
    targetEl.classList.add('typing');

    // 同步启动 TTS
    if (this.ttsEnabled && this.tts && character?.voice) {
      this._speakTTS(text, character.voice);
    }

    return new Promise((resolve) => {
      const tick = () => {
        if (this.currentIdx >= this.currentText.length) {
          targetEl.classList.remove('typing');
          this.currentTimer = null;
          resolve();
          return;
        }
        targetEl.textContent += this.currentText[this.currentIdx];
        this.currentIdx++;
        this.currentTimer = setTimeout(tick, this.typingSpeed);
      };
      tick();
    });
  }

  /**
   * 跳过打字机，直接显示完整内容
   */
  skipTyping() {
    if (!this.currentTimer) return;
    clearTimeout(this.currentTimer);
    this.currentTimer = null;
    if (this.currentTargetEl) {
      this.currentTargetEl.textContent = this.currentText;
      this.currentTargetEl.classList.remove('typing');
    }
  }

  /**
   * TTS 朗读
   */
  _speakTTS(text, voice) {
    if (!this.tts) return;
    this.tts.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice.lang || 'zh-CN';
    utterance.rate = voice.rate || 1.0;
    utterance.pitch = voice.pitch || 1.0;
    utterance.volume = 1.0;

    const voices = this.tts.getVoices();
    const isMale = (voice.pitch || 1.0) < 1.0;
    const zhVoice = voices.find(v =>
      v.lang.startsWith('zh') && (
        (isMale && /male|男/i.test(v.name)) ||
        (!isMale && /female|女/i.test(v.name))
      )
    ) || voices.find(v => v.lang.startsWith('zh'));

    if (zhVoice) utterance.voice = zhVoice;

    this.tts.speak(utterance);
  }

  /**
   * 停止
   */
  stop() {
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    if (this.currentTargetEl) {
      this.currentTargetEl.classList.remove('typing');
    }
    if (this.tts) this.tts.cancel();
  }

  toggleTTS() {
    this.ttsEnabled = !this.ttsEnabled;
    if (!this.ttsEnabled && this.tts) this.tts.cancel();
    return this.ttsEnabled;
  }

  setSpeed(ms) {
    this.typingSpeed = ms;
  }
}

window.DialoguePlayer = DialoguePlayer;
