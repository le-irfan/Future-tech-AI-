const supabaseLib = window.supabase;
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

const configured =
  supabaseLib &&
  typeof supabaseLib.createClient === "function" &&
  typeof SUPABASE_URL === "string" &&
  typeof SUPABASE_ANON_KEY === "string" &&
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") &&
  !SUPABASE_ANON_KEY.includes("YOUR_");

const client = configured ? supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function getPostKey() {
  const path = window.location.pathname.split("/").pop() || "home";
  return path.toLowerCase();
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function status(message, error = false) {
  const el = document.getElementById("comments-status");
  if (el) {
    el.textContent = message;
    el.dataset.error = error ? "true" : "false";
  }
}

function renderAuth(user) {
  const form = document.getElementById("comment-form");
  if (!form) return;

  let auth = document.getElementById("comment-auth");
  if (!auth) {
    auth = document.createElement("div");
    auth.id = "comment-auth";
    form.parentNode.insertBefore(auth, form);
  }

  if (!client) {
    form.style.display = "none";
    auth.innerHTML = "<strong>Comments are temporarily unavailable.</strong><br>Connect Supabase in supabase-config.js to enable login and shared comments.";
    return;
  }

  if (user) {
    const displayName = escapeHtml(user.user_metadata?.full_name || user.email || "User");
    auth.innerHTML = `<div class="auth-user">Signed in as <strong>${displayName}</strong> <button type="button" id="comment-logout">Log out</button></div>`;
    form.style.display = "grid";
    const nameInput = document.getElementById("comment-name");
    if (nameInput) {
      nameInput.value = user.user_metadata?.full_name || "";
      nameInput.readOnly = Boolean(user.user_metadata?.full_name);
    }
    document.getElementById("comment-logout")?.addEventListener("click", async () => {
      const { error } = await client.auth.signOut();
      if (error) status(error.message, true);
      else window.location.reload();
    });
    return;
  }

  form.style.display = "none";
  auth.innerHTML = `
    <div class="auth-box">
      <h3>Sign in to comment</h3>
      <form id="login-form">
        <input id="login-email" type="email" placeholder="Email" autocomplete="email" required />
        <input id="login-password" type="password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit">Log in</button>
      </form>
      <hr>
      <h3>Create an account</h3>
      <form id="signup-form">
        <input id="signup-name" type="text" placeholder="Your name" maxlength="50" required />
        <input id="signup-email" type="email" placeholder="Email" autocomplete="email" required />
        <input id="signup-password" type="password" placeholder="Password (6+ characters)" minlength="6" autocomplete="new-password" required />
        <button type="submit">Sign up</button>
      </form>
    </div>`;

  document.getElementById("login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    status("Logging in...");
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return status(error.message, true);
    window.location.reload();
  });

  document.getElementById("signup-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    status("Creating account...");
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });
    if (error) return status(error.message, true);
    if (data.session) {
      window.location.reload();
    } else {
      status("Account created. Check your email to confirm your account, then log in.");
    }
  });
}

async function loadComments() {
  const list = document.getElementById("comments-list");
  if (!list || !client) return [];

  const { data, error } = await client
    .from("comments")
    .select("id,user_id,name,text,created_at")
    .eq("post_key", getPostKey())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderComments(comments, userId) {
  const list = document.getElementById("comments-list");
  if (!list) return;

  list.innerHTML = comments.length ? comments.map((comment) => `
    <article class="comment" data-id="${escapeHtml(comment.id)}">
      <div class="comment-header">
        <strong>${escapeHtml(comment.name)}</strong>
        <span>${escapeHtml(formatDate(comment.created_at))}</span>
      </div>
      <p>${escapeHtml(comment.text)}</p>
      ${comment.user_id === userId ? `<div class="comment-actions"><button type="button" data-action="delete" data-id="${escapeHtml(comment.id)}">Delete</button></div>` : ""}
    </article>`).join("") : '<p class="no-comments">No comments yet. Be the first to comment!</p>';
}

async function initComments() {
  const form = document.getElementById("comment-form");
  const list = document.getElementById("comments-list");
  if (!form || !list) return;

  if (!client) {
    renderAuth(null);
    status("Comments require the Supabase configuration.", true);
    return;
  }

  try {
    const { data: { session } } = await client.auth.getSession();
    const user = session?.user || null;
    renderAuth(user);
    renderComments(await loadComments(), user?.id || null);

    if (!user) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.getElementById("comment-name")?.value.trim() || "";
      const text = document.getElementById("comment-text")?.value.trim() || "";
      if (!name || !text) return status("Please enter your name and comment.", true);

      status("Posting...");
      const { error } = await client.from("comments").insert({
        post_key: getPostKey(),
        user_id: user.id,
        name,
        text
      });
      if (error) return status(error.message, true);
      form.reset();
      const nameInput = document.getElementById("comment-name");
      if (nameInput) nameInput.value = user.user_metadata?.full_name || "";
      status("Comment posted.");
      renderComments(await loadComments(), user.id);
    });

    list.addEventListener("click", async (event) => {
      const button = event.target.closest('button[data-action="delete"]');
      if (!button) return;
      const id = button.dataset.id;
      if (!id || !confirm("Delete your comment?")) return;

      const { error } = await client
        .from("comments")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) return status(error.message, true);

      status("Comment deleted.");
      renderComments(await loadComments(), user.id);
    });
  } catch (error) {
    console.error("Comment system error:", error);
    status(error.message || "Unable to load comments.", true);
  }
}

document.addEventListener("DOMContentLoaded", initComments);
