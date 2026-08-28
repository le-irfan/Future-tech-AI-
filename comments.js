const LOCAL_STORAGE_KEY = "future-tech-ai-comments";
const LOCAL_USER_KEY = "future-tech-ai-user-id";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function setStatus(message, isError = false) {
  const status = document.getElementById("comments-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.error = isError ? "true" : "false";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleString();
}

function getComments() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveComments(comments) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(comments));
}

function getUserId() {
  let id = localStorage.getItem(LOCAL_USER_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(LOCAL_USER_KEY, id);
  }
  return id;
}

function renderComments(comments, userId) {
  const list = document.getElementById("comments-list");
  if (!list) return;

  list.innerHTML = comments.length
    ? comments.map((comment) => `
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
    `).join("")
    : '<p class="no-comments">No comments yet. Be the first to comment!</p>';
}

function initComments() {
  const form = document.getElementById("comment-form");
  const list = document.getElementById("comments-list");
  if (!form || !list) return;

  const userId = getUserId();
  renderComments(getComments(), userId);
  setStatus("Comments are saved on this device.");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const nameInput = document.getElementById("comment-name");
    const textInput = document.getElementById("comment-text");
    const name = nameInput?.value.trim() || "";
    const text = textInput?.value.trim() || "";

    if (!name || !text) {
      setStatus("Please enter your name and comment.", true);
      return;
    }

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
    setStatus("Comment posted.");
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
      setStatus("Comment deleted.");
      return;
    }

    if (button.dataset.action === "edit") {
      const updated = prompt("Edit your comment:", comment.text);
      if (updated === null) return;

      const text = updated.trim();
      if (!text) {
        setStatus("Comment cannot be empty.", true);
        return;
      }

      comment.text = text;
      comment.updated_at = new Date().toISOString();
      saveComments(comments);
      renderComments(comments, userId);
      setStatus("Comment updated.");
    }
  });
}

document.addEventListener("DOMContentLoaded", initComments);
