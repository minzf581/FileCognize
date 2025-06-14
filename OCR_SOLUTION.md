# OCR识别问题解决方案

## 问题描述
前端使用Tesseract.js时出现错误：
```
createWorker.js:217 Uncaught Error: TypeError: Failed to fetch
```

这个错误通常是由于以下原因造成的：

## 问题原因
1. **CDN访问问题**: Tesseract.js需要从CDN下载语言包和核心文件
2. **网络连接问题**: 无法访问jsDelivr或unpkg等CDN
3. **CORS问题**: 跨域资源共享限制
4. **浏览器兼容性**: 某些浏览器版本不支持

## 解决方案

### 方案1: 使用本地文件（推荐）
将Tesseract.js的核心文件下载到本地：

```javascript
// 在前端代码中配置本地路径
const worker = await createWorker('eng', 1, {
  workerPath: '/static/js/worker.min.js',
  langPath: '/static/lang-data',
  corePath: '/static/tesseract-core.wasm.js'
});
```

### 方案2: 使用不同的CDN
```javascript
const worker = await createWorker('eng', 1, {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4.1.1/dist/worker.min.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4.0.3/tesseract-core.wasm.js'
});
```

### 方案3: 后端OCR服务（已实现）
我已经在后端实现了OCR服务API：

#### API端点：
- `POST /api/ocr` - 基本OCR识别
- `POST /api/ocr-and-process` - OCR识别并处理缺省模板

#### 使用示例：
```javascript
// 前端调用后端OCR API
const formData = new FormData();
formData.append('image', imageFile);
formData.append('multiLanguage', 'true');

const response = await fetch('/api/ocr', {
  method: 'POST',
  body: formData
});

const result = await response.json();
if (result.success) {
  console.log('识别文本:', result.text);
  console.log('置信度:', result.confidence);
}
```

### 方案4: 修改前端代码使用后端API

将前端的OCR逻辑替换为调用后端API：

```javascript
// 替换前端OCR函数
async function performOCR(imageFile) {
  try {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('multiLanguage', 'true');
    
    const response = await fetch('/api/ocr-and-process', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      return {
        text: result.ocrResult.text,
        confidence: result.ocrResult.confidence,
        extractedData: result.extractedData,
        processedData: result.processedData
      };
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('OCR识别失败:', error);
    throw error;
  }
}
```

## 当前状态

### 后端OCR服务
- ✅ 已实现模拟OCR服务
- ✅ 支持基本图片识别
- ✅ 支持多语言识别
- ✅ 集成缺省模板处理
- ✅ 支持会话管理

### 前端修改建议
1. 移除前端Tesseract.js依赖
2. 使用后端OCR API
3. 保持相同的用户界面
4. 添加上传进度显示

## 部署建议

### 生产环境
1. 使用真实的OCR服务（如Google Vision API、Azure Computer Vision等）
2. 配置适当的文件上传限制
3. 添加图片预处理（压缩、格式转换）
4. 实现OCR结果缓存

### 开发环境
- 当前的模拟OCR服务可以用于开发和测试
- 返回预设的示例数据，便于前端开发

## 测试方法

启动服务器后，可以使用以下方式测试OCR功能：

```bash
# 测试OCR API
curl -X POST -F "image=@test-image.jpg" -F "multiLanguage=true" http://localhost:3001/api/ocr

# 测试OCR并处理
curl -X POST -F "image=@test-image.jpg" -F "sessionId=test123" http://localhost:3001/api/ocr-and-process
```

## 注意事项

1. **文件大小限制**: 当前设置为50MB，可根据需要调整
2. **支持格式**: 支持常见图片格式（JPG、PNG、GIF、BMP等）
3. **处理时间**: 真实OCR服务可能需要几秒到几十秒
4. **准确率**: 取决于图片质量和OCR服务质量

## 下一步

1. 根据需要选择合适的解决方案
2. 如果选择后端API方案，需要修改前端代码
3. 在生产环境中配置真实的OCR服务
4. 添加错误处理和用户反馈机制 