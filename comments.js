const { createClient } = window.supabase || {};

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
const hasSupabaseConfig =
  typeof createClient === "function" &&
  typeof SUPABASE_URL === "string" &&
  typeof SUPABASE_ANON_KEY === "string" &&
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") &&
  !SUPABASE_ANON_KEY.includes("YOUR_");

const supabaseClient = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const LOCAL_STORAGE_KEY = "future-tech-ai-comments";

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

function getLocalComments() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveLocalComments(comments) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(comments));
}

function getLocalUserId() {
  let id = localStorage.getItem("future-tech-ai-user-id");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem("future-tech-ai-user-id", id);
  }
  return id;
}

async function ensureAnonymousUser() {
  if (!supabaseClient) return { id: getLocalUserId() };

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) return session.user;

  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

async function loadComments() {
  if (!supabaseClient) return getLocalComments();

  const { data, error } = await supabaseClient
    .from("comments")
    .select("id, user_id, name, text, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderComments(comments, currentUserId) {
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
          ${comment.user_id === currentUserId ? `
            <div class="comment-actions">
              <button type="button" data-action="edit" data-id="${escapeHtml(comment.id)}">Edit</button>
              <button type="button" data-action="delete" data-id="${escapeHtml(comment.id)}">Delete</button>
            </div>` : ""}
        </article>
      `).join("")
    : '<p class="no-comments">No comments yet. Be the first to comment!</p>';
}

async function refreshComments(userId) {
  const comments = await loadComments();
  renderComments(comments, userId);
}

async function addComment(user, name, text) {
  if (supabaseClient) {
    const { error } = await supabaseClient.from("comments").insert({
      user_id: user.id,
      name,
      text,
    });
    if (error) throw error;
    return;
  }

  const comments = getLocalComments();
  comments.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    user_id: user.id,
    name,
    text,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  saveLocalComments(comments);
}

async function editComment(user, id, text) {
  if (supabaseClient) {
    const { error } = await supabaseClient
      .from("comments")
      .update({ text })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;
    return;
  }

  const comments = getLocalComments();
  const comment = comments.find((item) => String(item.id) === String(id) && item.user_id === user.id);
  if (!comment) throw new Error("Comment not found.");
  comment.text = text;
  comment.updated_at = new Date().toISOString();
  saveLocalComments(comments);
}

async function deleteComment(user, id) {
  if (supabaseClient) {
    const { error } = await supabaseClient
      .from("comments")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;
    return;
  }

  const comments = getLocalComments().filter(
    (item) => !(String(item.id) === String(id) && item.user_id === user.id)
  );
  saveLocalComments(comments);
}

async function initComments() {
  const form = document.getElementById("comment-form");
  const list = document.getElementById("comments-list");
  if (!form || !list) return;

  try {
    const user = await ensureAnonymousUser();
    await refreshComments(user.id);

    if (!supabaseClient) {
      setStatus("Comments are working in this browser. Connect Supabase for shared comments.");
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const nameInput = document.getElementById("comment-name");
      const textInput = document.getElementById("comment-text");
      const name = nameInput?.value.trim() || "";
      const text = textInput?.value.trim() || "";

      if (!name || !text) {
        setStatus("Please enter your name and comment.", true);
        return;
      }

      setStatus("Posting...");
      try {
        await addComment(user, name, text);
        form.reset();
        setStatus("Comment posted.");
        await refreshComments(user.id);
      } catch (error) {
        console.error("Failed to post comment:", error);
        setStatus(error.message || "Unable to post comment.", true);
      }
    });

    list.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      if (!id) return;

      try {
        if (button.dataset.action === "delete") {
          if (!confirm("Delete this comment?")) return;
          await deleteComment(user, id);
          setStatus("Comment deleted.");
        }

        if (button.dataset.action === "edit") {
          const article = button.closest("article");
          const currentText = article?.querySelector("p")?.textContent || "";
          const updated = prompt("Edit your comment:", currentText);
          if (updated === null) return;

          const text = updated.trim();
          if (!text) {
            setStatus("Comment cannot be empty.", true);
            return;
          }

          await editComment(user, id, text);
          setStatus("Comment updated.");
        }

        await refreshComments(user.id);
      } catch (error) {
        console.error("Comment action failed:", error);
        setStatus(error.message || "Unable to update the comment.", true);
      }
    });
  } catch (error) {
    console.error("Comments initialization failed:", error);
    setStatus(error.message || "Unable to initialize comments.", true);
  }
}

document.addEventListener("DOMContentLoaded", initComments);
