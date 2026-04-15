const state = {
  token: localStorage.getItem('event_token') || '',
  user: JSON.parse(localStorage.getItem('event_user') || 'null'),
  departments: [],
  people: []
};

const el = (id) => document.getElementById(id);

async function apiPost(action, payload = {}) {
  const res = await fetch(window.APP_CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token: state.token, ...payload })
  });
  return res.json();
}

async function apiGet(params = {}) {
  const url = new URL(window.APP_CONFIG.API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

function showLogin() {
  el('loginView').classList.remove('hidden');
  el('appView').classList.add('hidden');
}

function showApp() {
  el('loginView').classList.add('hidden');
  el('appView').classList.remove('hidden');
  el('welcomeText').textContent = `Welcome, ${state.user?.displayName || state.user?.username || ''}`;
  el('userMeta').textContent = `${state.user?.role || ''} • ${state.user?.department || ''}`;
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tabpane').forEach(x => x.classList.add('hidden'));
      btn.classList.add('active');
      el(btn.dataset.tab).classList.remove('hidden');
    });
  });
}

async function login() {
  el('loginMsg').textContent = 'Logging in...';
  const out = await apiPost('login', {
    username: el('username').value.trim(),
    password: el('password').value.trim()
  });

  if (!out.ok) {
    el('loginMsg').textContent = out.message || 'Login failed';
    return;
  }

  state.token = out.data.token;
  state.user = out.data.user;
  localStorage.setItem('event_token', state.token);
  localStorage.setItem('event_user', JSON.stringify(state.user));
  showApp();
  await loadDepartments();
  await refreshRegistrations();
  await refreshDashboard();
  await refreshTasks();
}

function logout() {
  localStorage.removeItem('event_token');
  localStorage.removeItem('event_user');
  state.token = '';
  state.user = null;
  showLogin();
}

async function loadDepartments() {
  const out = await apiGet({ action: 'departments' });
  if (!out.ok) return;
  state.departments = out.data || [];
  el('departmentSelect').innerHTML = state.departments.map(d => `<option value="${escapeHtml(d.code)}">${escapeHtml(d.label)}</option>`).join('');
}

async function loadPeople() {
  const dept = el('departmentSelect').value;
  const out = await apiGet({ action: 'people', department: dept });
  if (!out.ok) {
    el('regMsg').textContent = out.message;
    return;
  }
  state.people = out.data || [];
  renderPeople();
}

function renderPeople() {
  const root = el('peopleList');
  root.innerHTML = (state.people || []).map(p => `
    <label class="person-card person-row">
      <input type="checkbox" class="person-check" value="${escapeHtml(p.personId)}">
      <div>
        <div><strong>${escapeHtml(p.name)}</strong></div>
        <div class="small">${escapeHtml(p.title || '')} ${p.country ? '• ' + escapeHtml(p.country) : ''}</div>
      </div>
    </label>
  `).join('');
}

async function registerSelected() {
  const personIds = [...document.querySelectorAll('.person-check:checked')].map(x => x.value);
  const out = await apiPost('registerPeople', {
    department: el('departmentSelect').value,
    personIds,
    note: el('regNote').value.trim(),
    deviceLabel: 'GitHub Frontend'
  });
  el('regMsg').textContent = out.ok ? `Saved: ${out.data.saved}, Skipped: ${out.data.skipped}` : out.message;
  await refreshRegistrations();
}

async function refreshRegistrations() {
  const out = await apiPost('todayRegistrations', {});
  const root = el('todayRegistrations');
  if (!out.ok) {
    root.innerHTML = `<div class="msg">${escapeHtml(out.message || 'Error')}</div>`;
    return;
  }
  root.innerHTML = (out.data || []).map(r => `
    <div class="reg-card">
      <strong>${escapeHtml(r.name)}</strong>
      <div class="small">${escapeHtml(r.department)} • ${escapeHtml(r.status)} • ${escapeHtml(r.timestamp)}</div>
    </div>
  `).join('') || '<div class="small">No registrations yet today.</div>';
}

