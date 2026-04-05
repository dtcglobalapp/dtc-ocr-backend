import fs from "fs/promises";
import path from "path";
import os from "os";
import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function extractTextFromFile({ filePath, originalName }) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === ".pdf") {
    return extractTextFromPdf(filePath);
  }

  return extractTextFromImage(filePath);
}

async function extractTextFromPdf(pdfPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-"));
  const imagePrefix = path.join(tempDir, "page");

  await execFileAsync("pdftoppm", ["-png", pdfPath, imagePrefix]);

  const files = await fs.readdir(tempDir);

  let text = "";

  for (const file of files) {
    if (!file.endsWith(".png")) continue;

    const full = path.join(tempDir, file);
    const result = await extractTextFromImage(full);
    text += result.text + "\n";
  }

  await fs.rm(tempDir, { recursive: true, force: true });

  return { text };
}

async function extractTextFromImage(imagePath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "img-"));
  const processed = path.join(tempDir, "img.png");
  const output = path.join(tempDir, "out");

  await sharp(imagePath)
    .grayscale()
    .normalize()
    .toFile(processed);

  await execFileAsync("tesseract", [
    processed,
    output,
    "-l",
    "eng"
  ]);

  const text = await fs.readFile(output + ".txt", "utf8");

  await fs.rm(tempDir, { recursive: true, force: true });

  return { text };
}
