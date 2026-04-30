// app.js - وظائف تطبيق المهام PWA
// يعتمد على LocalStorage لتخزين المهام محلياً
// يدعم الوضع الداكن، التنقل السلس، وإرسال نموذج الاتصال عبر WhatsApp

document.addEventListener('DOMContentLoaded', () => {
  // تهيئة الوضع الداكن حسب تفضيل المستخدم أو النظام
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedTheme = localStorage.getItem('theme');
  const isDark = savedTheme ? savedTheme === 'dark' : prefersDark;
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';

  // زر تبديل الوضع الداكن
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.checked = isDark;
    themeToggle.addEventListener('change', e => {
      const theme = e.target.checked ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('theme', theme);
    });
  }

  // تفعيل القائمة المتنقلة
  const menuBtn = document.getElementById('menu-btn');
  const nav = document.getElementById('nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      nav.classList.toggle('open');
    });
  }

  // تحميل المهام من LocalStorage
  const tasksContainer = document.getElementById('tasks');
  const taskForm = document.getElementById('task-form');
  const taskInput = document.getElementById('task-input');

  function renderTasks() {
    const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    tasksContainer.innerHTML = '';
    tasks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'task-item';
      li.textContent = t;
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
      delBtn.addEventListener('click', () => deleteTask(i));
      li.appendChild(delBtn);
      tasksContainer.appendChild(li);
    });
  }

  function addTask(task) {
    const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    tasks.push(task);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    renderTasks();
  }

  function deleteTask(index) {
    const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    tasks.splice(index, 1);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    renderTasks();
  }

  if (taskForm) {
    taskForm.addEventListener('submit', e => {
      e.preventDefault();
      const task = taskInput.value.trim();
      if (task) {
        addTask(task);
        taskInput.value = '';
      }
    });
  }

  renderTasks();

  // تفعيل التمرير السلس للروابط الداخلية
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // نموذج الاتصال عبر WhatsApp (زر عائم)
  const whatsappBtn = document.getElementById('whatsapp-float');
  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
      const phone = '201234567890'; // استبدل برقم الواتساب الفعلي
      const text = encodeURIComponent('مرحباً، أود الاستفسار عن تطبيق المهام.');
      window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    });
  }

  // تسجيل Service Worker إذا كان المدعوم
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker مسجل', reg))
      .catch(err => console.error('فشل تسجيل Service Worker', err));
  }
});