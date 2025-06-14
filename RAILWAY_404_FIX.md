# Railway 404错误修复指南

## 问题描述
Railway部署后访问根路径返回404错误：
```
GET https://filecognize-ipchcck.up.railway.app/ 404 (Not Found)
```

## 根本原因
Railway部署环境中，`public`目录的路径与本地开发环境不同，导致服务器无法找到前端文件。

## 解决方案

### 1. 增强路径检测
修改了`server/server.js`中的路径检测逻辑，支持多种可能的路径：

```javascript
const publicPaths = [
  path.join(__dirname, '../public'),     // 相对于server目录
  path.join(process.cwd(), 'public'),    // 相对于项目根目录
  path.join(__dirname, '../../public'),  // 如果server在子目录中
  '/app/public'                          // Railway的绝对路径
];
```

### 2. 添加调试端点
新增`/api/debug/paths`端点用于诊断路径问题：

```bash
curl https://filecognize-ipchcck.up.railway.app/api/debug/paths
```

### 3. 静态文件服务配置
确保在找到正确路径后，正确配置静态文件服务：

```javascript
if (publicPath && publicIndexPath) {
  // 提供静态文件服务
  app.use(express.static(publicPath));
  
  // 为所有非API路由返回新的前端页面
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: '接口不存在' });
    }
    res.sendFile(publicIndexPath);
  });
}
```

## 验证步骤

### 1. 检查部署日志
Railway部署后，查看日志应该显示：
```
✅ 使用新的前端页面: /app/public
```

### 2. 测试调试端点
访问调试端点检查路径状态：
```bash
curl https://filecognize-ipchcck.up.railway.app/api/debug/paths
```

### 3. 测试前端页面
访问根路径应该返回HTML页面：
```bash
curl https://filecognize-ipchcck.up.railway.app/
```

## 预期结果

部署成功后：
- ✅ 根路径返回FileCognize前端页面
- ✅ 显示现代化的渐变UI界面
- ✅ 文件上传功能正常
- ✅ OCR处理返回简化的3字段结果
- ✅ Excel导出功能正常

## 故障排除

如果仍然出现404错误：

1. **检查Railway日志**：
   - 查看是否显示"✅ 使用新的前端页面"
   - 如果显示"❌ 未找到public目录"，说明路径仍有问题

2. **使用调试端点**：
   ```bash
   curl https://filecognize-ipchcck.up.railway.app/api/debug/paths
   ```
   检查哪些路径存在，哪些不存在

3. **检查文件结构**：
   确保`public/index.html`文件已正确提交到Git仓库

4. **重新部署**：
   如果文件结构正确但仍有问题，尝试在Railway控制台手动触发重新部署

## 技术细节

### 路径解析优先级
1. `path.join(__dirname, '../public')` - 标准相对路径
2. `path.join(process.cwd(), 'public')` - 基于工作目录
3. `path.join(__dirname, '../../public')` - 深层嵌套情况
4. `/app/public` - Railway绝对路径

### 静态文件服务
- 使用`express.static()`提供静态文件服务
- 所有非API路由都返回`index.html`（SPA路由支持）
- API路由保持独立处理

### 错误处理
- 如果找不到`public`目录，会尝试回退到`build`目录
- 如果都找不到，返回明确的错误信息
- 提供详细的调试信息帮助排查问题

## 更新历史
- 2025-06-14: 初始版本，修复Railway 404错误
- 增加多路径检测和调试端点
- 优化静态文件服务配置 