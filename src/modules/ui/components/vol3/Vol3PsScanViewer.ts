/**
 * Vol3 进程扫描视图 (psscan)
 * 与 PsList 相同结构，额外标注已退出进程，便于发现隐藏进程
 */

import { Vol3PsListViewer } from './Vol3PsListViewer';

// psscan 和 pslist CSV 结构相同，直接复用
export class Vol3PsScanViewer extends Vol3PsListViewer {
  // 完全继承 PsListViewer 的功能
  // 唯一区别是使用 psscan 的数据文件
}
