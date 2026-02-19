// ================================================
// server.js — File Upload Only, Stream-first
//
// Upload : browser upload blob → /tmp → ffmpeg → stream → hapus
// Tidak ada yt-dlp, tidak ada YouTube download.
// Semua storage permanen ada di browser IndexedDB.
// ================================================
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express    from "express";
import cors       from "cors";
import { spawn }  from "child_process";
import fs         from "fs";
import path       from "path";
import os         from "os";
import { fileURLToPath } from "url";
import multer            from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://namaprojectkamu.vercel.app"
  ]
}));

app.use(express.json());

// ─── System temp dir ──────────────────────────────────────────────────────────
const SYS_TEMP = path.join(os.tmpdir(), "clipper-ai");
if (!fs.existsSync(SYS_TEMP)) fs.mkdirSync(SYS_TEMP, { recursive: true });

// ─── Multer — simpan upload browser ke SYS_TEMP ───────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SYS_TEMP),
    filename:    (_req, _file, cb) => {
      const ext = path.extname(_file.originalname) || ".mp4";
      cb(null, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // max 4 GB
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function secondsToFFmpeg(s) {
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(3);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(6, "0")}`;
}

function safeDelete(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); }
  catch (e) { console.warn("⚠️  Could not delete temp file:", filePath, e.message); }
}

// ─── GET /api/health ──────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({
    ok:      true,
    storage: "Stream-only — tidak ada file yang disimpan di folder project",
    tmpDir:  SYS_TEMP,
    mode:    "file-upload-only (no yt-dlp)",
  })
);

// ─── POST /api/get-video-duration ─────────────────────────────────────────────
// Menerima video upload, kembalikan durasi via ffprobe, lalu hapus file.
// Dipakai opsional; browser bisa baca duration langsung dari HTMLVideoElement.
app.post(
  "/api/get-video-duration",
  upload.single("video"),
  async (req, res) => {
    const uploadedPath = req.file?.path;
    if (!uploadedPath) return res.status(400).json({ error: "No file uploaded" });

    const ffprobe = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      uploadedPath,
    ]);

    let out = "";
    ffprobe.stdout.on("data", (d) => { out += d.toString(); });
    ffprobe.on("close", (code) => {
      safeDelete(uploadedPath);
      if (code !== 0) return res.status(500).json({ error: "ffprobe failed" });
      try {
        const info = JSON.parse(out);
        res.json({ duration: parseFloat(info.format?.duration ?? 0) });
      } catch {
        res.status(500).json({ error: "Failed to parse ffprobe output" });
      }
    });
  }
);

// ─── POST /api/export-clip ────────────────────────────────────────────────────
// Alur:
//   1. Browser upload video blob sebagai multipart/form-data (field: "video")
//   2. Terima edits sebagai JSON di field "editsJson"
//   3. ffmpeg proses → Fragmented MP4 ke stdout → stream ke browser
//   4. Hapus file upload dari SYS_TEMP
//   5. Browser terima blob → simpan di IndexedDB
app.post(
  "/api/export-clip",
  upload.single("video"),
  async (req, res) => {
    const uploadedPath = req.file?.path;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "Field 'video' tidak ditemukan dalam upload" });
      }

      const editsJson = req.body.editsJson;
      const clipJson  = req.body.clipJson;
      if (!editsJson || !clipJson) {
        return res.status(400).json({ error: "Field 'editsJson' dan 'clipJson' diperlukan" });
      }

      const edits = JSON.parse(editsJson);
      const clip  = JSON.parse(clipJson);

      const startSec    = clip.startTime;
      const durationSec = clip.endTime - clip.startTime;
      const filters     = buildFFmpegFilters(edits);
      const speed       = edits?.speed || 1;

      const ffmpegArgs = [
        "-y",
        "-ss", secondsToFFmpeg(startSec),
        "-i",  uploadedPath,
        "-t",  secondsToFFmpeg(durationSec),
        ...(filters.length ? ["-vf", filters.join(",")] : []),
        ...(speed !== 1    ? ["-af", `atempo=${Math.min(Math.max(speed, 0.5), 2)}`] : []),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "128k",
        "-f", "mp4",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "pipe:1",
      ];

      console.log(`🎬 Exporting clip via ffmpeg (streaming ke browser)…`);

      const ffmpeg = spawn("ffmpeg", ffmpegArgs);

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("X-File-Name", `clip_${Date.now()}.mp4`);
      res.setHeader("Access-Control-Expose-Headers", "X-File-Name");
      res.setHeader("Transfer-Encoding", "chunked");

      ffmpeg.stdout.pipe(res);

      let stderrBuf = "";
      ffmpeg.stderr.on("data", (d) => { stderrBuf += d.toString(); });

      ffmpeg.on("close", (code) => {
        safeDelete(uploadedPath);
        if (code !== 0) {
          console.error("[ffmpeg error]", stderrBuf.slice(-500));
          if (!res.headersSent) {
            res.status(500).json({ error: "ffmpeg failed", detail: stderrBuf.slice(-300) });
          } else {
            res.end();
          }
        } else {
          console.log(`✅ Export selesai, temp upload dihapus`);
        }
      });

      ffmpeg.on("error", (err) => {
        safeDelete(uploadedPath);
        console.error("[ffmpeg spawn error]", err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to start ffmpeg", detail: err.message });
        } else {
          res.end();
        }
      });

      res.on("close", () => {
        if (!ffmpeg.killed) ffmpeg.kill("SIGKILL");
        safeDelete(uploadedPath);
      });

    } catch (err) {
      safeDelete(uploadedPath);
      console.error("[export error]", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Export failed", detail: err.message });
      }
    }
  }
);

// ─── buildFFmpegFilters ───────────────────────────────────────────────────────
function buildFFmpegFilters(edits) {
  const filters = [];

  if (edits.aspectRatio && edits.aspectRatio !== "original") {
    const [rw, rh] = edits.aspectRatio.split(":").map(Number);
    const cropW = `if(gt(iw/ih\\,${rw}/${rh})\\,trunc(ih*${rw}/${rh}/2)*2\\,iw)`;
    const cropH = `if(gt(iw/ih\\,${rw}/${rh})\\,ih\\,trunc(iw*${rh}/${rw}/2)*2)`;
    filters.push(`crop=${cropW}:${cropH}:(iw-out_w)/2:(ih-out_h)/2`);
  }

  const eq = [];
  if (edits.brightness != null && edits.brightness !== 0) eq.push(`brightness=${edits.brightness}`);
  if (edits.contrast   != null && edits.contrast   !== 0) eq.push(`contrast=${(1 + edits.contrast).toFixed(4)}`);
  if (edits.saturation != null && edits.saturation !== 0) eq.push(`saturation=${(1 + edits.saturation).toFixed(4)}`);
  if (eq.length) filters.push(`eq=${eq.join(":")}`);

  if (edits.speed && edits.speed !== 1) {
    filters.push(`setpts=${(1 / edits.speed).toFixed(6)}*PTS`);
  }

  if (edits.textOverlays?.length) {
    for (const t of edits.textOverlays) {
      const color    = (t.color || "#FFFFFF").replace("#", "0x");
      const size     = t.fontSize || 36;
      const x        = t.x   != null ? `w*${t.x}` : "(w-text_w)/2";
      const y        = t.y   != null ? `h*${t.y}` : "h*0.85";
      const enable   = t.startSec != null && t.endSec != null
        ? `:enable='between(t,${t.startSec},${t.endSec})'` : "";
      const safeText = t.text
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/:/g, "\\:");
      filters.push(
        `drawtext=text='${safeText}':fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}${enable}`
      );
    }
  }

  return filters;
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 AI Clipper Backend → http://localhost:${PORT}`);
  console.log(`   Mode         : File Upload Only (no yt-dlp)`);
  console.log(`   OS Temp dir  : ${SYS_TEMP}`);
  console.log(`   Storage mode : Stream ke browser → IndexedDB\n`);
});