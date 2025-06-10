# FileCognize 部署指南

## 🚀 Railway 部署

### 步骤1: 准备Railway账户
1. 访问 [Railway.app](https://railway.app)
2. 使用GitHub账户登录
3. 连接GitHub仓库权限

### 步骤2: 创建新项目
1. 点击 "New Project"
2. 选择 "Deploy from GitHub repo"
3. 选择 `minzf581/FileCognize` 仓库

### 步骤3: 配置环境变量
在Railway项目设置中添加以下环境变量：

```env
NODE_ENV=production
PORT=5000
CI=false
GENERATE_SOURCEMAP=false
```

### 步骤4: 部署设置
Railway支持多种构建方式：

#### 方式1: NIXPACKS构建（推荐）
- 自动检测到 `railway.json` 配置
- 运行 `npm run railway-build`
- 启动命令: `npm start`

#### 方式2: Docker构建（备选）
- 如果NIXPACKS失败，可以尝试使用Dockerfile
- 在Railway设置中选择 "Use Dockerfile"

### 步骤5: 验证部署
1. 等待部署完成（通常3-5分钟）
2. 访问分配的域名
3. 检查健康检查端点: `https://your-app.railway.app/api/health`

## 🔧 本地开发

### 开发环境启动
```bash
# 安装依赖
npm install
npm run install-client

# 启动开发服务器（前后端同时）
npm run dev

# 或分别启动
npm run server  # 后端 localhost:5000
npm run client  # 前端 localhost:3000
```

### 生产环境测试
```bash
# 构建前端
npm run railway-build

# 启动生产服务器
npm start
```

## 📦 项目结构

```
FileCognize/
├── server/
│   ├── server.js           # Express后端服务器
│   └── uploads/            # 临时文件目录（自动创建）
├── client/                 # React前端应用
│   ├── src/
│   │   ├── components/     # React组件
│   │   ├── types/          # TypeScript类型定义
│   │   └── ...
│   ├── public/
│   └── build/              # 构建输出（生产环境）
├── package.json            # 后端依赖和脚本
├── railway.json           # Railway部署配置
├── Dockerfile             # Docker构建配置（备选）
├── .dockerignore          # Docker忽略文件
├── .nvmrc                 # Node.js版本
├── README.md              # 项目说明文档
└── .gitignore             # Git忽略文件
```

## 🌐 功能特点

- ✅ 图片拖拽上传
- ✅ 相机拍摄支持
- ✅ OCR文字识别（中英文）
- ✅ 数据结构化解析
- ✅ Excel文件生成
- ✅ JSON数据导出
- ✅ 响应式设计（PC/移动端）
- ✅ 实时预览和进度显示
- ✅ 数据手动编辑校正
- ✅ 安全文件处理

## 🔍 故障排除

### Railway部署失败解决方案

#### 问题1: "npm run railway-build" exit code 249
**解决方案**:
1. **清除Railway缓存**
   - 在Railway项目设置中点击 "Clear Cache"
   - 或者删除项目重新创建

2. **检查环境变量**
   ```env
   NODE_ENV=production
   PORT=5000
   CI=false
   GENERATE_SOURCEMAP=false
   ```

3. **切换构建方式**
   - 在Railway设置中尝试 "Use Dockerfile"
   - 或修改 `railway.json` 中的 builder 设置

#### 问题2: 内存不足错误
**解决方案**:
1. **升级Railway计划**：免费版内存限制较小
2. **优化构建**：已设置 `GENERATE_SOURCEMAP=false`
3. **清理依赖**：删除不必要的开发依赖

#### 问题3: Tailwind CSS构建错误
**解决方案**:
- ✅ 已修复：使用Tailwind CSS 3.4.0版本
- ✅ 已修复：添加了PostCSS配置文件

### 常见问题

1. **OCR识别速度慢**
   - 这是正常现象，Tesseract.js需要下载语言包
   - 首次使用会较慢，后续会有缓存

2. **文件上传失败**
   - 检查文件大小（最大10MB）
   - 确保文件格式支持（JPG, PNG等）

3. **Excel下载不工作**
   - 确保浏览器允许下载
   - 检查浏览器兼容性

4. **移动端相机不工作**
   - 需要HTTPS环境
   - 确保允许相机权限

### 部署问题

1. **Railway部署超时**
   - ✅ 已优化：增加了健康检查超时时间
   - ✅ 已优化：优化了构建过程和内存使用

2. **静态文件访问404**
   - 确保 `npm run railway-build` 成功执行
   - 检查build目录是否存在

3. **部署后服务不响应**
   - 检查Railway日志中的错误信息
   - 确保PORT环境变量正确设置

## 📈 性能优化建议

1. **构建优化**
   - ✅ 使用增量构建
   - ✅ 内存限制优化
   - ✅ 依赖缓存优化
   - ✅ 禁用源码映射减少构建时间

2. **图片预处理**
   - 建议上传清晰、对比度高的图片
   - 避免过大的图片文件

3. **OCR优化**
   - 图片中文字应清晰可见
   - 避免复杂背景和手写字体

4. **服务器资源**
   - Railway免费版有内存限制
   - 考虑升级计划以获得更好性能

## 🛡️ 安全考虑

- 文件大小限制（10MB）
- 临时文件自动清理（30分钟）
- 请求频率限制
- CORS配置
- 安全头设置（Helmet）

## 🔄 重新部署步骤

如果部署失败，按以下步骤重新部署：

### 方法1: 清除缓存重新部署
1. **在Railway控制台**
   - 进入项目设置
   - 点击 "Clear Cache"
   - 点击 "Redeploy"

### 方法2: 删除项目重新创建
1. **删除当前Railway项目**
2. **重新从GitHub创建新项目**
3. **重新配置环境变量**

### 方法3: 本地验证
```bash
# 本地测试构建
npm run railway-build

# 如果成功，推送最新代码
git add .
git commit -m "修复部署问题"
git push origin main
```

## 🚀 多种部署选项

### 选项1: Railway (推荐)
- 简单易用，GitHub集成
- 免费额度足够小型项目

### 选项2: Vercel (前端) + Railway (后端)
- 分离部署，性能更好
- 适合高流量应用

### 选项3: Docker部署
- 使用提供的Dockerfile
- 可部署到任何支持Docker的平台

---

**Happy Deploying! 🚀** 