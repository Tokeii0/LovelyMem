#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文本分析工具 - 分析文本文件的内容统计
用法: python text_analyzer.py <文本文件路径> <输出目录>
"""

# @name: 文本分析
# @description: 分析文本文件的字符、单词、行数等统计信息
# @icon: 📊
# @file_types: txt,log,md,py,js,html,css,json,xml

import sys
import os
import re
import time
from pathlib import Path
from collections import Counter


def analyze_text_file(file_path, output_dir):
    """
    分析文本文件的内容
    
    Args:
        file_path (str): 文本文件路径
        output_dir (str): 输出目录
    
    Returns:
        str: 分析报告文件路径
    """
    try:
        file_path = Path(file_path)
        output_dir = Path(output_dir)
        
        # 确保输出目录存在
        output_dir.mkdir(parents=True, exist_ok=True)
        
        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")
        
        print(f"📊 分析文本文件: {file_path}")
        
        # 读取文件内容
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            # 如果UTF-8失败，尝试其他编码
            try:
                with open(file_path, 'r', encoding='gbk') as f:
                    content = f.read()
            except UnicodeDecodeError:
                with open(file_path, 'r', encoding='latin-1') as f:
                    content = f.read()
        
        # 基本统计
        lines = content.split('\n')
        line_count = len(lines)
        char_count = len(content)
        char_count_no_spaces = len(content.replace(' ', '').replace('\t', '').replace('\n', ''))
        
        # 单词统计
        words = re.findall(r'\b\w+\b', content.lower())
        word_count = len(words)
        unique_words = len(set(words))
        
        # 最常见的单词
        word_freq = Counter(words)
        top_words = word_freq.most_common(10)
        
        # 行长度统计
        line_lengths = [len(line) for line in lines]
        avg_line_length = sum(line_lengths) / len(line_lengths) if line_lengths else 0
        max_line_length = max(line_lengths) if line_lengths else 0
        
        # 空行统计
        empty_lines = sum(1 for line in lines if not line.strip())
        
        # 字符频率统计
        char_freq = Counter(content.lower())
        top_chars = [(char, count) for char, count in char_freq.most_common(10) if char.isprintable() and char != ' ']
        
        # 生成分析报告
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        report_filename = f"{file_path.stem}_analysis_{timestamp}.txt"
        report_path = output_dir / report_filename
        
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write("=" * 60 + "\n")
            f.write("文本分析报告\n")
            f.write("=" * 60 + "\n\n")
            f.write(f"文件名: {file_path.name}\n")
            f.write(f"文件路径: {file_path.absolute()}\n")
            f.write(f"文件大小: {format_size(file_path.stat().st_size)}\n\n")
            
            f.write("基本统计:\n")
            f.write("-" * 30 + "\n")
            f.write(f"总行数: {line_count:,}\n")
            f.write(f"总字符数: {char_count:,}\n")
            f.write(f"字符数(不含空格): {char_count_no_spaces:,}\n")
            f.write(f"总单词数: {word_count:,}\n")
            f.write(f"唯一单词数: {unique_words:,}\n")
            f.write(f"空行数: {empty_lines:,}\n\n")
            
            f.write("行统计:\n")
            f.write("-" * 30 + "\n")
            f.write(f"平均行长度: {avg_line_length:.1f} 字符\n")
            f.write(f"最长行长度: {max_line_length} 字符\n\n")
            
            if top_words:
                f.write("最常见单词 (前10个):\n")
                f.write("-" * 30 + "\n")
                for i, (word, count) in enumerate(top_words, 1):
                    f.write(f"{i:2d}. {word:<15} ({count:,} 次)\n")
                f.write("\n")
            
            if top_chars:
                f.write("最常见字符 (前10个):\n")
                f.write("-" * 30 + "\n")
                for i, (char, count) in enumerate(top_chars, 1):
                    char_display = repr(char) if char in '\t\n\r' else char
                    f.write(f"{i:2d}. {char_display:<10} ({count:,} 次)\n")
                f.write("\n")
            
            f.write(f"分析时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        print(f"✅ 分析报告已生成: {report_path}")
        print(f"📏 总行数: {line_count:,}")
        print(f"📝 总单词数: {word_count:,}")
        print(f"🔤 总字符数: {char_count:,}")
        
        return str(report_path)
        
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
        print("❌ 用法: python text_analyzer.py <文本文件路径> <输出目录>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    try:
        result_path = analyze_text_file(file_path, output_dir)
        print(f"SUCCESS:{result_path}")  # 返回结果标识符，便于前端解析
    except Exception as e:
        print(f"ERROR:{str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main() 