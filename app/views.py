import os
import threading
from django.core.files.storage import default_storage
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from app.models import VideoTask, UserSettings
from app.services import AudioSummarizer


@api_view(['GET'])
def get_tasks(request):
    tasks = VideoTask.objects.all()
    data = []
    for task in tasks:
        data.append({
            'id': task.id,
            'title': task.title,
            'url': task.url,
            'task_type': task.task_type,
            'status': task.status,
            'progress': task.progress,
            'original_text': task.original_text,
            'summary': task.summary,
            'error_message': task.error_message,
            'created_at': task.created_at,
            'completed_at': task.completed_at,
        })
    return Response(data)


@api_view(['POST'])
def create_url_task(request):
    url = request.data.get('url')
    if not url:
        return Response({'error': '无效的URL'}, status=status.HTTP_400_BAD_REQUEST)
    
    task = VideoTask.objects.create(
        title=url,
        url=url,
        task_type='url'
    )
    
    # Add task to queue instead of creating new thread
    audio_summarizer = AudioSummarizer()
    audio_summarizer.add_task_to_queue(task.id, 'url')
    
    # Get queue status for response
    queue_status = audio_summarizer.get_queue_status()
    
    return Response({
        'id': task.id,
        'title': task.title,
        'status': task.status,
        'progress': task.progress,
        'queue_position': queue_status['queue_size'],
        'is_processing': queue_status['is_processing']
    })


@api_view(['POST'])
def create_file_task(request):
    uploaded_file = request.FILES.get('file')
    if not uploaded_file:
        return Response({'error': '未上传文件'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Save file
    file_path = default_storage.save(f'uploads/{uploaded_file.name}', uploaded_file)
    full_path = os.path.join(default_storage.location, file_path)
    
    task = VideoTask.objects.create(
        title=uploaded_file.name,
        file_path=full_path,
        task_type='file'
    )
    
    # Add task to queue instead of creating new thread
    audio_summarizer = AudioSummarizer()
    audio_summarizer.add_task_to_queue(task.id, 'file')
    
    # Get queue status for response
    queue_status = audio_summarizer.get_queue_status()
    
    return Response({
        'id': task.id,
        'title': task.title,
        'status': task.status,
        'progress': task.progress,
        'queue_position': queue_status['queue_size'],
        'is_processing': queue_status['is_processing']
    })


@api_view(['GET'])
def get_task_detail(request, task_id):
    try:
        task = VideoTask.objects.get(id=task_id)
        return Response({
            'id': task.id,
            'title': task.title,
            'url': task.url,
            'task_type': task.task_type,
            'status': task.status,
            'progress': task.progress,
            'original_text': task.original_text,
            'summary': task.summary,
            'error_message': task.error_message,
            'created_at': task.created_at,
            'completed_at': task.completed_at,
        })
    except VideoTask.DoesNotExist:
        return Response({'error': '任务不存在'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
def get_settings(request):
    settings = UserSettings.get_settings()
    return Response({
        'openai_api_key': settings.openai_api_key,
        'openai_base_url': settings.openai_base_url,
        'openai_model': settings.openai_model,
        'whisper_model': settings.whisper_model,
        'whisper_device': settings.whisper_device,
        'auto_load_model': settings.auto_load_model,
        'summary_prompt': settings.summary_prompt,
        'url_summary_prompt': settings.url_summary_prompt,
    })


@api_view(['POST'])
def update_settings(request):
    settings = UserSettings.get_settings()
    
    if 'openai_api_key' in request.data:
        settings.openai_api_key = request.data['openai_api_key']
    if 'openai_base_url' in request.data:
        settings.openai_base_url = request.data['openai_base_url']
    if 'openai_model' in request.data:
        settings.openai_model = request.data['openai_model']
    if 'whisper_model' in request.data:
        settings.whisper_model = request.data['whisper_model']
    if 'whisper_device' in request.data:
        settings.whisper_device = request.data['whisper_device']
    if 'auto_load_model' in request.data:
        settings.auto_load_model = request.data['auto_load_model']
    if 'summary_prompt' in request.data:
        settings.summary_prompt = request.data['summary_prompt']
    if 'url_summary_prompt' in request.data:
        settings.url_summary_prompt = request.data['url_summary_prompt']
    
    settings.save()
    
    return Response({'message': '设置已保存'})


@api_view(['DELETE'])
def delete_task(request, task_id):
    try:
        task = VideoTask.objects.get(id=task_id)
        task.delete()
        return Response({'message': '任务已删除'})
    except VideoTask.DoesNotExist:
        return Response({'error': '任务不存在'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
def manage_whisper_model(request):
    """Load or unload Whisper model"""
    action = request.data.get('action')  # 'load' or 'unload'
    
    # Get the singleton instance
    audio_summarizer = AudioSummarizer()
    
    if action == 'unload':
        audio_summarizer.unload_whisper_model()
        return Response({
            'message': '模型已卸载，显存已释放',
            'status': '未加载模型'
        })
    
    elif action == 'load':
        # Get model settings from user settings
        user_settings = UserSettings.get_settings()
        model_name = user_settings.whisper_model
        device = user_settings.whisper_device
        
        try:
            # Force reload even if model is already loaded
            print(f"强制重新加载模型: {model_name} on {device}")
            result = audio_summarizer.load_whisper_model(model_name, device)
            return Response({
                'message': f'模型加载成功: {result}',
                'status': result
            })
        except Exception as e:
            return Response({
                'error': f'模型加载失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    else:
        return Response({'error': '无效的操作'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def get_model_status(request):
    """Get current Whisper model status"""
    audio_summarizer = AudioSummarizer()
    user_settings = UserSettings.get_settings()
    
    return Response({
        'status': audio_summarizer.get_model_status(),
        'cuda_available': audio_summarizer._check_cuda_availability(),
        'loaded': audio_summarizer.whisper_model is not None,
        'device': audio_summarizer.device,
        'auto_load_enabled': user_settings.auto_load_model,
        'queue_size': audio_summarizer.get_queue_status()['queue_size'],
        'is_processing': audio_summarizer.get_queue_status()['is_processing']
    })


@api_view(['GET'])
def get_queue_status(request):
    """Get current processing queue status"""
    audio_summarizer = AudioSummarizer()
    queue_status = audio_summarizer.get_queue_status()
    return Response({
        'queue_size': queue_status['queue_size'],
        'is_processing': queue_status['is_processing'],
        'current_task': queue_status['current_task']
    })
