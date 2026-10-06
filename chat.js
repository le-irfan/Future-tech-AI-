document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("nexvoraChatForm");
  const input = document.getElementById("nexvoraChatInput");
  const messages = document.getElementById("nexvoraChatMessages");
  const status = document.getElementById("nexvoraChatStatus");
  if (!form || !input || !messages) return;

  const history = [];

  function addMessage(text, who) {
    const item = document.createElement("div");
    item.className = `nexvora-chat-message ${who}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    addMessage(message, "user");
    input.value = "";
    input.disabled = true;
    status.textContent = "Thinking...";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.slice(-10) })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chat is unavailable.");

      addMessage(data.reply, "bot");
      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: data.reply });
      status.textContent = "";
    } catch (error) {
      addMessage(error.message || "Sorry, the assistant is unavailable right now.", "bot");
      status.textContent = "Connection error";
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
});