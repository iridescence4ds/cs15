import { Request, Response } from 'express';
import TimelineStep from '../models/TimelineStep.js';
import OnboardingAuditLog from '../models/OnboardingAuditLog.js';

// GET /admin/timeline-steps
export const getTimelineSteps = async (req: Request, res: Response): Promise<void> => {
  try {
    const steps = await TimelineStep.find().sort({ order: 1 });
    res.status(200).json(steps);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching timeline steps', error });
  }
};

// POST /admin/timeline-steps
export const createTimelineStep = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title, description, icon, isMandatory, isLocked, status,
      dependencies, completionType, estimatedTime, rewards, mentorNotes,
      resources, checklistItems
    } = req.body;

    if (!title) {
      res.status(400).json({ message: 'title is required' });
      return;
    }

    // Auto-assign order as last position
    const maxOrder = await TimelineStep.findOne().sort({ order: -1 }).select('order');
    const order = (maxOrder?.order ?? -1) + 1;

    const step = new TimelineStep({
      title, description, icon, order, isMandatory, isLocked, status,
      dependencies, completionType, estimatedTime, rewards, mentorNotes,
      resources: resources || [], checklistItems: checklistItems || []
    });
    await step.save();

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'timeline_step',
        entityId: step._id,
        action: 'create',
        newValue: { title, order },
      });
    }

    res.status(201).json(step);
  } catch (error) {
    res.status(500).json({ message: 'Error creating timeline step', error });
  }
};

// PUT /admin/timeline-steps/:id
export const updateTimelineStep = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      title, description, icon, isMandatory, isLocked, status,
      dependencies, completionType, estimatedTime, rewards, mentorNotes,
      resources, checklistItems
    } = req.body;

    const step = await TimelineStep.findById(id);
    if (!step) {
      res.status(404).json({ message: 'Timeline step not found' });
      return;
    }

    const previousValue = { title: step.title, description: step.description };

    if (title !== undefined) step.title = title;
    if (description !== undefined) step.description = description;
    if (icon !== undefined) step.icon = icon;
    if (isMandatory !== undefined) step.isMandatory = isMandatory;
    if (isLocked !== undefined) step.isLocked = isLocked;
    if (status !== undefined) step.status = status;
    if (dependencies !== undefined) step.dependencies = dependencies;
    if (completionType !== undefined) step.completionType = completionType;
    if (estimatedTime !== undefined) step.estimatedTime = estimatedTime;
    if (rewards !== undefined) step.rewards = rewards;
    if (mentorNotes !== undefined) step.mentorNotes = mentorNotes;
    if (resources !== undefined) step.resources = resources;
    if (checklistItems !== undefined) step.checklistItems = checklistItems;

    await step.save();

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'timeline_step',
        entityId: step._id,
        action: 'update',
        previousValue,
        newValue: { title: step.title, description: step.description },
      });
    }

    res.status(200).json(step);
  } catch (error) {
    res.status(500).json({ message: 'Error updating timeline step', error });
  }
};

// DELETE /admin/timeline-steps/:id
export const deleteTimelineStep = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const step = await TimelineStep.findById(id);
    if (!step) {
      res.status(404).json({ message: 'Timeline step not found' });
      return;
    }

    const deletedTitle = step.title;
    await TimelineStep.deleteOne({ _id: id });

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'timeline_step',
        entityId: id,
        action: 'delete',
        previousValue: { title: deletedTitle },
      });
    }

    res.status(200).json({ message: 'Timeline step deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting timeline step', error });
  }
};

// PUT /admin/timeline-steps/reorder
export const reorderTimelineSteps = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      res.status(400).json({ message: 'orderedIds array is required' });
      return;
    }

    // Bulk update order for each step
    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } },
      },
    }));

    await TimelineStep.bulkWrite(bulkOps);

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'timeline_step',
        entityId: orderedIds[0], // log first step as entity
        action: 'reorder',
        newValue: { orderedIds },
      });
    }

    res.status(200).json({ message: 'Timeline steps reordered' });
  } catch (error) {
    res.status(500).json({ message: 'Error reordering timeline steps', error });
  }
};

// GET /admin/onboarding-audit-log
export const getAuditLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { entityType, limit = 50 } = req.query;
    const filter: any = {};
    if (entityType) filter.entityType = entityType;

    const logs = await OnboardingAuditLog
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .populate('changedBy', 'name email');

    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit log', error });
  }
};
