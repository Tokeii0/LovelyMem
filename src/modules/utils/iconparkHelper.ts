/**
 * 图标助手模块（基于 Lucide Icons）
 * 保持 IconParkHelper 类名以兼容所有消费者文件
 */

import {
  Circle, Hourglass, RefreshCw, CircleCheck, CircleX, AlertTriangle, Trophy,
  Monitor, FolderOpen, Settings, Code, Bookmark, Pencil, Image,
  ChartLine, List, FileText, PenLine, Lock, Wrench,
  Upload, Download, Trash2, Folder, Search, Save,
  Link, Link2, Play, ChevronsRight, Plus, PlusCircle,
  Home, SlidersHorizontal, Puzzle, Info, Diamond, Rocket,
  Droplet, Star, User, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Bot,
  Archive, Shield,
  // Markdown Editor
  Eye, Columns, Bold, Italic, Strikethrough, Heading, ListOrdered, Quote, Table, Undo, Redo,
  // Additional
  Pause, Filter, ArrowDownAZ, Clipboard, X, FolderClosed, AlertOctagon, MessageSquare, Clock, Copy,
  ZoomIn, ZoomOut, Maximize, Minimize, Cpu, Network, GitBranch,
  // Plugin Manager
  CheckCircle, MinusCircle, Plug, Plug2, Tag, Inbox, Box, Check,
  // Report Editor and Timeline
  FolderPlus, Globe, Database,
  // Event Viewer and AI Chat
  ScrollText, Wand2,
  // Settings Manager
  Zap, EyeOff, Ban, Brain, Cog, Settings2, Webhook,
  SplitSquareHorizontal,
} from 'lucide';

import type { IconNode } from 'lucide';

/**
 * IconPark 图标助手类（内部已迁移至 Lucide）
 */
export class IconParkHelper {
  private static readonly DEFAULT_SIZE = 16;
  private static readonly DEFAULT_STROKE_WIDTH = 2;
  private static readonly DEFAULT_FILL = 'currentColor';

