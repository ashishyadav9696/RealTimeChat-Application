const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary only if all required env vars are present and are not placeholder strings
const isConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_KEY !== 'your_api_key' &&
  process.env.CLOUDINARY_API_SECRET &&
  process.env.CLOUDINARY_API_SECRET !== 'your_api_secret'
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('☁️ Cloudinary configured successfully.');
} else {
  console.warn('⚠️ Cloudinary credentials missing or set to placeholder values. Falling back to local disk storage.');
}

/**
 * Uploads a local file to Cloudinary.
 * If Cloudinary is configured, it uploads the file, deletes the local file, and returns the secure URL.
 * If Cloudinary is NOT configured, it returns the local relative URL and keeps the file locally.
 * 
 * @param {string} localFilePath - Path to the local file (e.g. req.file.path)
 * @param {string} folder - Folder name in Cloudinary
 * @returns {Promise<string>} The file URL (Cloudinary URL or local relative URL)
 */
const uploadFile = async (localFilePath, folder = 'chatsphere') => {
  if (!localFilePath) return '';

  if (!isConfigured) {
    // Return relative URL for local serving (fallback)
    const filename = path.basename(localFilePath);
    return `/uploads/${filename}`;
  }

  try {
    const result = await cloudinary.uploader.upload(localFilePath, {
      folder: folder,
      resource_type: 'auto', // Detects image, video, raw files automatically
    });

    // Clean up local temp file after successful upload
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (err) {
      console.error('Error deleting local temp file after Cloudinary upload:', err);
    }

    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    // On error, fall back to returning local path (so file is still accessible)
    const filename = path.basename(localFilePath);
    return `/uploads/${filename}`;
  }
};

module.exports = {
  cloudinary,
  isCloudinaryConfigured: () => isConfigured,
  uploadFile,
};
