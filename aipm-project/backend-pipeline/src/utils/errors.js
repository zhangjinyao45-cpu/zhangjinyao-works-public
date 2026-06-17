/**
 * 应用错误类（统一错误格式）
 */

export class AppError extends Error {
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const Errors = {
  invalidInput: (msg, details) => new AppError('INVALID_INPUT', msg, 400, details),
  projectNotFound: (id) => new AppError('PROJECT_NOT_FOUND', `项目不存在: ${id}`, 404, { projectId: id }),
  stageNotReady: (current, requested) => new AppError(
    'STAGE_NOT_READY',
    `阶段前置条件未满足`,
    409,
    { currentStage: current, requestedStage: requested }
  ),
  decisionPending: (count) => new AppError(
    'DECISION_PENDING',
    `有 ${count} 个未拍板的决策点`,
    409,
    { pendingCount: count }
  ),
  dataRagFailed: (reason) => new AppError('DATA_RAG_FAILED', `数据源调用失败: ${reason}`, 502),
  claudeApiFailed: (reason) => new AppError('CLAUDE_API_FAILED', `Claude API 调用失败: ${reason}`, 502),
};
