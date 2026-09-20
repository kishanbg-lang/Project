// Shared helper used by every page to talk to the backend.

const API_BASE = 'http://localhost:3000/api';

function getToken() {
  return localStorage.getItem('token');
}

function getStudent() {
  const raw = localStorage.getItem('student');
  return raw ? JSON.parse(raw) : null;
}

function saveSession(token, student) {
  localStorage.setItem('token', token);
  localStorage.setItem('student', JSON.stringify(student));
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('student');
}

// Redirect to login if there's no token. Call at the top of protected pages.
function requireAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
  }
}

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 || res.status === 403) {
    clearSession();
    window.location.href = 'login.html';
    return Promise.reject(data);
  }
  if (!res.ok) {
    return Promise.reject(data);
  }
  return data;
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}
