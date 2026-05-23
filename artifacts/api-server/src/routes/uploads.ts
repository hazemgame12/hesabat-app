import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { adminAuth } from "../middleware/auth";

const router = Router();

const uploadsDir = path.resolve(process.env["UPLOADS_DIR"] ?? "./uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const hash = crypto.randomBytes(8).toString("hex");
    cb(null, `${Date.now()}-${hash}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|gif|svg\+xml)$/.test(file.mimetype);
    if (!ok) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
});

router.post("/admin/uploads", adminAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

export default router;
export { uploadsDir };
