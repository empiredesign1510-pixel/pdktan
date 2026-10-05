
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "28mb" }));
app.use(express.static(path.join(__dirname, "public")));

const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

  const chunks = [];
  for (const item of data.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonLoose(text) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
  }

  throw new Error("Model tidak mengembalikan JSON yang valid.");
}

function normalizeResult(obj, targetMessage) {
  const replies = Array.isArray(obj?.replies) ? obj.replies.slice(0, 5) : [];

  return {
    summary: String(obj?.summary || "Konteks sudah dibaca."),
    tone_read: String(obj?.tone_read || "Belum cukup konteks untuk membaca nada dengan pasti."),
    conversation_note: String(obj?.conversation_note || "Gunakan balasan yang paling sesuai dengan gaya bicaramu."),
    target_message: String(obj?.target_message || targetMessage || ""),
    replies: replies.map((r, i) => ({
      label: String(r?.label || `Opsi ${i + 1}`),
      text: String(r?.text || "").trim(),
      why: String(r?.why || "").trim(),
      caution: String(r?.caution || "").trim()
    })).filter(r => r.text)
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: MODEL
  });
});

app.post("/api/reply", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "OPENAI_API_KEY belum diatur di file .env."
      });
    }

    const {
      messages = [],
      images = [],
      targetMessage = "",
      perspective = "right",
      relationshipStage = "pdkt",
      tone = "natural",
      goal = "continue",
      boldness = 3,
      extraContext = ""
    } = req.body || {};

    const cleanedMessages = Array.isArray(messages)
      ? messages
          .filter(m => m && ["me", "them"].includes(m.role) && typeof m.text === "string" && m.text.trim())
          .slice(-30)
          .map(m => ({ role: m.role, text: m.text.trim() }))
      : [];

    const cleanedImages = Array.isArray(images)
      ? images
          .filter(x => typeof x === "string" && x.startsWith("data:image/"))
          .slice(0, 6)
      : [];

    if (!targetMessage.trim()) {
      return res.status(400).json({
        error: "Pesan terakhir yang mau dibalas wajib diisi supaya AI tidak menebak-nebak."
      });
    }

    if (!cleanedMessages.length && !cleanedImages.length) {
      return res.status(400).json({
        error: "Masukkan riwayat chat manual atau upload minimal satu screenshot."
      });
    }

    const transcript = cleanedMessages.length
      ? cleanedMessages.map((m, i) => `${i + 1}. ${m.role === "me" ? "AKU" : "DIA"}: ${m.text}`).join("\n")
      : "(Tidak ada transkrip manual. Gunakan screenshot sebagai konteks utama.)";

    const perspectiveText = {
      right: "Di screenshot, chat/bubble milik AKU biasanya berada di KANAN; chat DIA biasanya di KIRI.",
      left: "Di screenshot, chat/bubble milik AKU biasanya berada di KIRI; chat DIA biasanya di KANAN.",
      detect: "Posisi bubble tidak ditentukan. Jangan mengklaim identitas pengirim jika tidak cukup jelas; gunakan target message sebagai jangkar."
    }[perspective] || "";

    const prompt = `
Kamu adalah asisten penyusun balasan chat berbahasa Indonesia yang natural.

TUGAS:
Baca konteks percakapan yang diberikan. Tujuannya bukan memanipulasi atau menebak isi hati orang lain, melainkan membantu pengguna membuat balasan yang terdengar manusia, relevan, ringan, dan sesuai konteks.

ATURAN PENTING:
- TARGET PESAN YANG HARUS DIBALAS sudah diberikan eksplisit. Jangan mengganti target dengan pesan lain.
- Jangan mengarang kejadian, hobi, janji, atau fakta yang tidak ada di konteks.
- Jangan menyimpulkan "dia pasti suka", "dia tertarik X%", atau kepastian perasaan lain.
- Jika screenshot ambigu, gunakan hanya informasi yang benar-benar terbaca/masuk akal.
- Hindari bahasa terlalu puitis, template AI, atau gombalan cringe kecuali tone memang meminta gombal.
- Gunakan bahasa chat Indonesia yang natural. Boleh "wkwk", "hehe", emoji, atau slang secukupnya jika cocok dengan gaya percakapan.
- Jangan terlalu agresif. Boldness 1 sangat aman, 5 lebih berani tetapi tetap menghormati batasan.
- Untuk tone flirty/gombal, tetap buat opsi yang bisa dipakai manusia sungguhan.
- Balasan tidak perlu panjang. Utamakan 1–2 kalimat.
- Balasan harus menanggapi TARGET PESAN, bukan sekadar membuat topik baru.

KONTEKS TERSTRUKTUR:
${transcript}

TARGET PESAN DARI DIA YANG MAU DIBALAS:
"${targetMessage.trim()}"

KETERANGAN SCREENSHOT:
${perspectiveText}

PENGATURAN:
- Tahap hubungan: ${relationshipStage}
- Tone: ${tone}
- Tujuan: ${goal}
- Keberanian: ${boldness}/5
- Konteks tambahan pengguna: ${extraContext || "(tidak ada)"}

Keluarkan HANYA JSON valid tanpa markdown, dengan bentuk persis:
{
  "summary": "ringkasan konteks 1-2 kalimat",
  "tone_read": "bacaan nada percakapan yang hati-hati, tidak mengklaim isi hati",
  "conversation_note": "satu tips singkat soal arah balasan",
  "target_message": "salin target pesan",
  "replies": [
    {
      "label": "Natural",
      "text": "balasan siap kirim",
      "why": "kenapa nyambung dengan konteks",
      "caution": "catatan kecil jika perlu, atau string kosong"
    },
    {
      "label": "Playful",
      "text": "balasan siap kirim",
      "why": "kenapa nyambung dengan konteks",
      "caution": ""
    },
    {
      "label": "Flirty ringan",
      "text": "balasan siap kirim",
      "why": "kenapa nyambung dengan konteks",
      "caution": ""
    },
    {
      "label": "Paling aman",
      "text": "balasan siap kirim",
      "why": "kenapa nyambung dengan konteks",
      "caution": ""
    }
  ]
}`;

    const content = [
      { type: "input_text", text: prompt },
      ...cleanedImages.map(image_url => ({
        type: "input_image",
        image_url,
        detail: "high"
      }))
    ];

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content }],
        max_output_tokens: 1400
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error("OpenAI API error:", data);
      return res.status(apiResponse.status).json({
        error: data?.error?.message || "Gagal memanggil model AI."
      });
    }

    const outputText = extractOutputText(data);
    if (!outputText) throw new Error("Respons model kosong.");

    const parsed = parseJsonLoose(outputText);
    const result = normalizeResult(parsed, targetMessage.trim());

    if (!result.replies.length) {
      throw new Error("Model belum menghasilkan opsi balasan.");
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error?.message || "Terjadi kesalahan di server."
    });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`ReplyMuse aktif di http://localhost:${port}`);
});
