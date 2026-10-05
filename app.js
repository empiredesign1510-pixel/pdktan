
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  mode: "screenshot",
  images: [],
  messages: []
};

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 1500);
}

function showError(message = "") {
  const el = $("#sideError");
  el.textContent = message;
  el.classList.toggle("show", Boolean(message));
}

async function health() {
  try {
    const r = await fetch("/api/health");
    const data = await r.json();
    $("#apiState").classList.toggle("ok", data.configured);
    $("#apiState").classList.toggle("bad", !data.configured);
    $("#apiText").textContent = data.configured ? `AI aktif · ${data.model}` : "API key belum disetel";
  } catch {
    $("#apiState").classList.add("bad");
    $("#apiText").textContent = "backend tidak aktif";
  }
}
health();

$$(".mode").forEach(btn => {
  btn.addEventListener("click", () => {
    state.mode = btn.dataset.mode;
    $$(".mode").forEach(x => x.classList.toggle("active", x === btn));
    $$(".input-pane").forEach(x => x.classList.remove("active"));
    $("#pane-" + state.mode).classList.add("active");
  });
});

$("#boldness").addEventListener("input", e => {
  $("#boldValue").textContent = e.target.value;
});

const input = $("#imageInput");
const drop = $("#dropZone");

input.addEventListener("change", e => readFiles([...e.target.files]));
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("drag"); });
drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
drop.addEventListener("drop", e => {
  e.preventDefault();
  drop.classList.remove("drag");
  readFiles([...e.dataTransfer.files].filter(f => f.type.startsWith("image/")));
});

function readFiles(files) {
  const allowed = files.filter(f => f.type.startsWith("image/")).slice(0, Math.max(0, 6 - state.images.length));
  allowed.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      state.images.push({ name: file.name, dataUrl: reader.result });
      renderImages();
    };
    reader.readAsDataURL(file);
  });
}

function moveImage(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= state.images.length) return;
  [state.images[index], state.images[next]] = [state.images[next], state.images[index]];
  renderImages();
}

function renderImages() {
  const box = $("#shots");
  box.innerHTML = "";
  state.images.forEach((img, i) => {
    const el = document.createElement("div");
    el.className = "shot";
    el.innerHTML = `
      <img alt="${escapeHtml(img.name)}" src="${img.dataUrl}">
      <div class="shot-actions">
        <button type="button" title="Geser ke depan">↑</button>
        <button type="button" title="Geser ke belakang">↓</button>
        <button type="button" title="Hapus">×</button>
      </div>`;
    const [up, down, remove] = el.querySelectorAll("button");
    up.onclick = e => { e.preventDefault(); moveImage(i, -1); };
    down.onclick = e => { e.preventDefault(); moveImage(i, 1); };
    remove.onclick = e => {
      e.preventDefault();
      state.images.splice(i, 1);
      renderImages();
    };
    box.appendChild(el);
  });
}

function addMessage(role = "them", text = "") {
  state.messages.push({ id: crypto.randomUUID(), role, text });
  renderMessages();
}

function renderMessages() {
  const box = $("#chatBuilder");
  box.innerHTML = "";
  state.messages.forEach(msg => {
    const row = document.createElement("div");
    row.className = "msg-row";
    row.innerHTML = `
      <select>
        <option value="them" ${msg.role === "them" ? "selected" : ""}>Dia</option>
        <option value="me" ${msg.role === "me" ? "selected" : ""}>Aku</option>
      </select>
      <input type="text" placeholder="Isi bubble chat…" value="${escapeHtml(msg.text)}">
      <button type="button" class="remove">×</button>
    `;
    const select = row.querySelector("select");
    const text = row.querySelector("input");
    select.onchange = () => msg.role = select.value;
    text.oninput = () => msg.text = text.value;
    row.querySelector(".remove").onclick = () => {
      state.messages = state.messages.filter(x => x.id !== msg.id);
      renderMessages();
    };
    box.appendChild(row);
  });
}
$("#addMessage").onclick = () => addMessage("them", "");
addMessage("them", "");
addMessage("me", "");
addMessage("them", "");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast("Balasan tersalin ✨");
}

function renderResult(data) {
  $("#summary").textContent = data.summary || "";
  $("#toneRead").textContent = data.tone_read || "";
  $("#note").textContent = data.conversation_note || "";
  $("#targetShow").textContent = data.target_message || $("#targetMessage").value.trim();

  const box = $("#replies");
  box.innerHTML = "";
  for (const reply of data.replies || []) {
    const card = document.createElement("article");
    card.className = "reply";
    card.innerHTML = `
      <div class="tag">✦ ${escapeHtml(reply.label || "Opsi")}</div>
      <div class="text">${escapeHtml(reply.text || "")}</div>
      <div class="why">${escapeHtml(reply.why || "")}</div>
      ${reply.caution ? `<div class="caution">⚠ ${escapeHtml(reply.caution)}</div>` : ""}
      <button class="copy" type="button">Salin balasan</button>
    `;
    card.querySelector(".copy").onclick = () => copyText(reply.text || "");
    box.appendChild(card);
  }
}

$("#generate").addEventListener("click", async () => {
  showError("");

  const targetMessage = $("#targetMessage").value.trim();
  if (!targetMessage) {
    showError("Isi dulu pesan dari dia yang benar-benar mau kamu balas.");
    $("#targetMessage").focus();
    return;
  }

  const messages = state.messages
    .map(m => ({ role: m.role, text: m.text.trim() }))
    .filter(m => m.text);

  if (state.mode === "screenshot" && !state.images.length) {
    showError("Upload minimal satu screenshot percakapan.");
    return;
  }

  if (state.mode === "manual" && !messages.length) {
    showError("Tambahkan minimal satu bubble percakapan.");
    return;
  }

  const payload = {
    messages: state.mode === "manual" ? messages : [],
    images: state.mode === "screenshot" ? state.images.map(x => x.dataUrl) : [],
    targetMessage,
    perspective: $("#perspective").value,
    relationshipStage: $("#stage").value,
    tone: $("#tone").value,
    goal: $("#goal").value,
    boldness: Number($("#boldness").value),
    extraContext: $("#extraContext").value.trim()
  };

  $("#emptyState").style.display = "none";
  $("#result").classList.remove("show");
  $("#loading").classList.add("show");
  $("#generate").disabled = true;

  try {
    const response = await fetch("/api/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    let data;
    try { data = await response.json(); }
    catch { throw new Error("Backend mengembalikan respons yang tidak valid."); }

    if (!response.ok) throw new Error(data.error || "Gagal membuat balasan.");

    renderResult(data);
    $("#result").classList.add("show");
  } catch (err) {
    showError(err.message || "Terjadi kesalahan.");
    $("#emptyState").style.display = "grid";
  } finally {
    $("#loading").classList.remove("show");
    $("#generate").disabled = false;
  }
});
