/* FutureTechX local comments: authentication forms live only on login.html/signup.html. */
const SESSION_KEY = "futuretechx_session";
const COMMENTS_KEY = "futuretechx_comments";

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function getSession() { return read(SESSION_KEY, null); }
function getComments() { return read(COMMENTS_KEY, []); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random(); }
function escapeHtml(value) { const d = document.createElement("div"); d.textContent = String(value ?? ""); return d.innerHTML; }
function formatDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(); }

function renderAuthPrompt() {
  const form = document.getElementById("comment-form");
  if (!form) return;
  let panel = document.getElementById("comment-auth-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "comment-auth-panel";
    panel.className = "comment-auth-panel";
    form.parentNode.insertBefore(panel, form);
  }
  const session = getSession();
  if (!session) {
    form.style.display = "none";
    panel.innerHTML = '<span>🔐 Log in or create an account to comment.</span><a href="login.html">Login</a><a href="signup.html">Sign Up</a>';
    return;
  }
  panel.innerHTML = '<span>Signed in as <strong>' + escapeHtml(session.name) + '</strong></span><button class="comment-auth-button" id="comment-logout" type="button">Log out</button>';
  form.style.display = "grid";
  const name = document.getElementById("comment-name");
  if (name) { name.value = session.name; name.readOnly = true; }
  document.getElementById("comment-logout")?.addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    renderAuthPrompt();
    renderComments();
  });
}

function renderComments() {
  const list = document.getElementById("comments-list");
  if (!list) return;
  const session = getSession();
  const comments = getComments().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!comments.length) { list.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>'; return; }
  list.innerHTML = comments.map(comment => {
    const own = session && comment.userId === session.id;
    return '<article class="comment"><div class="comment-header"><strong>' + escapeHtml(comment.name) + '</strong><span>' + escapeHtml(formatDate(comment.createdAt)) + '</span></div><p>' + escapeHtml(comment.text) + '</p>' + (own ? '<div class="comment-actions"><button type="button" data-delete-comment="' + escapeHtml(comment.id) + '">Delete</button></div>' : '') + '</article>';
  }).join("");
}

function initComments() {
  const form = document.getElementById("comment-form");
  const list = document.getElementById("comments-list");
  if (!form || !list) return;
  renderAuthPrompt();
  renderComments();
  form.addEventListener("submit", event => {
    event.preventDefault();
    const session = getSession();
    if (!session) { window.location.href = "login.html"; return; }
    const text = document.getElementById("comment-text")?.value.trim() || "";
    if (!text) return;
    const comments = getComments();
    comments.push({ id: uid(), userId: session.id, name: session.name, text, createdAt: new Date().toISOString() });
    write(COMMENTS_KEY, comments);
    form.reset();
    const name = document.getElementById("comment-name");
    if (name) name.value = session.name;
    renderComments();
  });
  list.addEventListener("click", event => {
    const button = event.target.closest("button[data-delete-comment]");
    if (!button) return;
    const session = getSession();
    const id = button.dataset.deleteComment;
    const comments = getComments();
    const comment = comments.find(c => c.id === id);
    if (!session || !comment || comment.userId !== session.id) return;
    write(COMMENTS_KEY, comments.filter(c => c.id !== id));
    renderComments();
  });
}

document.addEventListener("DOMContentLoaded", initComments);
