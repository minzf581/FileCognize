// 测试应用启动脚本
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 启动FileCognize测试...\n');

// 检查必要文件
const requiredFiles = [
  'server/server.js',
  'client/package.json',
  'package.json'
];

requiredFiles.forEach(file => {
  try {
    require.resolve(path.join(__dirname, file));
    console.log(`✅ ${file} - 存在`);
  } catch (err) {
    console.log(`❌ ${file} - 缺失`);
    process.exit(1);
  }
});

console.log('\n📦 检查依赖...');

// 检查后端依赖
try {
  require('express');
  require('cors');
  require('multer');
  console.log('✅ 后端依赖已安装');
} catch (err) {
  console.log('❌ 后端依赖缺失，请运行: npm install');
  process.exit(1);
}

console.log('\n🎯 项目结构验证完成！');
console.log('\n📋 使用说明:');
console.log('1. 开发模式: npm run dev');
console.log('2. 只启动后端: npm run server');
console.log('3. 只启动前端: npm run client');
console.log('4. 生产构建: npm run build');
console.log('5. 生产启动: npm start');

console.log('\n🌐 访问地址:');
console.log('- 前端开发服务器: http://localhost:3000');
console.log('- 后端API服务器: http://localhost:5000');
console.log('- API健康检查: http://localhost:5000/api/health');

console.log('\n🔗 GitHub仓库:');
console.log('https://github.com/minzf581/FileCognize');

console.log('\n🚀 现在可以运行 npm run dev 启动开发服务器！'); 