#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文件信息查看工具 - 获取文件的详细信息
用法: python file_info.py <文件路径> <输出目录>
"""

# @name: 文件信息
# @description: 获取文件的详细信息（大小、创建时间、MD5等）
# @icon: ℹ️
# @file_types: *

import sys
import os
import hashlib
import time
from pathlib import Path

# 设置标准输出编码为UTF-8
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


def get_file_info(file_path, output_dir):
    """
    获取文件的详细信息
    
    Args:
        file_path (str): 文件路径
        output_dir (str): 输出目录
    
    Returns:
        str: 信息文件路径
    """
    try:
        file_path = Path(file_path)
        output_dir = Path(output_dir)
        
        # 确保输出目录存在
        output_dir.mkdir(parents=True, exist_ok=True)
        
        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")
        
        print(f"📄 分析文件: {file_path}")
        
        # 获取文件基本信息
        stat = file_path.stat()
        file_size = stat.st_size
        created_time = time.ctime(stat.st_ctime)
        modified_time = time.ctime(stat.st_mtime)
        
        # 计算MD5哈希
        print("🔍 计算MD5哈希...")
        md5_hash = hashlib.md5()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                md5_hash.update(chunk)
        md5_value = md5_hash.hexdigest()
        
        # 生成信息报告
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        info_filename = f"{file_path.stem}_info_{timestamp}.txt"
        info_path = output_dir / info_filename
        
        with open(info_path, 'w', encoding='utf-8') as f:
            f.write("=" * 50 + "\n")
            f.write("文件信息报告\n")
            f.write("=" * 50 + "\n\n")
            f.write(f"文件名: {file_path.name}\n")
            f.write(f"完整路径: {file_path.absolute()}\n")
            f.write(f"文件大小: {format_size(file_size)}\n")
            f.write(f"创建时间: {created_time}\n")
            f.write(f"修改时间: {modified_time}\n")
            f.write(f"MD5哈希: {md5_value}\n")
            f.write(f"文件扩展名: {file_path.suffix}\n")
            
            if file_path.is_file():
                f.write(f"文件类型: 普通文件\n")
            elif file_path.is_dir():
                f.write(f"文件类型: 目录\n")
            
            f.write(f"\n生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        print(f"✅ 信息报告已生成: {info_path}")
        print(f"📏 文件大小: {format_size(file_size)}")
        print(f"🔐 MD5哈希: {md5_value}")
        
        return str(info_path)
        
    except Exception as e:
        print(f"❌ 分析失败: {str(e)}")
        raise


def format_size(size_bytes):
    """格式化文件大小显示"""
    if size_bytes == 0:
        return "0 B"
    
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    
    return f"{size_bytes:.1f} {size_names[i]}"


def main():
    """主函数"""
    if len(sys.argv) < 3:
        print("❌ 用法: python file_info.py <文件路径> <输出目录>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    try:
        result_path = get_file_info(file_path, output_dir)
        print(f"SUCCESS:{result_path}")  # 返回结果标识符，便于前端解析
    except Exception as e:
        print(f"ERROR:{str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main() 