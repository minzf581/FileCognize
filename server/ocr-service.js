const fs = require('fs');
const path = require('path');

// 尝试导入Tesseract.js，如果失败则使用模拟模式
let Tesseract;
let useRealOCR = false;

try {
  Tesseract = require('tesseract.js');
  useRealOCR = true;
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
        // 初始化Tesseract.js worker
        this.worker = await Tesseract.createWorker('ita+eng+chi_sim', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`OCR识别进度: ${Math.round(m.progress * 100)}%`);
            }
          }
        });
        console.log('✅ Tesseract.js OCR服务初始化完成');
      } else {
        // 模拟初始化过程
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ 模拟OCR服务初始化完成');
      }
      
      this.isInitialized = true;
      
    } catch (error) {
      console.error('OCR服务初始化失败:', error);
      throw error;
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
        throw new Error('图片文件不存在');
      }

      if (useRealOCR && this.worker) {
        // 使用真实的Tesseract.js OCR
        const { data: { text, confidence } } = await this.worker.recognize(imagePath);
        
        console.log(`✅ OCR识别完成，置信度: ${confidence.toFixed(1)}%`);
        console.log(`📝 识别文本长度: ${text.length} 字符`);
        
        return {
          text: text.trim(),
          confidence: confidence,
          success: true,
          language: 'ita+eng+chi_sim'
        };
      } else {
        // 模拟OCR识别过程
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 返回模拟的OCR结果
        const mockText = `
        运输单据示例
        Numero Documento: 12345
        Quantita: 150cm
        Descrizione Articolo: NS .CERNIERE A SCORCIARE
        其他识别的文本内容...
        `;

        console.log('⚠️ OCR识别完成 (模拟结果)');
        
        return {
          text: mockText.trim(),
          confidence: 85.5,
          success: true,
          note: '这是模拟的OCR结果，要启用真实OCR请安装tesseract.js'
        };
      }

    } catch (error) {
      console.error('OCR识别失败:', error);
      return {
        text: '',
        confidence: 0,
        success: false,
        error: error.message
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
        throw new Error('图片文件不存在');
      }

      if (useRealOCR && this.worker) {
        // 使用真实的Tesseract.js多语言OCR
        const { data: { text, confidence } } = await this.worker.recognize(imagePath);
        
        console.log(`✅ 多语言OCR识别完成，置信度: ${confidence.toFixed(1)}%`);
        console.log(`📝 识别文本长度: ${text.length} 字符`);
        
        return {
          text: text.trim(),
          confidence: confidence,
          success: true,
          language: 'ita+eng+chi_sim'
        };
      } else {
        // 模拟多语言OCR识别过程
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 使用真实的OCR结果格式作为模拟数据
        const mockText = `£ Py
. » . .
Meoni & Ciampalini s.p.a.
. : Spett.
RAPPRESENTANZE CON DEPOSITO E COMMERCIO CONFEZIONE APOLLO DI CHEN DONGPING
ACCESSORI PER CONFEZIONE VIA DEL CASTELLUCCIO, 38
一 PO FI
50053 EMPOLI (Firenze) - Via Reali, 32/34 Ae Be ire
Zona Industriale Terrafino
| edd Ud + Fax 0571.930161
e-mail: info@meoniciampalini.it - www. ici ini.i i inazi i i
| Capitale Sociale Euro 200.006 60 meoniciampalini.it Luogo di Destinazione dei Beni
R.E.A. Firenze 296618
| Codice Fiscale e Partita Iva 03066330485 ay
| Reg. Impr. Firenze 03066330485
| Id. Code: IT 03066330485
1
| [i Cliente] Numero Documento Data Documento "Cod. Fisc./Partita Iva ca
[01107 | 549/s 10/03/2025 07188150481 Documento di Trasporto (0.d.t.) || 1 |
LCodice Articolo || Descrizione Articolo i Jun) quantità |
i | Fr STE ET A TE RE ET os RTI | —
| METALLOFIS CATENA CONTINUA METALLO DA FARE FISSA VARIE MISURE PZ 246 MT | 105,00 |
05685`;

        console.log('⚠️ 多语言OCR识别完成 (模拟结果)');
        
        return {
          text: mockText.trim(),
          confidence: 88.2,
          success: true,
          language: 'ita+eng+chi_sim',
          note: '这是模拟的多语言OCR结果，要启用真实OCR请安装tesseract.js'
        };
      }

    } catch (error) {
      console.error('多语言OCR识别失败:', error);
      return {
        text: '',
        confidence: 0,
        success: false,
        error: error.message,
        language: 'ita+eng+chi_sim'
      };
    }
  }

  // 清理资源
  async terminate() {
    try {
      if (this.worker) {
        await this.worker.terminate();
        this.worker = null;
      }
      this.isInitialized = false;
      console.log('正在关闭OCR服务...');
    } catch (error) {
      console.error('终止OCR服务时出错:', error);
    }
  }

  // 预处理图片（可选）
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