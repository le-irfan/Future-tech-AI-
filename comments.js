/* FutureTechX local comment system
   No Supabase required.
   Demo authentication/comments are stored in this browser only.
*/

const USERS_KEY = "futuretechx_users";
const SESSION_KEY = "futuretechx_session";
const COMMENTS_KEY = "futuretechx_comments";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function uid() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getUsers() {
  return read(USERS_KEY, []);
}

function getComments() {
  return read(COMMENTS_KEY, []);
}

function getSession() {
  return read(SESSION_KEY, null);
}

function setStatus(message, error = false) {
  const el = document.getElementById("comments-status");
  if (el) {
    el.textContent = message;
    el.dataset.error = error ? "true" : "false";
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function renderAuth() {
  const form = document.getElementById("comment-form");
  if (!form) return;

  let box = document.getElementById("comment-auth");
  if (!box) {
    box = document.createElement("div");
    box.id = "comment-auth";
    form.parentNode.insertBefore(box, form);
  }

  const session = getSession();

  if (session) {
    box.innerHTML = `
      <div class="auth-user">
        Signed in as <strong>${escapeHtml(session.name)}</strong>
        <button type="button" id="comment-logout">Log out</button>
      </div>`;

    form.style.display = "grid";

    const nameInput = document.getElementById("comment-name");
    if (nameInput) {
      nameInput.value = session.name;
      nameInput.readOnly = true;
    }

    document.getElementById("comment-logout")?.addEventListener("click", () => {
      localStorage.removeItem(SESSION_KEY);
      renderAuth();
      renderComments();
      setStatus("You have been logged out.");
    });

    return;
  }

  form.style.display = "none";
  box.innerHTML = `
    <div class="auth-box">
      <h3>🔐 Sign in to comment</h3>

      <form id="login-form">
        <input id="login-email" type="email" placeholder="Email" autocomplete="email" required>
        <input id="login-password" type="password" placeholder="Password" autocomplete="current-password" required>
        <button type="submit">Log in</button>
      </form>

      <hr>

      <h3>📝 Create an account</h3>
      <form id="signup-form">
        <input id="signup-name" type="text" placeholder="Your name" maxlength="50" required>
        <input id="signup-email" type="email" placeholder="Email" autocomplete="email" required>
        <input id="signup-password" type="password" placeholder="Password (6+ characters)" minlength="6" required>
        <button type="submit">Sign up</button>
      </form>
    </div>`;

  document.getElementById("login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const user = getUsers().find((item) => item.email === email && item.password === password);

    if (!user) {
      setStatus("Invalid email or password.", true);
      return;
    }

    write(SESSION_KEY, { id: user.id, name: user.name, email: user.email });
    setStatus("Login successful.");
    renderAuth();
    renderComments();
  });

  document.getElementById("signup-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim().toLowerCase();
    const password = document.getElementById("signup-password").value;

    if (password.length < 6) {
      setStatus("Password must be at least 6 characters.", true);
      return;
    }

    const users = getUsers();

    if (users.some((user) => user.email === email)) {
      setStatus("An account with this email already exists. Please log in.", true);
      return;
    }

    const user = { id: uid(), name, email, password };
    users.push(user);
    write(USERS_KEY, users);
    write(SESSION_KEY, { id: user.id, name: user.name, email: user.email });

    setStatus("Account created. You are now signed in.");
    renderAuth();
    renderComments();
  });
}

function renderComments() {
  const list = document.getElementById("comments-list");
  if (!list) return;

  const session = getSession();
  const comments = getComments().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!comments.length) {
    list.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
    return;
  }

  list.innerHTML = comments.map((comment) => {
    const ownComment = Boolean(session && comment.userId === session.id);

    return `
      <article class="comment" data-id="${escapeHtml(comment.id)}">
        <div class="comment-header">
          <strong>${escapeHtml(comment.name)}</strong>
          <span>${escapeHtml(formatDate(comment.createdAt))}</span>
        </div>
        <p>${escapeHtml(comment.text)}</p>
        ${ownComment ? `
          <div class="comment-actions">
            <button type="button" data-delete-comment="${escapeHtml(comment.id)}">Delete</button>
          </div>` : ""}
      </article>`;
  }).join("");
}

function initComments() {
  const form = document.getElementById("comment-form");
  const list = document.getElementById("comments-list");

  if (!form || !list) return;

  renderAuth();
  renderComments();

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const session = getSession();
    if (!session) {
      setStatus("Please log in or sign up before posting.", true);
      renderAuth();
      return;
    }

    const text = document.getElementById("comment-text")?.value.trim() || "";

    if (!text) {
      setStatus("Please write a comment.", true);
      return;
    }

    const comments = getComments();
    comments.push({
      id: uid(),
      userId: session.id,
      name: session.name,
      text,
      createdAt: new Date().toISOString()
    });

    write(COMMENTS_KEY, comments);
    form.reset();

    const nameInput = document.getElementById("comment-name");
    if (nameInput) nameInput.value = session.name;

    setStatus("Comment posted.");
    renderComments();
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-delete-comment]");
    if (!button) return;

    const session = getSession();
    const commentId = button.dataset.deleteComment;

    if (!session) {
      setStatus("Please log in first.", true);
      return;
    }

    const comments = getComments();
    const comment = comments.find((item) => item.id === commentId);

    if (!comment) return;

    /* Owner check: another signed-in user cannot delete this comment. */
    if (comment.userId !== session.id) {
      setStatus("You can only delete your own comments.", true);
      return;
    }

    if (!confirm("Delete your comment?")) return;

    write(COMMENTS_KEY, comments.filter((item) => item.id !== commentId));
    setStatus("Comment deleted.");
    renderComments();
  });
}

document.addEventListener("DOMContentLoaded", initComments);