  /**
   * 将 Lucide IconNode 渲染为 SVG 字符串
   */
  private static renderIconNode(
    iconNode: IconNode,
    size: number,
    color: string,
    strokeWidth: number
  ): string {
    const children = iconNode.map(([tag, attrs]) => {
      // 显式设置 fill="none"，防止 CSS 中 svg { fill: currentColor } 覆盖
      const mergedAttrs = { fill: 'none', ...attrs };
      const attrStr = Object.entries(mergedAttrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrStr}/>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
  }

  /**
   * 图标映射表 - 内部名称到 Lucide 图标数据的映射
   */
  private static readonly ICON_BUILDERS: Record<string, IconNode> = {
    'dot': Circle,
    'hourglass': Hourglass,
    'refresh': RefreshCw,
    'check-circle': CircleCheck,
    'close-circle': CircleX,
    'warning': AlertTriangle,
    'celebrate': Trophy,
    'computer': Monitor,
    'folder-open': FolderOpen,
    'setting': Settings,
    'code': Code,
    'bookmark': Bookmark,
    'edit': Pencil,
    'pic': Image,
    'chart-line': ChartLine,
    'list': List,
    'file-text': FileText,
    'edit-name': PenLine,
    'lock': Lock,
    'tool': Wrench,
    'upload': Upload,
    'download': Download,
    'delete': Trash2,
    'folder': Folder,
    'search': Search,
    'save': Save,
    'link': Link,
    'connection': Link2,
    'play': Play,
    'play-double': ChevronsRight,
    'plus': Plus,
    'add': Plus,
    'add-circle': PlusCircle,
    'home': Home,
    'sliders': SlidersHorizontal,
    'puzzle': Puzzle,
    'info': Info,
    'help': Info,
    'diamond': Diamond,
    'rocket': Rocket,
    'drop': Droplet,
    'star': Star,
    'user': User,
    'right': ChevronRight,
    'left': ChevronLeft,
    'up': ChevronUp,
    'down': ChevronDown,
    'robot': Bot,
    'file-cabinet': Archive,
    'shield': Shield,
    // Markdown Editor Icons
    'markdown': FileText,
    'preview-open': Eye,
    'split': SplitSquareHorizontal,
    'text-bold': Bold,
    'text-italic': Italic,
    'strikethrough': Strikethrough,
    'h': Heading,
    'link-one': Link,
    'ordered-list': ListOrdered,
    'quote': Quote,
    'table': Table,
    'undo': Undo,
    'redo': Redo,
    'add-one': PlusCircle,
    // Additional icons
    'pause': Pause,
    'pause-one': Pause,
    'filter': Filter,
    'sort': ArrowDownAZ,
    'clipboard': Clipboard,
    'close': X,
    'folder-close': FolderClosed,
    'close-one': CircleX,
    'attention': AlertTriangle,
    'caution': AlertOctagon,
    'message': MessageSquare,
    'time': Clock,
    'copy': Copy,
    'zoom-in': ZoomIn,
    'zoom-out': ZoomOut,
    'full-screen': Maximize,
    'off-screen': Minimize,
    'cpu': Cpu,
    'network-tree': GitBranch,
    'mind-mapping': Network,
    'process-galaxy': Network,
    // Plugin Manager icons
    'check-correct': CheckCircle,
    'reduce-one': MinusCircle,
    'plug-one': Plug2,
    'plug': Plug,
    'electric-plug': Plug,
    'tag-one': Tag,
    'tag': Tag,
    'inbox-in': Inbox,
    'cloud': Inbox,
    'box': Box,
    'package': Box,
    'check-small': Check,
    // Report Editor icons
    'folder-plus': FolderPlus,
    // Timeline Galaxy icons
    'planet': Globe,
    'data': Database,
    // Event Viewer icon
    'log': ScrollText,
    // AI Chat icon
    'magic': Wand2,
    // Settings Manager icons
    'flash': Zap,
    'preview-close': EyeOff,
    'forbid': Ban,
    'brain': Brain,
    'config': Cog,
    'setting-config': Settings2,
    'check': Check,
    'api': Webhook,
  };

  /**
   * Emoji 到图标名称的映射
   */
  private static readonly EMOJI_MAP: Record<string, string> = {
    // 状态指示器
    '🟢': 'dot',
    '⏳': 'hourglass',
    '🔄': 'refresh',
    '✅': 'check-circle',
    '❌': 'close-circle',
    '❓': 'warning',
    '🎉': 'celebrate',
    '⚠️': 'warning',

    // 按钮图标
    '💻': 'computer',
    '🗂️': 'folder-open',
    '⚙️': 'setting',
    '🐍': 'code',
    '🔖': 'bookmark',
    '📝': 'edit',

    // 文件操作图标
    '📂': 'folder-open',
    '🖼️': 'pic',
    '📊': 'chart-line',
    '📋': 'list',
    '📄': 'file-text',
    '✏️': 'edit-name',
    '🔐': 'lock',
    '🔧': 'tool',
    '📤': 'upload',
    '📥': 'download',
    '🗑️': 'delete',
    '📁': 'folder-open',
    '🔍': 'search',
    '💾': 'save',
    '📎': 'link',
    '🔗': 'connection',
    '▶': 'play',
    '▶▶': 'play-double',
    '➕': 'plus',
    '🆕': 'add-circle',
    '🏠': 'home',
    '🎛️': 'sliders',
    '🧩': 'puzzle',
    '🤖': 'robot',
    '🗄️': 'file-cabinet',
    '🛡️': 'shield',

    // 星图/进程关系图标
    '🌌': 'mind-mapping',

    // 时间线/星迹图标
    '⏱️': 'time',
    // 插件管理器图标
    '🔌': 'plug',
    '🏷️': 'tag-one',
    '📦': 'box',
    '☑️': 'check-correct',
    '☐': 'reduce-one',
    // 事件查看器图标
    '📅': 'log',
    // AI助手图标
    '✨': 'magic',
    // 设置界面图标
    '⚡': 'flash',
    '👁️': 'preview-open',
    '🚫': 'forbid',
    '🧠': 'brain',
    '✓': 'check',
  };

  /**
   * 获取 SVG 字符串
   */
  static getSvgString(
    iconName: string,
    options?: {
      size?: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    }
  ): string {
    const iconNode = this.ICON_BUILDERS[iconName];
    if (!iconNode) {
      console.warn(`Icon not found: ${iconName}`);
      return '';
    }

    const size = options?.size ?? this.DEFAULT_SIZE;
    const strokeWidth = options?.strokeWidth ?? this.DEFAULT_STROKE_WIDTH;
    const color = options?.fill || options?.stroke || this.DEFAULT_FILL;

    try {
      return this.renderIconNode(iconNode, size, color, strokeWidth);
    } catch (e) {
      console.error(`Error generating icon ${iconName}:`, e);
      return '';
    }
  }

  /**
   * 获取 HTML 元素
   */
  static getHtmlElement(
    iconName: string,
    options?: {
      size?: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      className?: string;
    }
  ): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = this.getSvgString(iconName, options);
    const svg = div.querySelector('svg') as SVGSVGElement | null;

    if (svg) {
      if (options?.className) {
        svg.classList.add(...options.className.split(' '));
      }
      svg.style.display = 'block';
    }

    return (svg as unknown as HTMLElement) || div;
  }

  /**
   * 从 emoji 获取图标名称
   */
  static getIconNameFromEmoji(emoji: string): string | null {
    return this.EMOJI_MAP[emoji] || null;
  }

  /**
   * 批量获取图标映射
   * @deprecated 仅用于兼容旧代码
   */
  static getIconMappings(): Record<string, string> {
    const mappings: Record<string, string> = {};
    for (const key of Object.keys(this.ICON_BUILDERS)) {
      mappings[key] = this.getSvgString(key);
    }
    return mappings;
  }
}

export default IconParkHelper;
