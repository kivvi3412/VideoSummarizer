#!/bin/bash

# Django Video Summarizer 启动脚本 - 使用 uv 管理

echo "启动 Django 视频总结器..."

echo "更新 yt-dlp..."
uv tool upgrade yt-dlp || uv tool install yt-dlp

echo "同步依赖..."
uv sync

echo "运行数据库迁移..."
uv run python manage.py makemigrations app
uv run python manage.py migrate

echo "启动 Django 开发服务器..."
echo "访问 http://localhost:18000 使用应用"
echo "按 Ctrl+C 停止服务器"
uv run python manage.py runserver 0.0.0.0:18000