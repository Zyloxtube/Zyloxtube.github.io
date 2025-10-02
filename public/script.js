// public/script.js
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

let sessionId = null; // لتتبع كل session مع السيرفر

function appendMessage(text, sender) {
  const div = document.createElement("div");
  div.className = `message ${sender}`;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
  const message = userInput.value.trim();
  if (!message) return;
  appendMessage(message, "user");
  userInput.value = "";
  appendMessage("جاري الرد...", "ai");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId })
    });

    const data = await res.json();
    // إزالة "جاري الرد..."
    const last = chatBox.querySelector(".message.ai:last-child");
    if (last) last.remove();

    if (res.ok && data.reply) {
      appendMessage(data.reply, "ai");
      sessionId = data.sessionId; // تحديث sessionId
    } else {
      appendMessage(`خطأ: ${data.error || "لم يتم الحصول على رد"}`, "ai");
      console.error("[AI ERROR]", data);
    }
  } catch (err) {
    const last = chatBox.querySelector(".message.ai:last-child");
    if (last) last.remove();
    appendMessage("خطأ في الاتصال بالسيرفر", "ai");
    console.error("[Fetch ERROR]", err);
  }
}

sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});
