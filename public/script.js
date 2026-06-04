const chatBox = document.getElementById("chatBox");
const input = document.getElementById("input");

function addMessage(text, type) {
  const div = document.createElement("div");
  div.classList.add("msg", type);
  div.innerText = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
  const message = input.value.trim();
  if (!message) return;

  // user message
  addMessage(message, "user");
  input.value = "";

  // loading bubble
  const loading = document.createElement("div");
  loading.classList.add("msg", "bot");
  loading.innerText = "typing...";
  chatBox.appendChild(loading);

  try {
    const res = await fetch("http://localhost:3000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    loading.remove();
    addMessage(data.reply, "bot");

  } catch (err) {
    loading.remove();
    addMessage("Error connecting to server", "bot");
  }
}

// Enter key support
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});