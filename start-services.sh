#!/bin/bash

# FileCognize 服务启动脚本
# 作用：清理旧进程并启动新的服务

echo "🚀 FileCognize 服务启动脚本"
echo "================================"

# 定义要检查的端口
PORTS=(3000 3001 5000 8000)

# 函数：杀掉占用指定端口的进程
kill_port_process() {
    local port=$1
    echo "🔍 检查端口 $port..."
    
    # 多次尝试清理端口
    for i in {1..3}; do
        # 查找占用端口的进程
        local pid=$(lsof -ti:$port)
        
        if [ ! -z "$pid" ]; then
            echo "⚠️  发现端口 $port 被进程 $pid 占用，正在终止... (尝试 $i/3)"
            kill -9 $pid 2>/dev/null
            sleep 2
            
            # 再次检查是否成功终止
            local check_pid=$(lsof -ti:$port)
            if [ -z "$check_pid" ]; then
                echo "✅ 端口 $port 已释放"
                return 0
            fi
        else
            echo "✅ 端口 $port 空闲"
            return 0
        fi
    done
    
    # 如果3次尝试后仍然占用，报告错误
    local final_pid=$(lsof -ti:$port)
    if [ ! -z "$final_pid" ]; then
        echo "❌ 端口 $port 仍被进程 $final_pid 占用，请手动检查"
        return 1
    fi
}

# 函数：杀掉所有node进程（更彻底的清理）
kill_node_processes() {
    echo "🔍 检查所有Node.js进程..."
    
    # 查找所有相关的node进程
    local node_pids=$(ps aux | grep -E "(node.*server|FileCognize)" | grep -v grep | grep -v $$ | awk '{print $2}')
    
    if [ ! -z "$node_pids" ]; then
        echo "⚠️  发现Node.js服务进程，正在终止..."
        echo "$node_pids" | xargs kill -9 2>/dev/null
        sleep 3
        echo "✅ Node.js进程已清理"
    else
        echo "✅ 没有发现运行中的Node.js服务进程"
    fi
}

# 开始清理进程
echo ""
echo "🧹 开始清理旧进程..."
echo "--------------------------------"

# 方法1：按端口杀进程（推荐）
for port in "${PORTS[@]}"; do
    kill_port_process $port
done

echo ""
echo "🔄 等待进程完全终止..."
sleep 5

# 方法2：杀掉所有相关node进程（启用更彻底的清理）
kill_node_processes

echo ""
echo "🔄 再次等待进程完全终止..."
sleep 3

echo ""
echo "🚀 启动FileCognize服务..."
echo "--------------------------------"

# 检查是否存在server.js文件
if [ ! -f "server/server.js" ]; then
    echo "❌ 错误：未找到 server/server.js 文件"
    echo "请确保在FileCognize项目根目录下运行此脚本"
    exit 1
fi

# 检查是否安装了依赖
if [ ! -d "node_modules" ]; then
    echo "📦 未找到node_modules，正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
fi

# 设置环境变量
export NODE_ENV=production
export PORT=3001

echo "🌟 启动参数："
echo "   - 环境: $NODE_ENV"
echo "   - 端口: $PORT"
echo "   - 工作目录: $(pwd)"

echo ""
echo "🎯 正在启动服务..."

# 启动服务（后台运行）
nohup node server/server.js > filecognize.log 2>&1 &
SERVER_PID=$!

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务是否成功启动
if kill -0 $SERVER_PID 2>/dev/null; then
    echo ""
    echo "🎉 FileCognize 服务启动成功！"
    echo "================================"
    echo "📋 服务信息："
    echo "   - 进程ID: $SERVER_PID"
    echo "   - 访问地址: http://localhost:$PORT"
    echo "   - 日志文件: $(pwd)/filecognize.log"
    echo ""
    echo "📝 常用命令："
    echo "   - 查看日志: tail -f filecognize.log"
    echo "   - 停止服务: kill $SERVER_PID"
    echo "   - 查看进程: ps aux | grep $SERVER_PID"
    echo ""
    echo "🌐 请在浏览器中访问: http://localhost:$PORT"
    
    # 保存PID到文件，方便后续管理
    echo $SERVER_PID > filecognize.pid
    echo "💾 进程ID已保存到 filecognize.pid"
    
else
    echo ""
    echo "❌ 服务启动失败！"
    echo "请检查日志文件: $(pwd)/filecognize.log"
    exit 1
fi

echo ""
echo "✨ 启动完成！" 