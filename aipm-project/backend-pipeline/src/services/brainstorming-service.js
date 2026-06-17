/**
 * 头脑风暴 Service
 * 严格遵循 requirement-brainstorming-zjy skill
 * 渐进式问答：每回答一题，根据上一个回答动态生成下一题
 */

import { config } from '../config.js';
import { callClaude } from './claude-service.js';

// Skill 定义的 6 大维度框架，每题预设问题文本和类型
const DIMENSION_FRAMEWORK = [
  { id: 'A', name: '产品定位', questions: [
    { id: 'A1', question: '如果用一句话描述，你想做一个什么产品？它最核心解决什么问题？', type: 'single_choice' },
    { id: 'A2', question: '这个产品主要给谁用？', type: 'single_choice' },
  ]},
  { id: 'B', name: '用户与场景', questions: [
    { id: 'B1', question: '用户通常会在什么场景下打开这个产品？', type: 'single_choice' },
    { id: 'B2', question: '现在没有你的产品，用户怎么解决？', type: 'multi_choice' },
  ]},
  { id: 'C', name: '功能范围', questions: [
    { id: 'C1', question: '第一版只能做好一个功能，你最想先做哪个？', type: 'single_choice' },
    { id: 'C2', question: '首版还必须有哪些功能才能让产品成立？', type: 'multi_choice' },
  ]},
  { id: 'D', name: '页面与信息架构', questions: [
    { id: 'D1', question: '这个产品至少需要哪些页面？', type: 'multi_choice' },
    { id: 'D2', question: '页面怎么组织？', type: 'single_choice' },
  ]},
  { id: 'E', name: '交互与视觉', questions: [
    { id: 'E1', question: '你偏好哪种整体风格和色调？', type: 'single_choice' },
    { id: 'E2', question: '核心页面上用户最主要的操作是什么？', type: 'multi_choice' },
  ]},
  { id: 'F', name: '确认收敛', questions: [
    { id: 'F1', question: '还有什么硬性要求或特别看重的？', type: 'text' },
    { id: 'F2', question: '如果第一版只能验证一件事，你最希望验证什么？', type: 'single_choice' },
  ]},
];

// 扁平化所有题目，带维度信息
const ALL_QUESTIONS = DIMENSION_FRAMEWORK.flatMap(dim =>
  dim.questions.map(q => ({ ...q, dimId: dim.id, dimName: dim.name }))
);

export class BrainstormingService {

  /**
   * 获取第一题（无需 API 调用，秒出）
   */
  getFirstQuestion(meta) {
    const q = ALL_QUESTIONS[0];
    return {
      ...q,
      options: this._defaultOptions(q.id),
      totalQuestions: ALL_QUESTIONS.length,
      currentIndex: 0,
      intro: `好，我是周明。听到你想做"${meta.idea}"。\n\n做产品不是"我觉得"，是"用户需要、竞品没做好、我们能做到"三者的交集。我会用六个维度把你的想法结构化——如实回答就好。`,
    };
  }

  /**
   * 根据用户回答，动态生成下一题
   * 1. 分析用户回答，调整后续问题的选项
   * 2. 如果回答模糊，插入追问
   * 3. 返回下一题 + 定制选项
   */
  async getNextQuestion(meta, answerHistory, currentIndex) {
    const nextIdx = currentIndex + 1;

    // 所有题答完 → 返回完成信号
    if (nextIdx >= ALL_QUESTIONS.length) {
      return { done: true, totalQuestions: ALL_QUESTIONS.length };
    }

    const nextQ = ALL_QUESTIONS[nextIdx];

    // 尝试动态生成定制选项
    let customOptions = null;
    if (!config.useMock) {
      try {
        const qaSummary = answerHistory.slice(-6).map(a =>
          `${a.questionId}: ${Array.isArray(a.answer) ? a.answer.join(',') : a.answer}`
        ).join('\n');

        const result = await callClaude(
          '你是周明，AIPM团队Lead PM。根据用户的产品想法和已有回答，为下一题生成3-5个贴合该产品的选项。输出严格JSON数组。',
          `产品：${meta.idea}\n\n已有回答：\n${qaSummary}\n\n下一题：${nextQ.question} (${nextQ.type})\n\n生成3-5个选项，格式：[{"id":"${nextQ.id}a","label":"简短选项","description":"一句话解释"}]\n只输出JSON数组`,
          { maxTokens: 800, timeout: 120000 }
        );

        if (result) {
          let cleaned = result.trim();
          if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
          else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
          if (cleaned.trimEnd().endsWith('```')) cleaned = cleaned.trimEnd().slice(0, -3);
          cleaned = cleaned.trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length >= 2 && parsed.every(o => o.id && o.label)) {
            customOptions = parsed;
          }
        }
      } catch (err) {
        console.warn('Dynamic options generation failed, using defaults:', err.message);
      }
    }

