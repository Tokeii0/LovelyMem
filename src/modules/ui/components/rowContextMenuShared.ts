/**
 * 第二视图（进程树 / 服务 / 模块 / 驱动 / 网络 / 句柄 / 文件树）复用
 * CSV 表格视图右键菜单的共享契约与工具。
 *
 * EmbeddedCSVViewer 通过 showSharedRowContextMenu 结构化实现本接口，各第二视图
 * 只需把「被右键的行/卡片」解析成以原始 CSV 列名为键的 rowData，再委托给 host，
 * 即可获得与表格视图完全一致的菜单（复制/查看行详情/CSV 插件/查看文件内容/
 * 可视化进程内存/凭据/时区转换/AI 分析等）。
 */

export interface SharedRowContextMenuOptions {
  /** 以原始 CSV 列名为键的整行数据 */
  rowData: Record<string, string>;
  columnName?: string;
  cellValue?: string;
  /** 原始文件名（如 'process.csv'），用于条件菜单项判断 */
  loadFileName?: string;
  /** 显示名（如 '进程信息'），用于条件菜单项判断 */
  displayName?: string;
  x: number;
  y: number;
}

export interface RowContextMenuHost {
  showSharedRowContextMenu(opts: SharedRowContextMenuOptions): Promise<void>;
}

/** 解析器：把被右键的目标元素解析为行上下文；返回 null 表示忽略本次右键 */
export type RowContextResolver = (
  target: HTMLElement
) => { rowData: Record<string, string>; columnName?: string; cellValue?: string } | null;

/**
 * 在容器上绑定一个委托式 contextmenu 监听，命中行时弹出共享 CSV 右键菜单。
 * 返回解绑函数，便于组件 cleanup。
 */
export function attachSharedRowContextMenu(
  container: HTMLElement,
  getHost: () => RowContextMenuHost | null,
  fileCtx: { loadFileName: string; displayName: string },
  resolve: RowContextResolver
): () => void {
  const handler = (e: Event) => {
    const host = getHost();
    if (!host) return;
    const me = e as MouseEvent;
    const info = resolve(me.target as HTMLElement);
    if (!info) return;
    e.preventDefault();
    void host.showSharedRowContextMenu({
      rowData: info.rowData,
      columnName: info.columnName,
      cellValue: info.cellValue,
      loadFileName: fileCtx.loadFileName,
      displayName: fileCtx.displayName,
      x: me.clientX,
      y: me.clientY,
    });
  };
  container.addEventListener('contextmenu', handler);
  return () => container.removeEventListener('contextmenu', handler);
}
