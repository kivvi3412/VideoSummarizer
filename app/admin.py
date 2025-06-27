from django.contrib import admin
from .models import UserSettings, VideoTask


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ['id', 'openai_model', 'whisper_model', 'whisper_device', 'auto_load_model', 'updated_at']
    fieldsets = (
        ('OpenAI 配置', {
            'fields': ('openai_api_key', 'openai_base_url', 'openai_model')
        }),
        ('Whisper 配置', {
            'fields': ('whisper_model', 'whisper_device', 'auto_load_model')
        }),
        ('提示词配置', {
            'fields': ('summary_prompt', 'url_summary_prompt')
        }),
    )


@admin.register(VideoTask)
class VideoTaskAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'task_type', 'status', 'progress', 'created_at']
    list_filter = ['status', 'task_type', 'created_at']
    search_fields = ['title', 'url']
    readonly_fields = ['created_at', 'updated_at', 'completed_at']
    fieldsets = (
        ('基本信息', {
            'fields': ('title', 'task_type', 'url', 'file_path')
        }),
        ('处理状态', {
            'fields': ('status', 'progress', 'error_message')
        }),
        ('结果', {
            'fields': ('original_text', 'summary')
        }),
        ('时间信息', {
            'fields': ('created_at', 'updated_at', 'completed_at')
        }),
    )