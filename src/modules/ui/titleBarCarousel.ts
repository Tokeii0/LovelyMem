/**
 * 标题栏文本循环播放管理器
 */

export class TitleBarCarousel {
  private texts: string[] = [
    // 工具使用提示
    '点击左侧的加载镜像可以加载内存镜像',
    '一般可以根据NTFS时间线看出出题人在dump镜像前干了什么事情',
    '文件内存管理器并不是所有文件都可以导出，请以vol2，vol3的filescan能导出的文件为准',
    '如果右键菜单没有功能列表，可以尝试在左下角头像点击下载表格插件',
    '某些地方右键可以快速调用一些功能',
    // 内存取证基础知识
    'Volatility 的 pslist 列出正常进程，psscan 能发现被隐藏的进程',
    '进程的 PPID 不正确（如 svchost 的父进程不是 services.exe）可能是恶意进程伪装',
    '内存中的 EPROCESS 结构包含了进程的几乎所有关键信息',
    'malfind 插件可检测进程中被注入的可疑代码段（PAGE_EXECUTE_READWRITE）',
    'netscan 可以从内存中恢复已关闭的网络连接记录',
    'hivelist 定位注册表 hive 后，可用 printkey 查看具体键值',
    'Windows 的 SAM 注册表 hive 存储本地用户的密码哈希',
    'cmdscan/consoles 可还原 cmd.exe 中执行过的命令历史',
    'mftparser 能恢复 NTFS 文件系统的文件时间线和被删除的文件记录',
    'filescan 扫描内存中所有文件对象，dumpfiles 可将其导出到磁盘',
    'shimcache（AppCompatCache）记录了程序执行的历史痕迹',
    'userassist 记录用户通过 Explorer 打开程序的次数和最后执行时间',
    '通过 envars 可以查看每个进程的环境变量，有时能发现攻击者设置的特殊变量',
    'svcscan 能列出 Windows 服务，包括已停止和被隐藏的服务',
    'dlllist 查看已加载 DLL，ldrmodules 可对比发现被卸载隐藏的 DLL',
    'callbacks 插件能检测内核回调，rootkit 常通过注册回调来拦截系统操作',
    'ssdt 插件检查系统服务描述符表，SSDT Hook 是经典的内核级 rootkit 技术',
    'Linux 内存镜像可用 linux_pslist、linux_bash 等插件进行分析',
    '内存镜像的 profile 选择至关重要，错误的 profile 会导致解析失败',
    'Volatility3 不再需要手动指定 profile，通过符号表自动识别系统版本',
    'hashdump 可以从内存中提取 Windows 用户的 NTLM 密码哈希',
    'clipboard 插件可以恢复内存中剪贴板的内容',
    'screenshot 插件可以从内存中恢复当时桌面上窗口的布局截图',
    'timeliner 插件可综合多种时间戳生成完整的事件时间线',
    'procdump 可以导出进程的可执行文件，用于后续逆向分析',
    'yarascan 支持在内存中使用 YARA 规则进行恶意代码特征匹配',
    '内存取证的核心优势：能捕获磁盘取证无法获取的运行时数据，如解密后的密钥和密码',
  ];
  
  private currentIndex: number = 0;
  private intervalId: number | null = null;
  private containerElement: HTMLElement | null = null;
  private textElement: HTMLElement | null = null;
  private readonly interval: number = 15000; // 15秒切换一次
  private shownIndices: Set<number> = new Set(); // 记录已显示过的索引

  /**
   * 初始化文本循环播放
   */
  public init(): void {
    this.containerElement = document.getElementById('title-bar-carousel');
    if (!this.containerElement) {
      console.warn('⚠️ 标题栏文本循环容器未找到');
      return;
    }

    this.textElement = this.containerElement.querySelector('.carousel-text');
    if (!this.textElement) {
      console.warn('⚠️ 标题栏文本元素未找到');
      return;
    }

    // 显示随机第一条文本
    this.showRandomText();

    // 启动定时器
    this.start();

    //console.log('✅ 标题栏文本循环播放已启动');
  }

  /**
   * 显示指定索引的文本
   */
  private showText(index: number): void {
    if (!this.textElement) return;

    // 添加淡出效果
    this.textElement.style.opacity = '0';

    setTimeout(() => {
      if (!this.textElement) return;
      
      // 更新文本
      this.textElement.textContent = this.texts[index];
      
      // 添加淡入效果
      this.textElement.style.opacity = '1';
    }, 300); // 等待淡出动画完成
  }

  /**
   * 获取随机索引（不重复直到所有文本都显示过）
   */
  private getRandomIndex(): number {
    // 如果所有文本都显示过了，重置记录
    if (this.shownIndices.size >= this.texts.length) {
      this.shownIndices.clear();
    }

    // 获取未显示过的索引列表
    const availableIndices: number[] = [];
    for (let i = 0; i < this.texts.length; i++) {
      if (!this.shownIndices.has(i)) {
        availableIndices.push(i);
      }
    }

    // 随机选择一个索引
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    this.shownIndices.add(randomIndex);
    
    return randomIndex;
  }

  /**
   * 显示随机文本
   */
  private showRandomText(): void {
    const randomIndex = this.getRandomIndex();
    this.showText(randomIndex);
  }

  /**
   * 切换到下一条文本（随机）
   */
  private next(): void {
    this.showRandomText();
  }

  /**
   * 启动循环播放
   */
  public start(): void {
    if (this.intervalId !== null) {
      return; // 已经在运行
    }

    this.intervalId = window.setInterval(() => {
      this.next();
    }, this.interval);
  }

  /**
   * 停止循环播放
   */
  public stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 销毁实例
   */
  public destroy(): void {
    this.stop();
    this.containerElement = null;
    this.textElement = null;
  }
}

// 创建全局单例
export const titleBarCarousel = new TitleBarCarousel();
