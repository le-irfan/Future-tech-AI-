const LOCAL_USER_KEY = "future-tech-ai-user-id";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function getPostKey() {
  const path = window.location.pathname.split("/").pop() || "home";
  return `future-tech-ai-comments:${path.toLowerCase()}`;
}

function getComments() {
  try {
    const saved = JSON.parse(localStorage.getItem(getPostKey()) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveComments(comments) {
  localStorage.setItem(getPostKey(), JSON.stringify(comments));
}

function getUserId() {
  let id = localStorage.getItem(LOCAL_USER_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(LOCAL_USER_KEY, id);
  }
  return id;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function renderComments(comments, userId) {
  const list = document.getElementById("comments-list");
  if (!list) return;

  list.innerHTML = comments.map((comment) => `
    <article class="comment" data-id="${escapeHtml(comment.id)}">
      <div class="comment-header">
        <strong>${escapeHtml(comment.name)}</strong>
        <span>${escapeHtml(formatDate(comment.updated_at || comment.created_at))}</span>
      </div>
      <p>${escapeHtml(comment.text)}</p>
      ${comment.user_id === userId ? `
        <div class="comment-actions">
          <button type="button" data-action="edit" data-id="${escapeHtml(comment.id)}">Edit</button>
          <button type="button" data-action="delete" data-id="${escapeHtml(comment.id)}">Delete</button>
        </div>` : ""}
    </article>
  `).join("");
}

function initComments() {
  const form = document.getElementById("comment-form");
  const list = document.getElementById("comments-list");
  const status = document.getElementById("comments-status");
  if (!form || !list) return;

  const userId = getUserId();
  renderComments(getComments(), userId);
  if (status) status.textContent = "";

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const nameInput = document.getElementById("comment-name");
    const textInput = document.getElementById("comment-text");
    const name = nameInput?.value.trim() || "";
    const text = textInput?.value.trim() || "";

    if (!name || !text) return;

    const now = new Date().toISOString();
    const comments = getComments();
    comments.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      user_id: userId,
      name,
      text,
      created_at: now,
      updated_at: now
    });

    saveComments(comments);
    form.reset();
    renderComments(comments, userId);
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    let comments = getComments();
    const comment = comments.find((item) => String(item.id) === String(id) && item.user_id === userId);
    if (!comment) return;

    if (button.dataset.action === "delete") {
      if (!confirm("Delete this comment?")) return;
      comments = comments.filter((item) => String(item.id) !== String(id));
      saveComments(comments);
      renderComments(comments, userId);
    }

    if (button.dataset.action === "edit") {
      const updated = prompt("Edit your comment:", comment.text);
      if (updated === null) return;
      const text = updated.trim();
      if (!text) return;

      comment.text = text;
      comment.updated_at = new Date().toISOString();
      saveComments(comments);
      renderComments(comments, userId);
    }
  });
}

document.addEventListener("DOMContentLoaded", initComments);
