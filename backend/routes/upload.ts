import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getCloudinaryConfig, signUploadParams, isOurCloudinaryAsset } from '../utils/http/cloudinary.js';

const router = Router();

/**
 * GET /api/upload/sign
 *
 * Returns a signed Cloudinary upload token. The browser uses this to POST
 * an image file directly to Cloudinary's /image/upload endpoint. After
 * upload, the browser sends the resulting `secure_url` + `public_id` to
 * the appropriate model endpoint (e.g. /api/auth/profile for avatar,
 * /api/community for post attachments).
 *
 * The `folder` is locked to `yaksha/<userId>/<subfolder>` so different
 * users can't clobber each other's files. The actual `public_id` is set
 * client-side from a UUID we issue in the response.
 */
router.get('/sign', protect, async (req, res) => {
  try {
    const cfg = getCloudinaryConfig();
    const subfolder = String(req.query.subfolder ?? 'misc');
    if (!/^[a-z0-9_-]{1,32}$/i.test(subfolder)) {
      res.status(400).json({ message: 'subfolder must be alphanumeric, dash, or underscore (1-32 chars).' });
      return;
    }
    const userId = (req.user as { _id: { toString: () => string } })._id.toString();
    // The folder is server-controlled — the browser can't upload into a
    // sibling user's space.
    const folder = `${cfg.folder}/${userId}/${subfolder}`;
    const signed = signUploadParams(cfg, { folder });

    res.json({
      ...signed,
      // Some friendly defaults the browser can use to build the upload URL.
      uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
    });
  } catch (err) {
    // Surface the missing-config error clearly to the developer.
    const msg = (err as Error).message;
    if (msg.startsWith('Cloudinary is not configured')) {
      res.status(503).json({ message: msg });
      return;
    }
    res.status(500).json({ message: 'Failed to sign upload params.' });
  }
});

/**
 * GET /api/upload/config
 *
 * Public — returns just the cloud name + a default folder. The signature
 * still requires auth (see /sign), but the browser uses this to build
 * the upload URL on the client without hardcoding the cloud name.
 */
router.get('/config', (_req, res) => {
  try {
    const cfg = getCloudinaryConfig();
    res.json({
      cloudName: cfg.cloudName,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
      folder: cfg.folder,
    });
  } catch (err) {
    res.status(503).json({ message: (err as Error).message });
  }
});

/**
 * Lightweight validator: returns true if a given secure_url points at our
 * configured Cloudinary account. Use this server-side before saving a
 * URL onto a model — prevents the browser from slipping in a URL to a
 * different account.
 */
export function assertOurCloudinaryUrl(secureUrl: string): void {
  const cfg = getCloudinaryConfig();
  if (!isOurCloudinaryAsset(secureUrl, cfg.cloudName)) {
    throw new Error('URL is not a valid Cloudinary asset for this account.');
  }
}

export default router;
