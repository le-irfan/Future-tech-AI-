document.addEventListener("DOMContentLoaded", async () => {
  const form = document.querySelector(".auth-form");
  const status = document.querySelector(".auth-status");
  const submit = form?.querySelector("button[type=submit]");
  const params = new URLSearchParams(location.search);
  const fallback = "tech.html#blog";
  const next = safeNext(params.get("next"));

  function safeNext(value) {
    if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
    return value;
  }

  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (response.ok) {
      const data = await response.json();
      if (data.user) location.replace(next);
    }
  } catch (_) {}

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    if (submit) submit.disabled = true;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong.");
      location.replace(next);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  if (localStorage.getItem("futureTechTheme") === "light") {
    document.body.classList.add("secret-mode");
  }
});