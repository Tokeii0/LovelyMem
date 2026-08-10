import { invoke } from '@tauri-apps/api/core';

export class Vol3LinuxEventHandler {
    private app: any;

    constructor(app: any) {
        this.app = app;
    }

    /**
     * 处理Vol3Linux功能点击事件
     */
    async handleVol3LinuxFeatureClick(featureId: string): Promise<void> {
        console.log(`点击了Vol3Linux功能: ${featureId}`);
        
        // 获取插件名称（去掉vol3linux-前缀）
        const pluginName = featureId.replace('vol3linux-', '');
        
        // 直接调用主应用的handleVol3LinuxFeature方法
        await this.app.featureHandlers.handleVol3LinuxFeature(pluginName);
    }





    /**
     * 获取Vol3Linux插件列表
     */
    async getVol3LinuxPlugins(settings: any): Promise<string[]> {
        try {
            return await invoke<string[]>('get_vol3linux_plugins', {
                pythonPath: settings.python3_path,
                volatility3Path: settings.volatility3_path
            });
        } catch (error) {
            console.error('获取Vol3Linux插件列表失败:', error);
            return [];
        }
    }

    /**
     * 获取Vol3Linux版本信息
     */
    async getVol3LinuxVersion(settings: any): Promise<string> {
        try {
            return await invoke<string>('get_vol3linux_version', {
                pythonPath: settings.python3_path,
                volatility3Path: settings.volatility3_path
            });
        } catch (error) {
            console.error('获取Vol3Linux版本失败:', error);
            return '未知版本';
        }
    }

    /**
     * 创建输出目录
     */
    async createOutputDir(outputPath: string): Promise<void> {
        try {
            await invoke('create_vol3linux_output_dir', {
                dirPath: outputPath
            });
        } catch (error) {
            console.error('创建输出目录失败:', error);
            throw new Error(`创建输出目录失败: ${error}`);
        }
    }
}

export default Vol3LinuxEventHandler; 