/**
 * three-loader.js
 * 加载 Mixamo 3D 人物模型（Three.js + GLTFLoader/FBXLoader）
 * 替换原有的 Live2D + PIXI 方案
 */

class ThreeLoader {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.models = {};
    this.mixer = null;
    this.clock = new THREE.Clock();
    this.animFrame = null;
  }

  async init() {
    if (!window.THREE) {
      throw new Error('Three.js 未加载');
    }

    const { WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Color } = THREE;

    // Scene
    this.scene = new Scene();
    this.scene.background = new Color(0x000000);
    this.scene.background = null; // transparent

    // Camera
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new PerspectiveCamera(35, aspect, 0.1, 100);
    this.camera.position.set(0, 1.2, 4);
    this.camera.lookAt(0, 1, 0);

    // Renderer
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Lights
    const ambient = new AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);

    const dirLight = new DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 3, 2);
    this.scene.add(dirLight);

    const backLight = new DirectionalLight(0x4488ff, 0.4);
    backLight.position.set(-2, 2, -2);
    this.scene.add(backLight);

    // Ground plane (subtle shadow catcher)
    // const groundGeo = new THREE.PlaneGeometry(20, 20);
    // const groundMat = new THREE.ShadowMaterial({ opacity: 0.1 });
    // const ground = new THREE.Mesh(groundGeo, groundMat);
    // ground.rotation.x = -Math.PI / 2;
    // ground.position.y = 0;
    // this.scene.add(ground);

    // Resize
    window.addEventListener('resize', () => this._onResize());

    // Start render loop
    this._animate();

    console.log('✅ Three.js 已初始化');
    return this.renderer;
  }

  async loadModel(characterId, character) {
    // Map model name to actual FBX file
    const fbxFiles = {
      'Lewis': 'Ch12_nonPBR.fbx',
      'Suzie': 'Ch41_nonPBR.fbx',
      'Martha': 'Ch27_nonPBR.fbx',
      'Josh': 'Ch23_nonPBR.fbx',
      'Steve': 'Ch49_nonPBR.fbx',
    };
    const modelDir = character.model.toLowerCase();
    const fbxName = fbxFiles[character.model] || `${modelDir}.fbx`;
    const modelPath = `models/${modelDir}/${fbxName}`;

    try {
      let loadedModel;

      if (modelPath.endsWith('.fbx')) {
        if (!window.THREE.FBXLoader) {
          throw new Error('FBXLoader 未加载');
        }
        const loader = new THREE.FBXLoader();
        loadedModel = await loader.loadAsync(modelPath);
      } else {
        if (!window.THREE.GLTFLoader) {
          throw new Error('GLTFLoader 未加载');
        }
        const loader = new THREE.GLTFLoader();
        const gltf = await loader.loadAsync(modelPath);
        loadedModel = gltf.scene;
      }

      // Position and scale
      loadedModel._character = character;
      this._positionModel(loadedModel, character);

      this.scene.add(loadedModel);
      this.models[characterId] = loadedModel;

      // Setup idle animation if available
      if (loadedModel.animations && loadedModel.animations.length > 0) {
        if (!this.mixer) this.mixer = new THREE.AnimationMixer(this.scene);
        const action = this.mixer.clipAction(loadedModel.animations[0], loadedModel);
        action.play();
      } else {
        // Apply T-pose or subtle breathing animation
        this._addBreathingAnimation(loadedModel);
      }

      console.log(`✅ 已加载: ${character.name} (${character.model})`);
      return loadedModel;
    } catch (err) {
      console.error(`❌ 加载 ${character.name} 失败:`, err);
      return null;
    }
  }

  _positionModel(model, character) {
    // Get bounding box
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Normalize: center the model and scale to ~1.8 units tall
    const targetHeight = 1.8;
    const scale = targetHeight / size.y;
    model.scale.setScalar(scale);

    // Recalculate after scaling
    box.setFromObject(model);
    box.getCenter(center);

    // Center horizontally and place feet at y=0
    model.position.x -= center.x;
    model.position.y -= box.min.y;
    model.position.z -= center.z;

    // Now position based on character config (percentage of stage)
    // Map 2D percentages to 3D positions
    const stageWidth = 6;  // world units
    const stageDepth = 3;
    model.position.x = (character.position.x / 100 - 0.5) * stageWidth;
    model.position.z = (character.position.y / 100 - 0.5) * stageDepth * -1;

    // Apply additional scale from config
    const configScale = character.scale * 3; // Live2D scale was smaller
    model.scale.multiplyScalar(configScale);

    model._idleScale = model.scale.x;
    model._basePosition = model.position.clone();
  }

  _addBreathingAnimation(model) {
    // Subtle idle bobbing - handled in _animate
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this._repositionAll();
  }

  _repositionAll() {
    Object.values(this.models).forEach(model => {
      if (model._character) {
        this._positionModel(model, model._character);
      }
    });
  }

  _animate() {
    this.animFrame = requestAnimationFrame(() => this._animate());

    const delta = this.clock.getDelta();
    if (this.mixer) this.mixer.update(delta);

    // Subtle breathing for models without animation
    const time = this.clock.getElapsedTime();
    Object.values(this.models).forEach(model => {
      if (model._idleScale && !model.animations?.length) {
        const breath = Math.sin(time * 2) * 0.005;
        const s = model._idleScale * (1 + breath);
        model.scale.setScalar(s);
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  async loadAllModels() {
    const characters = Object.values(window.CHARACTERS);
    const promises = characters.map(c => this.loadModel(c.id, c));
    await Promise.allSettled(promises);
    console.log(`✅ 模型加载完成，成功 ${Object.keys(this.models).length}/5`);
  }

  startSpeaking(characterId) {
    const model = this.models[characterId];
    if (!model) return;

    // Pulse scale animation
    if (!model._idleScale) model._idleScale = model.scale.x;
    this._pulseScale(model);

    // Play animation if available
    if (model.animations?.length && this.mixer) {
      const action = this.mixer.clipAction(model.animations[0], model);
      action.reset().play();
    }
  }

  stopSpeaking(characterId) {
    const model = this.models[characterId];
    if (!model) return;
    if (model._pulseInterval) {
      clearInterval(model._pulseInterval);
      model._pulseInterval = null;
    }
    if (model._idleScale) {
      model.scale.setScalar(model._idleScale);
    }
  }

  _pulseScale(model) {
    if (model._pulseInterval) clearInterval(model._pulseInterval);
    let phase = 0;
    model._pulseInterval = setInterval(() => {
      phase += 0.3;
      const offset = Math.sin(phase) * 0.01;
      model.scale.setScalar(model._idleScale * (1 + offset));
    }, 80);
  }

  resetAll() {
    Object.keys(this.models).forEach(id => this.stopSpeaking(id));
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.renderer) this.renderer.dispose();
    Object.values(this.models).forEach(m => {
      this.scene.remove(m);
    });
    this.models = {};
  }
}

window.ThreeLoader = ThreeLoader;
