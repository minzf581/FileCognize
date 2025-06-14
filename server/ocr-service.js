const fs = require('fs');
const path = require('path');

// 尝试导入Tesseract.js，如果失败则使用模拟模式
let Tesseract;
let useRealOCR = false;

try {
  Tesseract = require('tesseract.js');
  useRealOCR = true; // 启用真实OCR
  console.log('✅ Tesseract.js已加载，使用真实OCR识别');
} catch (error) {
  console.log('⚠️ Tesseract.js未安装，使用模拟OCR模式');
  console.log('💡 要启用真实OCR，请运行: npm install tesseract.js');
}

// OCR服务类 - 支持真实OCR和模拟模式
class OCRService {
  constructor() {
    this.isInitialized = false;
    this.worker = null;
  }

  // 初始化OCR服务
  async initialize() {
    try {
      console.log('正在初始化OCR服务...');
      
      if (useRealOCR) {
        // 初始化Tesseract.js worker，使用最简单的配置
        console.log('🔧 创建Tesseract worker...');
        this.worker = await Tesseract.createWorker();
        
        console.log('🔧 加载语言包...');
        await this.worker.loadLanguage('ita+eng');
        
        console.log('🔧 初始化语言包...');
        await this.worker.initialize('ita+eng');
        
        console.log('✅ Tesseract.js OCR服务初始化完成');
      } else {
        // 模拟初始化过程
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ 模拟OCR服务初始化完成');
      }
      
      this.isInitialized = true;
      
    } catch (error) {
      console.error('OCR服务初始化失败:', error);
      // 如果真实OCR初始化失败，切换到模拟模式
      useRealOCR = false;
      this.isInitialized = true;
      console.log('⚠️ 切换到模拟OCR模式');
    }
  }

  // 识别图片文本 - 真实OCR实现
  async recognizeImage(imagePath, options = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('开始OCR识别:', path.basename(imagePath));
      
      // 检查文件是否存在
      if (!fs.existsSync(imagePath)) {
        throw new Error(`图片文件不存在: ${imagePath}`);
      }

      if (useRealOCR && this.worker) {
        try {
          // 使用真实的Tesseract.js OCR
          console.log('🔍 开始真实OCR识别...');
          const { data: { text, confidence } } = await this.worker.recognize(imagePath);
          
          console.log(`✅ 真实OCR识别完成，置信度: ${confidence.toFixed(1)}%`);
          console.log(`📝 识别文本长度: ${text.length} 字符`);
          console.log(`📄 识别文本预览: ${text.substring(0, 200)}...`);
          
          return {
            text: text.trim(),
            confidence: confidence,
            success: true,
            language: 'ita+eng',
            isReal: true
          };
        } catch (ocrError) {
          console.error('Tesseract.js OCR失败:', ocrError);
          throw ocrError; // 不再降级到模拟模式，直接抛出错误
        }
      } else {
        throw new Error('真实OCR未启用，请检查Tesseract.js安装');
      }

    } catch (error) {
      console.error('OCR识别失败:', error);
      return {
        text: '',
        confidence: 0,
        success: false,
        error: error.message,
        isReal: false
      };
    }
  }

  // 识别多语言文本 - 真实OCR实现
  async recognizeMultiLanguage(imagePath, options = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('开始多语言OCR识别:', path.basename(imagePath));
      
      // 检查文件是否存在
      if (!fs.existsSync(imagePath)) {
        throw new Error(`图片文件不存在: ${imagePath}`);
      }

      if (useRealOCR && this.worker) {
        try {
          // 使用真实的Tesseract.js多语言OCR
          console.log('🔍 开始真实多语言OCR识别...');
          const { data: { text, confidence } } = await this.worker.recognize(imagePath);
          
          console.log(`✅ 真实多语言OCR识别完成，置信度: ${confidence.toFixed(1)}%`);
          console.log(`📝 识别文本长度: ${text.length} 字符`);
          console.log(`📄 识别文本预览: ${text.substring(0, 300)}...`);
          
          return {
            text: text.trim(),
            confidence: confidence,
            success: true,
            language: 'ita+eng',
            isReal: true
          };
        } catch (ocrError) {
          console.error('Tesseract.js多语言OCR失败:', ocrError);
          throw ocrError; // 不再降级到模拟模式，直接抛出错误
        }
      } else {
        throw new Error('真实OCR未启用，请检查Tesseract.js安装');
      }

    } catch (error) {
      console.error('多语言OCR识别失败:', error);
      return {
        text: '',
        confidence: 0,
        success: false,
        error: error.message,
        language: 'ita+eng',
        isReal: false
      };
    }
  }

  // 清理资源
  async terminate() {
    try {
      console.log('正在关闭OCR服务...');
      if (this.worker) {
        await this.worker.terminate();
        this.worker = null;
      }
      this.isInitialized = false;
      console.log('OCR服务已终止');
    } catch (error) {
      console.error('关闭OCR服务时出错:', error);
    }
  }

  // 预处理图片以提高OCR准确性
  preprocessImage(imagePath, outputPath) {
    // 这里可以添加图片预处理逻辑
    // 比如调整对比度、去噪等
    return imagePath;
  }
}

// 创建单例实例
const ocrService = new OCRService();

// 优雅关闭 - 仅在非生产环境中注册信号处理器
if (process.env.NODE_ENV !== 'production') {
  process.on('SIGINT', async () => {
    console.log('正在关闭OCR服务...');
    await ocrService.terminate();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('正在关闭OCR服务...');
    await ocrService.terminate();
    process.exit(0);
  });
}

module.exports = ocrService; 