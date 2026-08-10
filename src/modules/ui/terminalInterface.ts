import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import IconParkHelper from '../utils/iconparkHelper';
import '../../css/terminalInterface.css';
import { TerminalAutocomplete } from './terminalAutocomplete';

export class TerminalInterface {
    private container: HTMLElement | null = null;
    private term: Terminal | null = null;
    private fitAddon: FitAddon | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private autocomplete: TerminalAutocomplete | null = null;
    private isInitialized: boolean = false;
    private shellInitialized: boolean = false; // 后端 shell 是否已初始化（独立于 UI）
    private unlistenTerminalOutput: (() => void) | null = null;
    private particleDisposable: { dispose: () => void } | null = null;
    private particleResizeListener: (() => void) | null = null;

    constructor() {
    }

    public render(): string {
        const terminalIcon = IconParkHelper.getSvgString('code', { size: 20 });
        const clearIcon = IconParkHelper.getSvgString('delete', { size: 16 });
        const copyIcon = IconParkHelper.getSvgString('file-text', { size: 16 });
        const helpIcon = IconParkHelper.getSvgString('help', { size: 16 });

        return `
            <div class="terminal-container">
                <div class="terminal-header">
                    <div class="terminal-title">
                        <span class="icon-wrapper">${terminalIcon}</span>
                        <span>Terminal</span>
                        <span class="terminal-image-status" id="terminal-image-status" style="margin-left: 16px; font-size: 12px; color: #888;">
                            <span id="terminal-image-indicator">⚠</span>
                            <span id="terminal-image-text">未加载镜像</span>
                        </span>
                    </div>
                    <div class="terminal-controls">
                        <button class="terminal-control-btn" id="term-help" title="帮助提示">
                            ${helpIcon}
                        </button>
                        <button class="terminal-control-btn" id="term-clear" title="Clear Output">
                            ${clearIcon}
                        </button>
                        <button class="terminal-control-btn" id="term-copy" title="Copy All">
                            ${copyIcon}
                        </button>
                    </div>
                </div>
                <div class="terminal-body" id="terminal-xterm-container">
                    <canvas id="terminal-particle-canvas" class="terminal-particle-canvas"></canvas>
                </div>
                <div class="terminal-help-tooltip" id="terminal-help-tooltip" style="display: none;">
                    <div class="help-tooltip-header">💡 使用提示</div>
                    <div class="help-tooltip-content">
                        <p><strong>镜像自动加载功能：</strong></p>
                        <p>✓ 已加载镜像时，无需手动输入 <code>-f 镜像路径</code></p>
                        <p class="help-example">直接输入：<code>vol2 pslist</code></p>
                        <p class="help-example">自动转换为：<code>vol2 -f "镜像.dmp" pslist</code></p>
                        <hr>
                        <p><strong>快捷键：</strong></p>
                        <p>• <code>Tab</code> - 自动补全命令</p>
                        <p>• <code>↑/↓</code> - 浏览补全列表</p>
                        <p>• <code>Esc</code> - 关闭补全</p>
                    </div>
                </div>
            </div>
        `;
    }

