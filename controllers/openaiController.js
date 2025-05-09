const pool = require('../db');
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function personalizePlan(req, res) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: token required' });
  }

  const connection = await pool.getConnection();
  try {
    const [[userProfile]] = await connection.query(
      `SELECT birthday, height, weight, background FROM user_profile WHERE id = ?`,
      [userId]
    );
    if (!userProfile) return res.status(404).json({ error: 'User profile not found' });

    const age = Math.floor((Date.now() - new Date(userProfile.birthday)) / (1000 * 60 * 60 * 24 * 365));

    const [[programMeta]] = await connection.query(
      `SELECT id FROM program_metadata WHERE status = 1 LIMIT 1`
    );
    if (!programMeta) return res.status(500).json({ error: 'No active program found' });

    const programId = programMeta.id;

    const [existing] = await connection.query(
      `SELECT 1 FROM user_program_schedule WHERE user_id = ? AND program_id = ? LIMIT 1`,
      [userId, programId]
    );
    if (existing.length) {
      return res.status(400).json({
        error: 'You already have a personalized workout plan. Please reset it before generating a new one.'
      });
    }

    const [rows] = await connection.query(
      `SELECT ps.day, ps.workout_id, w.name
       FROM program_schedule ps
       JOIN workouts w ON ps.workout_id = w.id
       WHERE ps.program_id = ?
       ORDER BY FIELD(ps.day, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), ps.id`,
      [programId]
    );

    const workoutIdToDay = new Map();
    const workoutList = [];

    for (const row of rows) {
      workoutIdToDay.set(row.workout_id, row.day);
      workoutList.push({ id: row.workout_id, name: row.name });
    }

    const promptInput = {
      profile: {
        age,
        height: userProfile.height,
        weight: userProfile.weight,
        background: userProfile.background
      },
      workouts: workoutList
    };

    const messages = [
      {
        role: 'system',
        content: `
You are a fitness coach.

You will receive:
- A user profile: { age, height, weight, background }
- A list of workouts: [{ id, name }]

Your task is to personalize each workout by returning:
- id (copied from input)
- sets (int)
- reps (int)
- weight_value (number; use 0 if exercise uses bodyweight)
- weight_unit ("kg" or "lb")

Return a flat JSON array. No nesting, no markdown, no explanations, no comments.
        `.trim()
      },
      {
        role: 'user',
        content: JSON.stringify(promptInput)
      }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0,
      max_tokens: 2048
    });

    const raw = completion.choices[0].message.content.trim();
    let enriched;
    try {
      enriched = JSON.parse(raw);
    } catch (err) {
      console.error('OpenAI JSON parse error:', raw);
      return res.status(500).json({ error: 'OpenAI returned invalid JSON' });
    }

    const values = [];

    for (const workout of enriched) {
      const { id, sets, reps, weight_value, weight_unit } = workout;
      const day = workoutIdToDay.get(id);
      if (!day) continue;

      if (
        typeof sets !== 'number' ||
        typeof reps !== 'number' ||
        typeof weight_value !== 'number' ||
        !['kg', 'lb'].includes(weight_unit)
      ) {
        return res.status(422).json({ error: `Invalid data format for workout id ${id}` });
      }

      values.push([
        userId,
        programId,
        day,
        id,
        sets,
        reps,
        weight_value,
        weight_unit
      ]);
    }

    if (values.length === 0) {
      return res.status(400).json({ error: 'No valid workout data returned by OpenAI' });
    }

    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO user_program_schedule
       (user_id, program_id, day, workout_id, sets, reps, weight_value, weight_unit)
       VALUES ?`,
      [values]
    );

    await connection.commit();
    res.json({ program_id: programId, personalized: enriched });

  } catch (err) {
    await connection.rollback();
    console.error('Personalization error:', err);
    res.status(500).json({ error: 'Failed to personalize plan', details: err.message });
  } finally {
    connection.release();
  }
}

async function resetPersonalizedPlan(req, res) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: token required' });
  }

  try {
    const [[meta]] = await pool.query(
      `SELECT id FROM program_metadata WHERE status = 1 LIMIT 1`
    );

    if (!meta) {
      return res.status(500).json({ error: 'No active program found' });
    }

    await pool.query(
      `DELETE FROM user_program_schedule WHERE user_id = ? AND program_id = ?`,
      [userId, meta.id]
    );

    res.json({ message: 'Your personalized workout plan has been reset.' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Failed to reset workout plan', details: err.message });
  }
}

module.exports = {
  personalizePlan,
  resetPersonalizedPlan
};