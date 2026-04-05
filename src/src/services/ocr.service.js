import fs from "fs/promises";
import path from "path";
import os from "os";
import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function extractTextFromFile({ filePath, originalName = "", mimeType = "" }) {
  const ext = path.extname(originalName).toLowerCase();

  if (mimeType === "application/pdf" || ext === ".pdf") {
    return await extractTextFromPdf(filePath);
  }

  if (mimeType.startsWith("image/") || isImageExt(ext)) {
    return await extractTextFromImage(filePath);
  }

  throw new Error("Unsupported file type");
}

function isImageExt(ext) {
  return [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"].includes(ext);
}

async function extractTextFromPdf(pdfPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dtc-pdf-"));
  const textPath = path.join(tempDir, "native.txt");
  const imagePrefix = path.join(tempDir, "page");

  try {
    let nativeText = "";

    try {
      await execFileAsync("pdftotext", ["-layout", pdfPath, textPath]);
      nativeText = await fs.readFile(textPath, "utf8").catch(() => "");
      nativeText = cleanText(nativeText);
    } catch {
      nativeText = "";
    }

    if (nativeText.length >= 80) {
      return {
        text: nativeText
      };
    }

    await execFileAsync("pdftoppm", ["-png", "-r", "300", pdfPath, imagePrefix]);

    const files = (await fs.readdir(tempDir))
      .filter((file) => file.startsWith("page-") && file.endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!files.length) {
      throw new Error("PDF rasterization failed");
    }

    let fullText = "";

    for (const file of files) {
      const imagePath = path.join(tempDir, file);
      const result = await extractTextFromImage(imagePath);
      if (result?.text) {
        fullText += `${result.text}\n`;
      }
    }

    return {
      text: cleanText(fullText)
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractTextFromImage(imagePath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dtc-img-"));
  const processedImage = path.join(tempDir, "processed.png");
  const outputBase = path.join(tempDir, "ocr-output");

  try {
    await preprocessImage(imagePath, processedImage);

    await execFileAsync("tesseract", [
      processedImage,
      outputBase,
      "-l",
      "eng",
      "--psm",
      "6"
    ]);

    const rawText = await fs.readFile(`${outputBase}.txt`, "utf8");

    return {
      text: cleanText(rawText)
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function preprocessImage(inputPath, outputPath) {
  const metadata = await sharp(inputPath, { failOn: false }).metadata();

  let pipeline = sharp(inputPath, { failOn: false })
    .rotate()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize();

  if ((metadata.width || 0) < 1800) {
    pipeline = pipeline.resize({
      width: 1800,
      withoutEnlargement: false
    });
  }

  await pipeline
    .sharpen()
    .threshold(180)
    .png()
    .toFile(outputPath);
}

function cleanText(value = "") {
  return String(value)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+\n/g, "\n")
    .trim();
}
