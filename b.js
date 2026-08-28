document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".comment-form");
  const nameInput = document.getElementById("commentName");
  const textInput = document.getElementById("commentText");
  const list = document.getElementById("commentList");
  const status = document.getElementById("commentStatus");
  const post = typeof postId !== "undefined" ? postId : "ai";

  async function loadComments() {
    try {
      const response = await fetch(`/api/comments?post=${encodeURIComponent(post)}`);
      if (!response.ok) throw new Error("Could not load comments.");
      const comments = await response.json();
      list.innerHTML = "";
      comments.forEach(renderComment);
    } catch (error) {
      status.textContent = "Comments are unavailable right now.";
    }
  }

  function renderComment(comment) {
    const item = document.createElement("article");
    item.className = "comment";
    item.dataset.id = comment.id;
    item.innerHTML = `
      <strong></strong>
      <p></p>
      <small></small>
      <div class="comment-actions">
        <button type="button" data-action="edit">Edit</button>
        <button type="button" data-action="delete">Delete</button>
      </div>`;
    item.querySelector("strong").textContent = comment.name;
    item.querySelector("p").textContent = comment.comment;
    item.querySelector("small").textContent = new Date(comment.createdAt).toLocaleString();
    item.querySelector('[data-action="edit"]').onclick = () => editComment(comment);
    item.querySelector('[data-action="delete"]').onclick = () => deleteComment(comment.id);
    list.appendChild(item);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const comment = textInput.value.trim();
    if (!name || !comment) return;
    status.textContent = "Posting...";
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, comment, post }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not post comment.");
      nameInput.value = "";
      textInput.value = "";
      status.textContent = "Comment posted.";
      renderComment(data);
    } catch (error) {
      status.textContent = error.message;
    }
  });

  async function deleteComment(id) {
    if (!confirm("Delete this comment?")) return;
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete comment.");
      document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
    } catch (error) {
      status.textContent = error.message;
    }
  }

  async function editComment(comment) {
    const name = prompt("Edit your name:", comment.name);
    if (name === null) return;
    const text = prompt("Edit your comment:", comment.comment);
    if (text === null) return;
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), comment: text.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not edit comment.");
      document.querySelector(`[data-id="${CSS.escape(comment.id)}"]`)?.remove();
      renderComment(data);
    } catch (error) {
      status.textContent = error.message;
    }
  }

  loadComments();
});
