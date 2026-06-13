import express from 'express';
import { 
  getProjects, 
  createProject, 
  updateProject, 
  deleteProject,
  getOrientations,
  uploadOrientation,
  deleteOrientation,
  getOrientationMetrics,
  updateOrientation,
  getOnboardingStatus,
  updateOnboardingStatus,
  getOnboardingAuditLogs
} from '../controllers/adminWelcomeController.js';
import { adminOnly } from '../middleware/admin.js';
import { protect } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Setup multer for local file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/orientations';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// All these routes require admin/moderator auth
router.use(protect);
router.use(adminOnly); // ensure this middleware exists or adjust based on actual codebase

// Projects
router.get('/projects', getProjects);
router.post('/projects', createProject);
router.put('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);

// Orientations
router.get('/orientations', getOrientations);
router.post('/orientations', upload.single('video'), uploadOrientation);
router.put('/orientations/:id', updateOrientation);
router.delete('/orientations/:id', deleteOrientation);
router.get('/orientations/metrics', getOrientationMetrics);

// Onboarding Tracking
router.get('/onboarding-status', getOnboardingStatus);
router.put('/onboarding-override/:userId', updateOnboardingStatus);
// Audit Logs
router.get('/audit-logs', getOnboardingAuditLogs);

export default router;
