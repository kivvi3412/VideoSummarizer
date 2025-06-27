class VideoSummarizerApp {
    constructor() {
        this.currentTask = null;
        this.tasks = [];
        this.settings = null;
        this.pollInterval = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.initMobile();
        await this.loadSettings();
        await this.loadTasks();
        this.startPolling();
    }

    setupEventListeners() {
        // URL task creation
        document.getElementById('addUrlTask').addEventListener('click', () => {
            this.createUrlTask();
        });

        document.getElementById('videoUrl').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createUrlTask();
            }
        });

        // File upload
        const fileInput = document.getElementById('audioFile');
        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });

        // Tab switching
        document.getElementById('summaryTab').addEventListener('click', () => {
            this.switchTab('summary');
        });

        document.getElementById('originalTab').addEventListener('click', () => {
            this.switchTab('original');
        });

        // Settings modal
        document.getElementById('settingsButton').addEventListener('click', () => {
            this.openSettings();
        });

        document.getElementById('closeSettings').addEventListener('click', () => {
            this.closeSettings();
        });

        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });

        // Model management
        document.getElementById('loadModel').addEventListener('click', () => {
            this.loadModel();
        });

        document.getElementById('unloadModel').addEventListener('click', () => {
            this.unloadModel();
        });

        // Close modal on backdrop click
        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeSettings();
            }
        });

        // Update file input status
        fileInput.addEventListener('change', (e) => {
            const status = document.querySelector('.file-input-status');
            if (e.target.files.length > 0) {
                status.textContent = e.target.files[0].name;
            } else {
                status.textContent = '未选择文件';
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSettings();
                this.closeMobileTask();
            }
        });

        // Mobile task functionality
        document.getElementById('mobileTaskButton').addEventListener('click', () => {
            this.openMobileTask();
        });

        document.getElementById('closeMobileTask').addEventListener('click', () => {
            this.closeMobileTask();
        });

        // Mobile URL task creation
        document.getElementById('addMobileUrlTask').addEventListener('click', () => {
            this.createMobileUrlTask();
        });

        document.getElementById('mobileVideoUrl').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createMobileUrlTask();
            }
        });

        // Mobile file upload
        const mobileFileInput = document.getElementById('mobileAudioFile');
        mobileFileInput.addEventListener('change', (e) => {
            this.handleMobileFileUpload(e.target.files[0]);
        });

        // Update mobile file input status
        mobileFileInput.addEventListener('change', (e) => {
            const status = document.querySelector('#mobileTaskOverlay .file-input-status');
            if (e.target.files.length > 0) {
                status.textContent = e.target.files[0].name;
            } else {
                status.textContent = '未选择文件';
            }
        });

        // Close mobile task overlay on backdrop click
        document.getElementById('mobileTaskOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeMobileTask();
            }
        });

        // Mobile bottom navigation
        document.getElementById('mobileNavAdd').addEventListener('click', () => {
            this.switchMobilePage('add');
        });

        document.getElementById('mobileNavTasks').addEventListener('click', () => {
            this.switchMobilePage('tasks');
        });

        document.getElementById('mobileNavSummary').addEventListener('click', () => {
            this.switchMobilePage('summary');
        });

        // Mobile new navigation system
        document.getElementById('addMobileUrlBtn').addEventListener('click', () => {
            this.createMobileNewUrlTask();
        });

        document.getElementById('mobileVideoUrlInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createMobileNewUrlTask();
            }
        });

        // Mobile new file upload
        const mobileNewFileInput = document.getElementById('mobileAudioFileInput');
        mobileNewFileInput.addEventListener('change', (e) => {
            this.handleMobileNewFileUpload(e.target.files[0]);
        });

        // Update mobile new file input status
        mobileNewFileInput.addEventListener('change', (e) => {
            const status = document.querySelector('#mobileAddPage .file-input-status');
            if (e.target.files.length > 0) {
                status.textContent = e.target.files[0].name;
            } else {
                status.textContent = '未选择文件';
            }
        });

        // Mobile summary tabs
        document.getElementById('mobileSummaryTabBtn').addEventListener('click', () => {
            this.switchMobileSummaryTab('summary');
        });

        document.getElementById('mobileOriginalTabBtn').addEventListener('click', () => {
            this.switchMobileSummaryTab('original');
        });

        // Clipboard import button
        document.getElementById('clipboardImportBtn').addEventListener('click', () => {
            this.importFromClipboard();
        });
    }

    async createUrlTask() {
        const urlInput = document.getElementById('videoUrl');
        const url = urlInput.value.trim();

        if (!url) {
            this.showNotification('请输入视频链接', 'error');
            return;
        }

        if (!this.isValidUrl(url)) {
            this.showNotification('请输入有效的视频链接', 'error');
            return;
        }

        try {
            this.showLoading(true);
            const response = await fetch('/api/tasks/create-url/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (response.ok) {
                urlInput.value = '';
                this.showNotification('任务创建成功', 'success');
                await this.loadTasks();
            } else {
                this.showNotification(data.error || '创建任务失败', 'error');
            }
        } catch (error) {
            console.error('Error creating URL task:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handleFileUpload(file) {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            this.showLoading(true);
            const response = await fetch('/api/tasks/create-file/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                document.getElementById('audioFile').value = '';
                document.querySelector('.file-input-status').textContent = '未选择文件';
                this.showNotification('文件上传成功', 'success');
                await this.loadTasks();
            } else {
                this.showNotification(data.error || '文件上传失败', 'error');
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadTasks() {
        try {
            const [tasksResponse, queueResponse] = await Promise.all([
                fetch('/api/tasks/'),
                fetch('/api/queue/status/')
            ]);
            
            const tasksData = await tasksResponse.json();
            const queueData = await queueResponse.json();

            if (tasksResponse.ok) {
                // Add queue information to tasks
                this.tasks = tasksData.map((task, index) => {
                    if (task.status === 'pending') {
                        task.queue_position = index + 1;
                    }
                    return task;
                });
                
                this.queueStatus = queueData;
                this.renderTasks();
                
                // Update mobile tasks if on mobile
                if (this.isMobile() && this.currentMobilePage === 'tasks') {
                    this.renderMobileTasks();
                }
            } else {
                console.error('Failed to load tasks:', tasksData);
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
        }
    }

    renderTasks() {
        const taskList = document.getElementById('taskList');
        
        if (this.tasks.length === 0) {
            taskList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <p>暂无任务</p>
                </div>
            `;
            return;
        }

        taskList.innerHTML = this.tasks.map(task => {
            const queueInfo = task.queue_position > 1 ? `<div class="queue-info">队列位置: ${task.queue_position}</div>` : '';
            return `
                <div class="task-item ${task.id === this.currentTask?.id ? 'active' : ''} ${task.status}" 
                     data-task-id="${task.id}" onclick="app.selectTask(${task.id})">
                    <div class="task-title">${task.title}</div>
                    <div class="task-meta">
                        <div class="task-status">
                            <div class="status-indicator ${task.status}"></div>
                            <span>${this.getStatusText(task.status)}</span>
                        </div>
                        <div class="task-time">${this.formatTime(task.created_at)}</div>
                    </div>
                    ${queueInfo}
                    ${task.status !== 'completed' && task.progress !== undefined ? `
                        <div class="task-progress">
                            <div class="progress-bar" style="width: ${task.progress}%"></div>
                        </div>
                    ` : ''}
                    <button class="task-delete" onclick="event.stopPropagation(); app.deleteTask(${task.id})">&times;</button>
                </div>
            `;
        }).join('');
    }

    async selectTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.currentTask = task;
        this.renderTasks();

        if (task.status === 'completed') {
            this.displayTaskContent(task);
        } else {
            this.displayTaskProgress(task);
        }
    }

    displayTaskContent(task) {
        const summaryContent = document.getElementById('summaryContent');
        const originalContent = document.getElementById('originalContent');

        summaryContent.innerHTML = `
            <div class="content-display">
                <h1>${task.title}</h1>
                <div class="markdown-content">${this.renderMarkdown(task.summary || '暂无总结内容')}</div>
            </div>
        `;

        originalContent.innerHTML = `
            <div class="content-display">
                <h1>原始转录文本</h1>
                <div class="original-text">${task.original_text || '暂无原始文本'}</div>
            </div>
        `;
    }

    displayTaskProgress(task) {
        const content = `
            <div class="progress-display">
                <div class="progress-header">
                    <h2>${task.title}</h2>
                    <div class="progress-status">
                        <div class="status-indicator ${task.status}"></div>
                        <span>${this.getStatusText(task.status)}</span>
                    </div>
                </div>
                <div class="progress-details">
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${task.progress || 0}%"></div>
                    </div>
                    <div class="progress-text">${task.progress || 0}%</div>
                </div>
                ${task.error_message ? `
                    <div class="error-message">
                        <strong>错误信息:</strong> ${task.error_message}
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('summaryContent').innerHTML = content;
        document.getElementById('originalContent').innerHTML = content;
    }

    async deleteTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}/delete/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                }
            });

            if (response.ok) {
                this.showNotification('任务删除成功', 'success');
                if (this.currentTask?.id === taskId) {
                    this.currentTask = null;
                    this.clearContent();
                }
                await this.loadTasks();
            } else {
                this.showNotification('删除任务失败', 'error');
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        }
    }

    async loadSettings() {
        try {
            const response = await fetch('/api/settings/');
            const data = await response.json();

            if (response.ok) {
                this.settings = data;
                this.populateSettingsForm();
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    populateSettingsForm() {
        if (!this.settings) return;

        document.getElementById('openaiApiKey').value = this.settings.openai_api_key || '';
        document.getElementById('openaiBaseUrl').value = this.settings.openai_base_url || 'https://api.openai.com/v1';
        document.getElementById('openaiModel').value = this.settings.openai_model || 'gpt-4o-mini';
        document.getElementById('whisperModel').value = this.settings.whisper_model || 'base';
        document.getElementById('whisperDevice').value = this.settings.whisper_device || 'auto';
        document.getElementById('autoLoadModel').checked = this.settings.auto_load_model || false;
        document.getElementById('summaryPrompt').value = this.settings.summary_prompt || '总结录音，简体中文回答';
        document.getElementById('urlSummaryPrompt').value = this.settings.url_summary_prompt || '本次录音的标题是{title}，简要回答标题的问题，并且总结录音，简体中文回答';
    }

    async saveSettings() {
        const newSettings = {
            openai_api_key: document.getElementById('openaiApiKey').value,
            openai_base_url: document.getElementById('openaiBaseUrl').value,
            openai_model: document.getElementById('openaiModel').value,
            whisper_model: document.getElementById('whisperModel').value,
            whisper_device: document.getElementById('whisperDevice').value,
            auto_load_model: document.getElementById('autoLoadModel').checked,
            summary_prompt: document.getElementById('summaryPrompt').value,
            url_summary_prompt: document.getElementById('urlSummaryPrompt').value
        };

        // Check if Whisper settings changed
        const whisperChanged = this.settings && (
            this.settings.whisper_model !== newSettings.whisper_model ||
            this.settings.whisper_device !== newSettings.whisper_device
        );

        try {
            this.showLoading(true);
            const response = await fetch('/api/settings/update/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify(newSettings)
            });

            if (response.ok) {
                this.settings = newSettings;
                this.showNotification('设置保存成功', 'success');
                
                if (whisperChanged) {
                    this.showNotification('Whisper设置已更改，建议重新加载模型以应用新设置', 'info');
                }
                
                this.closeSettings();
            } else {
                this.showNotification('设置保存失败', 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadModel() {
        try {
            this.showLoading(true);
            const response = await fetch('/api/model/manage/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({ action: 'load' })
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification('模型加载成功', 'success');
                this.updateModelStatus();
            } else {
                this.showNotification(data.error || '模型加载失败', 'error');
            }
        } catch (error) {
            console.error('Error loading model:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async unloadModel() {
        try {
            this.showLoading(true);
            const response = await fetch('/api/model/manage/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({ action: 'unload' })
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification('模型卸载成功', 'success');
                this.updateModelStatus();
            } else {
                this.showNotification(data.error || '模型卸载失败', 'error');
            }
        } catch (error) {
            console.error('Error unloading model:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async updateModelStatus() {
        try {
            const response = await fetch('/api/model/status/');
            const data = await response.json();

            if (response.ok) {
                if (data.loaded) {
                    document.getElementById('modelStatus').textContent = `模型状态: ${data.status}`;
                } else {
                    const cudaInfo = data.cuda_available ? ' (CUDA可用)' : ' (CUDA不可用)';
                    const autoLoadInfo = this.settings?.auto_load_model ? ' - 动态加载已启用' : '';
                    document.getElementById('modelStatus').textContent = `模型状态: 未加载${cudaInfo}${autoLoadInfo}`;
                }
            }
        } catch (error) {
            console.error('Error getting model status:', error);
        }
    }

    switchTab(tab) {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.content-panel').forEach(panel => panel.classList.remove('active'));

        if (tab === 'summary') {
            document.getElementById('summaryTab').classList.add('active');
            document.getElementById('summaryContent').classList.add('active');
        } else {
            document.getElementById('originalTab').classList.add('active');
            document.getElementById('originalContent').classList.add('active');
        }
    }

    openSettings() {
        document.getElementById('settingsModal').classList.add('active');
        this.updateModelStatus();
    }

    closeSettings() {
        document.getElementById('settingsModal').classList.remove('active');
    }

    clearContent() {
        const welcomeContent = `
            <div class="welcome-message">
                <div class="welcome-icon">🎬</div>
                <h2>欢迎使用智能视频内容分析工具</h2>
                <p>选择左侧的视频链接或上传音频文件开始分析</p>
            </div>
        `;

        document.getElementById('summaryContent').innerHTML = welcomeContent;
        document.getElementById('originalContent').innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">📄</div>
                <h2>原始转录文本</h2>
                <p>完成任务后，这里将显示原始的转录文本</p>
            </div>
        `;
    }

    startPolling() {
        this.pollInterval = setInterval(() => {
            this.loadTasks();
        }, 2000);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span>${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

        document.body.appendChild(notification);

        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });

        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);

        // Add notification styles if not already added
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-medium);
                    padding: var(--spacing-md);
                    z-index: 3000;
                    max-width: 400px;
                    box-shadow: 0 8px 24px var(--shadow-medium);
                    animation: slideIn 0.3s ease;
                }
                .notification-success {
                    border-color: var(--accent-green);
                }
                .notification-error {
                    border-color: var(--accent-red);
                }
                .notification-info {
                    border-color: var(--accent-blue);
                }
                .notification-content {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    color: var(--text-primary);
                    font-size: 14px;
                }
                .notification-close {
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    font-size: 18px;
                    margin-left: var(--spacing-md);
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }
    }

    renderMarkdown(text) {
        if (typeof marked !== 'undefined') {
            return marked.parse(text);
        }
        return text.replace(/\n/g, '<br>');
    }

    getStatusText(status) {
        const statusMap = {
            'pending': '排队中',
            'downloading': '下载中',
            'transcribing': '转录中',
            'summarizing': '总结中',
            'completed': '已完成',
            'failed': '失败'
        };
        return statusMap[status] || status;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
        return `${Math.floor(diff / 86400000)}天前`;
    }

    isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    getCSRFToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
    }

    // Mobile task methods
    openMobileTask() {
        document.getElementById('mobileTaskOverlay').classList.add('active');
    }

    closeMobileTask() {
        document.getElementById('mobileTaskOverlay').classList.remove('active');
    }

    async createMobileUrlTask() {
        const urlInput = document.getElementById('mobileVideoUrl');
        const url = urlInput.value.trim();

        if (!url) {
            this.showNotification('请输入视频链接', 'error');
            return;
        }

        if (!this.isValidUrl(url)) {
            this.showNotification('请输入有效的视频链接', 'error');
            return;
        }

        try {
            this.showLoading(true);
            const response = await fetch('/api/tasks/create-url/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (response.ok) {
                urlInput.value = '';
                this.showNotification('任务创建成功', 'success');
                this.closeMobileTask();
                await this.loadTasks();
            } else {
                this.showNotification(data.error || '创建任务失败', 'error');
            }
        } catch (error) {
            console.error('Error creating mobile URL task:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handleMobileFileUpload(file) {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            this.showLoading(true);
            const response = await fetch('/api/tasks/create-file/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                document.getElementById('mobileAudioFile').value = '';
                document.querySelector('#mobileTaskOverlay .file-input-status').textContent = '未选择文件';
                this.showNotification('文件上传成功', 'success');
                this.closeMobileTask();
                await this.loadTasks();
            } else {
                this.showNotification(data.error || '文件上传失败', 'error');
            }
        } catch (error) {
            console.error('Error uploading mobile file:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Mobile Navigation Methods
    initMobile() {
        this.currentMobilePage = 'add';
        this.currentMobileSummaryTab = 'summary';
        
        if (this.isMobile()) {
            this.switchMobilePage('add');
        }
    }

    isMobile() {
        return window.innerWidth <= 768 || 
               (window.innerWidth <= 430 && window.innerHeight <= 932) ||
               (window.innerWidth <= 932 && window.innerHeight <= 430);
    }

    switchMobilePage(page) {
        if (!this.isMobile()) return;

        // Update navigation
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.getElementById(`mobileNav${page.charAt(0).toUpperCase() + page.slice(1)}`).classList.add('active');

        // Update pages
        document.querySelectorAll('.mobile-page').forEach(page => {
            page.classList.remove('active');
        });
        
        const pageId = page === 'add' ? 'mobileAddPage' : 
                      page === 'tasks' ? 'mobileTasksPage' : 
                      'mobileSummaryPage';
        
        document.getElementById(pageId).classList.add('active');

        this.currentMobilePage = page;

        // Load content based on page
        if (page === 'tasks') {
            this.renderMobileTasks();
        } else if (page === 'summary' && this.currentTask) {
            this.displayMobileTaskContent(this.currentTask);
        }
    }

    switchMobileSummaryTab(tab) {
        document.querySelectorAll('.mobile-tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.mobile-summary-content').forEach(content => {
            content.classList.remove('active');
        });

        if (tab === 'summary') {
            document.getElementById('mobileSummaryTabBtn').classList.add('active');
            document.getElementById('mobileSummaryContent').classList.add('active');
        } else {
            document.getElementById('mobileOriginalTabBtn').classList.add('active');
            document.getElementById('mobileOriginalContent').classList.add('active');
        }

        this.currentMobileSummaryTab = tab;
    }

    async createMobileNewUrlTask() {
        const urlInput = document.getElementById('mobileVideoUrlInput');
        const url = urlInput.value.trim();

        if (!url) {
            this.showNotification('请输入视频链接', 'error');
            return;
        }

        if (!this.isValidUrl(url)) {
            this.showNotification('请输入有效的视频链接', 'error');
            return;
        }

        try {
            this.showLoading(true);
            const response = await fetch('/api/tasks/create-url/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (response.ok) {
                urlInput.value = '';
                this.showNotification('任务创建成功', 'success');
                await this.loadTasks();
                // Auto switch to tasks page
                setTimeout(() => {
                    this.switchMobilePage('tasks');
                }, 1000);
            } else {
                this.showNotification(data.error || '创建任务失败', 'error');
            }
        } catch (error) {
            console.error('Error creating mobile URL task:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handleMobileNewFileUpload(file) {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            this.showLoading(true);
            const response = await fetch('/api/tasks/create-file/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                document.getElementById('mobileAudioFileInput').value = '';
                document.querySelector('#mobileAddPage .file-input-status').textContent = '未选择文件';
                this.showNotification('文件上传成功', 'success');
                await this.loadTasks();
                // Auto switch to tasks page
                setTimeout(() => {
                    this.switchMobilePage('tasks');
                }, 1000);
            } else {
                this.showNotification(data.error || '文件上传失败', 'error');
            }
        } catch (error) {
            console.error('Error uploading mobile file:', error);
            this.showNotification('网络错误，请稍后重试', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    renderMobileTasks() {
        if (!this.isMobile()) return;

        const tasksList = document.getElementById('mobileTasksList');
        
        if (this.tasks.length === 0) {
            tasksList.innerHTML = `
                <div class="mobile-empty-state">
                    <div class="mobile-empty-icon">📝</div>
                    <p>暂无任务，点击底部"添加任务"开始</p>
                </div>
            `;
            return;
        }

        tasksList.innerHTML = this.tasks.map(task => {
            const queueInfo = task.queue_position > 1 ? 
                `<div class="mobile-queue-info">队列位置: ${task.queue_position}</div>` : '';
            return `
                <div class="mobile-task-item ${task.id === this.currentTask?.id ? 'active' : ''} ${task.status}" 
                     data-task-id="${task.id}" onclick="app.selectMobileTask(${task.id})">
                    <div class="mobile-task-title">${task.title}</div>
                    <div class="mobile-task-meta">
                        <div class="task-status">
                            <div class="status-indicator ${task.status}"></div>
                            <span>${this.getStatusText(task.status)}</span>
                        </div>
                        <div class="task-time">${this.formatTime(task.created_at)}</div>
                    </div>
                    ${queueInfo}
                    ${task.status !== 'completed' && task.progress !== undefined ? `
                        <div class="mobile-task-progress">
                            <div class="mobile-progress-bar" style="width: ${task.progress}%"></div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    async selectMobileTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.currentTask = task;
        this.renderMobileTasks(); // Update task list to show selection

        if (task.status === 'completed') {
            this.displayMobileTaskContent(task);
            // Auto switch to summary page
            setTimeout(() => {
                this.switchMobilePage('summary');
            }, 500);
        } else {
            this.displayMobileTaskProgress(task);
            // Auto switch to summary page
            setTimeout(() => {
                this.switchMobilePage('summary');
            }, 500);
        }
    }

    displayMobileTaskContent(task) {
        const summaryContent = document.getElementById('mobileSummaryContent');
        const originalContent = document.getElementById('mobileOriginalContent');

        summaryContent.innerHTML = `
            <div class="mobile-content-display">
                <h1>${task.title}</h1>
                <div class="markdown-content">${this.renderMarkdown(task.summary || '暂无总结内容')}</div>
            </div>
        `;

        originalContent.innerHTML = `
            <div class="mobile-content-display">
                <h1>原始转录文本</h1>
                <div class="mobile-original-text">${task.original_text || '暂无原始文本'}</div>
            </div>
        `;
    }

    displayMobileTaskProgress(task) {
        const content = `
            <div class="mobile-progress-display">
                <div class="mobile-progress-header">
                    <h2>${task.title}</h2>
                    <div class="mobile-progress-status">
                        <div class="status-indicator ${task.status}"></div>
                        <span>${this.getStatusText(task.status)}</span>
                    </div>
                </div>
                <div class="mobile-progress-details">
                    <div class="mobile-progress-bar-container">
                        <div class="progress-bar" style="width: ${task.progress || 0}%"></div>
                    </div>
                    <div class="mobile-progress-text">${task.progress || 0}%</div>
                </div>
                ${task.error_message ? `
                    <div class="mobile-error-message">
                        <strong>错误信息:</strong> ${task.error_message}
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('mobileSummaryContent').innerHTML = content;
        document.getElementById('mobileOriginalContent').innerHTML = content;
    }

    async importFromClipboard() {
        try {
            // Check if clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.readText) {
                this.showNotification('您的浏览器不支持剪切板功能', 'error');
                return;
            }

            // Read from clipboard
            const clipboardText = await navigator.clipboard.readText();
            
            if (!clipboardText || !clipboardText.trim()) {
                this.showNotification('剪切板为空或无有效内容', 'error');
                return;
            }

            const url = clipboardText.trim();

            // Validate URL
            if (!this.isValidUrl(url)) {
                this.showNotification('剪切板内容不是有效的视频链接', 'error');
                return;
            }

            // Fill the input field
            document.getElementById('mobileVideoUrlInput').value = url;
            
            // Create task directly
            try {
                this.showLoading(true);
                const response = await fetch('/api/tasks/create-url/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCSRFToken()
                    },
                    body: JSON.stringify({ url })
                });

                const data = await response.json();

                if (response.ok) {
                    document.getElementById('mobileVideoUrlInput').value = '';
                    this.showNotification('从剪切板导入成功，任务已开始执行', 'success');
                    await this.loadTasks();
                    // Auto switch to tasks page to show progress
                    setTimeout(() => {
                        this.switchMobilePage('tasks');
                    }, 1000);
                } else {
                    this.showNotification(data.error || '创建任务失败', 'error');
                }
            } catch (error) {
                console.error('Error creating task from clipboard:', error);
                this.showNotification('网络错误，请稍后重试', 'error');
            } finally {
                this.showLoading(false);
            }

        } catch (error) {
            console.error('Error reading clipboard:', error);
            this.showNotification('读取剪切板失败，请检查浏览器权限', 'error');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VideoSummarizerApp();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        window.app?.stopPolling();
    } else {
        window.app?.startPolling();
    }
});

// Handle beforeunload
window.addEventListener('beforeunload', () => {
    window.app?.stopPolling();
});