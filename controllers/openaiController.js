import pool from '../db.js';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /personalize/plan
 */
export async function personalizePlan(req, res) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: token required' });
  }

  const connection = await pool.getConnection();
  try {
    // 1. Fetch user profile
    const [[userProfile]] = await connection.query(
      `SELECT birthday, height, weight, background, training_goal, training_experience, injury_caution_area
       FROM user_profile WHERE id = ?`,
      [userId]
    );
    if (!userProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Calculate age
    const age = Math.floor(
      (Date.now() - new Date(userProfile.birthday)) /
      (1000 * 60 * 60 * 24 * 365)
    );

    // 2. Get active program
    const [[programMeta]] = await connection.query(
      `SELECT id FROM program_metadata WHERE status = 1 LIMIT 1`
    );
    if (!programMeta) {
      return res.status(500).json({ error: 'No active program found' });
    }
    const programId = programMeta.id;

    // Prevent duplicate
    const [existing] = await connection.query(
      `SELECT 1 FROM user_program_schedule WHERE user_id = ? AND program_id = ? LIMIT 1`,
      [userId, programId]
    );
    if (existing.length) {
      return res.status(400).json({
        error: 'You already have a personalized workout plan. Please reset it before generating a new one.'
      });
    }

    // 3. Load base workouts
    const [rows] = await connection.query(
      `SELECT ps.day, ps.workout_id AS id, w.name
       FROM program_schedule ps
       JOIN workouts w ON ps.workout_id = w.id
       WHERE ps.program_id = ?
       ORDER BY FIELD(ps.day, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), ps.id`,
      [programId]
    );

    // Deduplicate and map days
    const workoutMap = new Map();
    for (const { day, id, name } of rows) {
      if (!workoutMap.has(id)) workoutMap.set(id, { name, days: [] });
      workoutMap.get(id).days.push(day);
    }
    const workoutList = Array.from(workoutMap.entries()).map(
      ([id, { name }]) => ({ id, name })
    );
    const workoutIdToDays = new Map(
      Array.from(workoutMap.entries()).map(([id, { days }]) => [id, days])
    );

    // 4. Build messages
    const promptInput = { profile: { ...userProfile, age }, workouts: workoutList };
    const messages = [
      {
        role: 'system',
        content: `You are a fitness coach.

Your task is to personalize a list of workouts based on the user's profile and training goals.

You will receive:
- A user profile: { age, height, weight, background, training_goal, training_experience, injury_caution_area }
- A list of workouts: [{ id, name }]

Respond with a flat JSON array where each item includes:
- id (number)
- sets (int)
- reps (int)
- weight_value (number; 0 only for bodyweight exercises)
- weight_unit ("kg" or "lb")

Rules:
1. Tailor sets, reps, and weight_value based on training_goal and training_experience.
2. For "muscle_gain" or "improve_strength", use non-zero weight_value for equipment exercises.
3. Use 0 only for bodyweight exercises.
4. Never assign 0 to bench press, deadlift, row, squat, overhead press, or carry exercises.
5. Adjust or skip exercises that risk injury_caution_area.
6. Return exactly one object per input workout.
7. Return only the JSON array.`
      },
      { role: 'user', content: JSON.stringify(promptInput) }
    ];

    // 5. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', messages, temperature: 0, max_tokens: 2048
    });

    const raw = completion.choices[0].message.content.trim();
    let enriched;
    try {
      enriched = JSON.parse(raw);
    } catch (e) {
      console.error('Parse error:', e.stack, raw);
      const start = raw.indexOf('['), end = raw.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        try { enriched = JSON.parse(raw.slice(start, end + 1)); } 
        catch (ee) { return res.status(500).json({ error: 'OpenAI returned invalid JSON' }); }
      } else {
        return res.status(500).json({ error: 'OpenAI returned invalid JSON' });
      }
    }

    // 6. Prepare inserts
    const values = [], seen = new Set();
    for (const { id, sets, reps, weight_value, weight_unit } of enriched) {
      const days = workoutIdToDays.get(id) || [];
      for (const day of days) {
        const key = `${day}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (typeof sets !== 'number' || typeof reps !== 'number' || typeof weight_value !== 'number' || !['kg','lb'].includes(weight_unit)) {
          return res.status(422).json({ error: `Invalid data for workout id ${id}` });
        }
        values.push([userId, programId, day, id, sets, reps, weight_value, weight_unit]);
      }
    }
    if (!values.length) return res.status(400).json({ error: 'No valid workout data' });

    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO user_program_schedule (user_id, program_id, day, workout_id, sets, reps, weight_value, weight_unit) VALUES ?`,
      [values]
    );
    await connection.commit();

    return res.json({ program_id: programId, personalized: enriched });

  } catch (err) {
    await connection.rollback();
    console.error('Personalization error:', err.stack);
    return res.status(500).json({ error: 'Failed to personalize plan', details: err.message });
  } finally {
    connection.release();
  }
}

/**
 * DELETE /personalize/reset
 */
export async function resetPersonalizedPlan(req, res) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized: token required' });
  try {
    const [[meta]] = await pool.query(`SELECT id FROM program_metadata WHERE status = 1 LIMIT 1`);
    if (!meta) return res.status(500).json({ error: 'No active program found' });
    await pool.query(`DELETE FROM user_program_schedule WHERE user_id = ? AND program_id = ?`, [userId, meta.id]);
    return res.json({ message: 'Your personalized workout plan has been reset.' });
  } catch (err) {
    console.error('Reset error:', err.stack);
    return res.status(500).json({ error: 'Failed to reset plan', details: err.message });
  }
}