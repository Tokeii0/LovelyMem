/**
 * EXIF工具类
 * 提供EXIF数据处理、格式化和分类功能
 */

/** EXIF 单个标签的值，可能是字符串、数字、布尔、数组或对象 */
export type EXIFValue = string | number | boolean | null | undefined | EXIFValue[] | { [key: string]: EXIFValue };

/** EXIF 数据集合：标签名 -> 值 */
export type EXIFData = Record<string, EXIFValue>;

export class EXIFUtils {
    /**
     * EXIF标签显示名称映射
     */
    static tagDisplayNames: Record<string, string> = {
        // 基本信息
        'ImageWidth': '图像宽度',
        'ImageHeight': '图像高度',
        'Orientation': '方向',
        'XResolution': '水平分辨率',
        'YResolution': '垂直分辨率',
        'ResolutionUnit': '分辨率单位',
        'BitsPerSample': '每样本位数',
        'SamplesPerPixel': '每像素样本数',
        'PhotometricInterpretation': '光度解释',
        'PlanarConfiguration': '平面配置',

        // 相机信息
        'Make': '制造商',
        'Model': '相机型号',
        'Software': '软件',
        'Artist': '作者',
        'Copyright': '版权',
        'CameraOwnerName': '相机所有者',
        'BodySerialNumber': '机身序列号',
        'LensModel': '镜头型号',
        'LensSerialNumber': '镜头序列号',
        'LensMake': '镜头制造商',

        // 拍摄参数
        'ExposureTime': '曝光时间',
        'FNumber': '光圈值',
        'ExposureProgram': '曝光程序',
        'SpectralSensitivity': '光谱敏感度',
        'ISOSpeedRatings': 'ISO感光度',
        'OECF': '光电转换函数',
        'SensitivityType': '敏感度类型',
        'ExposureBiasValue': '曝光补偿',
        'MaxApertureValue': '最大光圈值',
        'SubjectDistance': '主体距离',
        'MeteringMode': '测光模式',
        'LightSource': '光源',
        'Flash': '闪光灯',
        'FocalLength': '焦距',
        'FocalLengthIn35mmFilm': '35mm等效焦距',
        'SceneCaptureType': '场景捕获类型',
        'GainControl': '增益控制',
        'Contrast': '对比度',
        'Saturation': '饱和度',
        'Sharpness': '锐度',
        'WhiteBalance': '白平衡',
        'DigitalZoomRatio': '数字变焦比',
        'SubjectDistanceRange': '主体距离范围',

        // GPS信息
        'GPSVersionID': 'GPS版本',
        'GPSLatitudeRef': 'GPS纬度参考',
        'GPSLatitude': 'GPS纬度',
        'GPSLongitudeRef': 'GPS经度参考',
        'GPSLongitude': 'GPS经度',
        'GPSAltitudeRef': 'GPS海拔参考',
        'GPSAltitude': 'GPS海拔',
        'GPSTimeStamp': 'GPS时间戳',
        'GPSSatellites': 'GPS卫星',
        'GPSStatus': 'GPS状态',
        'GPSMeasureMode': 'GPS测量模式',
        'GPSDOP': 'GPS精度',
        'GPSSpeedRef': 'GPS速度参考',
        'GPSSpeed': 'GPS速度',
        'GPSTrackRef': 'GPS轨迹参考',
        'GPSTrack': 'GPS轨迹',
        'GPSImgDirectionRef': 'GPS图像方向参考',
        'GPSImgDirection': 'GPS图像方向',
        'GPSMapDatum': 'GPS地图基准',
        'GPSDestLatitudeRef': 'GPS目标纬度参考',
        'GPSDestLatitude': 'GPS目标纬度',
        'GPSDestLongitudeRef': 'GPS目标经度参考',
        'GPSDestLongitude': 'GPS目标经度',
        'GPSDestBearingRef': 'GPS目标方位参考',
        'GPSDestBearing': 'GPS目标方位',
        'GPSDestDistanceRef': 'GPS目标距离参考',
        'GPSDestDistance': 'GPS目标距离',
        'GPSProcessingMethod': 'GPS处理方法',
        'GPSAreaInformation': 'GPS区域信息',
        'GPSDateStamp': 'GPS日期戳',
        'GPSDifferential': 'GPS差分',

        // 时间信息
        'DateTime': '修改时间',
        'DateTimeOriginal': '拍摄时间',
        'DateTimeDigitized': '数字化时间',
        'SubSecTime': '修改时间亚秒',
        'SubSecTimeOriginal': '拍摄时间亚秒',
        'SubSecTimeDigitized': '数字化时间亚秒',
        'OffsetTime': '时区偏移',
        'OffsetTimeOriginal': '拍摄时区偏移',
        'OffsetTimeDigitized': '数字化时区偏移',

        // 技术参数
        'ColorSpace': '色彩空间',
        'PixelXDimension': '像素X尺寸',
        'PixelYDimension': '像素Y尺寸',
        'RelatedSoundFile': '相关声音文件',
        'FlashpixVersion': 'Flashpix版本',
        'ExifVersion': 'EXIF版本',
        'ComponentsConfiguration': '组件配置',
        'CompressedBitsPerPixel': '压缩每像素位数',
        'UserComment': '用户注释',
        'ImageUniqueID': '图像唯一ID',
        'LensSpecification': '镜头规格'
    };

