import { csvReader, CSVData } from './csvReader';
import { MessageManager } from '../../utils/message';

/**
 * CSV功能使用示例
 */
export class CSVExample {
    private csvData: CSVData | null = null;

    /**
     * 创建CSV功能按钮
     */
    public createCSVButtons(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'csv-controls';
        container.innerHTML = `
            <style>
                .csv-controls {
                    display: flex;
                    gap: 10px;
                    padding: 20px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    margin: 20px;
                }
                
                .csv-btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                    min-width: 120px;
                }
                
                .csv-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                
                .csv-btn:active {
                    transform: translateY(0);
                }
                
                .csv-btn.primary {
                    background: #007bff;
                    color: white;
                }
                
                .csv-btn.primary:hover {
                    background: #0056b3;
                }
                
                .csv-btn.secondary {
                    background: #6c757d;
                    color: white;
                }
                
                .csv-btn.secondary:hover {
                    background: #545b62;
                }
                
                .csv-btn.success {
                    background: #28a745;
                    color: white;
                }
                
                .csv-btn.success:hover {
                    background: #1e7e34;
                }
                
                .csv-btn:disabled {
                    background: #e9ecef;
                    color: #6c757d;
                    cursor: not-allowed;
                    transform: none;
                }
                
                .csv-info {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    padding: 0 15px;
                    background: #f8f9fa;
                    border-radius: 4px;
                    font-size: 14px;
                    color: #495057;
                }
            </style>
            
            <button id="loadCsvBtn" class="csv-btn primary">📄 加载CSV文件</button>
            <button id="viewCsvBtn" class="csv-btn secondary" disabled>🔍 查看数据</button>
            <button id="newWindowBtn" class="csv-btn success" disabled>🪟 新窗口查看</button>
            <div id="csvInfo" class="csv-info">请选择CSV文件...</div>
        `;

        this.setupEventListeners(container);
        return container;
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(container: HTMLElement): void {
        const loadBtn = container.querySelector('#loadCsvBtn') as HTMLButtonElement;
        const viewBtn = container.querySelector('#viewCsvBtn') as HTMLButtonElement;
        const newWindowBtn = container.querySelector('#newWindowBtn') as HTMLButtonElement;
        const csvInfo = container.querySelector('#csvInfo') as HTMLElement;

        // 加载CSV文件
        loadBtn?.addEventListener('click', async () => {
            try {
                loadBtn.disabled = true;
                loadBtn.textContent = '📄 加载中...';
                csvInfo.textContent = '正在选择和加载文件...';

                this.csvData = await csvReader.readCSVFile();
                
                csvInfo.textContent = `已加载: ${this.csvData.rows.length} 行数据，${this.csvData.headers.length} 列`;
                viewBtn.disabled = false;
                newWindowBtn.disabled = false;
                
                console.log('CSV数据加载成功:', this.csvData);
                
            } catch (error: any) {
                console.error('加载CSV失败:', error);
                csvInfo.textContent = '加载失败: ' + error.message;
            } finally {
                loadBtn.disabled = false;
                loadBtn.textContent = '📄 加载CSV文件';
            }
        });

        // 在当前窗口查看数据
        viewBtn?.addEventListener('click', () => {
            if (this.csvData) {
                this.showCSVInCurrentWindow(this.csvData);
            }
        });

        // 在新窗口查看数据
        newWindowBtn?.addEventListener('click', async () => {
            if (this.csvData) {
                try {
                    newWindowBtn.disabled = true;
                    newWindowBtn.textContent = '🪟 打开中...';
                    
                    await csvReader.showCSVInNewWindow(this.csvData, 'CSV数据查看器');
                    
                } catch (error: any) {
                    console.error('打开新窗口失败:', error);
                    MessageManager.showError('打开新窗口失败: ' + error.message);
                } finally {
                    newWindowBtn.disabled = false;
                    newWindowBtn.textContent = '🪟 新窗口查看';
                }
            }
        });
    }

    /**
     * 在当前窗口中显示CSV数据
     */
    private showCSVInCurrentWindow(csvData: CSVData): void {
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'csv-modal';
        modal.innerHTML = `
            <style>
                .csv-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                
                .csv-modal-content {
                    background: white;
                    border-radius: 8px;
                    width: 90%;
                    height: 80%;
                    max-width: 1200px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                
                .csv-modal-header {
                    padding: 20px;
                    border-bottom: 1px solid #e9ecef;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .csv-modal-header h2 {
                    margin: 0;
                    color: #495057;
                }
                
                .csv-close-btn {
                    background: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 14px;
                }
                
                .csv-close-btn:hover {
                    background: #c82333;
                }
                
                .csv-modal-body {
                    flex: 1;
                    overflow: auto;
                    padding: 20px;
                }
                
                .csv-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 14px;
                }
                
                .csv-table th,
                .csv-table td {
                    border: 1px solid #dee2e6;
                    padding: 8px 12px;
                    text-align: left;
                }
                
                .csv-table th {
                    background: #f8f9fa;
                    font-weight: 600;
                    position: sticky;
                    top: 0;
                }
                
                .csv-table tr:nth-child(even) {
                    background: #f8f9fa;
                }
                
                .csv-table tr:hover {
                    background: #e3f2fd;
                }
                
                .csv-stats {
                    padding: 15px;
                    background: #e8f5e8;
                    border-radius: 4px;
                    margin-bottom: 15px;
                    font-size: 14px;
                    color: #2e7d32;
                }
            </style>
            
            <div class="csv-modal-content">
                <div class="csv-modal-header">
                    <h2>CSV数据查看</h2>
                    <button class="csv-close-btn">关闭</button>
                </div>
                <div class="csv-modal-body">
                    <div class="csv-stats">
                        <strong>数据统计:</strong> 共 ${csvData.rows.length} 行数据，${csvData.headers.length} 列
                    </div>
                    <table class="csv-table">
                        <thead>
                            <tr>
                                ${csvData.headers.map(header => `<th>${this.escapeHtml(header)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${csvData.rows.slice(0, 100).map(row => 
                                `<tr>${csvData.headers.map(header => `<td>${this.escapeHtml(row[header] || '')}</td>`).join('')}</tr>`
                            ).join('')}
                            ${csvData.rows.length > 100 ? '<tr><td colspan="' + csvData.headers.length + '" style="text-align: center; color: #6c757d; font-style: italic;">显示前100行数据，如需查看全部数据请使用"新窗口查看"功能</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // 关闭按钮事件
        const closeBtn = modal.querySelector('.csv-close-btn');
        const closeModal = () => {
            document.body.removeChild(modal);
        };

        closeBtn?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // 添加ESC键关闭
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        document.body.appendChild(modal);
    }

    /**
     * HTML转义
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 获取当前加载的CSV数据
     */
    public getCurrentCSVData(): CSVData | null {
        return this.csvData;
    }

    /**
     * 搜索CSV数据
     */
    public searchCSVData(searchTerm: string, searchColumns?: string[]) {
        if (!this.csvData) {
            throw new Error('没有加载的CSV数据');
        }

        return csvReader.searchCSV(this.csvData, searchTerm, searchColumns);
    }

    /**
     * 获取列统计信息
     */
    public getColumnStats(columnName: string) {
        if (!this.csvData) {
            throw new Error('没有加载的CSV数据');
        }

        return csvReader.getColumnStats(this.csvData, columnName);
    }

    /**
     * 导出HTML
     */
    public exportToHTML(): string {
        if (!this.csvData) {
            throw new Error('没有加载的CSV数据');
        }

        return csvReader.exportToHTML(this.csvData);
    }
}

// 导出实例
export const csvExample = new CSVExample(); 