const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
require('dotenv').config();

const app = express();
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
    let startDate, endDate;
    const today = new Date();

    if (metaRows.length === 0 || new Date(metaRows[0].end_date) < today) {
      await pool.query('UPDATE program_metadata SET status = 0 WHERE status = 1');

      const newStart = today;
      const newEnd = new Date();
      newEnd.setDate(newStart.getDate() + 7);

      await pool.query(
        'INSERT INTO program_metadata (start_date, end_date, status) VALUES (?, ?, 1)',
        [newStart.toISOString().split('T')[0], newEnd.toISOString().split('T')[0]]
      );

      startDate = newStart;
      endDate = newEnd;
    } else {
      startDate = new Date(metaRows[0].start_date);
      endDate = new Date(metaRows[0].end_date);
    }

    const schedule = [];

    for (const [day, { label, categories }] of Object.entries(WEEKLY_WORKOUT_PLAN)) {
      let combinedWorkouts = [];
      const itemsPerCategory = categories.length === 1 ? 6 : 3;

      for (const cat of categories) {
        const [results] = await pool.query(
          'SELECT name FROM workouts WHERE category = ? ORDER BY RAND() LIMIT ?',
          [cat, itemsPerCategory]
        );
        combinedWorkouts = combinedWorkouts.concat(results.map(row => row.name));
      }

      schedule.push({
        day,
        category: label,
        workouts: combinedWorkouts,
      });
    }

    res.json({
      program_start: startDate.toISOString().split('T')[0],
      expires_on: endDate.toISOString().split('T')[0],
      schedule,
    });
  } catch (error) {
    console.error('🔥 Weekly Schedule Error:', error.message);
    if (process.env.NODE_ENV === 'development') console.error(error.stack);

    res.status(500).json({
      error: 'Failed to generate weekly schedule. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = app;
