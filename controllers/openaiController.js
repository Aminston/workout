// src/controllers/openaiController.js

import pool from '../db.js';
import { OpenAI } from 'openai';

// Instantiate OpenAI client (assumes process.env.OPENAI_API_KEY is set)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/personalize/plan
 * Generates and saves a personalized workout plan for the user.
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
      `SELECT birthday, height, weight, background,
              training_goal, training_experience, injury_caution_area
       FROM user_profile WHERE id = ?`,
      [userId]
    );
    if (!userProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Calculate age
    const age = Math.floor(
      (Date.now() - new Date(userProfile.birthday))
      / (1000 * 60 * 60 * 24 * 365)
    );

    // 2. Get active program metadata
    const [[programMeta]] = await connection.query(
      `SELECT id FROM program_metadata WHERE status = 1 LIMIT 1`
    );
    if (!programMeta) {
      return res.status(500).json({ error: 'No active program found' });
    }
    const programId = programMeta.id;

    // Prevent duplicate personalization
    const [existing] = await connection.query(
      `SELECT 1 FROM user_program_schedule WHERE user_id = ? AND program_id = ? LIMIT 1`,
      [userId, programId]
    );
    if (existing.length) {
      return res.status(400).json({
        error: 'You already have a personalized workout plan. Please reset it before generating a new one.'
      });
    }

    // 3. Load base workouts for the program
    const [rows] = await connection.query(
      `SELECT ps.day, ps.workout_id, w.name
       FROM program_schedule ps
       JOIN workouts w ON ps.workout_id = w.id
       WHERE ps.program_id = ?
       ORDER BY FIELD(ps.day, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), ps.id`,
      [programId]
    );

    const workoutIdToDays = new Map();
    const workoutList = [];
    for (const { day, workout_id: wid, name } of rows) {
      if (!workoutIdToDays.has(wid)) workoutIdToDays.set(wid, []);
      workoutIdToDays.get(wid).push(day);
      workoutList.push({ id: wid, name });
    }

    // 4. Build OpenAI prompt
    const promptInput = {
      profile: {
        age,
        height: userProfile.height,
        weight: userProfile.weight,
        background: userProfile.background,
        training_goal: userProfile.training_goal,
        training_experience: userProfile.training_experience,
        injury_caution_area: userProfile.injury_caution_area
      },
      workouts: workoutList
    };

    const systemMessage = {
      role: 'system',
      content: `You are a fitness coach.

Your task is to personalize a list of workouts based on the user's profile and training goals...
(Instructions trimmed for brevity)`
    };
    const userMessage = { role: 'user', content: JSON.stringify(promptInput) };

    // 5. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [systemMessage, userMessage],
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

    // 6. Prepare batch insert
    const values = [];
    const seen = new Set();

    for (const { id, sets, reps, weight_value, weight_unit } of enriched) {
      const days = workoutIdToDays.get(id) || [];
      for (const day of days) {
        const key = `${day}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Validate types
        if (
          typeof sets !== 'number' ||
          typeof reps !== 'number' ||
          typeof weight_value !== 'number' ||
          !['kg','lb'].includes(weight_unit)
        ) {
          return res.status(422).json({ error: `Invalid data for workout id ${id}` });
        }

        values.push([userId, programId, day, id, sets, reps, weight_value, weight_unit]);
      }
    }

    if (values.length === 0) {
      return res.status(400).json({ error: 'No valid workout data returned by OpenAI' });
    }

    // 7. Insert and commit
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO user_program_schedule
       (user_id, program_id, day, workout_id, sets, reps, weight_value, weight_unit)
       VALUES ?`,
      [values]
    );
    await connection.commit();

    return res.json({ program_id: programId, personalized: enriched });

  } catch (err) {
    await connection.rollback();
    console.error('Personalization error:', err);
    return res.status(500).json({ error: 'Failed to personalize plan', details: err.message });
  } finally {
    connection.release();
  }
}

/**
 * DELETE /api/personalize/reset
 * Clears the user's personalized plan for the active program.
 */
export async function resetPersonalizedPlan(req, res) {
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

    return res.json({ message: 'Your personalized workout plan has been reset.' });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Failed to reset workout plan', details: err.message });
  }
}