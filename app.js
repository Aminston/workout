// app.js
require('dotenv').config();
const express             = require('express');
const cors                = require('cors');
const pool                = require('./db');               // your MySQL pool
const userProfileRoutes   = require('./routes/userProfile');
const personalizeRoutes   = require('./routes/personalize');

const app = express();
app.use(cors());
app.use(express.json());

// Mount them under /api
app.use('/api', userProfileRoutes);
app.use('/api', personalizeRoutes);

module.exports = app;

// → Your 5-day plan definition
const WEEKLY_WORKOUT_PLAN = {
  Monday:    { label: 'Chest & Triceps',     categories: ['Chest','Arms']},
  Tuesday:   { label: 'Back & Biceps',       categories: ['Back','Arms']},
  Wednesday: { label: 'Legs & Shoulders',    categories: ['Legs','Shoulders']},
  Thursday:  { label: 'Core & Functional',   categories: ['Core','Cardio']},
  Friday:    { label: 'Full-Body',           categories: ['Full Body']              },
};

app.get('/weekly-schedule', async (req, res) => {
  try {
    // 1) Fetch or create active program
    const [metaRows] = await pool.query(
      'SELECT * FROM program_metadata WHERE status = 1 LIMIT 1'
    );
    let programId, startDate, endDate;
    const today = new Date();

    if (metaRows.length === 0 || new Date(metaRows[0].end_date) < today) {
      // expire old
      await pool.query('UPDATE program_metadata SET status = 0 WHERE status = 1');

      // create new
      startDate = today;
      endDate   = new Date(today);
      endDate.setDate(today.getDate() + 7);

      const [insertResult] = await pool.query(
        'INSERT INTO program_metadata (start_date, end_date, status) VALUES (?, ?, 1)',
        [ startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0] ]
      );
      programId = insertResult.insertId;

      // 2) Populate program_schedule with workout_ids only
      for (const [day, { categories }] of Object.entries(WEEKLY_WORKOUT_PLAN)) {
        const isSpecial = categories.includes('Core')
                        || categories.includes('Cardio')
                        || categories.includes('Full Body');

        for (const cat of categories) {
          let workoutIds = [];

          if (isSpecial) {
            const [rows] = await pool.query(
              'SELECT id FROM workouts WHERE category = ? ORDER BY RAND() LIMIT 6',
              [cat]
            );
            workoutIds = rows.map(r => r.id);

          } else {
            const [cps] = await pool.query(
              'SELECT id FROM workouts WHERE category = ? AND type = "Compound" ORDER BY RAND() LIMIT 2',
              [cat]
            );
            const [acs] = await pool.query(
              'SELECT id FROM workouts WHERE category = ? AND type = "Accessory" ORDER BY RAND() LIMIT 2',
              [cat]
            );
            workoutIds = [...cps, ...acs].map(r => r.id);
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
      endDate   = new Date(metaRows[0].end_date);
    }

    // 3) Pull back with JOIN so client still sees names/types
    const [scheduleRows] = await pool.query(
      `SELECT ps.day,
              w.name     AS workout,
              w.category,
              w.type
       FROM program_schedule ps
       JOIN workouts w ON ps.workout_id = w.id
       WHERE ps.program_id = ?`,
      [programId]
    );

    // 4) Group & order per your original plan
    const schedule = Object.entries(WEEKLY_WORKOUT_PLAN).map(
      ([day, { label, categories }]) => {

      // flatten categories in order, compounds first
      const workouts = categories.flatMap(cat => {
        return scheduleRows
          .filter(r => r.day === day && r.category === cat)
          .sort((a, b) => {
            if (a.type === 'Compound' && b.type !== 'Compound') return -1;
            if (b.type === 'Compound' && a.type !== 'Compound') return  1;
            return 0;
          })
          .map(r => ({
            name:     r.workout,
            category: r.category,
            type:     r.type
          }));
      });

      return { day, category: label, workouts };
    });

    // 5) Send JSON
    res.json({
      program_id:    programId,
      program_start: startDate.toISOString().split('T')[0],
      expires_on:    endDate.toISOString().split('T')[0],
      schedule
    });

  } catch (error) {
    console.error('🔥 Weekly Schedule Error:', error);
    res.status(500).json({
      error:   'Failed to generate weekly schedule.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = app;
