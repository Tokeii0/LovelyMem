import { AppState } from '../../core/types';
import IconParkHelper from '../../utils/iconparkHelper';

export class CommandPreviewRenderer {
    constructor(private state: AppState) { }

    public updateState(state: AppState) {
        this.state = state;
    }

    public render(): string {
        const commandHistory = this.state.commandHistory || [];

        if (commandHistory.length === 0) {
            return `
        <div class="empty-commands">
          <div class="empty-icon">💻</div>
          <div class="empty-text">暂无命令执行记录</div>
          <div class="empty-hint">加载镜像后将显示命令过程</div>
        </div>
      `;
        }

        const recentCommands = commandHistory.slice(0, 3);

        return recentCommands.map(cmd => {
            const statusIcon = this.getCommandStatusIcon(cmd.status);
            const statusClass = cmd.status;

            return `
        <div class="command-item" title="${cmd.command}">
          <span class="command-status ${statusClass}">${statusIcon}</span>
          <div class="command-info-preview">
            <div class="command-name-preview">${cmd.name}</div>
            <div class="command-text">${this.truncateCommand(cmd.command)}</div>
            ${cmd.processId ? `<div class="command-pid">PID: ${cmd.processId}</div>` : ''}
          </div>
        </div>
      `;
        }).join('');
    }

    private getCommandStatusIcon(status: string): string {
        const emojiMap: Record<string, string> = {
            'pending': '⏳',
            'running': '🔄',
            'completed': '✅',
            'error': '❌',
            'default': '❓'
        };

        const emoji = emojiMap[status] || emojiMap['default'];
        return this.getIconSvgHtml(emoji, 12);
    }

    private truncateCommand(command: string): string {
        if (command.length <= 50) return command;
        return command.substring(0, 47) + '...';
    }

    private getIconSvgHtml(emoji: string, size: number = 14): string {
        const iconName = IconParkHelper.getIconNameFromEmoji(emoji);
        if (!iconName) {
            return emoji;
        }

        try {
            const svgString = IconParkHelper.getSvgString(iconName, {
                size,
                fill: 'currentColor',
                stroke: 'currentColor',
                strokeWidth: 2
            });
            return svgString || emoji;
        } catch (error) {
            console.warn(`Failed to get icon for ${emoji}:`, error);
            return emoji;
        }
    }
}
