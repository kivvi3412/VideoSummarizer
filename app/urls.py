from django.urls import path
from . import views

urlpatterns = [
    path('tasks/', views.get_tasks, name='get_tasks'),
    path('tasks/create-url/', views.create_url_task, name='create_url_task'),
    path('tasks/create-file/', views.create_file_task, name='create_file_task'),
    path('tasks/<int:task_id>/', views.get_task_detail, name='get_task_detail'),
    path('tasks/<int:task_id>/delete/', views.delete_task, name='delete_task'),
    path('settings/', views.get_settings, name='get_settings'),
    path('settings/update/', views.update_settings, name='update_settings'),
    path('model/manage/', views.manage_whisper_model, name='manage_whisper_model'),
    path('model/status/', views.get_model_status, name='get_model_status'),
    path('queue/status/', views.get_queue_status, name='get_queue_status'),
]