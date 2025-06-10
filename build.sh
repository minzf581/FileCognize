#!/bin/bash
set -e

echo "🚀 开始构建FileCognize..."

# 设置环境变量
export NODE_ENV=production
export CI=false
export GENERATE_SOURCEMAP=false
export NODE_OPTIONS="--max_old_space_size=1024"

echo "📦 安装后端依赖..."
npm ci --omit=dev --cache /tmp/empty-cache

echo "📦 安装前端依赖..."
cd client
npm ci --cache /tmp/empty-cache

echo "🔨 构建前端应用..."
npm run build

echo "✅ 构建完成！" 