import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

export interface CSVRow {
    [key: string]: string;
}

export interface CSVData {
    headers: string[];
    rows: CSVRow[];
    rawData: string[][];
}

export class CSVReader {
    private static instance: CSVReader;
    
    public static getInstance(): CSVReader {
        if (!CSVReader.instance) {
            CSVReader.instance = new CSVReader();
        }
        return CSVReader.instance;
    }

    /**
     * 解析CSV文本内容
     * @param csvText CSV文本内容
     * @param delimiter 分隔符，默认为逗号
     * @returns 解析后的CSV数据
     */
    public parseCSV(csvText: string, delimiter: string = ','): CSVData {
        const lines = csvText.trim().split('\n');
        if (lines.length === 0) {
            throw new Error('CSV文件为空');
        }

        const rawData: string[][] = [];
        
        // 解析每一行，处理引号内的逗号
        for (const line of lines) {
            const row = this.parseCSVLine(line, delimiter);
            rawData.push(row);
        }

        if (rawData.length === 0) {
            throw new Error('CSV文件没有有效数据');
        }

        const headers = rawData[0];
        const dataRows = rawData.slice(1);
        
        // 将数据转换为对象数组
        const rows: CSVRow[] = dataRows.map(row => {
            const rowObj: CSVRow = {};
            headers.forEach((header, index) => {
                rowObj[header] = row[index] || '';
            });
            return rowObj;
        });

        return {
            headers,
            rows,
            rawData
        };
    }

    /**
     * 解析单行CSV，处理引号和转义字符
     * @param line CSV行文本
     * @param delimiter 分隔符
     * @returns 解析后的字段数组
     */
    private parseCSVLine(line: string, delimiter: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // 转义的引号
                    current += '"';
                    i += 2;
                } else {
                    // 切换引号状态
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === delimiter && !inQuotes) {
                // 分隔符（不在引号内）
                result.push(current.trim());
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    /**
     * 打开文件对话框选择CSV文件
     * @returns 选择的文件路径
     */
    public async selectCSVFile(): Promise<string | null> {
        try {
            const selected = await open({
                multiple: false,
                filters: [
                    {
                        name: 'CSV Files',
                        extensions: ['csv']
                    },
                    {
                        name: 'Text Files',
                        extensions: ['txt']
                    }
                ]
            });

            return selected as string | null;
        } catch (error) {
            console.error('文件选择失败:', error);
            throw new Error('文件选择失败');
        }
    }

    /**
     * 读取CSV文件
     * @param filePath 文件路径，如果不提供则打开文件选择对话框
     * @returns CSV数据
     */
    public async readCSVFile(filePath?: string): Promise<CSVData> {
        try {
            let targetPath = filePath;
            
            if (!targetPath) {
                const selectedPath = await this.selectCSVFile();
                if (!selectedPath) {
                    throw new Error('未选择文件');
                }
                targetPath = selectedPath;
            }

            const content = await readTextFile(targetPath);
            return this.parseCSV(content);
        } catch (error) {
            console.error('读取CSV文件失败:', error);
            throw error;
        }
    }

    /**
     * 在独立窗口中显示CSV数据
     * @param csvData CSV数据
     * @param windowTitle 窗口标题
     */
    public async showCSVInNewWindow(csvData: CSVData, windowTitle: string = 'CSV查看器'): Promise<void> {
        try {
            const windowLabel = `csv-viewer-${Date.now()}`;
            
            // 创建新窗口
            const webview = new WebviewWindow(windowLabel, {
                url: 'csv_viewer.html',
                title: windowTitle,
                width: 1000,
                height: 700,
                minWidth: 600,
                minHeight: 400,
                resizable: true,
                maximizable: true,
                center: true,
                decorations: false
            });

            // 等待窗口加载完成
            await webview.once('tauri://created', () => {
                console.log('CSV查看器窗口已创建');
            });

            // 延迟发送数据，确保窗口和JS都已加载完成
            setTimeout(async () => {
                try {
                    console.log('发送CSV数据到窗口:', csvData);
                    await webview.emit('csv-data', csvData);
                    console.log('CSV数据发送成功');
                } catch (error) {
                    console.error('发送CSV数据到窗口失败:', error);
                }
            }, 1000); // 延迟1秒确保窗口完全加载

        } catch (error) {
            console.error('创建CSV查看器窗口失败:', error);
            throw error;
        }
    }

    /**
     * 将CSV数据导出为HTML表格
     * @param csvData CSV数据
     * @returns HTML字符串
     */
    public exportToHTML(csvData: CSVData): string {
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>CSV数据</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    background: #f5f5f5;
                }
                .container {
                    background: white;
                    border-radius: 8px;
                    padding: 20px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    overflow: auto;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 14px;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 8px 12px;
                    text-align: left;
                    white-space: nowrap;
                }
                th {
                    background: #f8f9fa;
                    font-weight: 600;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                tr:nth-child(even) {
                    background: #f9f9f9;
                }
                tr:hover {
                    background: #e3f2fd;
                }
                .stats {
                    margin-bottom: 20px;
                    padding: 15px;
                    background: #e8f5e8;
                    border-radius: 4px;
                    border-left: 4px solid #4caf50;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="stats">
                    <strong>数据统计:</strong> 共 ${csvData.rows.length} 行数据，${csvData.headers.length} 列
                </div>
                <table>
                    <thead>
                        <tr>`;
        
        // 添加表头
        csvData.headers.forEach(header => {
            html += `<th>${this.escapeHtml(header)}</th>`;
        });
        
        html += `</tr></thead><tbody>`;
        
        // 添加数据行
        csvData.rows.forEach(row => {
            html += '<tr>';
            csvData.headers.forEach(header => {
                html += `<td>${this.escapeHtml(row[header] || '')}</td>`;
            });
            html += '</tr>';
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        </body>
        </html>`;
        
        return html;
    }

    /**
     * HTML转义
     * @param text 需要转义的文本
     * @returns 转义后的文本
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 搜索CSV数据
     * @param csvData CSV数据
     * @param searchTerm 搜索词
     * @param searchColumns 搜索的列，如果为空则搜索所有列
     * @returns 匹配的行
     */
    public searchCSV(csvData: CSVData, searchTerm: string, searchColumns?: string[]): CSVRow[] {
        if (!searchTerm.trim()) {
            return csvData.rows;
        }

        const term = searchTerm.toLowerCase();
        const columnsToSearch = searchColumns || csvData.headers;

        return csvData.rows.filter(row => {
            return columnsToSearch.some(column => {
                const value = row[column] || '';
                return value.toLowerCase().includes(term);
            });
        });
    }

    /**
     * 获取CSV列的统计信息
     * @param csvData CSV数据
     * @param columnName 列名
     * @returns 统计信息
     */
    public getColumnStats(csvData: CSVData, columnName: string) {
        if (!csvData.headers.includes(columnName)) {
            throw new Error(`列 "${columnName}" 不存在`);
        }

        const values = csvData.rows.map(row => row[columnName]).filter(val => val && val.trim());
        const uniqueValues = [...new Set(values)];

        return {
            totalCount: csvData.rows.length,
            nonEmptyCount: values.length,
            emptyCount: csvData.rows.length - values.length,
            uniqueCount: uniqueValues.length,
            uniqueValues: uniqueValues.slice(0, 10), // 只返回前10个唯一值作为示例
            hasMoreUniqueValues: uniqueValues.length > 10
        };
    }
}

// 导出单例实例
export const csvReader = CSVReader.getInstance(); 