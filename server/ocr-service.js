const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

// 固定的Descrizione Articolo选项（已更新为DA格式）
const DESCRIZIONE_OPTIONS = [
    'CERNIERE DA SCORCIARE',
    'CATENA CONTINUA METALLO MONT,BLOCCHETTO VARIE MIS',
    'CERNIERE DA MONTARE CURSORE',
    'CERNIERE DA MONTARE TIRETTO'
];

class OCRService {
    constructor() {
        this.worker = null;
        this.isInitialized = false;
        this.initializationAttempts = 0;
        this.maxInitAttempts = 3;
    }

    async initialize() {
        try {
            this.initializationAttempts++;
            console.log(`🔧 创建Tesseract worker... (尝试 ${this.initializationAttempts}/${this.maxInitAttempts})`);
            
            // 如果已有worker，先清理
            if (this.worker) {
                try {
                    console.log('🧹 清理现有worker...');
                    await this.worker.terminate();
                    await new Promise(resolve => setTimeout(resolve, 500)); // 等待清理完成
                } catch (e) {
                    console.log('⚠️ 清理旧worker时出错:', e.message);
                }
                this.worker = null;
            }
            
            // 使用最简单的配置创建worker (新版本已预加载语言包)
            console.log('🔧 正在创建新的Tesseract worker...');
            this.worker = await Tesseract.createWorker('ita');

            console.log('✅ 意大利语OCR服务初始化完成');
            this.isInitialized = true;
            this.initializationAttempts = 0; // 重置计数器
            return true;
        } catch (error) {
            console.error(`❌ OCR服务初始化失败 (尝试 ${this.initializationAttempts}/${this.maxInitAttempts}):`, error.message);
            console.error('错误堆栈:', error.stack);
            
            this.isInitialized = false;
            this.worker = null;
            
            // 如果还有重试机会，等待后重试
            if (this.initializationAttempts < this.maxInitAttempts) {
                console.log(`⏳ 等待2秒后重试初始化...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return await this.initialize();
            }
            
            return false;
        }
    }

    // 提取Numero Documento
    extractNumeroDocumento(text) {
        console.log('🔍 开始提取Numero Documento...');
        console.log(`📄 搜索文本长度: ${text.length} 字符`);
        console.log(`📄 文本预览: "${text.substring(0, 300)}..."`);
        
        // 匹配数字/字母格式，优先匹配特定模式
        const patterns = [
            /(\d{3}\/[a-zA-Z])/g,    // 549/s 格式
            /(\d{3}\/\d+)/g,         // 544/8 格式
            /(\d+\/[a-zA-Z0-9]+)/g,  // 通用格式
            /(\d+\/\d+)/g,           // 数字/数字格式
            /(\d+[\/\-][a-zA-Z0-9]+)/g, // 其他分隔符
            /(\d{2,4}[\/\-\\\|][a-zA-Z0-9]+)/g, // 更宽泛的模式
            /([0-9]{2,4}[^\w\s][a-zA-Z0-9]+)/g  // 任何非字母数字分隔符
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            console.log(`🔍 尝试模式 ${i + 1}: ${pattern.source}`);
            
            const matches = text.match(pattern);
            if (matches && matches.length > 0) {
                console.log(`✅ 找到匹配项: ${JSON.stringify(matches)}`);
                
                // 优先选择3位数字开头的格式
                for (const match of matches) {
                    if (/^\d{3}\//.test(match)) {
                        console.log(`✅ 找到Numero Documento (3位数字格式): ${match}`);
                        return match;
                    }
                }
                
                // 如果没有3位数字开头的，选择第一个匹配
                console.log(`✅ 找到Numero Documento (通用格式): ${matches[0]}`);
                return matches[0];
            } else {
                console.log(`❌ 模式 ${i + 1} 无匹配`);
            }
        }

        // 尝试更宽泛的搜索
        console.log('🔍 尝试更宽泛的数字搜索...');
        const allNumbers = text.match(/\d+/g);
        if (allNumbers) {
            console.log(`📊 找到所有数字: ${JSON.stringify(allNumbers)}`);
            
            // 查找可能的文档编号（通常是3位数字）
            const threeDigitNumbers = allNumbers.filter(num => num.length === 3);
            if (threeDigitNumbers.length > 0) {
                console.log(`✅ 找到可能的Numero Documento (3位数字): ${threeDigitNumbers[0]}`);
                return threeDigitNumbers[0];
            }
        }

        console.log('❌ 未找到Numero Documento');
        return null;
    }

    // 提取Quantita (只提取数字)
    extractQuantita(text) {
        console.log('🔍 开始提取Quantita...');
        console.log(`📄 搜索文本长度: ${text.length} 字符`);
        
        // 匹配数字格式，优先匹配特定范围的数字
        const patterns = [
            /(\d{2,3}[,\.]\d{2})/g,  // 两到三位数字带小数点 (如: 105,00)
            /(\d{1,3}[,\.]\d{2})/g,  // 一到三位数字带小数点
            /(\d{2,4}[,\.]\d{1,3})/g, // 更宽泛的小数格式
            /(\d{2,4})/g             // 纯数字格式
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            console.log(`🔍 尝试Quantita模式 ${i + 1}: ${pattern.source}`);
            
            const matches = text.match(pattern);
            if (matches && matches.length > 0) {
                console.log(`✅ 找到数字匹配项: ${JSON.stringify(matches)}`);
                
                // 选择在合理范围内的数字 (10-999)
                const validNumbers = matches.map(m => {
                    const num = parseFloat(m.replace(',', '.'));
                    return { original: m, value: num };
                }).filter(n => !isNaN(n.value) && n.value >= 10 && n.value <= 999);
                
                console.log(`📊 有效数字: ${JSON.stringify(validNumbers)}`);
                
                if (validNumbers.length > 0) {
                    // 优先选择100-300范围内的数字
                    const preferred = validNumbers.find(n => n.value >= 100 && n.value <= 300);
                    if (preferred) {
                        console.log(`✅ 找到Quantita (优选范围): ${preferred.original}`);
                        return preferred.original;
                    }
                    
                    // 否则选择第一个有效数字
                    console.log(`✅ 找到Quantita (通用): ${validNumbers[0].original}`);
                    return validNumbers[0].original;
                }
            } else {
                console.log(`❌ Quantita模式 ${i + 1} 无匹配`);
            }
        }

        // 尝试查找所有数字
        console.log('🔍 尝试查找所有可能的数量数字...');
        const allNumbers = text.match(/\d+/g);
        if (allNumbers) {
            console.log(`📊 找到所有数字: ${JSON.stringify(allNumbers)}`);
            
            // 查找可能的数量（通常是2-3位数字）
            const quantityNumbers = allNumbers.filter(num => {
                const value = parseInt(num);
                return value >= 50 && value <= 999;
            });
            
            if (quantityNumbers.length > 0) {
                console.log(`✅ 找到可能的Quantita: ${quantityNumbers[0]}`);
                return quantityNumbers[0] + '.00'; // 添加小数部分
            }
        }

        console.log('❌ 未找到Quantita');
        return null;
    }

    // 匹配Descrizione Articolo (从固定选项中选择最佳匹配)
    matchDescrizioneArticolo(text) {
        console.log('🔍 开始提取Descrizione Articolo...');
        console.log(`📄 原始文本长度: ${text.length} 字符`);
        console.log(`📄 原始文本预览: "${text.substring(0, 500)}..."`);
        
        const normalizedText = text.toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
        console.log(`🔍 标准化文本: "${normalizedText.substring(0, 300)}..."`);

        let bestMatch = null;
        let bestScore = 0;

        console.log('📊 开始相似度匹配...');
        for (const option of DESCRIZIONE_OPTIONS) {
            const normalizedOption = option.toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
            
            // 计算相似度分数
            const score = this.calculateSimilarity(normalizedText, normalizedOption);
            console.log(`📊 "${option}" 相似度: ${(score * 100).toFixed(1)}%`);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = option;
            }
        }

        // 如果最佳匹配分数超过15%，则认为匹配成功 (进一步降低阈值)
        if (bestScore > 0.15) {
            console.log(`✅ 最佳匹配: "${bestMatch}" (${(bestScore * 100).toFixed(1)}%)`);
            return bestMatch;
        }

        // 如果没有匹配，尝试关键词匹配
        console.log('🔍 尝试关键词匹配...');
        if (normalizedText.includes('CATENA') && (normalizedText.includes('METALLO') || normalizedText.includes('SPIRALE'))) {
            console.log('✅ 关键词匹配: CATENA CONTINUA (METALLO/SPIRALE)');
            return 'CATENA CONTINUA METALLO MONT,BLOCCHETTO VARIE MIS';
        } else if (normalizedText.includes('CATENA') && normalizedText.includes('CONTINUA')) {
            console.log('✅ 关键词匹配: CATENA CONTINUA (通用)');
            return 'CATENA CONTINUA METALLO MONT,BLOCCHETTO VARIE MIS';
        } else if (normalizedText.includes('CERNIERE') && normalizedText.includes('SCORCIARE')) {
            console.log('✅ 关键词匹配: CERNIERE DA SCORCIARE');
            return 'CERNIERE DA SCORCIARE';
        } else if (normalizedText.includes('CERNIERE') && normalizedText.includes('CURSORE')) {
            console.log('✅ 关键词匹配: CERNIERE DA MONTARE CURSORE');
            return 'CERNIERE DA MONTARE CURSORE';
        } else if (normalizedText.includes('CERNIERE') && normalizedText.includes('TIRETTO')) {
            console.log('✅ 关键词匹配: CERNIERE DA MONTARE TIRETTO');
            return 'CERNIERE DA MONTARE TIRETTO';
        }

        console.log('❌ 未找到匹配的Descrizione Articolo');
        return null;
    }

    // 计算字符串相似度
    calculateSimilarity(str1, str2) {
        const words1 = str1.split(' ').filter(w => w.length > 2);
        const words2 = str2.split(' ').filter(w => w.length > 2);
        
        let matchCount = 0;
        for (const word1 of words1) {
            for (const word2 of words2) {
                if (word1.includes(word2) || word2.includes(word1)) {
                    matchCount++;
                    break;
                }
            }
        }

        return matchCount / Math.max(words1.length, words2.length);
    }

    // 安全的OCR识别方法，带有多重错误保护
    async safeRecognize(imagePath, retryCount = 0, maxRetries = 2) {
        
        try {
            console.log(`🔍 执行OCR识别 (尝试 ${retryCount + 1}/${maxRetries + 1}): ${path.basename(imagePath)}`);
            
            // 验证文件
            if (!fs.existsSync(imagePath)) {
                throw new Error(`文件不存在: ${imagePath}`);
            }
            
            const stats = fs.statSync(imagePath);
            if (stats.size === 0) {
                throw new Error(`文件为空: ${imagePath}`);
            }
            
            console.log(`📁 文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
            
            // 确保worker已初始化
            if (!this.isInitialized || !this.worker) {
                console.log('🔄 Worker未初始化，正在重新初始化...');
                const initSuccess = await this.initialize();
                if (!initSuccess) {
                    throw new Error('Worker初始化失败');
                }
            }
            
            // 使用绝对路径
            const absolutePath = path.resolve(imagePath);
            console.log(`📁 使用绝对路径: ${absolutePath}`);
            
            // 创建带超时的OCR Promise
            const ocrPromise = this.worker.recognize(absolutePath);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('OCR操作超时 (30秒)')), 30000)
            );
            
            // 执行OCR识别
            const result = await Promise.race([ocrPromise, timeoutPromise]);
            
            if (!result || !result.data) {
                throw new Error('OCR返回无效结果');
            }
            
            const { data: { text, confidence } } = result;
            
            if (!text || text.length < 10) {
                throw new Error(`OCR识别文本过短: ${text ? text.length : 0} 字符`);
            }
            
            console.log(`📝 OCR识别成功，置信度: ${confidence.toFixed(1)}%`);
            console.log(`📄 识别文本长度: ${text.length} 字符`);
            
            return { text, confidence };
            
        } catch (error) {
            console.error(`❌ OCR识别失败 (尝试 ${retryCount + 1}):`, error.message);
            
            // 如果是Tesseract相关错误且还有重试机会
            if ((error.message.includes('SetImageFile') || 
                 error.message.includes('Cannot read properties of null') ||
                 error.message.includes('Worker') ||
                 error.message.includes('timeout')) && 
                retryCount < maxRetries) {
                
                console.log(`🔄 检测到可重试错误，准备重试 ${retryCount + 1}/${maxRetries}...`);
                
                // 强制重新初始化
                try {
                    await this.terminate();
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
                    
                    const initSuccess = await this.initialize();
                    if (!initSuccess) {
                        throw new Error('重新初始化失败');
                    }
                    
                    // 递归重试
                    return await this.safeRecognize(imagePath, retryCount + 1, maxRetries);
                    
                } catch (retryError) {
                    console.error(`❌ 重试初始化失败:`, retryError.message);
                    throw new Error(`重试失败: ${retryError.message}`);
                }
            }
            
            // 如果不能重试或重试次数用完，抛出错误
            throw error;
        }
    }

    // 完整的文档识别流程
    async recognizeDocument(imagePath, options = {}) {
        try {
            console.log(`🔍 开始识别文档: ${path.basename(imagePath)}`);
            
            const { source = 'upload', enhanced = false, retries = 2 } = options;
            
            if (source === 'camera') {
                console.log('📱 拍照模式: 使用优化识别策略');
                if (enhanced) {
                    console.log('✨ 图像已预处理: 跳过部分增强步骤');
                }
            }
            
            // 使用安全的OCR识别方法，拍照文件允许更多重试
            const { text, confidence } = await this.safeRecognize(imagePath, 0, retries);
            
            console.log(`📄 OCR置信度: ${confidence.toFixed(1)}%`);
            
            const results = {};

            // 从全文中提取各个字段
            const numero = this.extractNumeroDocumento(text);
            if (numero) {
                results['Numero Documento'] = numero;
            }

            const quantita = this.extractQuantita(text);
            if (quantita) {
                results['Quantita'] = quantita;
            }

            const descrizione = this.matchDescrizioneArticolo(text);
            if (descrizione) {
                results['Descrizione Articolo'] = descrizione;
            }

            // 为拍照文件提供额外的识别质量评估
            if (source === 'camera') {
                const fieldCount = Object.keys(results).length;
                console.log(`📱 拍照识别质量评估: ${fieldCount}/3 字段识别成功`);
                
                if (fieldCount === 0) {
                    console.log('⚠️ 拍照识别结果为空，可能需要重新拍照');
                } else if (fieldCount < 2) {
                    console.log('⚠️ 拍照识别结果不完整，建议重新拍照以获得更好效果');
                } else {
                    console.log('✅ 拍照识别结果良好');
                }
            }

            console.log('📊 最终识别结果:', results);
            return results;

        } catch (error) {
            console.error('❌ 文档识别完全失败:', error.message);
            console.error('错误堆栈:', error.stack);
            
            // 为拍照文件提供更具体的错误信息
            if (options.source === 'camera') {
                console.log('❌ 拍照识别失败，建议用户重新拍照');
                throw new Error('拍照识别失败，请确保文档清晰可见');
            }
            
            // 返回空结果而不是抛出错误，避免系统崩溃
            console.log('⚠️ 返回空结果以避免系统崩溃');
            return {};
        }
    }

    async terminate() {
        try {
            if (this.worker) {
                console.log('🔄 正在关闭OCR服务...');
                await this.worker.terminate();
                this.worker = null;
                this.isInitialized = false;
                console.log('✅ OCR服务已关闭');
            }
        } catch (error) {
            console.error('❌ 关闭OCR服务时出错:', error.message);
            // 强制清理
            this.worker = null;
            this.isInitialized = false;
        }
    }
}

// 导出单例实例
const ocrService = new OCRService();

module.exports = {
    ocrService,
    DESCRIZIONE_OPTIONS
}; 