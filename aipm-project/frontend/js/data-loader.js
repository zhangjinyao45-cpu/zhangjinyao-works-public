/**
 * data-loader.js
 * 加载评审会 JSON + 提供角色配置（5 人围圆桌新布局）
 */

// 5 个角色配置（围桌站位 + Live2D 缩放放大）
const CHARACTERS = {
  'zhou-ming': {
    id: 'zhou-ming',
    name: '周明',
    role: 'LEAD PM',
    model: 'Natori',  // Live2D 猫耳男生，沉稳PM感
    color: '#3a5f7d',           // 普鲁士蓝
    cssVar: '--c-zhou',
    voice: { lang: 'zh-CN', rate: 0.95, pitch: 0.9 },
    // 主持人居中偏后（桌后）
    position: { x: 50, y: 22 },
    nameplate: { x: 50, y: 50 },
    scale: 0.30,
    soloScale: 0.54,
  },
  'gu-qing': {
    id: 'gu-qing',
    name: '顾清',
    role: 'RESEARCHER',
    model: 'Mao',  // Live2D 短发女生，冷静知性
    color: '#2d6a4f',           // 森林绿
    cssVar: '--c-gu',
    voice: { lang: 'zh-CN', rate: 1.05, pitch: 1.15 },
    // 左后（桌左后侧）
    position: { x: 18, y: 28 },
    nameplate: { x: 20, y: 54 },
    scale: 0.31,
    soloScale: 0.52,
  },
  'su-yu': {
    id: 'su-yu',
    name: '苏予',
    role: 'DESIGNER',
    model: 'Hiyori',  // Live2D 优雅女生，设计师
    color: '#9d4e4e',           // 酒红
    cssVar: '--c-su',
    voice: { lang: 'zh-CN', rate: 1.0, pitch: 1.1 },
    // 左前（桌左前侧）
    position: { x: 30, y: 52 },
    nameplate: { x: 28, y: 82 },
    scale: 0.42,
    soloScale: 0.54,
  },
  'li-hang': {
    id: 'li-hang',
    name: '李航',
    role: 'ENGINEER',
    model: 'Haru',  // Live2D 人形模型，工程师
    color: '#b8730e',           // 焦糖
    cssVar: '--c-li',
    voice: { lang: 'zh-CN', rate: 0.95, pitch: 0.85 },
    // 右前（桌右前侧）
    position: { x: 70, y: 52 },
    nameplate: { x: 72, y: 82 },
    scale: 0.42,
    soloScale: 0.54,
  },
  'zhang-lei': {
    id: 'zhang-lei',
    name: '张磊',
    role: 'USER',
    model: 'Mark',  // Live2D human model for the user advocate role
    color: '#5e548e',           // 紫罗兰
    cssVar: '--c-zhang',
    voice: { lang: 'zh-CN', rate: 1.1, pitch: 1.05 },
    // 右后（桌右后侧）
    position: { x: 82, y: 28 },
    nameplate: { x: 80, y: 54 },
    scale: 0.31,
    soloScale: 0.52,
  },
};

// 发言类型对应的英文标签（设计上更杂志感）
const TYPE_LABELS = {
  opening: 'PROLOGUE',
  main_speech: 'TESTIMONY',
  interrupt: 'CUT-IN',
  response_to_interrupt: 'REPLY',
  closing: 'VERDICT',
};

// 中文标签（备用）
const TYPE_LABELS_ZH = {
  opening: '开场',
  main_speech: '主发言',
  interrupt: '插话',
  response_to_interrupt: '回应',
  closing: '收敛',
};

// 进度条标签（按发言类型）
const PHASE_LABELS = {
  opening: 'PRELUDE',
  main_speech: 'TESTIMONY',
  interrupt: 'INTERLUDE',
  response_to_interrupt: 'INTERLUDE',
  closing: 'FINALE',
};

class DataLoader {
  constructor() {
    this.reviewData = null;
  }

  async load(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.reviewData = await response.json();
      console.log('✅ 评审会数据已加载', this.reviewData);
      return this.reviewData;
    } catch (err) {
      console.error('❌ 加载评审会数据失败:', err);
      throw err;
    }
  }

  getTranscript() {
    return this.reviewData?.transcript || [];
  }

  getDecisions() {
    return this.reviewData?.decisions || [];
  }

  getStageInfo() {
    return {
      stage: this.reviewData?.stage || '00',
      artifact: this.reviewData?.artifact || '',
    };
  }

  getCharacter(speakerId) {
    return CHARACTERS[speakerId] || null;
  }

  getAllCharacters() {
    return Object.values(CHARACTERS);
  }
}

window.DataLoader = DataLoader;
window.CHARACTERS = CHARACTERS;
window.TYPE_LABELS = TYPE_LABELS;
window.TYPE_LABELS_ZH = TYPE_LABELS_ZH;
window.PHASE_LABELS = PHASE_LABELS;