    /**
     * EXIF标签分类映射
     */
    static tagCategories: Record<string, string[]> = {
        // 基本信息
        basic: ['ImageWidth', 'ImageHeight', 'Orientation', 'XResolution', 'YResolution', 'ResolutionUnit',
                'BitsPerSample', 'SamplesPerPixel', 'PhotometricInterpretation', 'PlanarConfiguration'],

        // 相机信息
        camera: ['Make', 'Model', 'Software', 'Artist', 'Copyright', 'CameraOwnerName', 'BodySerialNumber',
                 'LensModel', 'LensSerialNumber', 'LensMake', 'LensSpecification'],

        // 拍摄参数
        shooting: ['ExposureTime', 'FNumber', 'ExposureProgram', 'SpectralSensitivity', 'ISOSpeedRatings',
                   'OECF', 'SensitivityType', 'ExposureBiasValue', 'MaxApertureValue', 'SubjectDistance',
                   'MeteringMode', 'LightSource', 'Flash', 'FocalLength', 'FocalLengthIn35mmFilm',
                   'SceneCaptureType', 'GainControl', 'Contrast', 'Saturation', 'Sharpness', 'WhiteBalance',
                   'DigitalZoomRatio', 'SubjectDistanceRange'],

        // GPS信息
        gps: ['GPSVersionID', 'GPSLatitudeRef', 'GPSLatitude', 'GPSLongitudeRef', 'GPSLongitude',
              'GPSAltitudeRef', 'GPSAltitude', 'GPSTimeStamp', 'GPSSatellites', 'GPSStatus',
              'GPSMeasureMode', 'GPSDOP', 'GPSSpeedRef', 'GPSSpeed', 'GPSTrackRef', 'GPSTrack',
              'GPSImgDirectionRef', 'GPSImgDirection', 'GPSMapDatum', 'GPSDestLatitudeRef',
              'GPSDestLatitude', 'GPSDestLongitudeRef', 'GPSDestLongitude', 'GPSDestBearingRef',
              'GPSDestBearing', 'GPSDestDistanceRef', 'GPSDestDistance', 'GPSProcessingMethod',
              'GPSAreaInformation', 'GPSDateStamp', 'GPSDifferential'],

        // 时间信息
        datetime: ['DateTime', 'DateTimeOriginal', 'DateTimeDigitized', 'SubSecTime', 'SubSecTimeOriginal',
                   'SubSecTimeDigitized', 'OffsetTime', 'OffsetTimeOriginal', 'OffsetTimeDigitized'],

        // 技术参数
        technical: ['ColorSpace', 'PixelXDimension', 'PixelYDimension', 'RelatedSoundFile', 'FlashpixVersion',
                    'ExifVersion', 'ComponentsConfiguration', 'CompressedBitsPerPixel', 'UserComment',
                    'ImageUniqueID']
    };

