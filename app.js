// ✅ Step 1: Import packages
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
require('dotenv').config();



// ✅ Step 2: Create the Express app
const app = express();
app.use(cors());

// ✅ Step 3: Configure PostgreSQL connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  }).promise();
  

// ✅ Constants
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// ✅ Route: GET /weekly-schedule
app.get('/weekly-schedule', async (req, res) => {
  try {
    // 🎯 Get distinct categories from workouts
    const [result] = await pool.query('SELECT DISTINCT category FROM workouts');
    const categories = result.map(row => row.category);

    // 🚨 Ensure we have enough categories to assign one per day
    if (categories.length < 5) {
      return res.status(400).json({ error: 'Not enough categories in the database.' });
    }

    // 🔀 Shuffle and pick 5 categories
    const shuffled = categories.sort(() => 0.5 - Math.random()).slice(0, 5);

    const schedule = [];

    for (let i = 0; i < 5; i++) {
      const category = shuffled[i];

      // 🎲 Fetch 6 random workouts from this category
      const [workoutsRes] = await pool.query(
        'SELECT name FROM workouts WHERE category = ? ORDER BY RAND() LIMIT 6',
        [category]
      );

      schedule.push({
        day: DAYS[i],
        category,
        workouts: workoutsRes.map(row => row.name),
      });
    }

    // 📤 Send JSON response
    res.json(schedule);
  } catch (error) {
    console.error('🔥 ERROR:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Export the app for use in index.js
module.exports = app;