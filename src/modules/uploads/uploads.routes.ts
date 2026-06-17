import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ok } from '../../utils/http';
import { ApiError } from '../../utils/ApiError';
import { authRequired, requireRole } from '../../middleware/auth';

/**
 * Image uploads. Files are stored on disk under <cwd>/uploads and served
 * statically at /uploads/<file> (see app.ts). The API returns only the
 * relative path ("/uploads/abc.jpg"); clients prepend their own asset origin.
 */
export const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = /^image\/(jpeg|png|webp|gif|svg\+xml)$/;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.test(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, 'common.validation_failed'));
  },
});

const router = Router();

router.post(
  '/',
  authRequired,
  requireRole('admin'),
  upload.single('file'),
  (req, res) => {
    if (!req.file) throw ApiError.badRequest();
    return ok(res, { path: `/uploads/${req.file.filename}` }, 'common.ok', 201);
  }
);

export default router;
