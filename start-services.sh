#!/bin/bash

# FileCognize 服务启动脚本
# 作用：清理旧进程并启动新的服务

echo "🚀 启动FileCognize服务..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查并终止占用端口的进程
check_and_kill_port() {
    local port=$1
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo -e "${BLUE}检查端口 $port (尝试 $attempt/$max_attempts)...${NC}"
        
        # 查找占用端口的进程
        local pids=$(lsof -ti :$port 2>/dev/null)
        
        if [ -z "$pids" ]; then
            echo -e "${GREEN}✅ 端口 $port 可用${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}⚠️ 端口 $port 被占用，进程ID: $pids${NC}"
        echo -e "${YELLOW}正在终止进程...${NC}"
        
        # 终止进程
        echo "$pids" | xargs kill -9 2>/dev/null
        
        # 等待进程终止
        sleep 2
        
        # 再次检查
        local remaining_pids=$(lsof -ti :$port 2>/dev/null)
        if [ -z "$remaining_pids" ]; then
            echo -e "${GREEN}✅ 端口 $port 已释放${NC}"
            return 0
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ 无法释放端口 $port${NC}"
    return 1
}

# 清理所有相关进程
cleanup_processes() {
    echo -e "${BLUE}🧹 清理旧进程...${NC}"
    
    # 终止所有Node.js进程（谨慎使用）
    pkill -f "node server/server.js" 2>/dev/null || true
    pkill -f "PORT=3001" 2>/dev/null || true
    
    sleep 2
    
    # 检查并清理特定端口
    check_and_kill_port 3000
    check_and_kill_port 3001
    check_and_kill_port 5000
    check_and_kill_port 8000
}

# 启动服务
start_service() {
    echo -e "${BLUE}🚀 启动FileCognize服务器...${NC}"
    
    # 设置环境变量
    export PORT=3001
    export NODE_ENV=production
    
    # 启动服务器
    echo -e "${YELLOW}正在启动服务器在端口 $PORT...${NC}"
    
    # 后台启动服务器
    nohup node server/server.js > server.log 2>&1 &
    local server_pid=$!
    
    echo -e "${BLUE}服务器进程ID: $server_pid${NC}"
    echo "$server_pid" > server.pid
    
    # 等待服务器启动
    echo -e "${YELLOW}等待服务器启动...${NC}"
    sleep 5
    
    # 检查服务器是否正常运行
    if curl -s http://localhost:$PORT/ > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 服务器启动成功！${NC}"
        echo -e "${GREEN}🌐 访问地址: http://localhost:$PORT${NC}"
        echo -e "${BLUE}📋 服务器日志: tail -f server.log${NC}"
        echo -e "${BLUE}🛑 停止服务: kill $server_pid 或 pkill -f 'node server/server.js'${NC}"
        
        # 保存服务信息
        cat > service_info.txt << EOF
FileCognize服务信息
==================
启动时间: $(date)
进程ID: $server_pid
端口: $PORT
访问地址: http://localhost:$PORT
日志文件: server.log

停止服务命令:
kill $server_pid
或
pkill -f 'node server/server.js'
EOF
        
        return 0
    else
        echo -e "${RED}❌ 服务器启动失败${NC}"
        echo -e "${YELLOW}查看日志: tail -f server.log${NC}"
        return 1
    fi
}

# 主执行流程
main() {
    echo -e "${BLUE}=== FileCognize 服务启动脚本 ===${NC}"
    echo -e "${BLUE}时间: $(date)${NC}"
    echo ""
    
    # 清理旧进程
    cleanup_processes
    
    echo ""
    
    # 启动新服务
    if start_service; then
        echo ""
        echo -e "${GREEN}🎉 FileCognize服务启动完成！${NC}"
        echo -e "${GREEN}现在可以在浏览器中访问: http://localhost:3001${NC}"
    else
        echo ""
        echo -e "${RED}❌ 服务启动失败，请检查错误信息${NC}"
        exit 1
    fi
}

# 执行主函数
main 