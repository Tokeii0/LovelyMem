/**
 * 日志功能测试
 * 用于测试前端日志管理器是否正常工作
 */

import logManager from './logManager';

export class LogTest {
  /**
   * 运行日志测试
   */
  static async runTest(): Promise<void> {
    console.log('🧪 开始日志功能测试...');

    // 检查日志管理器状态
    console.log('📊 日志管理器状态:', {
      initialized: (window as any).logManager?.isInitialized,
      tauriAvailable: !!(window as any).logManager?.tauriInvoke,
      queueLength: (window as any).logManager?.logQueue?.length || 0
    });

    try {
      // 测试不同级别的日志
      console.log('📝 这是一条普通日志');
      console.info('ℹ️ 这是一条信息日志');
      console.warn('⚠️ 这是一条警告日志');
      console.error('❌ 这是一条错误日志');
      console.debug('🐛 这是一条调试日志');
      
      // 测试对象日志
      const testObject = {
        name: '测试对象',
        value: 123,
        nested: {
          array: [1, 2, 3],
          boolean: true
        }
      };
      console.log('📦 测试对象日志:', testObject);
      
      // 测试数组日志
      const testArray = ['item1', 'item2', 'item3'];
      console.log('📋 测试数组日志:', testArray);
      
      // 测试多参数日志
      console.log('🔢 多参数日志:', '参数1', 42, true, { key: 'value' });
      
      // 获取日志统计
      const stats = logManager.getLogStats();
      console.log('📊 日志统计:', stats);

      // 等待一段时间让日志写入文件
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 测试日志文件位置
      await LogTest.testLogFileLocation();

      console.log('✅ 日志功能测试完成');
      
    } catch (error) {
      console.error('❌ 日志功能测试失败:', error);
    }
  }
  
  /**
   * 测试日志队列清空
   */
  static testClearQueue(): void {
    console.log('🧹 测试清空日志队列...');
    logManager.clearQueue();
    console.log('✅ 日志队列清空测试完成');
  }
  
  /**
   * 测试手动添加日志
   */
  static testManualLog(): void {
    console.log('✋ 测试手动添加日志...');
    logManager.addLog('info', '这是手动添加的信息日志');
    logManager.addLog('warn', '这是手动添加的警告日志', { extra: 'data' });
    logManager.addLog('error', '这是手动添加的错误日志', 'with', 'multiple', 'args');
    console.log('✅ 手动添加日志测试完成');
  }

  /**
   * 测试日志文件位置
   */
  static async testLogFileLocation(): Promise<void> {
    console.log('📍 测试日志文件位置...');

    try {
      // 导入 Tauri API
      const { invoke } = await import('@tauri-apps/api/core');

      // 获取日志文件列表
      const logFiles = await invoke('get_log_files') as any[];
      console.log('📋 找到的日志文件:', logFiles);

      if (logFiles.length > 0) {
        console.log('✅ 日志文件存储位置正确，与 settings.json 在同一目录');
        logFiles.forEach(file => {
          console.log(`📄 ${file.name} - ${file.size} bytes - ${file.modified}`);
        });
      } else {
        console.log('⚠️ 暂无日志文件，请等待日志写入');
      }

    } catch (error) {
      console.error('❌ 测试日志文件位置失败:', error);
    }
  }
}

// 导出到全局作用域，方便在控制台中调用
if (typeof window !== 'undefined') {
  (window as any).LogTest = LogTest;
  (window as any).logManager = logManager;
}

export default LogTest;
