const { createClient } = window.supabase;

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
const supabaseClient =
  SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_")
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function setStatus(message, isError = false) {
  const status = document.getElementById("comments-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.error = isError ? "true" : "false";
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

async function ensureAnonymousUser() {
  if (!supabaseClient) throw new Error("Supabase is not configured yet.");

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) return session.user;

  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

async function loadComments() {
  if (!supabaseClient) return [];

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
        <article class="comment" data-id="${comment.id}">
          <div class="comment-header">
            <strong>${escapeHtml(comment.name)}</strong>
            <span>${escapeHtml(formatDate(comment.updated_at || comment.created_at))}</span>
          </div>
          <p>${escapeHtml(comment.text)}</p>
          ${comment.user_id === currentUserId ? `
            <div class="comment-actions">
              <button type="button" data-action="edit" data-id="${comment.id}">Edit</button>
              <button type="button" data-action="delete" data-id="${comment.id}">Delete</button>
            </div>` : ""}
        </article>
      `).join("")
    : '<p class="no-comments">No comments yet. Be the first to comment!</p>';
}

async function refreshComments(userId) {
  const comments = await loadComments();
  renderComments(comments, userId);
}

async function initComments() {
  const form = document.getElementById("comment-form");
  const list = document.getElementById("comments-list");
  if (!form || !list) return;

  if (!supabaseClient) {
    setStatus("Database is not configured. Add your Supabase URL and anon key in supabase-config.js.", true);
    return;
  }

  try {
    const user = await ensureAnonymousUser();
    await refreshComments(user.id);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = document.getElementById("comment-name").value.trim();
      const text = document.getElementById("comment-text").value.trim();
      if (!name || !text) return;

      setStatus("Posting...");
      const { error } = await supabaseClient.from("comments").insert({
        user_id: user.id,
        name,
        text,
      });

      if (error) {
        setStatus(error.message, true);
        return;
      }

      form.reset();
      setStatus("Comment posted.");
      await refreshComments(user.id);
    });

    list.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const id = Number(button.dataset.id);
      if (!Number.isFinite(id)) return;

      if (button.dataset.action === "delete") {
        if (!confirm("Delete this comment?")) return;
        const { error } = await supabaseClient
          .from("comments")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) {
          setStatus(error.message, true);
          return;
        }
      }

      if (button.dataset.action === "edit") {
        const article = button.closest("article");
        const currentText = article?.querySelector("p")?.textContent || "";
        const updated = prompt("Edit your comment:", currentText);
        if (updated === null) return;
        const text = updated.trim();
        if (!text) return;

        const { error } = await supabaseClient
          .from("comments")
          .update({ text })
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) {
          setStatus(error.message, true);
          return;
        }
      }

      await refreshComments(user.id);
    });
  } catch (error) {
    console.error("Comments initialization failed:", error);
    setStatus(error.message || "Unable to connect to the comments database.", true);
  }
}

document.addEventListener("DOMContentLoaded", initComments);
