# 🚀 Railway部署修复指南

## 🔍 问题原因

Railway部署后前端没有变化的原因：
1. **旧的build目录**: 项目中存在`build/`目录，包含旧的React构建文件
2. **静态文件优先级**: 服务器在生产环境下优先使用`build`目录而不是`public`目录
3. **缓存问题**: Railway可能缓存了旧的构建文件

## ✅ 解决方案

### 1. 删除旧的构建文件
```bash
# 删除旧的build目录
rm -rf build/
```

### 2. 修改服务器配置
已修改 `server/server.js` 中的生产环境配置，优先使用新的前端页面：

```javascript
// 生产环境下提供静态文件 - 优先使用新的前端页面
if (process.env.NODE_ENV === 'production') {
  // 优先检查public目录的新前端页面
  const publicPath = path.join(__dirname, '../public');
  const publicIndexPath = path.join(publicPath, 'index.html');
  
  if (fs.existsSync(publicIndexPath)) {
    console.log(`✅ 使用新的前端页面: ${publicPath}`);
    
    // 为所有路由返回新的前端页面
    app.get('*', (req, res) => {
      // 如果是API请求，跳过
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: '接口不存在' });
      }
      res.sendFile(publicIndexPath);
    });
  }
  // ... 回退逻辑
}
```

### 3. 确保文件结构正确
```
FileCognize/
├── public/
│   └── index.html          # ✅ 新的前端页面
├── server/
│   ├── server.js           # ✅ 已修改配置
│   └── ocr-service.js      # ✅ OCR服务
├── output.xlsx             # ✅ 导出模板
├── package.json            # ✅ 依赖配置
└── (删除了build目录)       # ✅ 避免冲突
```

## 🚀 部署步骤

### 1. 推送更新到GitHub
```bash
git add .
git commit -m "修复Railway部署前端问题：删除build目录，优先使用public/index.html"
git push origin main
```

### 2. Railway重新部署
Railway会自动检测到代码变化并重新部署。

### 3. 清除缓存（如果需要）
如果Railway仍使用旧版本，可以：
- 在Railway控制台中手动触发重新部署
- 或者在Railway设置中清除构建缓存

## 🧪 验证部署

### 1. 检查服务器日志
在Railway控制台中查看部署日志，应该看到：
```
✅ 使用新的前端页面: /app/public
```

### 2. 测试前端页面
访问Railway提供的URL，应该看到：
- 现代化的界面设计
- "FileCognize - 智能文档识别与数据提取系统"标题
- 拖拽上传功能

### 3. 测试API功能
- 上传图片应该只返回3个字段
- 导出应该生成符合模板的Excel文件

## 🔧 本地测试

### 模拟生产环境
```bash
NODE_ENV=production PORT=3001 node server/server.js
```

### 验证输出
应该看到：
```
✅ 使用新的前端页面: /path/to/public
文件整理服务器运行在端口 3001
```

### 测试前端
```bash
curl http://localhost:3001/
# 应该返回新的HTML页面内容
```

## 📊 预期结果

### ✅ 前端界面
- 现代化设计，渐变背景
- 简洁的上传界面
- 实时进度显示

### ✅ OCR结果
```json
{
  "success": true,
  "message": "OCR识别完成，提取到3个字段",
  "extractedFields": {
    "Numero Documento": "549/s",
    "Quantita": "105,00",
    "Descrizione Articolo": "CATENA CONTINUA METALLO MONT,BLOCCHETTO VARIE MIS"
  },
  "mapping": {
    "Numero Documento": "IMPORTO列 (G列)",
    "Quantita": "QUANTITA列 (A列)",
    "Descrizione Articolo": "DESCRIZIONE DEI BENI列 (B列)"
  }
}
```

### ✅ Excel导出
- 严格按照output.xlsx模板格式
- 数据写入正确的列和行
- 文件名格式：`FileCognize_Export_{sessionId}_{timestamp}.xlsx`

## 🚨 故障排除

### 如果仍显示旧界面
1. **检查Railway日志**: 确认使用了新的前端页面
2. **清除浏览器缓存**: 强制刷新页面
3. **检查文件**: 确认`public/index.html`存在且内容正确

### 如果API不工作
1. **检查路由**: 确认API路由没有被前端路由覆盖
2. **检查CORS**: 确认CORS配置正确
3. **检查日志**: 查看服务器错误日志

### 如果导出格式错误
1. **检查模板**: 确认`output.xlsx`文件存在
2. **检查字段映射**: 确认字段名称匹配
3. **检查数据**: 确认提取的数据格式正确

## 🎯 总结

通过以下修改解决了Railway部署问题：
1. ✅ **删除build目录**: 避免旧文件冲突
2. ✅ **修改服务器配置**: 优先使用新前端
3. ✅ **确保文件结构**: 正确的目录布局
4. ✅ **测试验证**: 本地和生产环境测试

现在Railway部署应该正确使用新的前端页面，显示简化的3字段输出，并按照模板格式导出Excel文件。 