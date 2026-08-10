/**
 * 友好错误层
 *
 * 把后端 / 底层抛出的原始错误（常为英文或技术细节，如 Rust 的 Result<T,String>）
 * 映射为用户能看懂的中文 + 下一步建议，避免把生硬的原始错误直接丢给用户。
 */
import { MessageManager } from './message';

export interface FriendlyResult {
  message: string;
  hint?: string;
}

interface ErrorRule {
  test: RegExp;
  message: string;
  hint?: string;
}

// 顺序敏感：更具体 / 更优先的规则放前面
const RULES: ErrorRule[] = [
  { test: /(not loaded|no image|尚未加载|未加载|镜像未)/i, message: '尚未加载内存镜像', hint: '请先在主界面加载内存镜像后重试' },
  { test: /(permission|denied|access is denied|拒绝访问|权限不足|没有权限)/i, message: '权限不足，无法访问', hint: '请尝试以管理员身份运行，或检查目标文件 / 目录权限' },
  { test: /(not found|no such file|cannot find|does not exist|找不到|不存在)/i, message: '文件或路径不存在', hint: '请确认文件是否已被移动或删除' },
  { test: /(timed?\s?out|timeout|超时)/i, message: '操作超时', hint: '请检查网络或稍后重试' },
  { test: /(connection|connect|network|refused|无法连接|网络)/i, message: '无法连接到服务', hint: '请检查网络连接与相关配置' },
  { test: /(busy|locked|in use|被占用|正在使用)/i, message: '文件被其他程序占用', hint: '请关闭可能正在使用该文件的程序后重试' },
  { test: /(no space|disk full|磁盘|空间不足)/i, message: '磁盘空间不足或写入失败', hint: '请检查磁盘剩余空间' },
  { test: /(parse|invalid|format|malformed|unexpected|\bEOF\b|解析失败|格式)/i, message: '文件格式不支持或内容已损坏', hint: '请确认使用了正确的文件类型' },
];

function toRawString(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === 'object') {
    const anyErr = err as { message?: unknown };
    if (typeof anyErr.message === 'string') return anyErr.message;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

function cleanRaw(raw: string): string {
  // 折叠空白、截断过长（堆栈等技术细节）
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? oneLine.slice(0, 120) + '…' : oneLine;
}

/**
 * 把原始错误映射为友好的中文消息 + 可选的下一步提示。
 * 命中已知模式则返回对应中文；否则返回清理截断后的原始错误 + 通用提示。
 */
export function friendlyError(err: unknown): FriendlyResult {
  const raw = toRawString(err);
  for (const rule of RULES) {
    if (rule.test.test(raw)) {
      return { message: rule.message, hint: rule.hint };
    }
  }
  const cleaned = cleanRaw(raw);
  return {
    message: cleaned || '操作失败',
    hint: '如反复出现，请查看应用日志了解详情',
  };
}

/**
 * 直接以 toast 展示友好错误，并把原始错误留到控制台便于排查。
 * @param err 原始错误
 * @param context 操作上下文，如 '加载注册表'、'保存报告'
 */
export function showFriendlyError(err: unknown, context?: string): void {
  const { message, hint } = friendlyError(err);
  const prefix = context ? `${context}：` : '';
  const tail = hint ? `——${hint}` : '';
  MessageManager.showError(`${prefix}${message}${tail}`);
  console.error(`[${context || 'error'}]`, err);
}
