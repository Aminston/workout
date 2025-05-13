// src/controllers/scheduleController.js

import pool from '../db.js';

export const WEEKLY_WORKOUT_PLAN = {
  Monday:    { label: 'Chest & Triceps',   categories: ['Chest', 'Arms']      },
  Tuesday:   { label: 'Back & Biceps',     categories: ['Back', 'Arms']       },
  Wednesday: { label: 'Legs & Shoulders',  categories: ['Legs', 'Shoulders']  },
  Thursday:  { label: 'Core & Functional', categories: ['Core', 'Cardio']     },
  Friday:    { label: 'Full-Body',         categories: ['Full Body']          },
};

/**
 * GET /api/schedule
 * Returns the current 7-day program (creating a new one if needed),
 * then merges any user-specific overrides.
 */
export async function getWeeklySchedule(req, res) {
  const userId = req.user?.userId || null;
  const today = new Date();
  let userName = null;

  try {
    // 1. Load or create active program
    const [metaRows] = await pool.query(
      'SELECT * FROM program_metadata WHERE status = 1 LIMIT 1'
    );

    let programId, startDate, endDate;

    if (!metaRows.length || new Date(metaRows[0].end_date) < today) {
      // expire old program
      await pool.query('UPDATE program_metadata SET status = 0 WHERE status = 1');

      // set up new window
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

      // populate schedule
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
      // reuse existing
      programId = metaRows[0].id;
      startDate = new Date(metaRows[0].start_date);
      endDate = new Date(metaRows[0].end_date);
    }

    // 2. Load user overrides if logged in
    const overrideRows = [];
    if (userId) {
      const [ur] = await pool.query(
        `SELECT
           ups.day,
           ups.workout_id,
           ups.sets,
           ups.reps,
           ups.weight_value,
           ups.weight_unit,
           w.name     AS workout,
           w.category,
           w.type
         FROM user_program_schedule ups
         JOIN workouts w ON ups.workout_id = w.id
         WHERE ups.user_id = ? AND ups.program_id = ?`,
        [userId, programId]
      );
      overrideRows.push(...ur);

      // fetch name
      const [userRows] = await pool.query(
        'SELECT name FROM user_profile WHERE id = ?',
        [userId]
      );
      if (userRows.length) userName = userRows[0].name;
    }

    // 3. Load default schedule
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

    // 4. Map overrides for quick lookup
    const overrideMap = new Map();
    for (const row of overrideRows) {
      overrideMap.set(`${row.day}-${row.workout_id}`, row);
    }

    // 5. Assemble final by day
    const schedule = Object.entries(WEEKLY_WORKOUT_PLAN).map(([day, { label }]) => {
      // filter and sort
      const dayRows = defaultRows
        .filter(r => r.day === day)
        .sort((a, b) => {
          if (a.type === 'Compound' && b.type !== 'Compound') return -1;
          if (b.type === 'Compound' && a.type !== 'Compound') return  1;
          return 0;
        });

      return {
        day,
        category: label,
        workouts: dayRows.map(r => {
          const key = `${r.day}-${r.workout_id}`;
          const ov = overrideMap.get(key);
          return {
            name:     r.workout,
            category: r.category,
            type:     r.type,
            sets:     ov?.sets ?? null,
            reps:     ov?.reps ?? null,
            weight:   ov?.weight_value != null
                      ? { value: ov.weight_value, unit: ov.weight_unit }
                      : null
          };
        })
      };
    });

    // 6. Respond
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
