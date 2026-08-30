document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".comment-form");
  const nameInput = document.getElementById("commentName");
  const textInput = document.getElementById("commentText");
  const list = document.getElementById("commentList");
  const status = document.getElementById("commentStatus");
  const commentsSection = document.querySelector(".comments");
  const post = typeof postId !== "undefined" ? postId : "ai";
  let currentUser = null;

  const nextUrl = () => `${location.pathname}${location.hash || "#comments"}`;
  const authUrl = (page) => `${page}?next=${encodeURIComponent(nextUrl())}`;

  function setStatus(message) {
    status.textContent = message || "";
  }

  function makeLink(text, href) {
    const a = document.createElement("a");
    a.textContent = text;
    a.href = href;
    return a;
  }

  function setupAuthPanel() {
    let panel = document.getElementById("commentAuthPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "commentAuthPanel";
      panel.className = "comment-auth-panel";
      commentsSection?.insertBefore(panel, commentsSection.querySelector("h2")?.nextSibling || form);
    }
    panel.replaceChildren();

    if (currentUser) {
      const text = document.createElement("span");
      text.textContent = `Logged in as ${currentUser.username}`;
      const logout = document.createElement("button");
      logout.type = "button";
      logout.className = "comment-auth-button";
      logout.textContent = "Log out";
      logout.onclick = logoutUser;
      panel.append(text, logout);
      if (form) form.style.display = "";
      if (nameInput) {
        nameInput.value = currentUser.username;
        nameInput.readOnly = true;
        nameInput.style.display = "none";
      }
      if (textInput) textInput.disabled = false;
    } else {
      const text = document.createElement("span");
      text.textContent = "Log in to post, edit, or delete your comments.";
      const login = makeLink("Log in", authUrl("login.html"));
      const signup = makeLink("Sign up", authUrl("signup.html"));
      panel.append(text, login, signup);
      if (form) form.style.display = "none";
    }
  }

  async function loadUser() {
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin" });
      const data = await response.json();
      currentUser = data.user || null;
    } catch (_) {
      currentUser = null;
    }
    setupAuthPanel();
  }

  async function loadComments() {
    try {
      const response = await fetch(`/api/comments?post=${encodeURIComponent(post)}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not load comments.");
      const comments = await response.json();
      list.innerHTML = "";
      comments.forEach(renderComment);
    } catch (_) {
      setStatus("Comments are unavailable right now.");
    }
  }

  function renderComment(comment) {
    const item = document.createElement("article");
    item.className = "comment";
    item.dataset.id = comment.id;
    item.innerHTML = `<strong></strong><p></p><small></small><div class="comment-actions"><button type="button" data-action="edit">Edit</button><button type="button" data-action="delete">Delete</button></div>`;
    item.querySelector("strong").textContent = comment.name;
    item.querySelector("p").textContent = comment.comment;
    item.querySelector("small").textContent = new Date(comment.createdAt).toLocaleString() + (comment.updatedAt ? " · edited" : "");
    const actions = item.querySelector(".comment-actions");
    if (!comment.isOwner) actions.remove();
    else {
      item.querySelector('[data-action="edit"]').onclick = () => editComment(comment);
      item.querySelector('[data-action="delete"]').onclick = () => deleteComment(comment.id);
    }
    list.appendChild(item);
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return location.assign(authUrl("login.html"));
    const comment = textInput.value.trim();
    if (!comment) return;
    setStatus("Posting...");
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ comment, post }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not post comment.");
      textInput.value = "";
      setStatus("Comment posted.");
      renderComment(data);
    } catch (error) {
      setStatus(error.message);
    }
  });

  async function deleteComment(id) {
    if (!confirm("Delete this comment?")) return;
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete comment.");
      document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
      setStatus("Comment deleted.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function editComment(comment) {
    const text = prompt("Edit your comment:", comment.comment);
    if (text === null || !text.trim()) return;
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ comment: text.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not edit comment.");
      document.querySelector(`[data-id="${CSS.escape(comment.id)}"]`)?.remove();
      renderComment(data);
      setStatus("Comment updated.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function logoutUser() {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch (_) {}
    currentUser = null;
    setupAuthPanel();
    loadComments();
    setStatus("Logged out.");
  }

  Promise.all([loadUser(), loadComments()]);
});