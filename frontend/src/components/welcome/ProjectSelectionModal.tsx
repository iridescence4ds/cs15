import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';

interface Project {
  projectName: string;
  mentorName: string;
  description: string;
  status: string;
  resources: string[];
  skills?: string[];
  capacity?: number;
  selectedCount?: number;
}

interface ProjectSelectionModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProjectSelectionModal({ isOpen, project, onClose, onSuccess }: ProjectSelectionModalProps) {
  const [confirming, setConfirming] = useState(false);

  const handleProceed = async () => {
    if (!project) return;
    setConfirming(true);
    try {
      await api.post('/welcome/select-project', { project: project.projectName });
      onSuccess();
    } catch (error) {
      console.error('Error selecting project', error);
      alert('Failed to select project. Please try again.');
      setConfirming(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && project && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-bg/80 backdrop-blur-md"
            onClick={confirming ? undefined : onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-[rgb(var(--bg-card-rgb))]/90 backdrop-blur-xl border border-border/50 rounded-3xl p-8 sm:p-12 shadow-2xl overflow-hidden text-center"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent pointer-events-none"></div>

            <div className="w-16 h-16 bg-accent/10 border border-accent/20 text-accent rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>

            <h3 className="text-2xl font-serif text-ink mb-2">Confirm Your Selection</h3>
            <p className="text-ink-soft mb-8 max-w-md mx-auto">
              You are about to officially join this track. This action will lock your assignment and assign your mentor.
            </p>

            <div className="bg-[rgb(var(--bg-primary-rgb))]/50 border border-border/20 rounded-2xl p-6 text-left mb-8 max-w-md mx-auto">
              <div className="flex flex-col gap-4">
                 <div>
                   <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider mb-1">Selected Project</div>
                   <div className="text-lg font-bold text-ink">{project.projectName}</div>
                 </div>
                 <div>
                   <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider mb-1">Assigned Mentor</div>
                   <div className="text-md font-medium text-ink">{project.mentorName}</div>
                 </div>
                 {project.capacity !== undefined && (
                   <div>
                     <div className="text-[10px] text-ink-faint uppercase font-bold tracking-wider mb-1">Seat Status</div>
                     <div className="text-md font-medium text-ink">
                       {project.selectedCount || 0} / {project.capacity} Seats Filled
                     </div>
                   </div>
                 )}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={onClose}
                disabled={confirming}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-medium text-ink-soft hover:bg-[rgb(var(--bg-primary-rgb))] hover:text-ink transition-colors disabled:opacity-50"
              >
                Go Back
              </button>
              <button 
                onClick={handleProceed}
                disabled={confirming}
                className="w-full sm:w-auto px-8 py-3 rounded-xl font-medium bg-accent text-[rgb(var(--bg-primary-rgb))] hover:bg-accent/90 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {confirming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[rgb(var(--bg-primary-rgb))] border-t-transparent rounded-full animate-spin"></div>
                    Confirming...
                  </>
                ) : (
                  'Proceed'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
