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

const supabase = configured
  ? supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function setStatus(message, isError = false) {
  const status = document.getElementById("comments-status");
  if (status) {
    status.textContent = message;
    status.dataset.error = isError ? "true" : "false";
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function renderAuth(user) {
  const form = document.getElementById("comment-form");
  if (!form) return;

  let authBox = document.getElementById("comment-auth");
  if (!authBox) {
    authBox = document.createElement("div");
    authBox.id = "comment-auth";
    form.parentNode.insertBefore(authBox, form);
  }

  if (!supabase) {
    form.style.display = "none";
    authBox.innerHTML = `<p>Comments are currently unavailable. Please configure Supabase.</p>`;
    return;
  }

  if (user) {
    const displayName = user.user_metadata?.full_name || user.email || "User";
    authBox.innerHTML = `
      <div class="auth-user">
        Signed in as <strong>${escapeHtml(displayName)}</strong>
        <button type="button" id="comment-logout">Log out</button>
      </div>`;

    form.style.display = "grid";

    const nameInput = document.getElementById("comment-name");
    if (nameInput) {
      nameInput.value = user.user_metadata?.full_name || "";
      nameInput.readOnly = Boolean(user.user_metadata?.full_name);
    }

    document.getElementById("comment-logout")?.addEventListener("click", async () => {
      const { error } = await supabase.auth.signOut();
      if (error) setStatus(error.message, true);
      else window.location.reload();
    });
    return;
  }

  form.style.display = "none";
  authBox.innerHTML = `
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
    setStatus("Logging in...");

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus(error.message, true);
      return;
    }

    window.location.reload();
  });

  document.getElementById("signup-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Creating account...");

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });

    if (error) {
      setStatus(error.message, true);
      return;
    }

    if (data.session) {
      window.location.reload();
    } else {
      setStatus("Account created. Check your email to confirm your account, then log in.");
    }
  });
}

async function loadComments() {
  const { data, error } = await supabase
    .from("comments")
    .select("id,user_id,name,text,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderComments(comments, currentUserId) {
  const list = document.getElementById("comments-list");
  if (!list) return;

  if (!comments.length) {
    list.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
    return;
  }

  list.innerHTML = comments.map((comment) => `
    <article class="comment" data-id="${escapeHtml(comment.id)}">
      <div class="comment-header">
        <strong>${escapeHtml(comment.name)}</strong>
        <span>${escapeHtml(formatDate(comment.created_at))}</span>
      </div>
      <p>${escapeHtml(comment.text)}</p>
      ${comment.user_id === currentUserId ? `
        <div class="comment-actions">
          <button type="button" data-action="delete" data-id="${escapeHtml(comment.id)}">Delete</button>
        </div>` : ""}
    </article>
  `).join("");
}

async function initComments() {
  const form = document.getElementById("comment-form");
  const list = document.getElementById("comments-list");
  if (!form || !list) return;

  if (!supabase) {
    renderAuth(null);
    setStatus("Supabase is not configured.", true);
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user || null;

    renderAuth(user);
    renderComments(await loadComments(), user?.id || null);

    if (!user) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = document.getElementById("comment-name")?.value.trim() || "";
      const text = document.getElementById("comment-text")?.value.trim() || "";

      if (!name || !text) {
        setStatus("Please enter your comment.", true);
        return;
      }

      setStatus("Posting...");

      const { error } = await supabase.from("comments").insert({
        user_id: user.id,
        name,
        text
      });

      if (error) {
        setStatus(error.message, true);
        return;
      }

      form.reset();
      const nameInput = document.getElementById("comment-name");
      if (nameInput) nameInput.value = user.user_metadata?.full_name || "";

      setStatus("Comment posted.");
      renderComments(await loadComments(), user.id);
    });

    list.addEventListener("click", async (event) => {
      const button = event.target.closest('button[data-action="delete"]');
      if (!button) return;

      const commentId = button.dataset.id;
      if (!commentId || !confirm("Delete your comment?")) return;

      setStatus("Deleting...");

      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", user.id);

      if (error) {
        setStatus(error.message, true);
        return;
      }

      setStatus("Comment deleted.");
      renderComments(await loadComments(), user.id);
    });
  } catch (error) {
    console.error("Comment system error:", error);
    setStatus(error.message || "Unable to load comments.", true);
  }
}

document.addEventListener("DOMContentLoaded", initComments);