async function refreshDashboard() {
  const out = await apiPost('dashboardStats', {});
  const root = el('statsGrid');
  if (!out.ok) {
    root.innerHTML = `<div class="msg">${escapeHtml(out.message || 'Error')}</div>`;
    return;
  }

  const cards = [];
  cards.push(`<div class="stat-card"><div class="small">Overall completion</div><strong>${out.data.overallCompletion}%</strong></div>`);
  cards.push(`<div class="stat-card"><div class="small">Total tasks</div><strong>${out.data.totalTasks}</strong></div>`);
  cards.push(`<div class="stat-card"><div class="small">Completed</div><strong>${out.data.completedTasks}</strong></div>`);
  Object.entries(out.data.byPriority || {}).forEach(([k, v]) => {
    cards.push(`<div class="stat-card"><div class="small">${escapeHtml(k)}</div><strong>${v.completion}%</strong></div>`);
  });
  root.innerHTML = cards.join('');
}

async function refreshTasks() {
  const out = await apiPost('listTasks', {
    status: el('taskStatusFilter').value,
    priority: el('taskPriorityFilter').value,
    search: el('taskSearch').value.trim()
  });
  const root = el('taskList');
  if (!out.ok) {
    root.innerHTML = `<div class="msg">${escapeHtml(out.message || 'Error')}</div>`;
    return;
  }

  root.innerHTML = (out.data || []).map(t => `
    <div class="task-card">
      <strong>${escapeHtml(t.taskId)} • ${escapeHtml(t.title)}</strong>
      <div class="small">${escapeHtml(t.department)} • ${escapeHtml(t.priority)} • ${escapeHtml(t.status)}</div>
      <div>${escapeHtml(t.description || '')}</div>
      <div class="small">${escapeHtml(t.lastUpdate || '')}</div>
      <select onchange="changeTaskStatus('${escapeJs(t.taskId)}', this.value)">
      <select onchange="changeTaskStatus('${escapeJs(t.taskId)}', this.value)">
        <option ${t.status === 'Open' ? 'selected' : ''}>Open</option>
        <option ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
        <option ${t.status === 'Waiting' ? 'selected' : ''}>Waiting</option>
        <option ${t.status === 'Blocked' ? 'selected' : ''}>Blocked</option>
        <option ${t.status === 'Done' ? 'selected' : ''}>Done</option>
        <option ${t.status === 'Closed' ? 'selected' : ''}>Closed</option>
      </select>
    </div>
  `).join('') || '<div class="small">No tasks found.</div>';
}

async function createTask() {
  const out = await apiPost('createTask', {
    date: el('taskDate').value,
    department: el('taskDepartment').value.trim(),
    title: el('taskTitle').value.trim(),
    description: el('taskDescription').value.trim(),
    priority: el('taskPriority').value
  });
  el('taskMsg').textContent = out.ok ? `Created task ${out.data.taskId}` : out.message;
  if (out.ok) {
    el('taskTitle').value = '';
    el('taskDescription').value = '';
    await refreshDashboard();
    await refreshTasks();
  }
}

async function changeTaskStatus(taskId, status) {
  const out = await apiPost('updateTaskStatus', {
    taskId,
    status,
    remark: 'Updated from frontend'
  });
  if (!out.ok) {
    alert(out.message || 'Failed to update status');
    return;
  }
  await refreshDashboard();
  await refreshTasks();
}

async function generateTokens() {
  const out = await apiPost('generatePersonTokens', {});
  el('adminMsg').textContent = out.ok ? `Generated tokens for ${out.data.count} people` : out.message;
}

async function generateBadges() {
  const out = await apiPost('createBadges', {});
  el('adminMsg').innerHTML = out.ok
    ? `Badge deck created: <a href="${out.data.presentationUrl}" target="_blank" rel="noopener">Open Slides</a>`
    : escapeHtml(out.message || 'Error');
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeJs(str) {
  return String(str || '').replaceAll("'", "\\'");
}

function init() {
  bindTabs();

  el('loginBtn').addEventListener('click', login);
  el('logoutBtn').addEventListener('click', logout);
  el('loadPeopleBtn').addEventListener('click', loadPeople);
  el('registerBtn').addEventListener('click', registerSelected);
  el('refreshTasksBtn').addEventListener('click', async () => {
    await refreshDashboard();
    await refreshTasks();
  });
  el('createTaskBtn').addEventListener('click', createTask);
  el('genTokensBtn').addEventListener('click', generateTokens);
  el('genBadgesBtn').addEventListener('click', generateBadges);

  el('taskDate').value = new Date().toISOString().slice(0, 10);

  if (state.token && state.user) {
    showApp();
    loadDepartments().then(refreshRegistrations);
    refreshDashboard();
    refreshTasks();
  } else {
    showLogin();
  }
}

document.addEventListener('DOMContentLoaded', init);
