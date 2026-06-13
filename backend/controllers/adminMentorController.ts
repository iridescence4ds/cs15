import { Request, Response } from 'express';
import Mentor from '../models/Mentor.js';
import Project from '../models/Project.js';
import OnboardingAuditLog from '../models/OnboardingAuditLog.js';

// GET /admin/mentors
export const getMentors = async (req: Request, res: Response): Promise<void> => {
  try {
    const mentors = await Mentor.find({ status: { $ne: 'archived' } }).lean().sort({ name: 1 });
    
    const mentorsWithCounts = await Promise.all(mentors.map(async (m) => {
      const projectsAssigned = await Project.countDocuments({ mentor: m._id });
      return { ...m, projectsAssigned };
    }));

    res.status(200).json(mentorsWithCounts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching mentors', error });
  }
};

// GET /admin/mentors/all (includes archived)
export const getAllMentors = async (req: Request, res: Response): Promise<void> => {
  try {
    const mentors = await Mentor.find().lean().sort({ status: 1, name: 1 });
    
    const mentorsWithCounts = await Promise.all(mentors.map(async (m) => {
      const projectsAssigned = await Project.countDocuments({ mentor: m._id });
      return { ...m, projectsAssigned };
    }));

    res.status(200).json(mentorsWithCounts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching mentors', error });
  }
};

// POST /admin/mentors
export const createMentor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, designation, bio, profilePicture, officeHours, meetingLink } = req.body;

    if (!name || !email) {
      res.status(400).json({ message: 'name and email are required' });
      return;
    }

    const mentor = new Mentor({
      name, email, designation, bio, profilePicture, officeHours, meetingLink
    });
    await mentor.save();

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'mentor',
        entityId: mentor._id,
        action: 'create',
        newValue: { name, email, designation },
      });
    }

    res.status(201).json(mentor);
  } catch (error) {
    res.status(500).json({ message: 'Error creating mentor', error });
  }
};

// PUT /admin/mentors/:id
export const updateMentor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, designation, bio, profilePicture, officeHours, meetingLink, status } = req.body;

    const mentor = await Mentor.findById(id);
    if (!mentor) {
      res.status(404).json({ message: 'Mentor not found' });
      return;
    }

    const previousValue = { name: mentor.name, email: mentor.email, designation: mentor.designation };

    if (name !== undefined) mentor.name = name;
    if (email !== undefined) mentor.email = email;
    if (designation !== undefined) mentor.designation = designation;
    if (bio !== undefined) mentor.bio = bio;
    if (profilePicture !== undefined) mentor.profilePicture = profilePicture;
    if (officeHours !== undefined) mentor.officeHours = officeHours;
    if (meetingLink !== undefined) mentor.meetingLink = meetingLink;
    if (status !== undefined) mentor.status = status;

    await mentor.save();

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'mentor',
        entityId: mentor._id,
        action: 'update',
        previousValue,
        newValue: { name: mentor.name, email: mentor.email, designation: mentor.designation },
      });
    }

    res.status(200).json(mentor);
  } catch (error) {
    res.status(500).json({ message: 'Error updating mentor', error });
  }
};

// PUT /admin/mentors/:id/archive
export const archiveMentor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const mentor = await Mentor.findById(id);
    if (!mentor) {
      res.status(404).json({ message: 'Mentor not found' });
      return;
    }

    mentor.status = 'archived';
    await mentor.save();

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'mentor',
        entityId: mentor._id,
        action: 'archive',
        previousValue: { status: 'active' },
        newValue: { status: 'archived' },
      });
    }

    res.status(200).json({ message: 'Mentor archived', mentor });
  } catch (error) {
    res.status(500).json({ message: 'Error archiving mentor', error });
  }
};
