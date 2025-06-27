from django.db import models
from django.utils import timezone


class UserSettings(models.Model):
    DEVICE_CHOICES = [
        ('auto', '自动选择'),
        ('cuda', 'GPU (CUDA)'),
        ('cpu', 'CPU'),
    ]

    # Since it's single user, we'll use a singleton pattern
    openai_api_key = models.CharField(max_length=255, blank=True)
    openai_base_url = models.URLField(blank=True)
    openai_model = models.CharField(max_length=100, default='gpt-3.5-turbo')
    whisper_model = models.CharField(max_length=50, default='base')
    whisper_device = models.CharField(max_length=10, choices=DEVICE_CHOICES, default='auto')
    auto_load_model = models.BooleanField(
        default=False,
        help_text='启用后，有任务时自动加载模型，任务完成后自动卸载模型以节省显存'
    )
    summary_prompt = models.TextField(
        default='总结录音，简体中文回答'
    )
    url_summary_prompt = models.TextField(
        default='''- 本次录音的标题是{title}, 简要回答标题的问题，并且总结录音，简体中文回答 - 标准MarkDown格式输出，使用有序无序列表，有层次的回答，使用横线分隔不同层次的内容 - 使用 > 回答标题问题，并且一句话总结，然后总结录音内容'''
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "用户设置"
        verbose_name_plural = "用户设置"

    @classmethod
    def get_settings(cls):
        settings, created = cls.objects.get_or_create(pk=1)
        return settings


class VideoTask(models.Model):
    STATUS_CHOICES = [
        ('pending', '排队中'),
        ('downloading', '下载中'),
        ('transcribing', '转录中'),
        ('summarizing', '总结中'),
        ('completed', '已完成'),
        ('failed', '失败'),
    ]

    TYPE_CHOICES = [
        ('url', 'URL视频'),
        ('file', '上传文件'),
    ]

    title = models.CharField(max_length=500)
    url = models.URLField(blank=True, null=True)
    file_path = models.CharField(max_length=500, blank=True, null=True)
    task_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    progress = models.IntegerField(default=0)  # 0-100

    # Results
    original_text = models.TextField(blank=True)
    summary = models.TextField(blank=True)
    error_message = models.TextField(blank=True)

    # Metadata
    video_id = models.CharField(max_length=100, blank=True)
    duration = models.IntegerField(null=True, blank=True)  # in seconds

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "视频任务"
        verbose_name_plural = "视频任务"

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"

    def mark_completed(self):
        self.status = 'completed'
        self.progress = 100
        self.completed_at = timezone.now()
        self.save()

    def mark_failed(self, error_msg):
        self.status = 'failed'
        self.error_message = error_msg
        self.save()
