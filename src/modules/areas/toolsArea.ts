import { FeatureConfig } from '../core/types';
import { toolsManager, ToolsManager } from '../tools/toolsManager';
import { IconParkHelper } from '../utils/iconparkHelper';

/** 生成内置工具卡片的 SVG 图标（统一走 Lucide 图标系统，取代 emoji） */
const svg = (name: string): string => IconParkHelper.getSvgString(name, { size: 22 });

export class ToolsArea {
  /**
   * 获取内置功能
   */
  static getBuiltinFeatures(): FeatureConfig[] {
    return [
      {
        icon: svg('search'),
        title: '字符串搜索',
        desc: '高性能字符串提取和搜索工具',
        feature: 'string-search',
        category: 'search'
      },
      {
        icon: svg('info'),
        title: 'EXIF查看器',
        desc: '查看图片EXIF元数据信息',
        feature: 'exif-viewer',
        category: 'viewer'
      },
      {
        icon: svg('pic'),
        title: 'Image Finder',
        desc: '从内存镜像中提取JPG和PNG图像文件',
        feature: 'image-finder',
        category: 'extract'
      },
      {
        icon: svg('preview-open'),
        title: '图片隐写分析器',
        desc: '专业图像隐写分析工具，支持通道分析和位平面检测',
        feature: 'stegsolve-analyzer',
        category: 'analysis'
      },
      {
        icon: svg('time'),
        title: 'Super Timeline',
        desc: '统一取证时间线 - 聚合NTFS/EVTX/注册表/进程多源事件',
        feature: 'super-timeline',
        category: 'analysis'
      },
      {
        icon: svg('puzzle'),
        title: '内存图像可视化',
        desc: '将内存 dump 按宽高/像素格式解释为图像并实时预览，支持熵值分析定位隐藏图片',
        feature: 'memory-image-visualizer',
        category: 'analysis'
      },
      {
        icon: svg('data'),
        title: 'SQLite 查看器',
        desc: '只读打开任意 SQLite 数据库（微信解密产物、浏览器 History/Cookies），支持浏览器取证预设查询',
        feature: 'sqlite-viewer',
        category: 'viewer'
      },
      {
        icon: svg('code'),
        title: 'Hex 查看器',
        desc: '按偏移分块查看任意文件的十六进制/ASCII，大文件懒加载不卡顿，支持跳转偏移',
        feature: 'hex-viewer',
        category: 'viewer'
      },
      {
        icon: svg('shield'),
        title: 'IOC 提取',
        desc: '从文本或文件中自动提取 IP/域名/URL/邮箱/哈希/比特币地址等失陷指标，一键导出报告',
        feature: 'ioc-extractor',
        category: 'analysis'
      },
      {
        icon: svg('chart-line'),
        title: '注册表取证',
        desc: '解析 Vol3 导出的 UserAssist/ShimCache/Amcache CSV，提供时间线、运行次数与可疑持久化高亮',
        feature: 'registry-forensics',
        category: 'analysis'
      }
    ];
  }

  /**
   * 获取自定义工具功能
   */
  static async getCustomToolFeatures(): Promise<FeatureConfig[]> {
    try {
      const customTools = await toolsManager.loadTools();

      return customTools
        .filter(tool => tool.enabled)
        .map(tool => ({
          icon: tool.icon,
          title: tool.name,
          desc: tool.description,
          feature: `custom-tool-${tool.id}`,
          category: tool.category || 'other'
        }));
    } catch (error) {
      console.error('加载自定义工具失败:', error);
      return [];
    }
  }

  /**
   * 获取所有功能（内置 + 自定义）
   */
  static async getFeatures(): Promise<FeatureConfig[]> {
    const builtinFeatures = this.getBuiltinFeatures();
    const customFeatures = await this.getCustomToolFeatures();

    return [...builtinFeatures, ...customFeatures];
  }

  /**
   * 同步版本的getFeatures，用于向后兼容
   */
  static getFeaturesSync(): FeatureConfig[] {
    return this.getBuiltinFeatures();
  }

  static getConfig() {
    return {
      name: '小工具',
      desc: '实用辅助工具集',
      icon: '/assets/Tools.png',
      color: '#ffa726'
    };
  }

  /**
   * 检查是否是自定义工具功能
   */
  static isCustomToolFeature(feature: string): boolean {
    return ToolsManager.isCustomToolFeature(feature);
  }

  /**
   * 从功能名称中提取工具ID
   */
  static extractToolIdFromFeature(feature: string): string {
    return ToolsManager.extractToolIdFromFeature(feature);
  }
}
