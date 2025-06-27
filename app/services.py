import os
import re
import gc
import threading
import queue
from pathlib import Path
import yt_dlp
from openai import OpenAI
from django.conf import settings
# Simplified imports
from app.models import UserSettings, VideoTask

# Lazy imports to avoid CUDA initialization on startup
torch = None
whisper = None

def _import_torch():
    global torch
    if torch is None:
        import torch as _torch
        torch = _torch
    return torch

def _import_whisper():
    global whisper
    if whisper is None:
        import whisper as _whisper
        whisper = _whisper
    return whisper


class AudioSummarizer:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(AudioSummarizer, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.model_name = None
        self.whisper_model = None
        self.client = None
        self.device = None
        self.is_cuda_available = None  # Will be checked lazily
        self.whisper_processor_lock = threading.Lock()
        
        # Task queue management
        self.task_queue = queue.Queue()
        self.current_task = None
        self.worker_thread = None
        self.is_processing = False
        self.queue_lock = threading.Lock()
        
        # Auto-load model management
        self.auto_unload_timer = None
        self.auto_unload_delay = 10  # 10 seconds after last task completion
        
        self._init_openai_client()
        self._start_worker_thread()
        self._initialized = True
    
    def _start_worker_thread(self):
        """Start the worker thread that processes tasks sequentially"""
        if self.worker_thread is None or not self.worker_thread.is_alive():
            self.worker_thread = threading.Thread(target=self._process_task_queue, daemon=True)
            self.worker_thread.start()
    
    def _process_task_queue(self):
        """Process tasks from the queue one by one"""
        while True:
            try:
                # Get next task from queue (blocks if empty)
                task_data = self.task_queue.get(timeout=1)
                
                with self.queue_lock:
                    self.is_processing = True
                    self.current_task = task_data
                
                # Cancel any pending auto-unload since we're about to process
                self._cancel_auto_unload()
                
                # Auto-load model if needed
                if self._should_auto_load_model():
                    self._auto_load_model_if_needed()
                
                # Process the task
                if task_data['type'] == 'url':
                    self._process_video_task_internal(task_data['task_id'])
                elif task_data['type'] == 'file':
                    self._process_file_task_internal(task_data['task_id'])
                
                # Mark task as done
                self.task_queue.task_done()
                
                with self.queue_lock:
                    self.is_processing = False
                    self.current_task = None
                
                # Schedule auto-unload if no more tasks and auto-load is enabled
                if self._should_auto_load_model() and self.task_queue.qsize() == 0:
                    self._schedule_auto_unload()
                    
            except queue.Empty:
                # No tasks in queue, continue waiting
                continue
            except Exception as e:
                print(f"Error processing task: {e}")
                # Mark task as done even on error to prevent queue blocking
                try:
                    self.task_queue.task_done()
                except:
                    pass
                
                with self.queue_lock:
                    self.is_processing = False
                    self.current_task = None
    
    def add_task_to_queue(self, task_id, task_type):
        """Add a task to the processing queue"""
        task_data = {
            'task_id': task_id,
            'type': task_type,
            'added_at': threading.current_thread().ident
        }
        
        # Update task status to queued if not already processing
        try:
            task = VideoTask.objects.get(id=task_id)
            if not self.is_processing or self.task_queue.qsize() > 0:
                task.status = 'pending'
                task.progress = 0
                task.save()
        except:
            pass
        
        self.task_queue.put(task_data)
        
        # Ensure worker thread is running
        self._start_worker_thread()
    
    def get_queue_status(self):
        """Get current queue status"""
        with self.queue_lock:
            return {
                'queue_size': self.task_queue.qsize(),
                'is_processing': self.is_processing,
                'current_task': self.current_task
            }
    
    def _should_auto_load_model(self):
        """Check if auto-load model is enabled"""
        try:
            user_settings = UserSettings.get_settings()
            return user_settings.auto_load_model
        except:
            return False
    
    def _auto_load_model_if_needed(self):
        """Auto-load model if enabled and not already loaded"""
        if not self._should_auto_load_model():
            return False
            
        if self.whisper_model is not None:
            return True  # Already loaded
            
        try:
            user_settings = UserSettings.get_settings()
            print("🔄 自动加载模型中...")
            self.load_whisper_model(
                user_settings.whisper_model, 
                user_settings.whisper_device
            )
            print("✅ 模型自动加载完成")
            return True
        except Exception as e:
            print(f"❌ 模型自动加载失败: {e}")
            return False
    
    def _schedule_auto_unload(self):
        """Schedule auto-unload of model after delay"""
        if not self._should_auto_load_model():
            return
            
        # Cancel previous timer if exists
        if self.auto_unload_timer:
            self.auto_unload_timer.cancel()
            
        # Schedule new timer
        self.auto_unload_timer = threading.Timer(
            self.auto_unload_delay, 
            self._auto_unload_model
        )
        self.auto_unload_timer.daemon = True
        self.auto_unload_timer.start()
        print(f"⏰ 已安排{self.auto_unload_delay}秒后自动卸载模型")
    
    def _auto_unload_model(self):
        """Auto-unload model if no tasks are pending/processing"""
        with self.queue_lock:
            # Check if there are pending tasks or currently processing
            if self.task_queue.qsize() > 0 or self.is_processing:
                print("🔄 有任务进行中，延迟卸载模型")
                self._schedule_auto_unload()  # Reschedule
                return
        
        if self.whisper_model is not None:
            print("🗑️ 自动卸载模型以释放显存...")
            self.unload_whisper_model()
            print("✅ 模型已自动卸载")
    
    def _cancel_auto_unload(self):
        """Cancel scheduled auto-unload"""
        if self.auto_unload_timer:
            self.auto_unload_timer.cancel()
            self.auto_unload_timer = None

    def _check_cuda_availability(self):
        """Check if CUDA is available (lightweight check, no memory allocation)"""
        if self.is_cuda_available is not None:
            return self.is_cuda_available
            
        try:
            torch = _import_torch()
            if not torch.cuda.is_available():
                print("CUDA is not available")
                self.is_cuda_available = False
                return False
            
            # Check if we can actually use CUDA
            device_count = torch.cuda.device_count()
            if device_count == 0:
                print("No CUDA devices found")
                self.is_cuda_available = False
                return False
            
            # Only log availability, don't test with actual tensors yet
            print(f"CUDA is available with {device_count} device(s)")
            try:
                print(f"Current CUDA device: {torch.cuda.get_device_name()}")
            except:
                pass  # Don't fail if we can't get device name
            
            self.is_cuda_available = True
            return True
                
        except Exception as e:
            print(f"Error checking CUDA availability: {e}")
            self.is_cuda_available = False
            return False

    def _test_cuda_functionality(self):
        """Test CUDA functionality with actual tensor creation (only when needed)"""
        if not self._check_cuda_availability():
            return False
        
        try:
            torch = _import_torch()
            print("Testing CUDA functionality...")
            test_tensor = torch.tensor([1.0]).cuda()
            del test_tensor
            torch.cuda.empty_cache()
            print("CUDA functionality test passed")
            return True
        except Exception as e:
            print(f"CUDA functionality test failed: {e}")
            return False

    def _init_openai_client(self):
        user_settings = UserSettings.get_settings()
        if user_settings.openai_api_key:
            self.client = OpenAI(
                api_key=user_settings.openai_api_key,
                base_url=user_settings.openai_base_url or "https://api.openai.com/v1"
            )
        else:
            self.client = None

    def _get_device(self, device_setting='auto'):
        """Get the appropriate device based on user setting"""
        cuda_available = self._check_cuda_availability()
        print(f"Device setting: {device_setting}, CUDA available: {cuda_available}")
        
        if device_setting == 'cpu':
            print("Forcing CPU usage as per user setting")
            return 'cpu'
        elif device_setting == 'cuda':
            if cuda_available:
                print("Using CUDA as per user setting")
                return 'cuda'
            else:
                print("CUDA requested but not available, falling back to CPU")
                return 'cpu'
        else:  # auto
            if cuda_available:
                print("Auto-selecting CUDA (available and working)")
                return 'cuda'
            else:
                print("Auto-selecting CPU (CUDA not available)")
                return 'cpu'

    def load_whisper_model(self, model_name: str, device_setting='auto'):
        """Load Whisper model with proper memory management"""
        if model_name == "NONE" or model_name.lower() == "none":
            self.unload_whisper_model()
            return "NONE"

        # Unload existing model first to prevent memory leaks
        if self.whisper_model is not None:
            print(f"卸载现有模型: {self.model_name}")
            self.unload_whisper_model()

        try:
            self.device = self._get_device(device_setting)
            self.model_name = model_name
            
            # Test CUDA functionality before loading model if using CUDA
            if self.device == 'cuda' and not self._test_cuda_functionality():
                print("CUDA test failed, falling back to CPU")
                self.device = 'cpu'
            
            print(f"Loading Whisper model '{model_name}' on device '{self.device}'")
            
            # Import whisper only when needed
            whisper = _import_whisper()
            torch = _import_torch()
            
            # Load model with explicit device specification
            self.whisper_model = whisper.load_model(model_name, device=self.device)
            
            # Verify the model is on the correct device
            if hasattr(self.whisper_model, 'device'):
                actual_device = str(self.whisper_model.device)
                print(f"Model loaded on device: {actual_device}")
            
            # Force garbage collection after loading
            gc.collect()
            if self.device == 'cuda' and self._check_cuda_availability():
                torch.cuda.empty_cache()
                print("CUDA cache cleared after model loading")
            
            result = f"{model_name} ({self.device.upper()})"
            print(f"Model loading completed: {result}")
            return result
        except Exception as e:
            self.unload_whisper_model()
            raise Exception(f"Failed to load model {model_name}: {str(e)}")

    def unload_whisper_model(self):
        """Properly unload Whisper model and free memory"""
        if self.whisper_model is not None:
            # Move model to CPU before deletion if it was on CUDA
            if hasattr(self.whisper_model, 'to') and self.device == 'cuda':
                try:
                    self.whisper_model.to('cpu')
                except:
                    pass
            
            # Delete model reference
            del self.whisper_model
            
        # Reset state
        self.whisper_model = None
        self.model_name = None
        self.device = None
        
        # Force memory cleanup
        gc.collect()
        
        # Clear CUDA cache if available
        if self._check_cuda_availability():
            torch = _import_torch()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
            
    def get_model_status(self):
        """Get current model status with device info"""
        if self.model_name is None:
            return "未加载模型"
        
        device_info = self.device.upper() if self.device else 'Unknown'
        cuda_info = f" - CUDA可用: {self._check_cuda_availability()}"
        
        return f"{self.model_name} ({device_info}){cuda_info}"

    @staticmethod
    def download_youtube_sub_or_audio(video_url, output_path="media/temp"):
        os.makedirs(output_path, exist_ok=True)
        
        video_info = {
            "id": None,
            "title": None,
            "webpage_url": None,
            "subtitles_path": None,
            "audio_path": None,
            "error_info": None
        }
        
        try:
            with yt_dlp.YoutubeDL({'skip_download': True}) as ydl:
                info = ydl.extract_info(video_url, download=False)
                subtitles = info.get('subtitles', {})
                has_subs = len(subtitles) > 0 and "live_chat" not in subtitles

                video_info["id"] = info.get('id')
                video_info["title"] = info.get('title')
                video_info["webpage_url"] = info.get('webpage_url')

            options = {}
            if has_subs:
                all_subs = {**subtitles}
                first_lang = next(iter(all_subs.keys()), None)
                if first_lang:
                    options.update({
                        'writesubtitles': True,
                        'subtitleslangs': [first_lang],
                        'writeautomaticsub': True,
                        'outtmpl': f'{output_path}/subtitles_{info.get("id")}.%(ext)s',
                        'skip_download': True
                    })
                    with yt_dlp.YoutubeDL(options) as ydl:
                        video_info["subtitles_path"] = f'{output_path}/subtitles_{info.get("id")}.{first_lang}.vtt'
                        ydl.download([video_url])
                    return video_info

            options.update({
                'format': 'bestaudio/best',
                'outtmpl': f'{output_path}/audio_{info.get("id")}.%(ext)s'
            })
            with yt_dlp.YoutubeDL(options) as ydl:
                ydl.download([video_url])

            for root, dirs, files in os.walk(output_path):
                for file in files:
                    if file.startswith(f"audio_{info.get('id')}"):
                        video_info["audio_path"] = os.path.join(root, file)
                        return video_info

            video_info["error_info"] = "音频或字幕下载失败"
            return video_info
        except Exception as e:
            video_info["error_info"] = str(e)
            return video_info

    def extract_info_from_sub_or_audio(self, video_info):
        if self.whisper_model is None:
            return {"status": "error", "text": "Whisper模型尚未加载，请先加载模型"}

        if video_info["audio_path"]:
            try:
                with self.whisper_processor_lock:
                    # Transcribe with optimized settings
                    result = self.whisper_model.transcribe(
                        video_info["audio_path"], 
                        verbose=False,
                        fp16=self.device == 'cuda'  # Use FP16 only on CUDA
                    )
                    
                    # Extract text and clean up result object
                    transcribed_text = result["text"]
                    
                    # Delete segments and other large objects to save memory
                    if "segments" in result:
                        del result["segments"]
                    if "language" in result:
                        del result["language"]
                    del result
                    
                    # Force memory cleanup after transcription
                    gc.collect()
                    if self.device == 'cuda' and self._check_cuda_availability():
                        torch = _import_torch()
                        torch.cuda.empty_cache()
                    
                return {"status": "success", "text": transcribed_text}
            except Exception as e:
                # Clean up on error
                gc.collect()
                if self.device == 'cuda' and self._check_cuda_availability():
                    torch = _import_torch()
                    torch.cuda.empty_cache()
                return {"status": "error", "text": f"whisper error: {e}"}

        elif video_info["subtitles_path"]:
            try:
                with open(video_info["subtitles_path"], "r", encoding="utf-8") as f:
                    sub_info = f.read().split("\n")
                sub_info = [line for line in sub_info if '-->' not in line]
                return {"status": "success", "text": "\n".join(sub_info)}
            except Exception as e:
                return {"status": "error", "text": f"读取字幕文件出错: {e}"}

        elif video_info["error_info"]:
            return {"status": "error", "text": video_info["error_info"]}
        else:
            return {"status": "error", "text": "未知错误"}

    def summary_text_url(self, title, text):
        if not self.llm_model_ready():
            return "error", "OpenAI模型尚未配置或出现错误"

        try:
            user_settings = UserSettings.get_settings()
            response = self.client.chat.completions.create(
                model=user_settings.openai_model,
                messages=[
                    {
                        "role": "system",
                        "content": user_settings.url_summary_prompt.format(title=title)
                    },
                    {
                        "role": "user",
                        "content": text
                    },
                ],
                stream=False
            )
            return "success", response.choices[0].message.content
        except Exception as e:
            return "error", f"OpenAI 接口错误: {e}"

    def summary_text_audio(self, text):
        if not self.llm_model_ready():
            return "error", "OpenAI模型尚未配置或出现错误"

        try:
            user_settings = UserSettings.get_settings()
            response = self.client.chat.completions.create(
                model=user_settings.openai_model,
                messages=[
                    {"role": "system", "content": user_settings.summary_prompt},
                    {"role": "user", "content": text},
                ],
                stream=False
            )
            return "success", response.choices[0].message.content
        except Exception as e:
            return "error", f"OpenAI 接口错误: {e}"

    def llm_model_ready(self):
        user_settings = UserSettings.get_settings()
        return bool(user_settings.openai_api_key and user_settings.openai_model)

    @staticmethod
    def is_valid_url(url):
        valid_domains = ["youtube.com", "youtu.be", "bilibili.com", "b23.tv"]
        regex = re.compile(
            r'^(https?://)?(www\.)?(' + '|'.join(re.escape(domain) for domain in valid_domains) + r')(/.*)?$'
        )
        return bool(regex.match(url))

    @staticmethod
    def cleanup_temp_files(video_info):
        try:
            if video_info.get("audio_path") and os.path.exists(video_info["audio_path"]):
                os.remove(video_info["audio_path"])
            if video_info.get("subtitles_path") and os.path.exists(video_info["subtitles_path"]):
                os.remove(video_info["subtitles_path"])
        except Exception as e:
            print(f"清理临时文件失败: {e}")

    def _process_video_task_internal(self, task_id):
        """Internal method to process video URL tasks"""
        try:
            task = VideoTask.objects.get(id=task_id)
            
            # Load or reload Whisper model if needed (skip if auto-load already handled it)
            user_settings = UserSettings.get_settings()
            
            # Only manually load if auto-load is disabled or model isn't loaded
            if not user_settings.auto_load_model or self.whisper_model is None:
                # Check if we need to load/reload the model
                if (self.whisper_model is None or 
                    self.model_name != user_settings.whisper_model or 
                    self.device != self._get_device(user_settings.whisper_device)):
                    
                    print(f"需要重新加载模型: 当前({self.model_name}, {self.device}) -> 新配置({user_settings.whisper_model}, {self._get_device(user_settings.whisper_device)})")
                    self.load_whisper_model(
                        user_settings.whisper_model, 
                        user_settings.whisper_device
                    )
            self._init_openai_client()
            
            # Update status: downloading
            task.status = 'downloading'
            task.progress = 10
            task.save()
            
            # Download video/audio
            video_info = AudioSummarizer.download_youtube_sub_or_audio(task.url)
            
            if video_info["error_info"]:
                task.mark_failed(video_info["error_info"])
                return
            
            # Update title if we got it from video info
            if video_info["title"]:
                task.title = video_info["title"]
                task.video_id = video_info["id"]
            
            task.status = 'transcribing'
            task.progress = 40
            task.save()
            
            # Transcribe audio
            text_result = self.extract_info_from_sub_or_audio(video_info)
            
            if text_result["status"] == "error":
                task.mark_failed(text_result["text"])
                AudioSummarizer.cleanup_temp_files(video_info)
                return
            
            task.original_text = text_result["text"]
            task.status = 'summarizing'
            task.progress = 70
            task.save()
            
            # Generate summary
            summary_result = self.summary_text_url(task.title, text_result["text"])
            
            if summary_result[0] == "error":
                task.mark_failed(summary_result[1])
            else:
                task.summary = summary_result[1]
                task.mark_completed()
            
            # Cleanup
            AudioSummarizer.cleanup_temp_files(video_info)
            
        except Exception as e:
            try:
                task = VideoTask.objects.get(id=task_id)
                task.mark_failed(f"处理任务时出错: {str(e)}")
            except:
                pass

    def _process_file_task_internal(self, task_id):
        """Internal method to process file upload tasks"""
        try:
            task = VideoTask.objects.get(id=task_id)
            
            # Load or reload Whisper model if needed (skip if auto-load already handled it)
            user_settings = UserSettings.get_settings()
            
            # Only manually load if auto-load is disabled or model isn't loaded
            if not user_settings.auto_load_model or self.whisper_model is None:
                # Check if we need to load/reload the model
                if (self.whisper_model is None or 
                    self.model_name != user_settings.whisper_model or 
                    self.device != self._get_device(user_settings.whisper_device)):
                    
                    print(f"需要重新加载模型: 当前({self.model_name}, {self.device}) -> 新配置({user_settings.whisper_model}, {self._get_device(user_settings.whisper_device)})")
                    self.load_whisper_model(
                        user_settings.whisper_model, 
                        user_settings.whisper_device
                    )
            self._init_openai_client()
            
            task.status = 'transcribing'
            task.progress = 30
            task.save()
            
            # Transcribe audio file
            text_result = self.extract_info_from_sub_or_audio(
                {"audio_path": task.file_path}
            )
            
            if text_result["status"] == "error":
                task.mark_failed(text_result["text"])
                return
            
            task.original_text = text_result["text"]
            task.status = 'summarizing'
            task.progress = 70
            task.save()
            
            # Generate summary
            summary_result = self.summary_text_audio(text_result["text"])
            
            if summary_result[0] == "error":
                task.mark_failed(summary_result[1])
            else:
                task.summary = summary_result[1]
                task.mark_completed()
                
        except Exception as e:
            try:
                task = VideoTask.objects.get(id=task_id)
                task.mark_failed(f"处理任务时出错: {str(e)}")
            except:
                pass

    # Removed WebSocket progress updates for simplicity