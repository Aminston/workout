// src/controllers/scheduleController.js

import pool from '../db.js';
import { MODIFICATION_TYPE } from '../constants/enums.js';
import { validateWorkoutModificationInput } from '../utils/validation.js';

export const WEEKLY_WORKOUT_PLAN = {
  Monday:    { label: 'Chest & Triceps',   categories: ['Chest', 'Arms']      },
  Tuesday:   { label: 'Back & Biceps',     categories: ['Back', 'Arms']       },
  Wednesday: { label: 'Legs & Shoulders',  categories: ['Legs', 'Shoulders']  },
  Thursday:  { label: 'Core & Functional', categories: ['Core', 'Cardio']     },
  Friday:    { label: 'Full-Body',         categories: ['Full Body']          },
};

export async function getWeeklySchedule(req, res) {
  const userId = req.user?.userId || null;
  const today = new Date();
  let userName = null;

  try {
    const [metaRows] = await pool.query(
      'SELECT * FROM program_metadata WHERE status = 1 LIMIT 1'
    );

    let programId, startDate, endDate;

    if (!metaRows.length || new Date(metaRows[0].end_date) < today) {
      await pool.query('UPDATE program_metadata SET status = 0 WHERE status = 1');
      startDate = today;
      endDate = new Date(today);
      endDate.setDate(today.getDate() + 7);

      const [ins] = await pool.query(
        'INSERT INTO program_metadata (start_date, end_date, status) VALUES (?, ?, 1)',
        [
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0]
        ]
      );
      programId = ins.insertId;

      for (const [day, { categories }] of Object.entries(WEEKLY_WORKOUT_PLAN)) {
        const isSpecial = ['Core', 'Cardio', 'Full Body']
          .some(c => categories.includes(c));

        for (const cat of categories) {
          let workoutIds = [];

          if (isSpecial) {
            const [ws] = await pool.query(
              'SELECT id FROM workouts WHERE category = ? ORDER BY RAND() LIMIT 6',
              [cat]
            );
            workoutIds = ws.map(w => w.id);
          } else {
            const [cps] = await pool.query(
              'SELECT id FROM workouts WHERE category = ? AND type="Compound" ORDER BY RAND() LIMIT 2',
              [cat]
            );
            const [acs] = await pool.query(
              'SELECT id FROM workouts WHERE category = ? AND type="Accessory" ORDER BY RAND() LIMIT 2',
              [cat]
            );
            workoutIds = [...cps, ...acs].map(w => w.id);
          }

          for (const wid of workoutIds) {
            await pool.query(
              'INSERT INTO program_schedule (program_id, day, workout_id) VALUES (?, ?, ?)',
              [programId, day, wid]
            );
          }
        }
      }
    } else {
      programId = metaRows[0].id;
      startDate = new Date(metaRows[0].start_date);
      endDate = new Date(metaRows[0].end_date);
    }

    const overrideRows = [];
    if (userId) {
      const [ur] = await pool.query(
        `SELECT
           ups.day,
           ups.workout_id,
           ups.sets,
           ups.reps,
           ups.weight_value,
           ups.sets_modified,
           ups.reps_modified,
           ups.weight_modified,
           ups.weight_unit,
           ups.is_modified,
           w.name     AS workout,
           w.category,
           w.type
         FROM user_program_schedule ups
         JOIN workouts w ON ups.workout_id = w.id
         WHERE ups.user_id = ? AND ups.program_id = ?`,
        [userId, programId]
      );
      overrideRows.push(...ur);

      const [userRows] = await pool.query(
        'SELECT name FROM user_profile WHERE id = ?',
        [userId]
      );
      if (userRows.length) userName = userRows[0].name;
    }

    const [defaultRows] = await pool.query(
      `SELECT
         ps.day,
         ps.workout_id,
         w.name     AS workout,
         w.category,
         w.type
       FROM program_schedule ps
       JOIN workouts w ON ps.workout_id = w.id
       WHERE ps.program_id = ?`,
      [programId]
    );

    const overrideMap = new Map();
    for (const row of overrideRows) {
      overrideMap.set(`${row.day}-${row.workout_id}`, row);
    }

    const schedule = Object.entries(WEEKLY_WORKOUT_PLAN).map(([day, { label }]) => {
      const dayRows = defaultRows
        .filter(r => r.day === day)
        .sort((a, b) => {
          if (a.type === 'Compound' && b.type !== 'Compound') return -1;
          if (b.type === 'Compound' && a.type !== 'Compound') return 1;
          return 0;
        });

      return {
        day,
        category: label,
        workouts: dayRows.map(r => {
          const key = `${r.day}-${r.workout_id}`;
          const ov = overrideMap.get(key);
          const isModified = ov?.is_modified === 1;

          return {
            workout_id: r.workout_id,
            name:     r.workout,
            category: r.category,
            type:     r.type,
            sets:     ov ? (isModified ? ov.sets_modified : ov.sets) : null,
            reps:     ov ? (isModified ? ov.reps_modified : ov.reps) : null,
            weight:   ov ? {
              value: isModified ? ov.weight_modified : ov.weight_value,
              unit: ov.weight_unit
            } : null,
            is_modified: isModified
          };
        })
      };
    });

    res.json({
      program_id:    programId,
      program_start: startDate.toISOString().split('T')[0],
      expires_on:    endDate.toISOString().split('T')[0],
      user_name:     userName,
      schedule
    });
  } catch (err) {
    console.error('🔥 getWeeklySchedule Error:', err);
    res.status(500).json({
      error:   'Could not load schedule',
      details: err.message
    });
  }
}

