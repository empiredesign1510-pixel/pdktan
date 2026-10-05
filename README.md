# ReplyMuse — Context First

Versi ini **tidak memakai generator lokal / OCR palsu**. Balasan dibuat oleh model AI melalui backend.

## Kenapa versi ini lebih benar

- Screenshot dikirim langsung sebagai image input ke model vision.
- User wajib menentukan pesan terakhir yang ingin dibalas.
- Kalau memasukkan chat manual, setiap bubble ditandai eksplisit sebagai `Aku` atau `Dia`.
- API key disimpan di server, bukan di browser.
- Jika AI/backend belum tersambung, aplikasi menampilkan error dan **tidak mengarang fallback lokal**.
- Prompt melarang model mengklaim tahu perasaan orang lain atau memberi "persentase suka".

## Menjalankan

Butuh Node.js 20+.

1. Buka terminal di folder ini.
2. Jalankan:

   npm install

3. Copy `.env.example` menjadi `.env`.
4. Isi:

   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-6-luna
   PORT=3000

5. Jalankan:

   npm start

6. Buka:

   http://localhost:3000

## Alur penggunaan

### Screenshot
1. Pilih mode Screenshot.
2. Upload 1–6 screenshot.
3. Pastikan urutannya dari chat lama → chat baru. Gunakan tombol ↑ / ↓.
4. Pilih posisi bubble kamu (kanan/kiri).
5. Isi **pesan persis dari dia yang mau dibalas**.
6. Pilih tone/tujuan.
7. Generate.

### Manual
1. Pilih mode Tulis chat.
2. Isi bubble dan pilih setiap baris sebagai `Aku` atau `Dia`.
3. Isi **pesan target**.
4. Generate.

## Deployment

Project bisa di-host di layanan Node seperti Render/Railway/Fly/VPS. Simpan `OPENAI_API_KEY` sebagai environment variable di server. Jangan pernah memasukkan API key ke `public/app.js` atau `index.html`.

## Catatan

Model default di `.env.example` adalah `gpt-6-luna`. Kamu bisa menggantinya melalui `OPENAI_MODEL` tanpa mengubah frontend.