    /**
     * 获取标签显示名称
     */
    static getDisplayName(tag: string): string {
        return this.tagDisplayNames[tag] || tag;
    }

    /**
     * 获取标签分类
     */
    static getTagCategory(tag: string): string {
        for (const [category, tags] of Object.entries(this.tagCategories)) {
            if (tags.includes(tag)) {
                return category;
            }
        }

        // 基于标签名称的模式匹配
        if (tag.startsWith('GPS')) return 'gps';
        if (tag.includes('Date') || tag.includes('Time')) return 'datetime';
        if (['Make', 'Model', 'Software', 'Artist', 'Copyright'].includes(tag)) return 'camera';
        if (tag.includes('Exposure') || tag.includes('ISO') || tag.includes('Flash') || tag.includes('Focus')) return 'shooting';
        if (tag.includes('Width') || tag.includes('Height') || tag.includes('Resolution')) return 'basic';

        return 'other';
    }

    /**
     * 格式化EXIF值
     */
    static formatValue(tag: string, value: EXIFValue): string {
        if (value === null || value === undefined) {
            return '未知';
        }

        // 特殊标签的格式化处理
        switch (tag) {
            case 'ExposureTime':
                return this.formatExposureTime(value);
            case 'FNumber':
                return this.formatFNumber(value);
            case 'FocalLength':
                return this.formatFocalLength(value);
            case 'ISOSpeedRatings':
            case 'ISO':
                return `ISO ${value}`;
            case 'Flash':
                return this.formatFlash(value);
            case 'WhiteBalance':
                return this.formatWhiteBalance(value);
            case 'MeteringMode':
                return this.formatMeteringMode(value);
            case 'ExposureProgram':
                return this.formatExposureProgram(value);
            case 'Orientation':
                return this.formatOrientation(value);
            case 'GPSLatitude':
            case 'GPSLongitude':
                return this.formatGPSCoordinate(value);
            case 'GPSAltitude':
                return this.formatGPSAltitude(value);
            case 'DateTime':
            case 'DateTimeOriginal':
            case 'DateTimeDigitized':
                return this.formatDateTime(value);
            case 'XResolution':
            case 'YResolution':
                return `${value} dpi`;
            case 'ColorSpace':
                return this.formatColorSpace(value);
            default:
                return this.formatGenericValue(value);
        }
    }

    /**
     * 格式化曝光时间
     */
    static formatExposureTime(value: EXIFValue): string {
        if (typeof value === 'string') return value;
        if (typeof value === 'number') {
            if (value >= 1) {
                return `${value}s`;
            } else {
                const fraction = Math.round(1 / value);
                return `1/${fraction}s`;
            }
        }
        return String(value);
    }

    /**
     * 格式化光圈值
     */
    static formatFNumber(value: EXIFValue): string {
        if (typeof value === 'number') {
            return `f/${value.toFixed(1)}`;
        }
        return String(value);
    }

    /**
     * 格式化焦距
     */
    static formatFocalLength(value: EXIFValue): string {
        if (typeof value === 'number') {
            return `${value}mm`;
        }
        return String(value);
    }

    /**
     * 格式化闪光灯
     */
    static formatFlash(value: EXIFValue): string {
        const flashModes: Record<number, string> = {
            0: '未闪光',
            1: '闪光',
            5: '闪光，未检测到回闪',
            7: '闪光，检测到回闪',
            9: '强制闪光',
            13: '强制闪光，未检测到回闪',
            15: '强制闪光，检测到回闪',
            16: '未闪光，强制关闭',
            24: '未闪光，自动模式',
            25: '闪光，自动模式',
            29: '闪光，自动模式，未检测到回闪',
            31: '闪光，自动模式，检测到回闪',
            32: '无闪光功能'
        };
        return flashModes[value as number] || `未知 (${value})`;
    }

    /**
     * 格式化白平衡
     */
    static formatWhiteBalance(value: EXIFValue): string {
        const whiteBalanceModes: Record<number, string> = {
            0: '自动',
            1: '手动'
        };
        return whiteBalanceModes[value as number] || `未知 (${value})`;
    }

