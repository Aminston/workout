// controllers/openaiController.js

const pool = require('../db');
const { OpenAI } = require('openai');
require('dotenv').config();

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.personalizePlan = async (req, res) => {
  const userId = req.userId;  // set by requireApiToken
  if (!userId) {
    return res.status(401).json({ error: 'API token required' });
  }

  try {
    // 1) Load user profile
    const [userRows] = await pool.query(
      `SELECT birthday, height, height_unit, weight, weight_unit, background
         FROM user_profile WHERE id = ?`,
      [userId]
    );
    if (!userRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const profile = userRows[0];

    // 2) Get active program
    const [metaRows] = await pool.query(
      `SELECT id FROM program_metadata WHERE status = 1 LIMIT 1`
    );
    if (!metaRows.length) {
      return res.status(500).json({ error: 'No active program found' });
    }
    const programId = metaRows[0].id;

    // 3) Return cached schedule if it exists
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
          id:           row.workout_id,
          sets:         row.sets,
          reps:         row.reps,
          weight_value: row.weight_value,
          weight_unit:  row.weight_unit
        });
        return acc;
      }, {});
      return res.json({ program_id: programId, personalized });
    }

    // 4) Fetch base schedule
    const [scheduleRows] = await pool.query(
      `SELECT ps.day, ps.workout_id, w.name AS workout, w.category
         FROM program_schedule ps
         JOIN workouts w ON ps.workout_id = w.id
        WHERE ps.program_id = ?`,
      [programId]
    );

    // 5) Build the minimal prompt payload
    const birth = new Date(profile.birthday);
    const age = Math.floor((Date.now() - birth) / (1000 * 60 * 60 * 24 * 365));
    const minimal = {
      profile: {
        age,
        height:     profile.height,
        weight:     profile.weight,
        background: profile.background
      },
      workouts: scheduleRows.map(r => ({
        id:       r.workout_id,
        name:     r.workout,
        category: r.category
      }))
    };

    // 6) Prepare OpenAI messages with strict JSON-only spec
    const messages = [
      {
        role: 'system',
        content: `
You are a fitness coach.
Given:
  - profile: { age, height, weight, background }
  - workouts: array of { id, name, category }

Produce only valid JSON (no markdown, no explanation).
Do NOT include any property other than:
  - id           (number)
  - sets         (number)
  - reps         (number)
  - weight_value (number)
  - weight_unit  (string; "kg" or "lb")

Your output must be a single object with keys for each weekday (Monday…Sunday), each mapping to an array of exercises.

Example:
\`\`\`json
{
  "Monday": [
    {
      "id": 1,
      "sets": 3,
      "reps": 12,
      "weight_value": 50,
      "weight_unit": "kg"
    }
  ],
  "Tuesday": [],
  "Wednesday": [],
  "Thursday": [],
  "Friday": [],
  "Saturday": [],
  "Sunday": []
}
\`\`\`
`
      },
      { role: 'user', content: JSON.stringify(minimal) }
    ];

    // 7) Call OpenAI
    const completion = await openai.chat.completions.create({
      model:       'gpt-3.5-turbo',
      messages,
      temperature: 0.0,
      max_tokens:  2000
    });
    const text = completion.choices[0].message.content.trim();

    // 8) Parse JSON (with fallback cleanup)
    let personalized;
    try {
      personalized = JSON.parse(text);
    } catch {
      let guess = text
        .replace(/,\s*]/g, ']')
        .replace(/,\s*}/g, '}');
      if (!guess.startsWith('{')) guess = `{${guess}`;
      if (!guess.endsWith('}'))   guess = `${guess}}`;
      personalized = JSON.parse(guess);
    }

    // 9) Persist overrides
    for (const [day, exercises] of Object.entries(personalized)) {
      for (const ex of exercises) {
        const { id: workout_id, sets, reps, weight_value, weight_unit } = ex;
        await pool.query(
          `INSERT INTO user_program_schedule
             (user_id, program_id, day, workout_id, sets, reps, weight_value, weight_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, programId, day, workout_id, sets, reps, weight_value, weight_unit]
        ).catch(e => console.error(`Insert failed for ${day}/${workout_id}:`, e.message));
      }
    }

    // 10) Respond
    res.json({ program_id: programId, personalized });

  } catch (err) {
    console.error('Personalization Error:', err);
    res.status(500).json({ error: 'Failed to personalize plan', details: err.message });
  }
};
