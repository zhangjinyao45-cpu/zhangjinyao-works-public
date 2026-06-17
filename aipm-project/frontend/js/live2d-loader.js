/**
 * Live2D loader for the theatre.
 *
 * Important: keep a single PixiJS Application for both roundtable and cut-in.
 * Multiple live2d Applications repeatedly loading Cubism models can corrupt
 * later renders in this demo stack, so the cut-in reuses the roundtable model.
 */
class Live2DLoader {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.app = null;
    this.models = {};
    this._stageCharacters = [];
    this._portraitState = null;
    this._resizeHandler = null;
  }

  async init() {
    if (!window.PIXI || !window.PIXI.live2d) {
      throw new Error('PixiJS or pixi-live2d-display is not loaded');
    }

    this.app = new PIXI.Application({
      view: this.canvas,
      autoStart: true,
      resizeTo: this.canvas.parentElement,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    this.app.stage.sortableChildren = true;
    this._resizeHandler = () => this._repositionAll();
    window.addEventListener('resize', this._resizeHandler);
    return this.app;
  }

  async loadModel(characterId, character) {
    const modelPath = `models/${character.model}/${character.model}.model3.json`;

    try {
      const Live2DModel = window.PIXI.live2d.Live2DModel;
      const model = await Promise.race([
        Live2DModel.from(modelPath),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`model load timeout: ${character.model}`)), 8000);
        }),
      ]);

      model._character = character;
      if (!this._stageCharacters.some(c => c.id === character.id)) {
        this._stageCharacters.push(character);
      }

      this._positionModel(model, character, this.app);
      this.app.stage.addChild(model);
      this.models[characterId] = model;

      try {
        model.motion?.('Idle');
      } catch (e) {
        /* ignore optional motions */
      }

      return model;
    } catch (err) {
      console.error(`[Live2D] failed to load ${character.name}:`, err);
      return null;
    }
  }

  async loadAllModels() {
    const characters = Object.values(window.CHARACTERS);
    this._stageCharacters = characters;
    await Promise.allSettled(characters.map(c => this.loadModel(c.id, c)));
  }

  _positionModel(model, character, app = this.app) {
    const stageWidth = app.screen.width;
    const stageHeight = app.screen.height;
    const natural = this._measureModel(model);
    const targetHeight = stageHeight * character.scale * 1.12;
    const baseScale = targetHeight / natural.height;

    model.scale.set(baseScale);

    const cx = (character.position.x / 100) * stageWidth;
    const footY = ((character.nameplate?.y ?? character.position.y) / 100) * stageHeight - stageHeight * 0.035;

    model.x = cx - (natural.x + natural.width / 2) * baseScale;
    model.y = footY - (natural.y + natural.height) * baseScale;
    model.zIndex = character.zIndex || 1;
    model._idleScale = baseScale;
  }

  _repositionAll() {
    if (this._portraitState) {
      const activeId = this._portraitState.activeId;
      const active = activeId ? this.models[activeId] : null;
      if (active?._character) this._positionPortraitModel(active);
      return;
    }

    Object.values(this.models).forEach(model => {
      if (model?._character) this._positionModel(model, model._character, this.app);
    });
  }

  startSpeaking(characterId) {
    const model = this.models[characterId];
    if (!model) return;

    try {
      model.motion?.('TapBody');
    } catch (e) {
      /* ignore optional motions */
    }

    if (!model._idleScale) model._idleScale = model.scale.x;
    this._pulseScale(model);
  }

  stopSpeaking(characterId) {
    const model = this.models[characterId];
    if (!model) return;
    if (model._pulseInterval) {
      clearInterval(model._pulseInterval);
      model._pulseInterval = null;
    }
    if (model._idleScale) {
      model.scale.set(model._idleScale);
    }
  }

  _pulseScale(model) {
    if (model._pulseInterval) clearInterval(model._pulseInterval);
    let phase = 0;
    model._pulseInterval = setInterval(() => {
      phase += 0.3;
      const offset = Math.sin(phase) * 0.008;
      model.scale.set(model._idleScale * (1 + offset));
    }, 80);
  }

  resetAll() {
    Object.keys(this.models).forEach(id => this.stopSpeaking(id));
  }

  restoreStage() {
    if (!this.app || !this.canvas) return;

    this.canvas.style.display = 'block';
    this.canvas.style.opacity = '1';
    this.canvas.style.visibility = 'visible';
    this.canvas.classList.remove('portrait-active');

    if (this.canvas.parentElement) {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.app.renderer.resize(Math.floor(rect.width), Math.floor(rect.height));
      }
    }

    Object.values(this.models).forEach(model => {
      if (!model) return;
      if (!model.parent) this.app.stage.addChild(model);
      model.visible = true;
      model.renderable = true;
      model.alpha = 1;
      if (model._character) this._positionModel(model, model._character, this.app);
    });

    this.app.ticker?.start?.();
    this.app.render?.();
  }

  async showPortrait(characterId, character) {
    const model = this.models[characterId];
    if (!model || !this.app) return null;

    if (!this._portraitState) {
      this._portraitState = {
        activeId: characterId,
        models: new Map(),
      };

      Object.entries(this.models).forEach(([id, m]) => {
        this._portraitState.models.set(id, {
          x: m.x,
          y: m.y,
          scaleX: m.scale.x,
          scaleY: m.scale.y,
          visible: m.visible,
          renderable: m.renderable,
          alpha: m.alpha,
          zIndex: m.zIndex,
          idleScale: m._idleScale,
        });
      });
    } else {
      this._portraitState.activeId = characterId;
    }

    Object.entries(this.models).forEach(([id, m]) => {
      if (!m) return;
      const isActive = id === characterId;
      if (m._pulseInterval && !isActive) {
        clearInterval(m._pulseInterval);
        m._pulseInterval = null;
      }
      m.visible = isActive;
      m.renderable = isActive;
      m.alpha = isActive ? 1 : 0;
    });

    model._character = character;
    model.zIndex = 100;
    this.canvas.classList.add('portrait-active');
    this._positionPortraitModel(model);

    try {
      model.motion?.('Idle');
    } catch (e) {
      /* ignore optional motions */
    }

    if (!model._idleScale) model._idleScale = model.scale.x;
    this._pulseScale(model);
    this.app.render?.();
    return model;
  }

  hidePortrait() {
    if (!this._portraitState) {
      this.restoreStage();
      return;
    }

    Object.entries(this.models).forEach(([id, model]) => {
      const state = this._portraitState.models.get(id);
      if (!model || !state) return;

      if (model._pulseInterval) {
        clearInterval(model._pulseInterval);
        model._pulseInterval = null;
      }

      model.x = state.x;
      model.y = state.y;
      model.scale.set(state.scaleX, state.scaleY);
      model.visible = state.visible;
      model.renderable = state.renderable;
      model.alpha = state.alpha;
      model.zIndex = state.zIndex;
      model._idleScale = state.idleScale;
    });

    this._portraitState = null;
    this.restoreStage();
  }

  _positionPortraitModel(model) {
    const portraitContainer = document.querySelector('.cine-dialog-portrait');
    if (!portraitContainer) return;

    const stageRect = (this.canvas.parentElement || this.canvas).getBoundingClientRect();
    const portraitRect = portraitContainer.getBoundingClientRect();
    const natural = this._measureModel(model);
    const targetWidth = portraitRect.width * 0.72;
    const targetHeight = portraitRect.height * 0.76;
    const scale = Math.min(targetWidth / natural.width, targetHeight / natural.height);
    const centerX = portraitRect.left - stageRect.left + portraitRect.width * 0.5;
    const centerY = portraitRect.top - stageRect.top + portraitRect.height * 0.46;

    model.scale.set(scale);
    model.x = centerX - (natural.x + natural.width / 2) * scale;
    model.y = centerY - (natural.y + natural.height / 2) * scale;
    model._idleScale = scale;
  }

  _measureModel(model) {
    const prevX = model.scale?.x || 1;
    const prevY = model.scale?.y || prevX;

    if (model.scale && typeof model.scale.set === 'function') {
      model.scale.set(1);
    }

    let bounds = null;
    try {
      bounds = model.getLocalBounds ? model.getLocalBounds() : null;
    } catch {
      bounds = null;
    }

    if (model.scale && typeof model.scale.set === 'function') {
      model.scale.set(prevX, prevY);
    }

    return {
      x: bounds?.x || 0,
      y: bounds?.y || 0,
      width: Math.max(1, bounds?.width || model.width || 1),
      height: Math.max(1, bounds?.height || model.height || 1),
    };
  }
}

window.Live2DLoader = Live2DLoader;
