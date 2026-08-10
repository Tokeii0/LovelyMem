/**
 * CSV 模块统计功能
 * 用于在 PID 列的右键菜单中显示模块统计信息
 */

const { invoke } = (window as any).__TAURI__.core;

/** 模块统计中“其它扩展名”分项 */
interface OtherBreakdownEntry {
    extension: string;
    count: number;
}

/** 后端返回的模块统计结果 */
interface ModuleStats {
    dll_count: number;
    sys_count: number;
    other_count: number;
    other_breakdown?: OtherBreakdownEntry[];
}

/** 右键菜单上下文数据（本模块用到的字段） */
interface ModuleStatsContextData {
    cellValue?: string;
}

/** 获取整行数据的回调 */
type GetFullRowData = () => Record<string, string> | null;

/**
 * 如果是 PID 列，显示模块统计
 * @param columnName - 列名
 * @param contextMenuData - 右键菜单上下文数据
 * @param getFullRowData - 获取整行数据的回调
 */
export async function showModuleStatsIfPID(
    columnName: string,
    contextMenuData: ModuleStatsContextData | null,
    getFullRowData?: GetFullRowData
): Promise<void> {
    const moduleStatsSection = document.getElementById('moduleStatsSection');

    if (!moduleStatsSection) return;

    // 检查是否是 PID 列
    if (columnName !== 'PID') {
        console.debug('[ModuleStats] 当前列非 PID，隐藏统计面板:', columnName);
        moduleStatsSection.style.display = 'none';
        return;
    }

    // 获取 PID 值
    const pid = contextMenuData?.cellValue;
    if (!pid || pid.trim() === '') {
        console.warn('[ModuleStats] PID 值为空，无法统计:', pid);
        moduleStatsSection.style.display = 'none';
        return;
    }

    // 获取当前行的完整数据以获取 Name 列的值
    const rowData = getFullRowData ? getFullRowData() : null;
    const processName = rowData?.Name || rowData?.Process || '';

    console.debug('[ModuleStats] 准备获取模块统计', { columnName, pid, processName });

    try {
        // 获取 output_path
        const settings = await invoke('load_settings_command') as { output_path?: string };
        console.debug('[ModuleStats] 读取到 settings.output_path:', settings?.output_path);
        const outputPath = settings.output_path;

        console.log(`开始获取 PID ${pid} 的模块统计...`);

        // 调用后端命令获取模块统计
        const stats = await invoke('get_module_stats_by_pid', {
            outputPath: outputPath,
            pid: pid
        }) as ModuleStats;

        console.log('模块统计结果:', stats);

        // 更新标题显示进程名
        const moduleStatsTitle = document.getElementById('moduleStatsTitle');
        if (moduleStatsTitle) {
            if (processName) {
                moduleStatsTitle.textContent = `模块统计(${processName})`;
            } else {
                moduleStatsTitle.textContent = '模块统计';
            }
        }

        // 更新显示
        const dllCountEl = document.getElementById('dllCount');
        const sysCountEl = document.getElementById('sysCount');
        if (dllCountEl) dllCountEl.textContent = String(stats.dll_count);
        if (sysCountEl) sysCountEl.textContent = String(stats.sys_count);

        const otherLabelEl = document.getElementById('otherLabel');
        const otherCountEl = document.getElementById('otherCount');

        const breakdown = Array.isArray(stats.other_breakdown) ? stats.other_breakdown : [];
        if (breakdown.length > 0) {
            const [top] = breakdown;
            const labelText = top.extension && top.extension !== '无扩展'
                ? `${top.extension}:`
                : '其它:';
            if (otherLabelEl) otherLabelEl.textContent = labelText;
            if (otherCountEl) otherCountEl.textContent = String(top.count);

            const detailItems = breakdown
                .map(entry => `${entry.extension}: ${entry.count}`);
            const detailText = detailItems.join(' | ');

            if (otherLabelEl) otherLabelEl.title = detailText;
            if (otherCountEl) otherCountEl.title = detailText;
        } else {
            if (otherLabelEl) {
                otherLabelEl.textContent = '其他:';
                otherLabelEl.removeAttribute('title');
            }
            if (otherCountEl) {
                otherCountEl.textContent = String(stats.other_count);
                otherCountEl.removeAttribute('title');
            }
        }

        // 添加点击事件：打开 modules.csv 并搜索当前 PID
        const moduleStatsContainer = moduleStatsSection.querySelector('.module-stats-container');
        if (moduleStatsContainer) {
            // 移除旧的点击事件
            const newContainer = moduleStatsContainer.cloneNode(true) as HTMLElement;
            moduleStatsContainer.parentNode?.replaceChild(newContainer, moduleStatsContainer);

            // 添加点击事件
            newContainer.style.cursor = 'pointer';
            newContainer.addEventListener('click', async () => {
                try {
                    const searchValue = processName || pid;
                    console.log(`打开 modules.csv 并搜索: ${searchValue}`);
                    await invoke('open_csv_viewer', {
                        csvFilePath: 'modules.csv',
                        windowTitle: processName ? `模块列表 - ${processName}` : `模块列表 - PID ${pid}`,
                        searchQuery: searchValue
                    });
                } catch (error) {
                    console.error('打开 modules.csv 失败:', error);
                }
            });
        }

        // 显示统计区域
        moduleStatsSection.style.display = 'block';

    } catch (error) {
        console.error('获取模块统计失败:', error);
        if (error && (error as Error).stack) {
            console.error('[ModuleStats] 错误堆栈:', (error as Error).stack);
        }
        console.error('[ModuleStats] 请求参数:', {
            columnName,
            pid,
            contextMenuData,
        });
        // 发生错误时隐藏统计区域
        moduleStatsSection.style.display = 'none';
    }
}
