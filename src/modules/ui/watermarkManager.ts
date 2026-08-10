/**
 * 水印管理器
 * 在页面上添加半透明的Canvas水印层,包含用户信息
 */

// 水印配置接口
export interface WatermarkConfig {
  enabled: boolean;
  custom_text: string;
  opacity: number;
  font_size: number;
  density: number; // 密集程度 0.5-2.0，1.0为默认
}

export class WatermarkManager {
  private canvas: HTMLCanvasElement | null = null;
  private startupTimestamp: number;
  private currentQQ: string = '';
  private themeObserver: MutationObserver | null = null;
  private config: WatermarkConfig = {
    enabled: true,
    custom_text: '',
    opacity: 0.1,
    font_size: 20,
    density: 1.0
  };

  // Base58字符集 (去掉了0OIl等容易混淆的字符)
  private static readonly BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  constructor() {
    // 记录启动时间戳
    this.startupTimestamp = Date.now();
  }

  /**
   * Base58编码
   * @param input 输入字符串
   * @returns Base58编码后的字符串
   */
  private base58Encode(input: string): string {
    // 将字符串转换为字节数组
    const bytes = new TextEncoder().encode(input);

    // 转换为大整数
    let num = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
      num = num * BigInt(256) + BigInt(bytes[i]);
    }

    // 转换为Base58
    let encoded = '';
    const base = BigInt(58);

    while (num > BigInt(0)) {
      const remainder = Number(num % base);
      encoded = WatermarkManager.BASE58_ALPHABET[remainder] + encoded;
      num = num / base; // BigInt除法会自动向下取整
    }

    // 处理前导零
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
      encoded = WatermarkManager.BASE58_ALPHABET[0] + encoded;
    }

    return encoded || WatermarkManager.BASE58_ALPHABET[0];
  }

  /**
   * 设置水印配置
   * @param config 水印配置
   */
  public setConfig(config: Partial<WatermarkConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('💧 水印配置已更新:', this.config);
  }

  /**
   * 获取当前配置
   */
  public getConfig(): WatermarkConfig {
    return { ...this.config };
  }

  /**
   * 检查水印是否启用
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 添加水印到页面
   * @param qq 用户QQ号
   */
  public addWatermark(qq: string): void {
    // 检查水印是否启用
    if (!this.config.enabled) {
      console.log('💧 水印已禁用，跳过添加');
      return;
    }

    // 保存当前QQ号
    this.currentQQ = qq;

    // 如果已经存在水印,先移除
    this.removeWatermark();

    // 创建Canvas元素
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');

    if (!ctx) {
      console.error('❌ 无法获取Canvas 2D上下文');
      return;
    }

    // 设置Canvas尺寸为窗口大小
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // 设置Canvas样式 - 使用配置的透明度
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
      opacity: ${this.config.opacity};
    `;

    // 设置水印文本内容
    let watermarkText: string;
    if (this.config.custom_text) {
      // 使用自定义文本
      watermarkText = this.config.custom_text;
    } else {
      // 使用默认水印: Base58编码的QQ号-启动时间戳
      const encodedQQ = this.base58Encode(qq);
      watermarkText = `${encodedQQ}-${this.startupTimestamp}`;
    }

    // 检测当前主题,深色主题使用白色,浅色主题使用黑色
    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkTheme ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';

    // 设置字体和颜色 - 使用配置的字体大小
    ctx.font = `${this.config.font_size}px Arial`;
    ctx.fillStyle = textColor;

    // 保存当前状态
    ctx.save();

    // 旋转画布 -20度
    ctx.rotate(-20 * Math.PI / 180);

    // 斜向重复绘制水印 - 根据密集程度调整间距
    // density: 0.5 = 稀疏(间距x2), 1.0 = 默认, 2.0 = 密集(间距x0.5)
    const baseXSpacing = 350;
    const baseYSpacing = 200;
    const xSpacing = baseXSpacing / this.config.density; // 密集程度越高，间距越小
    const ySpacing = baseYSpacing / this.config.density;
    const xCount = Math.ceil(this.canvas.width / xSpacing) + 5; // 多绘制几列以覆盖旋转后的空白
    const yCount = Math.ceil(this.canvas.height / ySpacing) + 5; // 多绘制几行

    for (let i = -2; i < xCount; i++) {
      for (let j = -2; j < yCount; j++) {
        ctx.fillText(watermarkText, i * xSpacing, j * ySpacing);
      }
    }

    // 恢复状态
    ctx.restore();

    // 添加到页面
    document.body.appendChild(this.canvas);

    // 监听窗口大小变化,重新绘制水印
    this.setupResizeListener(qq);

    // 监听主题变化,重新绘制水印
    this.setupThemeListener();

    console.log(`✅ 水印已添加: ${watermarkText} (透明度: ${this.config.opacity}, 字体: ${this.config.font_size}px, 密集度: ${this.config.density})`);
  }

  /**
   * 移除水印
   */
  public removeWatermark(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
      this.canvas = null;
    }

    // 移除主题监听器
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
  }

  /**
   * 设置窗口大小变化监听器
   * @param qq 用户QQ号
   */
  private setupResizeListener(qq: string): void {
    // 防抖处理,避免频繁重绘
    let resizeTimer: number | null = null;

    window.addEventListener('resize', () => {
      if (resizeTimer !== null) {
        clearTimeout(resizeTimer);
      }

      resizeTimer = window.setTimeout(() => {
        // 窗口大小变化后重新绘制水印
        this.addWatermark(qq);
        resizeTimer = null;
      }, 300);
    });
  }

  /**
   * 设置主题变化监听器
   */
  private setupThemeListener(): void {
    // 移除旧的监听器
    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }

    // 使用MutationObserver监听data-theme属性变化
    this.themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          console.log('🎨 检测到主题变化,重新绘制水印');
          // 主题变化后重新绘制水印
          if (this.currentQQ) {
            this.addWatermark(this.currentQQ);
          }
        }
      });
    });

    // 监听documentElement的data-theme属性变化
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    console.log('✅ 主题监听器已设置');
  }

  /**
   * 更新水印(用于QQ号变化时)
   * @param qq 新的QQ号
   */
  public updateWatermark(qq: string): void {
    this.addWatermark(qq);
  }

  /**
   * 获取启动时间戳
   */
  public getStartupTimestamp(): number {
    return this.startupTimestamp;
  }
}

// 导出单例实例
export const watermarkManager = new WatermarkManager();

