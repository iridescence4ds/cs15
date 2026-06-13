import { Request, Response } from 'express';
import Project from '../models/Project.js';
import Orientation from '../models/Orientation.js';
import AiQuestion from '../models/AiQuestion.js';
import fs from 'fs';

// --- Projects Management ---

export const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const projects = await Project.find().populate('mentor').sort({ createdAt: -1 });
    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching projects', error });
  }
};

import Mentor from '../models/Mentor.js';
import OnboardingAuditLog from '../models/OnboardingAuditLog.js';

export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = { ...req.body };
    const project = new Project(payload);
    await project.save();

    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'project',
        entityId: project._id,
        action: 'create',
        newValue: { projectName: project.projectName },
      });
    }

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error creating project', error });
  }
};

export const updateProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const payload = { ...req.body };

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const previousValue = { projectName: project.projectName, status: project.status, order: project.order };
    
    Object.assign(project, payload);
    await project.save();

    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'project',
        entityId: project._id,
        action: 'update',
        previousValue,
        newValue: { projectName: project.projectName, status: project.status, order: project.order },
      });
    }

    res.status(200).json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error updating project', error });
  }
};

export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const project = await Project.findByIdAndDelete(id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting project', error });
  }
};

// --- Orientation Management ---

export const getOrientations = async (req: Request, res: Response): Promise<void> => {
  try {
    const orientations = await Orientation.find().sort({ createdAt: -1 });
    res.status(200).json(orientations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching orientations', error });
  }
};

export const uploadOrientation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, transcript: customTranscript } = req.body;
    let videoUrl = '';
    
    // Using multer, the file will be in req.file
    if (req.file) {
      videoUrl = `/uploads/orientations/${req.file.filename}`;
    }

    // Use provided transcript or fallback
    const transcript = customTranscript || `Welcome to the organization! This is the orientation video. 
Here is how the contribution process works: First, you find an issue to work on. 
Then, you fork the repository and make your changes. 
After that, you submit a pull request. 
Pull requests are reviewed by the core maintainers. 
During onboarding, you are expected to read the guidelines and complete your first task.
If you need help, please ask in the #help channel on our community platform.`;

    const orientation = new Orientation({
      title,
      description,
      videoUrl,
      transcript
    });

    await orientation.save();
    res.status(201).json(orientation);
  } catch (error) {
    res.status(500).json({ message: 'Error uploading orientation', error });
  }
};

export const deleteOrientation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const orientation = await Orientation.findByIdAndDelete(id);
    if (!orientation) {
      res.status(404).json({ message: 'Orientation not found' });
      return;
    }

    // Attempt to delete the file if it exists locally
    if (orientation.videoUrl && orientation.videoUrl.startsWith('/uploads/')) {
      const filePath = `.${orientation.videoUrl}`;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(200).json({ message: 'Orientation deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting orientation', error });
  }
};

export const updateOrientation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { transcript, title, description } = req.body;
    
    const updateData: any = {};
    if (transcript !== undefined) updateData.transcript = transcript;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;

    const orientation = await Orientation.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!orientation) {
      res.status(404).json({ message: 'Orientation not found' });
      return;
    }

    res.status(200).json(orientation);
  } catch (error) {
    res.status(500).json({ message: 'Error updating orientation', error });
  }
};

export const getOrientationMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    // Basic metrics for AI questions
    const totalQuestions = await AiQuestion.countDocuments();
    
    res.status(200).json({
      totalQuestions,
      // More metrics could be calculated here
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching metrics', error });
  }
};

export const getOnboardingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const User = (await import('../models/User.js')).default;
    const users = await User.find({ role: 'user' }, 'name email orientationCompleted projectAssigned mentorAssigned projectAssignedAt projectSelectionLocked').sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    res.status(500).json({ message: 'Error fetching onboarding status', error });
  }
};

export const updateOnboardingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { projectAssigned, mentorAssigned, projectSelectionLocked } = req.body;
    // @ts-ignore
    const adminId = req.user?._id;

    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const changes: any[] = [];
    
    if (projectAssigned !== undefined && user.projectAssigned !== projectAssigned) {
      changes.push({ field: 'projectAssigned', oldValue: user.projectAssigned, newValue: projectAssigned });
      user.projectAssigned = projectAssigned;
      user.projectAssignedBy = adminId ? adminId.toString() : 'admin';
    }
    if (mentorAssigned !== undefined && user.mentorAssigned !== mentorAssigned) {
      changes.push({ field: 'mentorAssigned', oldValue: user.mentorAssigned, newValue: mentorAssigned });
      user.mentorAssigned = mentorAssigned;
    }
    if (projectSelectionLocked !== undefined && user.projectSelectionLocked !== projectSelectionLocked) {
      changes.push({ field: 'projectSelectionLocked', oldValue: user.projectSelectionLocked, newValue: projectSelectionLocked });
      user.projectSelectionLocked = projectSelectionLocked;
    }

    if (changes.length > 0) {
      if (adminId) {
        const AdminLog = (await import('../models/AdminLog.js')).default;
        await AdminLog.create({
          adminId,
          action: 'onboarding_override',
          targetId: user._id,
          targetType: 'user',
          details: `Updated onboarding status for user ${user.name}`,
          changes
        });
      }

      // Also add to the new user audit log array
      for (const change of changes) {
        user.onboardingAuditLog.push({
          changedBy: adminId ? adminId.toString() : 'system',
          changedAt: new Date(),
          oldValue: change.oldValue,
          newValue: change.newValue
        });
      }
      
      await user.save();
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error updating onboarding status:', error);
    res.status(500).json({ message: 'Error updating onboarding status', error });
  }
};

export const getOnboardingAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await OnboardingAuditLog.find()
      .populate('changedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit logs', error });
  }
};
