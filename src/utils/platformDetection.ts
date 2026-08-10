/**
 * 平台检测工具
 * 用于检测当前运行的操作系统平台
 */

export interface PlatformInfo {
  isMacOS: boolean;
  isWindows: boolean;
  isLinux: boolean;
  platform: string;
  shouldUseNativeTitleBar: boolean;
}

/**
 * 检测当前平台信息
 */
export function detectPlatform(): PlatformInfo {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  
  const isMacOS = platform.includes('mac') || userAgent.includes('mac os');
  const isWindows = platform.includes('win') || userAgent.includes('windows');
  const isLinux = platform.includes('linux') || userAgent.includes('linux');
  
  return {
    isMacOS,
    isWindows,
    isLinux,
    platform: isMacOS ? 'macos' : isWindows ? 'windows' : isLinux ? 'linux' : 'unknown',
    shouldUseNativeTitleBar: isMacOS // 在 macOS 上使用原生标题栏
  };
}

/**
 * 获取平台特定的样式类名
 */
export function getPlatformStyleClass(): string {
  const platformInfo = detectPlatform();
  return `platform-${platformInfo.platform}`;
}

/**
 * 检查是否应该隐藏自定义标题栏
 */
export function shouldHideCustomTitleBar(): boolean {
  return detectPlatform().shouldUseNativeTitleBar;
}

/**
 * 获取平台特定的主容器边距
 */
export function getPlatformMainContainerMargin(): string {
  const platformInfo = detectPlatform();
  
  if (platformInfo.isMacOS) {
    // macOS 使用原生标题栏，不需要额外的上边距
    // 必须带单位：该值会参与 calc() 计算，unitless 0 在 calc 里无效
    return '0px';
  } else {
    // 其他平台使用自定义标题栏，需要为标题栏留出空间
    return '45px'; // 自定义标题栏的高度
  }
}

/**
 * 应用平台特定的样式
 */
export function applyPlatformStyles(): void {
  const platformInfo = detectPlatform();
  const body = document.body;
  
  // 添加平台特定的CSS类
  body.classList.add(getPlatformStyleClass());
  
  // 如果是 macOS，添加原生标题栏类
  if (platformInfo.shouldUseNativeTitleBar) {
    body.classList.add('native-titlebar');
  } else {
    body.classList.add('custom-titlebar');
  }
  
  console.log(`🖥️ 平台检测结果: ${platformInfo.platform}, 使用原生标题栏: ${platformInfo.shouldUseNativeTitleBar}`);
}

/**
 * 动态调整主容器的样式
 */
export function adjustMainContainerForPlatform(): void {
  const mainContainer = document.querySelector('.main-container') as HTMLElement;
  const appLayout = document.querySelector('.app-layout') as HTMLElement;
  
  if (mainContainer && appLayout) {
    // 只设置 --titlebar-h 这一个变量：.main-container 的 margin-top 与 height 都由它派生，
    // 二者永远一致。（旧实现直接写 inline margin-top，而 height 里硬编码 45px，
    // 一旦两者不符就会在顶部/底部出现空白条。）
    document.documentElement.style.setProperty(
      '--titlebar-h',
      getPlatformMainContainerMargin()
    );

    // 如果使用原生标题栏，调整应用布局
    if (shouldHideCustomTitleBar()) {
      appLayout.classList.add('native-titlebar-layout');
    }
  }
}
