#!/bin/bash

# Django Video Summarizer 简化启动脚本

echo "启动 Django 视频总结器..."

# 检查是否安装了依赖
if [ ! -d ".venv" ]; then
    echo "创建虚拟环境..."
    python -m venv .venv
fi

source .venv/bin/activate

echo "安装依赖..."
pip install -r requirements.txt

echo "运行数据库迁移..."
python manage.py makemigrations core
python manage.py migrate

echo "启动 Django 开发服务器..."
echo "访问 http://localhost:18000 使用应用"
echo "按 Ctrl+C 停止服务器"
python manage.py runserver 0.0.0.0:18000