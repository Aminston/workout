// controllers/personalizeController.js
const pool    = require('../db');
const { OpenAI } = require('openai');
require('dotenv').config();

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY in .env');
  process.exit(1);
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.personalizePlan = async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId in body' });
  }

  try {
    // 1) profile
    const [userRows] = await pool.query(
      `SELECT birthday, height, height_unit, weight, weight_unit, background
         FROM user_profile WHERE id = ?`,
      [userId]
    );
    if (!userRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const profile = userRows[0];

    // 2) programId
    const [metaRows] = await pool.query(
      'SELECT id FROM program_metadata WHERE status = 1 LIMIT 1'
    );
    if (!metaRows.length) {
      return res.status(500).json({ error: 'No active program found' });
    }
    const programId = metaRows[0].id;

    // 3) cache check
    const [cached] = await pool.query(
      `SELECT day, workout_id, sets, reps, weight_value, weight_unit
         FROM user_program_schedule
        WHERE user_id = ? AND program_id = ?`,
      [userId, programId]
    );
    if (cached.length) {
      const personalized = cached.reduce((acc, row) => {
        acc[row.day] = acc[row.day] || [];
        acc[row.day].push({
          workout_id:   row.workout_id,
          sets:         row.sets,
          reps:         row.reps,
          weight_value: row.weight_value,
          weight_unit:  row.weight_unit
        });
        return acc;
      }, {});
      return res.json({ program_id: programId, personalized });
    }

    // 4) scheduleRows
    const [scheduleRows] = await pool.query(
      `SELECT ps.day, ps.workout_id, w.name AS workout, w.category, w.type
         FROM program_schedule ps
         JOIN workouts w ON ps.workout_id = w.id
        WHERE ps.program_id = ?`,
      [programId]
    );

    // 5) minimal prompt payload
    const birth = new Date(profile.birthday);
    const age   = Math.floor((Date.now() - birth) / (1000*60*60*24*365));

    const minimal = {
      profile: {
        age,
        height: profile.height,
        weight: profile.weight,
        background: profile.background
      },
      workouts: scheduleRows.map(r => ({
        id:       r.workout_id,
        name:     r.workout,
        category: r.category
      }))
    };

    const messages = [
      {
        role: 'system',
        content: `
You are a fitness coach.  
Given:
  • profile: { age, height, weight, background }  
  • workouts: array of { id, name, category }  
For each workout return EXACTLY valid JSON:
{
  "Monday": [
    { "id":1, "sets":3, "reps":12, "weight_value":50, "weight_unit":"kg", "distance_value":0, "distance_unit":"km" duration_value":0, "duration_unit":"min" }
    …
  ],
  "Tuesday": [ … ],
  …
}
Output **only** that JSON object, no extra text.`
      },
      { role: 'user', content: JSON.stringify(minimal) }
    ];

    // 6) call OpenAI with more tokens
    const completion = await openai.chat.completions.create({
      model:       'gpt-3.5-turbo',
      messages,
      temperature: 0.0,
      max_tokens:  2000
    });

    const text = completion.choices[0].message.content.trim();
    console.log(`📨 OpenAI raw response (${text.length} chars):\n`, text);

    // 7) try parse, with a simple fallback
    let personalized;
    try {
      personalized = JSON.parse(text);
    } catch (err) {
      console.warn('❗ JSON.parse failed:', err.message);
      // fallback: try to strip any trailing commas and ensure braces close
      let guess = text
        .replace(/,\s*]/g, ']')  // remove trailing commas before array close
        .replace(/,\s*}/g, '}'); // remove trailing commas before object close
      // ensure top‐level braces
      if (!guess.startsWith('{')) guess = `{${guess}`;
      if (!guess.endsWith('}'))   guess = `${guess}}`;

      try {
        personalized = JSON.parse(guess);
        console.log('✅ JSON.parse succeeded after cleanup');
      } catch (err2) {
        console.error('❌ Fallback parse also failed:', err2.message);
        return res.status(500).json({
          error: 'Invalid JSON from OpenAI',
          raw: text
        });
      }
    }

    // 8) persist
    for (const [day, exercises] of Object.entries(personalized)) {
      for (const ex of exercises) {
        const { id: workout_id, sets, reps, weight_value, weight_unit } = ex;
        try {
          await pool.query(
            `INSERT INTO user_program_schedule
               (user_id, program_id, day, workout_id, sets, reps, weight_value, weight_unit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, programId, day, workout_id, sets, reps, weight_value, weight_unit]
          );
        } catch (e) {
          console.error(`❌ DB insert failed for ${day} / workout ${workout_id}:`, e.message);
        }
      }
    }

    // 9) return
    res.json({ program_id: programId, personalized });

  } catch (err) {
    console.error('🔥 Personalization Error:', err.stack || err);
    res.status(500).json({
      error:   'Failed to personalize plan',
      details: err.message
    });
  }
};