    public async initialize(container: HTMLElement): Promise<void> {
        // 如果已经初始化过，需要重新创建终端实例（xterm 不支持对新 DOM 二次 open）
        if (this.isInitialized) {
            console.log('🔄 终端需要重新挂载，销毁旧实例并创建新的...');
            // 销毁旧的 UI 相关资源，但保留后端 shell 连接
            this.disposeTerminalUI();
        }

        this.container = container;
        
        // 创建新的 xterm 实例
        this.term = new Terminal({
            cursorBlink: true,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            theme: {
                background: '#1e1e1e',
                foreground: '#cccccc',
                cursor: '#dcdcaa',
                selectionBackground: 'rgba(255, 255, 255, 0.3)',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#e5e5e5'
            },
            allowProposedApi: true
        });

        this.fitAddon = new FitAddon();
        this.term.loadAddon(this.fitAddon);

        const terminalContainer = this.container.querySelector('#terminal-xterm-container') as HTMLElement;
        if (terminalContainer) {
            this.term.open(terminalContainer);

            // 延迟 fit，确保 DOM 完成布局后再计算尺寸
            await new Promise<void>(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (this.fitAddon && this.term) {
                            try {
                                this.fitAddon.fit();
                            } catch (e) {
                                console.error('fit 失败:', e);
                            }
                        }
                        resolve();
                    });
                });
            });
            
            // 初始化自动补全
            this.autocomplete = new TerminalAutocomplete(this.term, this.container, (data) => {
                invoke('write_to_shell', { data }).catch(err => {
                    console.error('Failed to write to shell:', err);
                });
            });

            // 仅在后端 shell 尚未初始化时才初始化（切换标签页回来时跳过）
            if (!this.shellInitialized) {
                try {
                    await invoke('init_shell', { cols: this.term.cols, rows: this.term.rows });
                    this.shellInitialized = true;
                    console.log('Shell initialized');
                } catch (e) {
                    this.term.writeln(`\x1b[31mFailed to initialize shell: ${e}\x1b[0m`);
                }
            } else {
                // Shell 已存在，同步当前终端尺寸并发送回车让 shell 重新输出提示符
                try {
                    await invoke('resize_terminal', { cols: this.term.cols, rows: this.term.rows });
                } catch (e) {
                    console.warn('resize_terminal 失败:', e);
                }
                // 发送空操作让 shell 重新打印提示符，用户能看到光标位置
                this.term.write('\x1b[?25h'); // 确保光标可见 (DECTCEM)
            }
        }

        this.bindEvents();
        if (terminalContainer) {
            this.setupResizeObserver(terminalContainer);
        }
        this.updateImageStatus();
        this.initParticleEffect();
        this.isInitialized = true;
        
        // 确保终端获得焦点
        this.term?.focus();
        console.log('✅ 终端初始化完成并获得焦点');
    }

    /**
     * 仅销毁终端 UI 相关资源，保留后端 shell 连接
     */
    private disposeTerminalUI(): void {
        console.log('🔧 销毁旧的终端 UI 实例...');

        // 清理 resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // 清理事件监听器（terminal-output）
        if (this.unlistenTerminalOutput) {
            this.unlistenTerminalOutput();
            this.unlistenTerminalOutput = null;
        }

        // 清理 autocomplete
        if (this.autocomplete) {
            this.autocomplete.dispose();
            this.autocomplete = null;
        }

        // 清理粒子效果
        if (this.particleDisposable) {
            this.particleDisposable.dispose();
            this.particleDisposable = null;
        }
        if (this.particleResizeListener) {
            window.removeEventListener('resize', this.particleResizeListener);
            this.particleResizeListener = null;
        }

        // 销毁旧的 terminal 实例（这会清理内部渲染器）
        if (this.term) {
            this.term.dispose();
            this.term = null;
        }
        this.fitAddon = null;
    }

    /**
     * 更新镜像状态显示
     */
    private async updateImageStatus(): Promise<void> {
        try {
            const imagePath = await invoke('get_current_image_path_command') as string;
            const indicator = this.container?.querySelector('#terminal-image-indicator');
            const text = this.container?.querySelector('#terminal-image-text');
            
            if (indicator && text) {
                if (imagePath && imagePath.trim() !== '') {
                    const fileName = imagePath.split(/[/\\]/).pop() || imagePath;
                    indicator.textContent = '✓';
                    indicator.setAttribute('style', 'color: #4CAF50;');
                    text.textContent = `已加载: ${fileName}`;
                    text.setAttribute('style', 'color: #4CAF50;');
                } else {
                    indicator.textContent = '⚠';
                    indicator.setAttribute('style', 'color: #FF9800;');
                    text.textContent = '未加载镜像';
                    text.setAttribute('style', 'color: #FF9800;');
                }
            }
        } catch (error) {
            console.warn('Failed to update image status:', error);
        }
    }

    private bindEvents(): void {
        if (!this.container || !this.term) return;

        // Handle user input
        this.term.onData((data) => {
            invoke('write_to_shell', { data }).catch(err => {
                console.error('Failed to write to shell:', err);
            });
        });

        // Handle backend output
        listen<string>('terminal-output', (event) => {
            this.term?.write(event.payload);
        }).then(unlisten => {
            this.unlistenTerminalOutput = unlisten;
        });

        this.bindUIEvents();
    }

    private bindUIEvents(): void {
        if (!this.container) return;

        // UI Controls
        const clearBtn = this.container.querySelector('#term-clear');
        const copyBtn = this.container.querySelector('#term-copy');
        const helpBtn = this.container.querySelector('#term-help');

        // Remove old listeners if any? 
        // Since we are getting new DOM elements (because container innerHTML was likely overwritten or we are in a new container), 
        // we don't need to remove listeners from old elements as they are garbage collected.
        // But if we are called on the SAME container without re-rendering, we might duplicate listeners.
        // However, the render() method returns a string, which is likely set to innerHTML. 
        // So the elements are new.

        clearBtn?.addEventListener('click', () => {
            this.term?.clear();
            this.term?.focus();
        });

        copyBtn?.addEventListener('click', () => {
            if (this.term) {
                this.term.selectAll();
                const text = this.term.getSelection();
                navigator.clipboard.writeText(text).then(() => {
                    this.term?.clearSelection();
                    // Optional: visual feedback
                });
                this.term.focus();
            }
        });

        helpBtn?.addEventListener('click', () => {
            this.toggleHelpTooltip();
        });
    }

    private setupResizeObserver(element: HTMLElement): void {
        this.resizeObserver = new ResizeObserver(() => {
            this.fit();
        });
        this.resizeObserver.observe(element);
        
        // Also listen for window resize
        window.addEventListener('resize', () => this.fit());
    }

    private fit(): void {
        if (!this.fitAddon || !this.term) return;
        
        try {
            this.fitAddon.fit();
            const dims = {
                cols: this.term.cols,
                rows: this.term.rows
            };
            invoke('resize_terminal', dims).catch(console.error);
        } catch (e) {
            console.error('Error resizing terminal:', e);
        }
    }

    /**
     * 切换帮助提示框显示
     */
    private toggleHelpTooltip(): void {
        const tooltip = this.container?.querySelector('#terminal-help-tooltip') as HTMLElement;
        if (tooltip) {
            if (tooltip.style.display === 'none' || !tooltip.style.display) {
                tooltip.style.display = 'block';
                // 3秒后自动隐藏
                setTimeout(() => {
                    tooltip.style.display = 'none';
                }, 5000);
            } else {
                tooltip.style.display = 'none';
            }
        }
    }

    /**
     * 初始化粒子效果
     */
    private initParticleEffect(): void {
        // Clean up previous effect
        if (this.particleDisposable) {
            this.particleDisposable.dispose();
            this.particleDisposable = null;
        }
        if (this.particleResizeListener) {
            window.removeEventListener('resize', this.particleResizeListener);
            this.particleResizeListener = null;
        }

        const canvas = this.container?.querySelector('#terminal-particle-canvas') as HTMLCanvasElement;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 设置画布大小
        const resizeCanvas = () => {
            const terminalBody = this.container?.querySelector('.terminal-body') as HTMLElement;
            if (terminalBody) {
                canvas.width = terminalBody.offsetWidth;
                canvas.height = terminalBody.offsetHeight;
            }
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        this.particleResizeListener = resizeCanvas;

        const particles: Array<{
            x: number;
            y: number;
            vx: number;
            vy: number;
            life: number;
            maxLife: number;
            size: number;
            color: string;
        }> = [];

        // 监听终端输入，创建粒子
        const disposable = this.term?.onData(() => {
            if (!this.term) return;
            
            const cursorX = this.term.buffer.active.cursorX;
            const cursorY = this.term.buffer.active.cursorY;
            
            // 使用terminal的实际渲染信息来计算位置
            const viewport = this.container?.querySelector('.xterm-viewport') as HTMLElement;
            if (!viewport) return;
            
            // 从terminal的dimensions中获取真实字符尺寸
            const rows = this.term.rows;
            const cols = this.term.cols;
            const terminalBody = this.container?.querySelector('.terminal-body') as HTMLElement;
            if (!terminalBody) return;
            
            // 计算每个字符的实际宽高
            const charWidth = (terminalBody.offsetWidth - 8) / cols;  // 减去padding
            const charHeight = (terminalBody.offsetHeight - 4) / rows;  // 减去padding
            
            // 计算光标在画布上的精确位置
            const x = cursorX * charWidth + 6;
            const y = cursorY * charHeight + charHeight / 2 + 4;

            // 创建粒子群
            const particleCount = 3 + Math.floor(Math.random() * 3);
            for (let i = 0; i < particleCount; i++) {
                const angle = (Math.random() * Math.PI * 2);
                const speed = 0.5 + Math.random() * 1.5;
                const colors = ['#4CAF50', '#2196F3', '#FFC107', '#E91E63', '#9C27B0', '#00BCD4'];
                
                particles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 1, // 向上飘
                    life: 1,
                    maxLife: 30 + Math.random() * 20,
                    size: 2 + Math.random() * 2,
                    color: colors[Math.floor(Math.random() * colors.length)]
                });
            }
        });
        this.particleDisposable = disposable || null;

        // 动画循环
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 更新和绘制粒子
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.life++;
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.05; // 重力

                const alpha = 1 - (p.life / p.maxLife);
                if (p.life >= p.maxLife || alpha <= 0) {
                    particles.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            requestAnimationFrame(animate);
        };
        animate();
    }

    public dispose(): void {
        console.log('🗑️ 正在清理 TerminalInterface 资源...');
        
        this.disposeTerminalUI();
        
        // 重置所有标志
        this.isInitialized = false;
        this.shellInitialized = false;
        
        console.log('✅ TerminalInterface 资源已清理');
    }
}
