const taskInput = document.getElementById('task-input');
const addTaskBtn = document.getElementById('add-task');
const taskList = document.getElementById('task-list');

let tasks = JSON.parse(localStorage.getItem('tasks')) || [];

function renderTasks() {
  taskList.innerHTML = '';
  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    li.classList.add(task.completed ? 'completed' : '');
    li.innerHTML = `
      <span>${task.text}</span>
      <button class="delete-btn" data-index="${index}">Delete</button>
    `;
    taskList.appendChild(li);
  });
}

function addTask() {
  const taskText = taskInput.value.trim();
  if (taskText) {
    tasks.push({ text: taskText, completed: false });
    localStorage.setItem('tasks', JSON.stringify(tasks));
    taskInput.value = '';
    renderTasks();
  }
}

function toggleTaskCompletion(index) {
  tasks[index].completed = !tasks[index].completed;
  localStorage.setItem('tasks', JSON.stringify(tasks));
  renderTasks();
}

function deleteTask(index) {
  tasks.splice(index, 1);
  localStorage.setItem('tasks', JSON.stringify(tasks));
  renderTasks();
}

addTaskBtn.addEventListener('click', addTask);
taskList.addEventListener('click', (event) => {
  if (event.target.classList.contains('delete-btn')) {
    const index = event.target.dataset.index;
    deleteTask(index);
  } else {
    const index = Array.from(taskList.children).indexOf(event.target.closest('li'));
    if (index !== -1) {
      toggleTaskCompletion(index);
    }
  }
});

renderTasks();