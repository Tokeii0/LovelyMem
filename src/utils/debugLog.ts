/**
 * 日志调试工具
 * 在浏览器控制台中运行这些函数来调试日志系统
 */

interface LogFileInfo {
  name: string;
  path: string;
  size?: number;
  modified?: string;
}

interface DebugLogApi {
  checkLogManager: () => unknown;
  testLogWrite: () => void;
  testTauriAPI: () => Promise<void>;
  forceProcessQueue: () => void;
  getAppDataDir: () => Promise<void>;
  fullDebug: () => Promise<void>;
}

// 检查日志管理器状态
function checkLogManager(): unknown {
  console.log('=== 日志管理器状态检查 ===');

  const manager = (window as any).logManager;
  if (typeof manager === 'undefined') {
    console.error('❌ logManager 未定义');
    return;
  }

  console.log('✅ logManager 已定义');
  console.log('初始化状态:', manager.isInitialized);
  console.log('Tauri API 可用:', !!manager.tauriInvoke);
  console.log('日志队列长度:', manager.logQueue.length);
  console.log('队列内容:', manager.logQueue.slice(-5)); // 显示最后5条

  return manager;
}

// 测试日志写入
function testLogWrite(): void {
  console.log('=== 测试日志写入 ===');

  console.log('这是测试日志 - LOG');
  console.info('这是测试日志 - INFO');
  console.warn('这是测试日志 - WARN');
  console.error('这是测试日志 - ERROR');

  setTimeout(() => {
    console.log('延迟后的日志队列长度:', (window as any).logManager?.logQueue?.length || 0);
  }, 1000);
}

// 直接调用 Tauri API 测试
async function testTauriAPI(): Promise<void> {
  console.log('=== 测试 Tauri API ===');

  try {
    if (typeof (window as any).__TAURI__ === 'undefined') {
      console.error('❌ Tauri API 不可用');
      return;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    console.log('✅ Tauri API 导入成功');

    // 直接调用日志写入
    await invoke('write_frontend_log', {
      level: 'info',
      message: '直接调用 Tauri API 的测试日志',
      timestamp: new Date().toISOString()
    });

    console.log('✅ 直接调用 write_frontend_log 成功');

    // 获取日志文件列表
    const logFiles = await invoke<LogFileInfo[]>('get_log_files');
    console.log('📋 日志文件列表:', logFiles);

  } catch (error) {
    console.error('❌ Tauri API 测试失败:', error);
  }
}

// 强制处理日志队列
function forceProcessQueue(): void {
  console.log('=== 强制处理日志队列 ===');

  const manager = (window as any).logManager;
  if (!manager) {
    console.error('❌ logManager 不可用');
    return;
  }

  const queueLength = manager.logQueue.length;
  console.log('处理前队列长度:', queueLength);

  // 手动触发队列处理
  if (manager.processLogQueue) {
    manager.processLogQueue();
    console.log('✅ 已触发队列处理');
  } else {
    console.error('❌ processLogQueue 方法不可用');
  }

  setTimeout(() => {
    console.log('处理后队列长度:', manager.logQueue.length);
  }, 2000);
}

// 获取应用数据目录路径
async function getAppDataDir(): Promise<void> {
  console.log('=== 获取应用数据目录 ===');

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('load_settings_command');
    console.log('✅ 设置加载成功');

    // 尝试获取日志文件列表来确定目录
    const logFiles = await invoke<LogFileInfo[]>('get_log_files');
    console.log('📁 日志文件:', logFiles);

    if (logFiles.length > 0) {
      const firstFile = logFiles[0];
      const dirPath = firstFile.path.replace(/[^/\\]*$/, '');
      console.log('📍 日志文件目录:', dirPath);
    } else {
      console.log('⚠️ 暂无日志文件');
    }

  } catch (error) {
    console.error('❌ 获取应用数据目录失败:', error);
  }
}

// 完整的调试流程
async function fullDebug(): Promise<void> {

  checkLogManager();
  await new Promise(resolve => setTimeout(resolve, 500));

  testLogWrite();
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testTauriAPI();
  await new Promise(resolve => setTimeout(resolve, 500));

  forceProcessQueue();
  await new Promise(resolve => setTimeout(resolve, 2000));

  await getAppDataDir();

}

// 导出到全局作用域
const debugLog: DebugLogApi = {
  checkLogManager,
  testLogWrite,
  testTauriAPI,
  forceProcessQueue,
  getAppDataDir,
  fullDebug
};

(window as any).debugLog = debugLog;

export { debugLog };
export type { DebugLogApi, LogFileInfo };
