# Railway 部署问题修复

## 🚨 问题分析

Railway部署失败的原因：

1. **OCR服务信号处理器冲突**：在生产环境中，SIGTERM信号处理器导致容器意外退出
2. **npm版本兼容性**：需要更新Node.js和npm版本要求
3. **缺少部署配置**：需要明确的启动命令和健康检查

## 🔧 修复措施

### 1. 修复OCR服务信号处理器
```javascript
// 仅在非生产环境中注册信号处理器
if (process.env.NODE_ENV !== 'production') {
  process.on('SIGINT', async () => {
    console.log('正在关闭OCR服务...');
    await ocrService.terminate();
    process.exit(0);
  });
}
```

### 2. 更新package.json引擎要求
```json
"engines": {
  "node": ">=18.0.0",
  "npm": ">=9.0.0"
}
```

### 3. 添加Railway配置文件
创建 `railway.toml`:
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/debug/paths"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[env]
NODE_ENV = "production"
PORT = "$PORT"
```

### 4. 添加Procfile
```
web: npm start
```

## 🧪 本地测试

在推送到Railway之前，先本地测试生产模式：

```bash
# 设置生产环境变量
NODE_ENV=production PORT=3001 node server/server.js

# 检查健康状态
curl http://localhost:3001/api/debug/paths
```

## 📋 部署检查清单

- ✅ 修复OCR服务信号处理器
- ✅ 更新Node.js/npm版本要求
- ✅ 添加Railway配置文件
- ✅ 添加Procfile
- ✅ 本地生产模式测试
- ⏳ 推送到GitHub触发Railway重新部署

## 🚀 重新部署步骤

1. 提交所有修复到Git
2. 推送到GitHub
3. Railway自动检测更改并重新部署
4. 检查部署日志确认成功

## 📊 预期结果

修复后，Railway部署应该：
- 正常启动服务器
- 响应健康检查
- 不会因为信号处理器而意外退出
- 支持所有新功能（PDF、相机、打印） 