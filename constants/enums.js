// src/constants/enums.js

/**
 * Available training goals for user profiles.
 */
export const TRAINING_GOALS = [
  { key: 'muscle_gain', label: 'Build Muscle' },
  { key: 'fat_loss', label: 'Lose Fat' },
  { key: 'tone_up', label: 'Tone Up' },
  { key: 'improve_strength', label: 'Build Strength' },
  { key: 'general_fitness', label: 'Improve Fitness' }
];

/**
 * Available experience levels for user profiles.
 */
export const EXPERIENCE_LEVELS = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'casual', label: 'Casual Lifter' },
  { key: 'consistent', label: 'Consistent Trainer' },
  { key: 'advanced', label: 'Advanced Lifter' }
];

/**
 * Areas to note for injury caution in user profiles.
 */
export const INJURY_AREAS = [
  { key: 'none', label: 'None' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'lower_back', label: 'Lower Back' },
  { key: 'knees', label: 'Knees' },
  { key: 'wrists', label: 'Wrists' },
  { key: 'elbows', label: 'Elbows' },
  { key: 'neck', label: 'Neck' },
  { key: 'ankles', label: 'Ankles' },
  { key: 'hips', label: 'Hips' }
];

export const MODIFICATION_TYPE = {
  UNCHANGED: 'unchanged',
  INCREASED: 'increased',
  REDUCED: 'reduced',
  MIXED: 'mixed'
};