    /**
     * 格式化测光模式
     */
    static formatMeteringMode(value: EXIFValue): string {
        const meteringModes: Record<number, string> = {
            0: '未知',
            1: '平均',
            2: '中央重点平均',
            3: '点测光',
            4: '多点',
            5: '评价',
            6: '局部',
            255: '其他'
        };
        return meteringModes[value as number] || `未知 (${value})`;
    }

    /**
     * 格式化曝光程序
     */
    static formatExposureProgram(value: EXIFValue): string {
        const exposurePrograms: Record<number, string> = {
            0: '未定义',
            1: '手动',
            2: '程序自动',
            3: '光圈优先',
            4: '快门优先',
            5: '创意程序',
            6: '动作程序',
            7: '人像模式',
            8: '风景模式'
        };
        return exposurePrograms[value as number] || `未知 (${value})`;
    }

    /**
     * 格式化方向
     */
    static formatOrientation(value: EXIFValue): string {
        const orientations: Record<number, string> = {
            1: '正常',
            2: '水平翻转',
            3: '旋转180°',
            4: '垂直翻转',
            5: '水平翻转并逆时针旋转90°',
            6: '顺时针旋转90°',
            7: '水平翻转并顺时针旋转90°',
            8: '逆时针旋转90°'
        };
        return orientations[value as number] || `未知 (${value})`;
    }

    /**
     * 格式化GPS坐标
     */
    static formatGPSCoordinate(value: EXIFValue): string {
        if (Array.isArray(value) && value.length === 3) {
            const [degrees, minutes, seconds] = value;
            return `${degrees}°${minutes}'${Number(seconds).toFixed(2)}"`;
        }
        return String(value);
    }

    /**
     * 格式化GPS海拔
     */
    static formatGPSAltitude(value: EXIFValue): string {
        if (typeof value === 'number') {
            return `${value.toFixed(2)}m`;
        }
        return String(value);
    }

    /**
     * 格式化日期时间
     */
    static formatDateTime(value: EXIFValue): string {
        if (typeof value === 'string') {
            // 尝试解析EXIF日期格式 "YYYY:MM:DD HH:MM:SS"
            const match = value.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
            if (match) {
                const [, year, month, day, hour, minute, second] = match;
                const date = new Date(
                    Number(year),
                    Number(month) - 1,
                    Number(day),
                    Number(hour),
                    Number(minute),
                    Number(second)
                );
                return date.toLocaleString();
            }
        }
        return String(value);
    }

    /**
     * 格式化色彩空间
     */
    static formatColorSpace(value: EXIFValue): string {
        const colorSpaces: Record<number, string> = {
            1: 'sRGB',
            2: 'Adobe RGB',
            65535: '未校准'
        };
        return colorSpaces[value as number] || `未知 (${value})`;
    }

    /**
     * 格式化通用值
     */
    static formatGenericValue(value: EXIFValue): string {
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }

    /**
     * 获取标签描述
     */
    static getTagDescription(tag: string): string {
        const descriptions: Record<string, string> = {
            'Make': '相机制造商名称',
            'Model': '相机型号名称',
            'DateTime': '图像最后修改的日期和时间',
            'DateTimeOriginal': '图像拍摄的日期和时间',
            'ExposureTime': '快门速度，以秒为单位',
            'FNumber': '镜头光圈值',
            'ISO': '感光度设置',
            'FocalLength': '镜头焦距，以毫米为单位',
            'Flash': '闪光灯使用情况',
            'WhiteBalance': '白平衡设置',
            'GPSLatitude': 'GPS纬度坐标',
            'GPSLongitude': 'GPS经度坐标',
            'GPSAltitude': 'GPS海拔高度'
        };
        return descriptions[tag] || '无描述信息';
    }

    /**
     * 格式化用于剪贴板的文本
     */
    static formatForClipboard(data: EXIFData): string {
        const lines: string[] = [];
        lines.push('EXIF元数据信息');
        lines.push('='.repeat(50));
        lines.push('');

        Object.entries(data).forEach(([tag, value]) => {
            const displayName = this.getDisplayName(tag);
            const formattedValue = this.formatValue(tag, value);
            lines.push(`${displayName}: ${formattedValue}`);
        });

        return lines.join('\n');
    }
}
