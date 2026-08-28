const USERS_KEY = "futuretechx_users";
const SESSION_KEY = "futuretechx_session";

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; }
}

function saveUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function setSession(user) { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

function showMessage(message, error = false) {
  const el = document.getElementById("auth-message");
  if (!el) return;
  el.textContent = message;
  el.className = error ? "auth-message error" : "auth-message success";
}

function setupLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;
  if (getSession()) {
    window.location.href = "blog-ai.html";
    return;
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const user = getUsers().find(u => u.email === email && u.password === password);
    if (!user) { showMessage("Invalid email or password.", true); return; }
    setSession({ id: user.id, name: user.name, email: user.email });
    showMessage("Login successful. Redirecting...");
    setTimeout(() => window.location.href = "blog-ai.html", 500);
  });
}

function setupSignup() {
  const form = document.getElementById("signup-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim().toLowerCase();
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm").value;
    if (name.length < 2) return showMessage("Please enter your name.", true);
    if (password.length < 6) return showMessage("Password must be at least 6 characters.", true);
    if (password !== confirm) return showMessage("Passwords do not match.", true);
    const users = getUsers();
    if (users.some(u => u.email === email)) return showMessage("This email is already registered. Please log in.", true);
    const user = { id: uid(), name, email, password };
    users.push(user); saveUsers(users); setSession({ id: user.id, name, email });
    showMessage("Account created. Redirecting...");
    setTimeout(() => window.location.href = "blog-ai.html", 500);
  });
}

document.addEventListener("DOMContentLoaded", () => { setupLogin(); setupSignup(); });
