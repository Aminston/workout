// ✅ Step 1: Import packages
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

// ✅ Step 2: Create the Express app
const app = express();
app.use(cors());

// ✅ Step 3: Configure PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'fedma',
  password: 'Skdf23js?',
  port: 5432,
});

// ✅ Step 4: Define the weekdays
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// ✅ Step 5: Define the route
app.get('/weekly-schedule', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM workouts');
    const categories = result.rows.map(row => row.category);

    if (categories.length < 5) {
      return res.status(400).json({ error: 'Not enough categories in the database.' });
    }

    const shuffled = categories.sort(() => 0.5 - Math.random()).slice(0, 5);

    const schedule = [];

    for (let i = 0; i < 5; i++) {
      const category = shuffled[i];
      const workoutsRes = await pool.query(
        'SELECT name FROM workouts WHERE category = $1 ORDER BY RANDOM() LIMIT 6',
        [category]
      );

      schedule.push({
        day: DAYS[i],
        category,
        workouts: workoutsRes.rows.map(row => row.name),
      });
    }

    res.json(schedule);
  } catch (error) {
    console.error('🔥 ERROR:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Step 6: Start the server
app.listen(3000, () => {
  console.log('✅ Server running at http://localhost:3000');
});