    return {
      ...nextQ,
      options: customOptions || this._defaultOptions(nextQ.id),
      totalQuestions: ALL_QUESTIONS.length,
      currentIndex: nextIdx,
      done: false,
    };
  }

  /**
   * 从答题结果生成 00-需求头脑风暴设计.md
   */
  async generateArtifact(meta, answers) {
    if (!config.useMock) {
      const answerText = answers.map(a =>
        `${a.questionId}: ${Array.isArray(a.answer) ? a.answer.join(', ') : a.answer}`
      ).join('\n');
      const result = await callClaude(
        `你是 AIPM 阶段 0 的文档生成器。请直接输出一份完整、专业的需求头脑风暴文档，不要包含任何评审讨论、角色对话或建议分析。

文档必须包含 9 个章节：
1. 产品定位（一句话描述、核心问题、产品形态、首版目标、成功标准）
2. 用户与场景（目标用户、核心场景、使用频率、当前替代方案、主要痛点）
3. 主任务流（核心流程、关键决策点、高风险卡点）
4. 功能范围（P0/P1/P2、模块划分、明确不做）
5. 页面与信息架构（页面清单、核心页面、导航结构、页面跳转）
6. 交互与状态设计输入（关键交互、页面状态、角色权限）
7. 视觉与体验方向（风格、色调、布局、参考产品）
8. 约束与边界
9. 可进入下一阶段的判断（4个ready自检）

只输出 Markdown。`,
        `项目名：${meta.name}\n原始想法：${meta.idea}\n\n用户答题：\n${answerText}\n\n生成完整的 00-需求头脑风暴设计.md。`,
        { maxTokens: 50000, timeout: 600000 }
      );
      if (result) {
        let cleaned = result;
        if (cleaned.startsWith('```markdown')) cleaned = cleaned.substring(11);
        else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
        if (cleaned.trimEnd().endsWith('```')) cleaned = cleaned.trimEnd().slice(0, -3);
        return cleaned.trim();
      }
    }
    return this._fallbackArtifact(meta, answers);
  }

  /**
   * 默认选项（当动态生成失败时使用）
   */
  _defaultOptions(qid) {
    const defaults = {
      A1: [
        { id: 'A1a', label: '撮合匹配', description: '帮用户找到对的人/资源/机会' },
        { id: 'A1b', label: '工具效率', description: '帮用户完成某件复杂的事' },
        { id: 'A1c', label: '决策辅助', description: '帮用户做出更好的判断' },
        { id: 'A1d', label: '省钱省时', description: '帮用户节省时间/金钱' },
        { id: 'A1e', label: '社交连接', description: '帮用户建立连接/关系' },
      ],
      A2: [
        { id: 'A2a', label: '个人用户（C端）', description: '消费者/学生/普通用户' },
        { id: 'A2b', label: '企业/团队（B端）', description: '商家/企业/组织' },
        { id: 'A2c', label: '双边用户', description: '同时服务供给方和需求方' },
      ],
      A3: [
        { id: 'A3a', label: '移动端App', description: '体验完整，获客成本高' },
        { id: 'A3b', label: '小程序', description: '即用即走，社交裂变友好' },
        { id: 'A3c', label: 'Web应用', description: 'SEO友好，跨平台' },
        { id: 'A3d', label: 'AI Agent', description: '交互极简，AI驱动' },
      ],
      A4: [
        { id: 'A4a', label: '用户愿不愿意用', description: '需求是否真实存在' },
        { id: 'A4b', label: '核心功能是否成立', description: '方案能否解决问题' },
        { id: 'A4c', label: '场景是否高频', description: '使用频率够不够' },
        { id: 'A4d', label: '能否提升效率/降成本', description: '价值可量化' },
      ],
      B1: [
        { id: 'B1a', label: '学生/年轻用户', description: '18-25岁' },
        { id: 'B1b', label: '职场人/白领', description: '25-35岁' },
        { id: 'B1c', label: '专业人士', description: '特定领域' },
        { id: 'B1d', label: '企业管理者', description: '决策者' },
      ],
      B2: [
        { id: 'B2a', label: '有任务时主动搜索', description: '用完即走' },
        { id: 'B2b', label: '碎片时间无聊浏览', description: '杀时间' },
        { id: 'B2c', label: '社交推荐后尝试', description: '口碑驱动' },
        { id: 'B2d', label: '突发事件/紧急需求', description: '焦虑驱动' },
      ],
      B3: [
        { id: 'B3a', label: '每天多次', description: '高频刚需' },
        { id: 'B3b', label: '每周几次', description: '中频' },
        { id: 'B3c', label: '偶尔使用', description: '低频' },
        { id: 'B3d', label: '特定任务时', description: '场景化触发' },
      ],
      B4: [
        { id: 'B4a', label: '手动/人工处理', description: '效率低但可行' },
        { id: 'B4b', label: 'Excel/文档', description: '有工具但体验差' },
        { id: 'B4c', label: '通用平台/软件', description: '不够垂直' },
        { id: 'B4d', label: '现有竞品', description: '有替代但不满意' },
        { id: 'B4e', label: '没有好方案', description: '蓝海机会' },
      ],
      B5: [
        { id: 'B5a', label: '浏览→筛选→详情→行动→反馈', description: '信息消费型' },
        { id: 'B5b', label: '输入→匹配→确认→执行→结果', description: '撮合匹配型' },
        { id: 'B5c', label: '创建→编辑→发布→反馈', description: '创作工具型' },
        { id: 'B5d', label: '提问→AI处理→结果→调整', description: 'AI辅助型' },
      ],
      B6: [
        { id: 'B6a', label: '找不到想要的', description: '搜索筛选体验差' },
        { id: 'B6b', label: '判断不了好坏', description: '缺少信任证据' },
        { id: 'B6c', label: '操作太复杂', description: '门槛高' },
        { id: 'B6d', label: '等不到结果', description: '反馈慢' },
      ],
      C1: [
        { id: 'C1a', label: '搜索/筛选/推荐', description: '帮用户快速找到目标' },
        { id: 'C1b', label: '详情/信息展示', description: '让用户看清决策' },
        { id: 'C1c', label: '行动/交易/提交', description: '完成核心动作' },
        { id: 'C1d', label: '信任/安全/保障', description: '让用户敢用' },
      ],
      C2: [
        { id: 'C2a', label: '注册/登录/认证', description: '身份体系' },
        { id: 'C2b', label: '搜索/筛选', description: '找内容' },
        { id: 'C2c', label: '消息/通知', description: '回访追踪' },
        { id: 'C2d', label: '评价/反馈', description: '质量保障' },
        { id: 'C2e', label: '收藏/历史', description: '行为留存' },
      ],
      C3: [
        { id: 'C3a', label: 'AI智能推荐', description: '数据积累后做' },
        { id: 'C3b', label: '社交/社区', description: '需用户量' },
        { id: 'C3c', label: '数据统计', description: '运营侧' },
        { id: 'C3d', label: '个性化设置', description: '体验增强' },
      ],
      C4: [
        { id: 'C4a', label: '即时通讯/聊天', description: '引导到微信' },
        { id: 'C4b', label: '支付/资金托管', description: '合规风险大' },
        { id: 'C4c', label: 'B端/企业功能', description: '先聚焦C端' },
        { id: 'C4d', label: '社交/社区', description: '先做工具' },
        { id: 'C4e', label: '复杂匹配算法', description: '首版简单筛选' },
      ],
      D1: [
        { id: 'D1a', label: '首页/发现页', description: '产品入口' },
        { id: 'D1b', label: '列表/搜索页', description: '浏览筛选' },
        { id: 'D1c', label: '详情页', description: '核心信息' },
        { id: 'D1d', label: '创建/编辑页', description: '内容提交' },
        { id: 'D1e', label: '个人中心', description: '设置记录' },
      ],
      D2: [
        { id: 'D2a', label: '首页', description: '第一印象' },
        { id: 'D2b', label: '列表/搜索页', description: '找东西的主战场' },
        { id: 'D2c', label: '详情页', description: '决策转化' },
        { id: 'D2d', label: '创建/行动页', description: '完成动作' },
      ],
      D3: [
        { id: 'D3a', label: '底部Tab', description: 'App标准模式' },
        { id: 'D3b', label: '单页工作台', description: '操作集中' },
        { id: 'D3c', label: '侧边抽屉', description: '功能多时用' },
        { id: 'D3d', label: '系统建议', description: '根据产品推荐' },
      ],
      E1: [
        { id: 'E1a', label: '浏览/滑动', description: '信息消费' },
        { id: 'E1b', label: '搜索/筛选', description: '主动查找' },
        { id: 'E1c', label: '点击/展开', description: '深入了解' },
        { id: 'E1d', label: '提交/创建', description: '内容生产' },
        { id: 'E1e', label: '分享/邀请', description: '社交传播' },
      ],
      E2: [
        { id: 'E2a', label: '极简克制', description: '如 Notion/Linear' },
        { id: 'E2b', label: '信息丰富', description: '如 Figma/Jira' },
        { id: 'E2c', label: '温暖轻松', description: '如生活方式产品' },
        { id: 'E2d', label: '科技感/AI感', description: '深色动效未来感' },
      ],
      E3: [
        { id: 'E3a', label: '浅色简洁', description: '白底清爽' },
        { id: 'E3b', label: '深色科技', description: '暗色沉浸' },
        { id: 'E3c', label: '活力明亮', description: '彩色年轻' },
        { id: 'E3d', label: '暖色亲切', description: '橙黄温暖' },
      ],
      E4: [
        { id: 'E4a', label: '小红书', description: '内容+社区' },
        { id: 'E4b', label: 'Notion/Linear', description: '极简工具' },
        { id: 'E4c', label: '美团/大众点评', description: '信息+决策' },
        { id: 'E4d', label: '闲鱼/转转', description: '轻信任交易' },
      ],
    };
    return defaults[qid] || [];
  }

  _fallbackArtifact(meta, answers) {
    const map = Object.fromEntries(answers.map(a => [a.questionId, a.answer]));
    const resolve = (id) => {
      if (!map[id]) return '（未选择）';
      if (Array.isArray(map[id])) return map[id].join('、');
      return map[id];
    };
    const now = new Date().toISOString().slice(0, 10);
    return `# 需求头脑风暴设计

> 生成时间：${now}
> 项目：${meta.name}

## 1. 产品定位
- 一句话：${meta.idea}
- 核心问题：${resolve('A1')}
- 目标用户：${resolve('A2')}
- 产品形态：${resolve('A3')}
- 首版目标：${resolve('A4')}

## 2. 用户与场景
- 典型用户：${resolve('B1')}
- 触发场景：${resolve('B2')}
- 使用频率：${resolve('B3')}
- 当前替代方案：${resolve('B4')}
- 任务流模式：${resolve('B5')}
- 关键卡点：${resolve('B6')}

## 3. 主任务流
- 流程模式：${resolve('B5')}
- 关键卡点：${resolve('B6')}

## 4. 功能范围
- P0 核心功能：${resolve('C1')}
- P0 必备功能：${resolve('C2')}
- P1 功能：${resolve('C3')}
- 明确不做：${resolve('C4')}

## 5. 页面与信息架构
- 页面清单：${resolve('D1')}
- 核心页面：${resolve('D2')}
- 导航结构：${resolve('D3')}

## 6. 交互与状态
- 关键交互：${resolve('E1')}

## 7. 视觉方向
- 风格：${resolve('E2')}
- 色调：${resolve('E3')}
- 参考产品：${resolve('E4')}

## 8. 约束与边界
- MVP建议 6-8 周开发

## 9. 可进入下一阶段判断
- [x] Prompt-ready
- [x] PRD-ready
- [x] Wireframe-ready
- [x] Prototype-ready

---
**头脑风暴阶段完成，准备进入评审会1。**
`;
  }
}

export const brainstormingService = new BrainstormingService();
