// controllers/scheduleController.js

const pool   = require('../db');
const crypto = require('crypto');

// 5-day plan definition (for default schedule)
const WEEKLY_WORKOUT_PLAN = {
  Monday:    { label: 'Chest & Triceps',  categories: ['Chest','Arms']    },
  Tuesday:   { label: 'Back & Biceps',    categories: ['Back','Arms']     },
  Wednesday: { label: 'Legs & Shoulders', categories: ['Legs','Shoulders']},
  Thursday:  { label: 'Core & Functional',categories: ['Core','Cardio']   },
  Friday:    { label: 'Full-Body',        categories: ['Full Body']       },
};

exports.getWeeklySchedule = async (req, res) => {
  // 1) Optional token → userId
  let userId = null;
  const token = req.headers['x-api-token'] || req.query.token;
  if (token) {
    try {
      const hash  = crypto.createHash('sha256').update(token).digest('hex');
      const [u]   = await pool.query(
        'SELECT id AS userId FROM user_profile WHERE api_token_hash = ?',
        [hash]
      );
      if (u.length) userId = u[0].userId;
    } catch {
      // ignore, proceed anonymously
    }
  }

  const today = new Date();
  try {
    // 2) Fetch/create program_metadata & seed program_schedule if needed
    const [metaRows] = await pool.query(
      'SELECT * FROM program_metadata WHERE status = 1 LIMIT 1'
    );

    let programId, startDate, endDate;
    if (!metaRows.length || new Date(metaRows[0].end_date) < today) {
      // expire old
      await pool.query('UPDATE program_metadata SET status = 0 WHERE status = 1');
      // create new 7-day window
      startDate = today;
      endDate   = new Date(today);
      endDate.setDate(today.getDate() + 7);

      const [ins] = await pool.query(
        'INSERT INTO program_metadata (start_date,end_date,status) VALUES (?,?,1)',
        [
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0]
        ]
      );
      programId = ins.insertId;

      // seed program_schedule
      for (const [day, { categories }] of Object.entries(WEEKLY_WORKOUT_PLAN)) {
        const isSpecial = ['Core','Cardio','Full Body'].some(c => categories.includes(c));
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
              'INSERT INTO program_schedule (program_id,day,workout_id) VALUES (?,?,?)',
              [programId, day, wid]
            );
          }
        }
      }

    } else {
      // reuse
      programId = metaRows[0].id;
      startDate = new Date(metaRows[0].start_date);
      endDate   = new Date(metaRows[0].end_date);
    }

    // 3) Load user overrides (if any)
    let overrideRows = [];
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
      overrideRows = ur;
    }

    // 4) Load default schedule
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

    // 5) Decide which to use
    const isOverride = overrideRows.length > 0;
    const rows       = isOverride ? overrideRows : defaultRows;

    // 6) Build the final schedule
    const schedule = Object.entries(WEEKLY_WORKOUT_PLAN).map(
      ([day, { label }]) => {
        // for overrides: include every workout for that day
        // for defaults: categories were already seeded to match the plan
        const dayRows = rows.filter(r => r.day === day);

        // sort compounds first
        dayRows.sort((a, b) =>
          a.type === 'Compound' && b.type !== 'Compound' ? -1 :
          b.type === 'Compound' && a.type !== 'Compound' ?  1 : 0
        );

        return {
          day,
          category: label,
          workouts: dayRows.map(r => ({
            name:     r.workout,
            category: r.category,
            type:     r.type,
            sets:     r.sets   ?? null,
            reps:     r.reps   ?? null,
            weight:   r.weight_value != null
                      ? { value: r.weight_value, unit: r.weight_unit }
                      : null
          }))
        };
      }
    );

    // 7) Return
    res.json({
      program_id:    programId,
      program_start: startDate.toISOString().split('T')[0],
      expires_on:    endDate.toISOString().split('T')[0],
      schedule
    });

  } catch (error) {
    console.error('🔥 getWeeklySchedule Error:', error);
    res.status(500).json({
      error:   'Could not load personalized schedule.',
      details: error.message
    });
  }
};
