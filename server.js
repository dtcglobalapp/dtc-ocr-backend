import express from "express";
import cors from "cors";
import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { extractTextFromFile } from "./services/ocr.service.js";

const app = express();
const PORT = process.env.PORT || 3001;

const upload = multer({
  dest: path.join(os.tmpdir(), "uploads"),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "dtc-ocr-backend"
  });
});

app.post("/extract-text", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }

    const result = await extractTextFromFile({
      filePath: req.file.path,
      originalName: req.file.originalname || "",
      mimeType: req.file.mimetype || ""
    });

    return res.json({
      success: true,
      text: result.text || ""
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "OCR failed"
    });
  } finally {
    if (req.file?.path) {
      await fs.rm(req.file.path, { force: true }).catch(() => {});
    }
  }
});

app.listen(PORT, () => {
  console.log("OCR server running on port " + PORT);
});
