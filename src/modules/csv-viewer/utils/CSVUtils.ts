/**
 * CSV工具类
 * 提供CSV数据处理、转换、搜索等通用方法
 */

/** CSV单行数据：列名 -> 单元格值 */
export type CSVRow = Record<string, string>;

/** 搜索选项 */
export interface CSVSearchOptions {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    useRegex?: boolean;
    searchColumns?: string[] | null;
    highlightMatches?: boolean;
}

/** 排序方向 */
export type SortDirection = 'asc' | 'desc';

/** 列数据类型 */
export type ColumnDataType = 'string' | 'number' | 'date' | 'auto';

/** CSV转换为字符串的选项 */
export interface ArrayToCSVOptions {
    delimiter?: string;
    lineEnding?: string;
    includeHeaders?: boolean;
    quoteAll?: boolean;
}

/** CSV解析选项 */
export interface ParseCSVOptions {
    delimiter?: string;
    hasHeaders?: boolean;
    skipEmptyLines?: boolean;
}

/** CSV解析结果 */
export interface ParsedCSV {
    headers: string[];
    rows: CSVRow[];
}

/** 列统计信息 */
export interface ColumnStats {
    count: number;
    unique: number;
    empty: number;
    dataType: ColumnDataType;
    uniqueValues?: string[];
    min?: number;
    max?: number;
    avg?: number;
    sum?: number;
}

/** 过滤条件 */
export interface CSVFilter {
    column: string;
    operator: string;
    value?: string;
    caseSensitive?: boolean;
}

/** 数字格式化选项 */
export interface FormatNumberOptions {
    decimals?: number;
    useThousandSeparator?: boolean;
    locale?: string;
}

export class CSVUtils {
    /**
     * 在行数据中搜索关键词
     */
    static searchRows(rows: CSVRow[], keyword: string, headers: string[], options: CSVSearchOptions = {}): CSVRow[] {
        const {
            caseSensitive = false,
            wholeWord = false,
            useRegex = false,
            searchColumns = null, // 指定搜索的列，null表示搜索所有列
        } = options;

        if (!keyword || !keyword.trim()) {
            return rows;
        }

        const columnsToSearch = searchColumns || headers;

        // 如果使用正则表达式
        if (useRegex) {
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(keyword, flags);

                return rows.filter(row => {
                    return columnsToSearch.some(header => {
                        const value = row[header] || '';
                        return regex.test(value.toString());
                    });
                });
            } catch (error) {
                console.warn('正则表达式无效:', keyword, error);
                return [];
            }
        }

        // 普通搜索
        const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();

