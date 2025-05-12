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
      `SELECT birthday, height, weight, background, training_goal, training_experience, injury_caution_area
       FROM user_profile WHERE id = ?`,
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

    const workoutIdToDays = new Map();
    const workoutList = [];

    for (const row of rows) {
      if (!workoutIdToDays.has(row.workout_id)) {
        workoutIdToDays.set(row.workout_id, []);
      }
      workoutIdToDays.get(row.workout_id).push(row.day);
      workoutList.push({ id: row.workout_id, name: row.name });
    }

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

    const messages = [
      {
        role: 'system',
        content: `
You are a fitness coach.

Your task is to personalize a list of workouts based on the user's profile and training goals.

You will receive:
- A user profile:
  {
    age,
    height,
    weight,
    background,
    training_goal (muscle_gain | fat_loss | tone_up | improve_strength | general_fitness),
    training_experience (beginner | casual | consistent | advanced),
    injury_caution_area (none | shoulders | lower_back | knees | wrists | elbows | neck | ankles | hips)
  }

- A list of workouts:
  [{ id, name }]

Respond with a flat JSON array where each item includes:
- id (copied from input)
- sets (int)
- reps (int)
- weight_value (number; use 0 only if the exercise is strictly bodyweight)
- weight_unit ("kg" or "lb")

Rules:
1. Tailor sets, reps, and weight_value based on the user's training_goal and training_experience.
2. If training_goal is "muscle_gain" or "improve_strength", assign meaningful non-zero weight_value for all exercises that use equipment.
3. Only use weight_value: 0 for exercises that are strictly bodyweight-based (e.g., push-ups, planks). Do not assume any weighted exercise is bodyweight.
4. Do not assign weight_value: 0 to any variation of bench press (including Close-Grip Bench Press), deadlift, row, squat, overhead press, or carry exercises. These always require external load.
5. Adjust or skip exercises that could aggravate the injury_caution_area.
6. Return only a valid flat JSON array. No formatting, markdown, headers, or extra text.
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
    const insertedPairs = new Set();

    for (const workout of enriched) {
      const { id, sets, reps, weight_value, weight_unit } = workout;
      const days = workoutIdToDays.get(id);
      if (!days) continue;

      for (const day of days) {
        const key = `${day}:${id}`;
        if (insertedPairs.has(key)) continue;
        insertedPairs.add(key);

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
