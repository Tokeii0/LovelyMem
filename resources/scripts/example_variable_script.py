#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
示例脚本：演示变量替换功能
这个脚本展示了如何在Lovelymem V2脚本系统中使用变量替换功能
"""

import os
import sys
from datetime import datetime

def main():
    print("=" * 60)
    print("Lovelymem V2 脚本变量替换示例")
    print("=" * 60)
    
    # 从环境变量获取路径信息
    output_path = os.environ.get('SCRIPT_OUTPUT_PATH', '未设置')
    image_path = os.environ.get('SCRIPT_IMAGE_PATH', '未设置')
    scripts_path = os.environ.get('SCRIPT_SCRIPTS_PATH', '未设置')
    python3_path = os.environ.get('SCRIPT_PYTHON3_PATH', '未设置')
    
    print(f"📁 输出路径: {output_path}")
    print(f"💾 镜像路径: {image_path}")
    print(f"📜 脚本路径: {scripts_path}")
    print(f"🐍 Python3路径: {python3_path}")
    print()
    
    # 显示时间信息
    timestamp = os.environ.get('SCRIPT_TIMESTAMP', '未设置')
    date = os.environ.get('SCRIPT_DATE', '未设置')
    time = os.environ.get('SCRIPT_TIME', '未设置')
    
    print(f"⏰ 时间戳: {timestamp}")
    print(f"📅 日期: {date}")
    print(f"🕐 时间: {time}")
    print()
    
    # 显示镜像相关信息
    image_name = os.environ.get('SCRIPT_IMAGE_NAME', '未设置')
    image_dir = os.environ.get('SCRIPT_IMAGE_DIRECTORY', '未设置')
    image_stem = os.environ.get('SCRIPT_IMAGE_NAME_WITHOUT_EXT', '未设置')
    
    print(f"🖼️ 镜像文件名: {image_name}")
    print(f"📂 镜像目录: {image_dir}")
    print(f"📄 镜像名称（无扩展名）: {image_stem}")
    print()
    
    # 显示命令行参数
    print(f"📋 命令行参数: {sys.argv[1:] if len(sys.argv) > 1 else '无'}")
    print()
    
    # 创建示例输出文件
    if output_path != '未设置' and os.path.exists(output_path):
        output_file = os.path.join(output_path, f"script_output_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write("Lovelymem V2 脚本执行结果\n")
                f.write(f"执行时间: {datetime.now()}\n")
                f.write(f"输出路径: {output_path}\n")
                f.write(f"镜像路径: {image_path}\n")
                f.write(f"脚本参数: {sys.argv[1:]}\n")
            
            print(f"✅ 输出文件已创建: {output_file}")
        except Exception as e:
            print(f"❌ 创建输出文件失败: {e}")
    else:
        print("⚠️ 输出路径不存在，跳过文件创建")
    
    print()
    print("🎉 脚本执行完成！")
    print("=" * 60)

if __name__ == "__main__":
    main()