        return rows.filter(row => {
            return columnsToSearch.some(header => {
                const value = row[header] || '';
                const searchValue = caseSensitive ? value.toString() : value.toString().toLowerCase();

                if (wholeWord) {
                    // 全字匹配：使用单词边界
                    const wordRegex = new RegExp(`\\b${this.escapeRegExp(searchKeyword)}\\b`, caseSensitive ? 'g' : 'gi');
                    return wordRegex.test(searchValue);
                } else {
                    // 普通包含匹配
                    return searchValue.includes(searchKeyword);
                }
            });
        });
    }

    /**
     * 转义正则表达式特殊字符
     */
    static escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 对行数据进行排序
     */
    static sortRows(rows: CSVRow[], columnName: string, direction: SortDirection = 'asc', dataType: ColumnDataType = 'auto'): CSVRow[] {
        if (!rows || rows.length === 0 || !columnName) {
            return rows;
        }

        // 自动检测数据类型
        let resolvedType: ColumnDataType = dataType;
        if (resolvedType === 'auto') {
            resolvedType = this.detectColumnDataType(rows, columnName);
        }

        const sortedRows = [...rows].sort((a, b) => {
            const valueA = a[columnName] || '';
            const valueB = b[columnName] || '';

            let comparison = 0;

            switch (resolvedType) {
                case 'number':
                    comparison = this.compareNumbers(valueA, valueB);
                    break;
                case 'date':
                    comparison = this.compareDates(valueA, valueB);
                    break;
                case 'string':
                default:
                    comparison = this.compareStrings(valueA, valueB);
                    break;
            }

            return direction === 'desc' ? -comparison : comparison;
        });

        return sortedRows;
    }

    /**
     * 检测列的数据类型
     */
    static detectColumnDataType(rows: CSVRow[], columnName: string): ColumnDataType {
        const sampleSize = Math.min(100, rows.length);
        const samples = rows.slice(0, sampleSize).map(row => row[columnName] || '').filter(val => val !== '');

        if (samples.length === 0) return 'string';

        let numberCount = 0;
        let dateCount = 0;

        samples.forEach(value => {
            const strValue = value.toString().trim();

            // 检测数字
            if (this.isNumeric(strValue)) {
                numberCount++;
            }

            // 检测日期
            if (this.isDate(strValue)) {
                dateCount++;
            }
        });

        const threshold = samples.length * 0.7; // 70%的样本匹配则认为是该类型

        if (numberCount >= threshold) return 'number';
        if (dateCount >= threshold) return 'date';
        return 'string';
    }

    /**
     * 检查是否为数字
     */
    static isNumeric(value: string): boolean {
        return !isNaN(value as unknown as number) && !isNaN(parseFloat(value));
    }

    /**
     * 检查是否为日期
     */
    static isDate(value: string): boolean {
        const date = new Date(value);
        return !isNaN(date.getTime()) && value.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}/) !== null;
    }

    /**
     * 比较数字
     */
    static compareNumbers(a: string, b: string): number {
        const numA = parseFloat(a) || 0;
        const numB = parseFloat(b) || 0;
        return numA - numB;
    }

    /**
     * 比较日期
     */
    static compareDates(a: string, b: string): number {
        const dateA = new Date(a);
        const dateB = new Date(b);

        if (isNaN(dateA.getTime())) return isNaN(dateB.getTime()) ? 0 : -1;
        if (isNaN(dateB.getTime())) return 1;

        return dateA.getTime() - dateB.getTime();
    }

    /**
     * 比较字符串
     */
    static compareStrings(a: string, b: string): number {
        const strA = a.toString().toLowerCase();
        const strB = b.toString().toLowerCase();
        return strA.localeCompare(strB);
    }

    /**
     * 将数组转换为CSV字符串
     */
    static arrayToCSV(headers: string[], rows: CSVRow[], options: ArrayToCSVOptions = {}): string {
        const {
            delimiter = ',',
            lineEnding = '\n',
            includeHeaders = true,
            quoteAll = false
        } = options;

        const csvRows: string[] = [];

        // 添加表头
        if (includeHeaders && headers.length > 0) {
            const headerRow = headers.map(header => this.escapeCSVValue(header, delimiter, quoteAll)).join(delimiter);
            csvRows.push(headerRow);
        }

        // 添加数据行
        rows.forEach(rowData => {
            const csvRow = headers.map(header => {
                const value = rowData[header] || '';
                return this.escapeCSVValue(value, delimiter, quoteAll);
            }).join(delimiter);
            csvRows.push(csvRow);
        });

        return csvRows.join(lineEnding);
    }

    /**
     * 转义CSV值
     */
    static escapeCSVValue(value: string, delimiter: string = ',', quoteAll: boolean = false): string {
        const strValue = value.toString();

        // 检查是否需要引号包围
        const needsQuotes = quoteAll ||
                           strValue.includes(delimiter) ||
                           strValue.includes('"') ||
                           strValue.includes('\n') ||
                           strValue.includes('\r');

        if (needsQuotes) {
            // 转义引号
            const escapedValue = strValue.replace(/"/g, '""');
            return `"${escapedValue}"`;
        }

        return strValue;
    }

    /**
     * 解析CSV字符串
     */
    static parseCSV(csvString: string, options: ParseCSVOptions = {}): ParsedCSV {
        const {
            delimiter = ',',
            hasHeaders = true,
            skipEmptyLines = true
        } = options;

        const lines = csvString.split(/\r?\n/);
        const parsedRows: string[][] = [];

        for (const line of lines) {
            if (skipEmptyLines && !line.trim()) continue;

            const row = this.parseCSVRow(line, delimiter);
            parsedRows.push(row);
        }

        if (parsedRows.length === 0) {
            return { headers: [], rows: [] };
        }

        let headers: string[];
        let dataRows: string[][];

        if (hasHeaders) {
            headers = parsedRows[0];
            dataRows = parsedRows.slice(1);
        } else {
            // 生成默认表头
            const columnCount = parsedRows[0].length;
            headers = Array.from({ length: columnCount }, (_, i) => `Column${i + 1}`);
            dataRows = parsedRows;
        }

        // 转换为对象数组
        const rows: CSVRow[] = dataRows.map(row => {
            const rowObj: CSVRow = {};
            headers.forEach((header, index) => {
                rowObj[header] = row[index] || '';
            });
            return rowObj;
        });

        return { headers, rows };
    }

    /**
     * 解析CSV行
     */
    static parseCSVRow(line: string, delimiter: string = ','): string[] {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // 转义的引号
                    current += '"';
                    i += 2;
                    continue;
                } else {
                    // 切换引号状态
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                // 字段分隔符
                values.push(current);
                current = '';
                i++;
                continue;
            } else {
                current += char;
            }

            i++;
        }

        // 添加最后一个值
        values.push(current);

        return values;
    }

    /**
     * 获取列的统计信息
     */
    static getColumnStats(rows: CSVRow[], columnName: string): ColumnStats {
        const values = rows.map(row => row[columnName] || '').filter(val => val !== '');

        if (values.length === 0) {
            return {
                count: 0,
                unique: 0,
                empty: rows.length,
                dataType: 'string'
            };
        }

        const dataType = this.detectColumnDataType(rows, columnName);
        const uniqueValues = new Set(values);
        const emptyCount = rows.length - values.length;

        const stats: ColumnStats = {
            count: values.length,
            unique: uniqueValues.size,
            empty: emptyCount,
            dataType,
            uniqueValues: Array.from(uniqueValues).slice(0, 100) // 最多显示100个唯一值
        };

        // 数字列的额外统计
        if (dataType === 'number') {
            const numbers = values.map(v => parseFloat(v)).filter(n => !isNaN(n));
            if (numbers.length > 0) {
                stats.min = Math.min(...numbers);
                stats.max = Math.max(...numbers);
                stats.avg = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
                stats.sum = numbers.reduce((sum, n) => sum + n, 0);
            }
        }

        return stats;
    }

    /**
     * 过滤行数据
     */
    static filterRows(rows: CSVRow[], filters: CSVFilter[]): CSVRow[] {
        if (!filters || filters.length === 0) {
            return rows;
        }

        return rows.filter(row => {
            return filters.every(filter => {
                const { column, operator, value, caseSensitive = false } = filter;
                const cellValue = row[column] || '';
                const filterValue = value || '';

                const compareValue = caseSensitive ? cellValue.toString() : cellValue.toString().toLowerCase();
                const targetValue = caseSensitive ? filterValue.toString() : filterValue.toString().toLowerCase();

                switch (operator) {
                    case 'equals':
                        return compareValue === targetValue;
                    case 'contains':
                        return compareValue.includes(targetValue);
                    case 'startsWith':
                        return compareValue.startsWith(targetValue);
                    case 'endsWith':
                        return compareValue.endsWith(targetValue);
                    case 'notEquals':
                        return compareValue !== targetValue;
                    case 'notContains':
                        return !compareValue.includes(targetValue);
                    case 'isEmpty':
                        return compareValue === '';
                    case 'isNotEmpty':
                        return compareValue !== '';
                    case 'greaterThan':
                        return parseFloat(compareValue) > parseFloat(targetValue);
                    case 'lessThan':
                        return parseFloat(compareValue) < parseFloat(targetValue);
                    case 'greaterThanOrEqual':
                        return parseFloat(compareValue) >= parseFloat(targetValue);
                    case 'lessThanOrEqual':
                        return parseFloat(compareValue) <= parseFloat(targetValue);
                    default:
                        return true;
                }
            });
        });
    }

    /**
     * 格式化文件大小
     */
    static formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';

        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
    }

    /**
     * 格式化数字
     */
    static formatNumber(number: number, options: FormatNumberOptions = {}): string {
        const {
            decimals = 2,
            useThousandSeparator = true,
            locale = 'zh-CN'
        } = options;

        const num = parseFloat(number as unknown as string);
        if (isNaN(num)) return number.toString();

        if (useThousandSeparator) {
            return num.toLocaleString(locale, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        } else {
            return num.toFixed(decimals);
        }
    }

    /**
     * 生成唯一ID
     */
    static generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * 深拷贝对象
     */
    static deepClone<T>(obj: T): T {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
        if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as unknown as T;
        if (typeof obj === 'object') {
            const cloned: Record<string, unknown> = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    cloned[key] = this.deepClone((obj as Record<string, unknown>)[key]);
                }
            }
            return cloned as unknown as T;
        }
        return obj;
    }
}
