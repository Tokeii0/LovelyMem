#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文件压缩工具 - 将文件或文件夹压缩成ZIP格式
用法: python compress_to_zip.py <源文件路径> <输出目录> [压缩级别]
"""

# @name: 压缩为ZIP
# @description: 将文件或文件夹压缩成ZIP格式
# @icon: 📦
# @file_types: *

import sys
import os
import zipfile
import time
from pathlib import Path

# 设置标准输出编码为UTF-8
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


def compress_file_to_zip(source_path, output_dir, compression_level=6):
    """
    将文件或文件夹压缩成ZIP格式
    
    Args:
        source_path (str): 源文件或文件夹路径
        output_dir (str): 输出目录
        compression_level (int): 压缩级别 (0-9, 默认6)
    
    Returns:
        str: 生成的ZIP文件路径
    """
    try:
        source_path = Path(source_path)
        output_dir = Path(output_dir)
        
        # 确保输出目录存在
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # 生成ZIP文件名
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        if source_path.is_file():
            zip_name = f"{source_path.stem}_{timestamp}.zip"
        else:
            zip_name = f"{source_path.name}_{timestamp}.zip"
        
        zip_path = output_dir / zip_name
        
        # 设置压缩级别
        compression = zipfile.ZIP_DEFLATED
        if compression_level == 0:
            compression = zipfile.ZIP_STORED
        
        print(f"📦 开始压缩: {source_path}")
        print(f"📁 输出目录: {output_dir}")
        print(f"📄 ZIP文件名: {zip_name}")
        print(f"🔧 压缩级别: {compression_level}")
        
        with zipfile.ZipFile(zip_path, 'w', compression, compresslevel=compression_level) as zipf:
            if source_path.is_file():
                # 压缩单个文件
                zipf.write(source_path, source_path.name)
                print(f"✅ 已添加文件: {source_path.name}")
            elif source_path.is_dir():
                # 压缩文件夹
                file_count = 0
                for root, dirs, files in os.walk(source_path):
                    for file in files:
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(source_path.parent)
                        zipf.write(file_path, arcname)
                        file_count += 1
                        print(f"✅ 已添加文件: {arcname}")
                print(f"📊 总共压缩了 {file_count} 个文件")
            else:
                raise FileNotFoundError(f"源路径不存在: {source_path}")
        
        # 获取压缩后的文件大小
        zip_size = zip_path.stat().st_size
        original_size = get_path_size(source_path)
        
        # 计算压缩比
        if original_size > 0:
            compression_ratio = (1 - zip_size / original_size) * 100
        else:
            compression_ratio = 0
        
        print(f"🎉 压缩完成!")
        print(f"📄 ZIP文件: {zip_path}")
        print(f"📏 原始大小: {format_size(original_size)}")
        print(f"📦 压缩后大小: {format_size(zip_size)}")
        print(f"💾 压缩比: {compression_ratio:.1f}%")
        
        return str(zip_path)
        
    except Exception as e:
        print(f"❌ 压缩失败: {str(e)}")
        raise


def get_path_size(path):
    """获取文件或文件夹的总大小"""
    path = Path(path)
    if path.is_file():
        return path.stat().st_size
    elif path.is_dir():
        total_size = 0
        for dirpath, dirnames, filenames in os.walk(path):
            for filename in filenames:
                file_path = Path(dirpath) / filename
                try:
                    total_size += file_path.stat().st_size
                except (OSError, FileNotFoundError):
                    pass
        return total_size
    return 0


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
        print("❌ 用法: python compress_to_zip.py <源文件路径> <输出目录> [压缩级别]")
        print("   压缩级别: 0-9 (0=无压缩, 9=最高压缩, 默认=6)")
        sys.exit(1)
    
    source_path = sys.argv[1]
    output_dir = sys.argv[2]
    compression_level = 6
    
    if len(sys.argv) > 3:
        try:
            compression_level = int(sys.argv[3])
            if not 0 <= compression_level <= 9:
                print("⚠️ 压缩级别必须在0-9之间，使用默认值6")
                compression_level = 6
        except ValueError:
            print("⚠️ 压缩级别必须是数字，使用默认值6")
            compression_level = 6
    
    try:
        result_path = compress_file_to_zip(source_path, output_dir, compression_level)
        print(f"SUCCESS:{result_path}")  # 返回结果标识符，便于前端解析
    except Exception as e:
        print(f"ERROR:{str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main() 