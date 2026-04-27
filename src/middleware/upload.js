import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads/products');

fs.mkdirSync(uploadsDir, { recursive: true });

// Image optimization function
const optimizeImage = async (inputPath) => {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Determine output format - prefer WebP for better compression
    const outputFormat = 'webp';
    const quality = 85; // Good balance between quality and file size

    let pipeline = image;

    // Resize if image is too large (max 1200px width/height)
    const maxDimension = 1200;
    if (metadata.width > maxDimension || metadata.height > maxDimension) {
      pipeline = pipeline.resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // Convert and compress, overwrite original file
    if (outputFormat === 'webp') {
      await pipeline.webp({ quality }).toFile(`${inputPath}.temp`);
    } else {
      // Fallback to jpeg if needed
      await pipeline.jpeg({ quality }).toFile(`${inputPath}.temp`);
    }

    // Replace original file with optimized version
    fs.renameSync(`${inputPath}.temp`, inputPath);

    return true;
  } catch (error) {
    console.error('Image optimization error:', error);
    // If optimization fails, keep original file
    return false;
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const safeName = path
      .basename(file.originalname || 'image', extension)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    cb(null, `${Date.now()}-${safeName || 'image'}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
    return;
  }

  cb(new Error('Only image uploads are allowed.'));
};

// Create multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // Increased to 10MB to allow for large originals
    files: 10
  }
});

// Wrapper function that handles upload and optimization
export const productImageUpload = {
  single: (fieldName) => {
    return (req, res, next) => {
      const multerUpload = upload.single(fieldName);
      multerUpload(req, res, async (err) => {
        if (err) return next(err);

        if (req.file) {
          try {
            await optimizeImage(req.file.path);
          } catch (optimizeErr) {
            console.error('Failed to optimize single image:', optimizeErr);
            // Continue anyway
          }
        }

        next();
      });
    };
  },

  array: (fieldName, maxCount) => {
    return (req, res, next) => {
      const multerUpload = upload.array(fieldName, maxCount);
      multerUpload(req, res, async (err) => {
        if (err) return next(err);

        if (req.files && req.files.length > 0) {
          // Optimize all uploaded images
          const optimizePromises = req.files.map(async (file) => {
            try {
              await optimizeImage(file.path);
            } catch (optimizeErr) {
              console.error('Failed to optimize image:', optimizeErr);
              // Continue with other files
            }
          });

          await Promise.all(optimizePromises);
        }

        next();
      });
    };
  }
};
