const COMMENT_KEY = "futuretechx_comments";

function loadComments() {
  try {
    return JSON.parse(localStorage.getItem(COMMENT_KEY)) || [];
  } catch {
    return [];
  }
}

function saveComments(comments) {
  localStorage.setItem(COMMENT_KEY, JSON.stringify(comments));
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderComments() {
  const list = document.getElementById("comments-list");
  if (!list) return;

  const comments = loadComments();
  list.innerHTML = comments.length
    ? comments.map((comment, index) => `
        <article class="comment" data-index="${index}">
          <div class="comment-header">
            <strong>${escapeHtml(comment.name)}</strong>
            <span>${escapeHtml(comment.date)}</span>
          </div>
          <p>${escapeHtml(comment.text)}</p>
          <div class="comment-actions">
            <button type="button" data-action="edit" data-index="${index}">Edit</button>
            <button type="button" data-action="delete" data-index="${index}">Delete</button>
          </div>
        </article>
      `).join("")
    : '<p class="no-comments">No comments yet. Be the first to comment!</p>';
}

function initComments() {
  const form = document.getElementById("comment-form");
  const list = document.getElementById("comments-list");
  if (!form || !list) return;

  renderComments();

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const nameInput = document.getElementById("comment-name");
    const textInput = document.getElementById("comment-text");
    const name = nameInput.value.trim();
    const text = textInput.value.trim();

    if (!name || !text) return;

    const comments = loadComments();
    comments.unshift({
      name,
      text,
      date: new Date().toLocaleString(),
    });
    saveComments(comments);
    form.reset();
    renderComments();
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const index = Number(button.dataset.index);
    const comments = loadComments();
    const comment = comments[index];
    if (!comment) return;

    if (button.dataset.action === "delete") {
      if (confirm("Delete this comment?")) {
        comments.splice(index, 1);
        saveComments(comments);
        renderComments();
      }
      return;
    }

    if (button.dataset.action === "edit") {
      const updated = prompt("Edit your comment:", comment.text);
      if (updated === null) return;
      const text = updated.trim();
      if (!text) return;
      comment.text = text;
      comment.date = new Date().toLocaleString();
      saveComments(comments);
      renderComments();
    }
  });
}

document.addEventListener("DOMContentLoaded", initComments);