function getModificationType(original, updated) {
  let increased = 0, reduced = 0;

  ['sets', 'reps', 'weight_value'].forEach(field => {
    const originalValue = original[field] || 0;
    const newValue = updated[field];

    if (typeof newValue === 'number') {
      if (newValue > originalValue) increased++;
      else if (newValue < originalValue) reduced++;
    }
  });

  if (increased && reduced) return MODIFICATION_TYPE.MIXED;
  if (increased) return MODIFICATION_TYPE.INCREASED;
  if (reduced) return MODIFICATION_TYPE.REDUCED;
  return MODIFICATION_TYPE.UNCHANGED;
}

export async function updateWorkoutModification(req, res) {
  const userId = req.user?.userId;

  console.log('\n===== PATCH /schedule/workout/update =====');
  console.log('[Authenticated userId]:', userId);
  console.log('[Request body]:', req.body);

  const {
    program_id,
    workout_id,
    day,
    sets,
    reps,
    weight_value,
    weight_unit
  } = req.body;

  const validation = validateWorkoutModificationInput(req.body);
  if (!validation.valid) {
    console.warn('[Validation Failed]:', validation.message);
    return res.status(400).json({ error: validation.message });
  }

  try {
    console.log('[Querying user_program_schedule with]:', {
      user_id: userId,
      program_id,
      workout_id,
      day
    });

    const [rows] = await pool.query(
      `SELECT sets, reps, weight_value, weight_unit 
       FROM user_program_schedule 
       WHERE user_id = ? AND program_id = ? AND workout_id = ? AND day = ?`,
      [userId, program_id, workout_id, day]
    );

    console.log('[Query result rows]:', rows);

    if (rows.length === 0) {
      console.warn('⚠️ No matching workout entry found in DB');
      return res.status(404).json({ error: 'Workout entry not found.' });
    }

    const original = rows[0];
    const updated = {
      sets: typeof sets === 'number' ? sets : original.sets,
      reps: typeof reps === 'number' ? reps : original.reps,
      weight_value: typeof weight_value === 'number' ? weight_value : original.weight_value
    };

    const modification_type = getModificationType(original, updated);
    const is_modified = modification_type !== MODIFICATION_TYPE.UNCHANGED ? 1 : 0;

    console.log('[Modification Type]:', modification_type, '| [is_modified]:', is_modified);

    if (!is_modified) {
      return res.status(400).json({ error: 'No changes detected in sets, reps, or weight.' });
    }

    await pool.query(
      `UPDATE user_program_schedule SET
         sets_modified = ?, reps_modified = ?, weight_modified = ?,
         weight_unit = ?, modification_type = ?, is_modified = 1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND program_id = ? AND workout_id = ? AND day = ?`,
      [
        updated.sets,
        updated.reps,
        updated.weight_value,
        typeof weight_unit === 'string' ? weight_unit : original.weight_unit,
        modification_type,
        userId,
        program_id,
        workout_id,
        day
      ]
    );

    console.log('✅ Workout updated successfully');
    return res.status(200).json({
      success: true,
      modification_type,
      is_modified: 1,
      sets_modified: updated.sets,
      reps_modified: updated.reps,
      weight_modified: updated.weight_value,
      weight_unit: typeof weight_unit === 'string' ? weight_unit : original.weight_unit
    });
  } catch (err) {
    console.error('🔥 Error updating workout modification:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}



export async function resetWorkoutModification(req, res) {
  const userId = req.user?.userId;
  const { program_id, workout_id, day } = req.body;

  if (!program_id || !workout_id || !day) {
    return res.status(400).json({
      error: 'Missing required fields: program_id, workout_id, or day.'
    });
  }

  try {
    const [result] = await pool.query(
      `UPDATE user_program_schedule
       SET
         sets_modified = NULL,
         reps_modified = NULL,
         weight_modified = NULL,
         is_modified = 0,
         modification_type = 'unchanged',
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND program_id = ? AND workout_id = ? AND day = ?`,
      [userId, program_id, workout_id, day]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Workout entry not found or already reset.'
      });
    }

    const [originalRows] = await pool.query(
      `SELECT sets, reps, weight_value, weight_unit
       FROM user_program_schedule
       WHERE user_id = ? AND program_id = ? AND workout_id = ? AND day = ?`,
      [userId, program_id, workout_id, day]
    );

    console.log(`[resetWorkoutModification] Reset workout ${workout_id} for user ${userId} on ${day}`);

    return res.status(200).json({
      success: true,
      message: 'Workout reset to original values.',
      original: originalRows[0] || null
    });
  } catch (err) {
    console.error('Error resetting workout modification:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}
