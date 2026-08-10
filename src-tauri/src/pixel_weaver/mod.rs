//! PixelWeaver：原始数据图像可视化（从 LovelyPixelWeaver 合并而来）
//!
//! 把无头二进制数据（内存 dump 等）按 宽/高/偏移/像素格式/位深/字节序
//! 解释成 PNG 图像，并支持熵值分析定位高熵（疑似图像）区域。

pub mod commands;
pub mod image_processor;
pub mod types;
