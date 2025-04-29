// ✅ Corrected and Clean `/weekly-schedule` endpoint
const express = require('express');
const app = express();
const cors = require('cors');
const mysql = require('mysql2');
require('dotenv').config();

app.use(cors());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
}).promise();

const WEEKLY_WORKOUT_PLAN = {
  Monday: { label: 'Chest & Triceps', categories: ['Chest', 'Arms'] },
  Tuesday: { label: 'Back & Biceps', categories: ['Back', 'Arms'] },
  Wednesday: { label: 'Legs & Shoulders', categories: ['Legs', 'Shoulders'] },
  Thursday: { label: 'Core & Functional', categories: ['Core', 'Cardio'] },
  Friday: { label: 'Full-Body', categories: ['Full Body'] },
};

app.get('/weekly-schedule', async (req, res) => {
  try {
    const [metaRows] = await pool.query('SELECT * FROM program_metadata WHERE status = 1 LIMIT 1');
    let startDate, endDate, programId;
    const today = new Date();

    if (metaRows.length === 0 || new Date(metaRows[0].end_date) < today) {
      await pool.query('UPDATE program_metadata SET status = 0 WHERE status = 1');

      const newStart = today;
      const newEnd = new Date();
      newEnd.setDate(newStart.getDate() + 7);

      const [insertResult] = await pool.query(
        'INSERT INTO program_metadata (start_date, end_date, status) VALUES (?, ?, 1)',
        [newStart.toISOString().split('T')[0], newEnd.toISOString().split('T')[0]]
      );

      programId = insertResult.insertId;
      startDate = newStart;
      endDate = newEnd;

      for (const [day, { label, categories }] of Object.entries(WEEKLY_WORKOUT_PLAN)) {
        const isSpecialDay = categories.includes('Core') || categories.includes('Cardio') || categories.includes('Full Body');

        if (isSpecialDay) {
          for (const cat of categories) {
            const [results] = await pool.query(
              'SELECT name, type FROM workouts WHERE category = ? ORDER BY RAND() LIMIT 6',
              [cat]
            );

            for (const row of results) {
              await pool.query(
                'INSERT INTO program_schedule (program_id, day, category, workout, type) VALUES (?, ?, ?, ?, ?)',
                [programId, day, label, row.name, row.type]
              );
            }
          }
        } else {
          for (const cat of categories) {
            const [compoundExercises] = await pool.query(
              'SELECT name, type FROM workouts WHERE category = ? AND type = "Compound" ORDER BY RAND() LIMIT 2',
              [cat]
            );

            const [accessoryExercises] = await pool.query(
              'SELECT name, type FROM workouts WHERE category = ? AND type = "Accessory" ORDER BY RAND() LIMIT 2',
              [cat]
            );

            const allExercises = [...compoundExercises, ...accessoryExercises];

            for (const row of allExercises) {
              await pool.query(
                'INSERT INTO program_schedule (program_id, day, category, workout, type) VALUES (?, ?, ?, ?, ?)',
                [programId, day, label, row.name, row.type]
              );
            }
          }
        }
      }
    } else {
      programId = metaRows[0].id;
      startDate = new Date(metaRows[0].start_date);
      endDate = new Date(metaRows[0].end_date);
    }

    const [scheduleRows] = await pool.query(
      'SELECT day, category, workout, type FROM program_schedule WHERE program_id = ?',
      [programId]
    );

    const groupedSchedule = Object.entries(WEEKLY_WORKOUT_PLAN).map(([day]) => {
      const workouts = scheduleRows
        .filter(row => row.day === day)
        .sort((a, b) => {
          if (a.type === 'Compound' && b.type !== 'Compound') return -1;
          if (a.type !== 'Compound' && b.type === 'Compound') return 1;
          return 0;
        })
        .map(row => ({
          name: row.workout,
          category: row.category,
          type: row.type
        }));

      const category = scheduleRows.find(row => row.day === day)?.category || '';

      return { day, category, workouts };
    });

    res.json({
      program_id: programId,
      program_start: startDate.toISOString().split('T')[0],
      expires_on: endDate.toISOString().split('T')[0],
      schedule: groupedSchedule,
    });

  } catch (error) {
    console.error('🔥 Weekly Schedule Error:', error.message);
    if (process.env.NODE_ENV === 'development') console.error(error.stack);

    res.status(500).json({
      error: 'Failed to generate weekly schedule.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = app;
