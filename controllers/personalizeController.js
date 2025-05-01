// controllers/personalizeController.js
const pool = require('../db');
const { OpenAI } = require('openai');
require('dotenv').config();

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.personalizePlan = async (req, res) => {
  const { userId } = req.body;
  console.log('🔑 personalizePlan called for userId=', userId);

  if (!userId) {
    console.warn('⚠️ Missing userId');
    return res.status(400).json({ error: 'Missing userId in body' });
  }

  try {
    // 1) Fetch user profile
    const [userRows] = await pool.query(
      `SELECT birthday, height, height_unit, weight, weight_unit, background
       FROM user_profile
       WHERE id = ?`,
      [userId]
    );
    if (userRows.length === 0) {
      console.warn(`⚠️ No profile found for userId=${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    const profile = userRows[0];
    console.log('👤 profile:', profile);

    // 2) Fetch active program id
    const [metaRows] = await pool.query(
      'SELECT id FROM program_metadata WHERE status = 1 LIMIT 1'
    );
    if (metaRows.length === 0) {
      console.error('❌ No active program_metadata found');
      return res.status(500).json({ error: 'No active program found' });
    }
    const programId = metaRows[0].id;
    console.log('📆 using programId=', programId);

    // 3) Fetch schedule rows
    const [scheduleRows] = await pool.query(
      `SELECT ps.day, ps.workout_id, w.name AS workout, w.category, w.type
       FROM program_schedule ps
       JOIN workouts w ON ps.workout_id = w.id
       WHERE ps.program_id = ?`,
      [programId]
    );
    console.log('📋 scheduleRows count=', scheduleRows.length);

    // 4) Build prompt messages
    const messages = [
      {
        role: 'system',
        content: `
You are a fitness coach.
User profile: age from ${profile.birthday},
 height ${profile.height}${profile.height_unit},
 weight ${profile.weight}${profile.weight_unit},
 background: ${profile.background}.
Weekly plan is an array of { day, workout_id, workout, category, type }.
For each entry, return JSON with sets, reps, and weight, including workout_id.
Output an object mapping days to arrays of { workout_id, sets, reps, weight }.
`
      },
      {
        role: 'user',
        content: JSON.stringify({ weekly_schedule: scheduleRows })
      }
    ];

    console.log('🤖 sending prompt to OpenAI…');

    // 5) Call OpenAI
    const completion = await openai.chat.completions.create({
      model:       'gpt-3.5-turbo',
      messages,
      temperature: 0.7,
      max_tokens:  800
    });

    const text = completion.choices[0].message.content.trim();
    console.log('📨 OpenAI response:', text);

    // 6) Parse and persist
    let personalized;
    try {
      personalized = JSON.parse(text);
    } catch (e) {
      console.error('❌ JSON.parse error:', e.message);
      return res.status(500).json({
        error: 'Invalid JSON from OpenAI',
        raw: text
      });
    }

    console.log('💾 Saving personalized schedule to user_program_schedule…');
    for (const [day, exercises] of Object.entries(personalized)) {
      for (const ex of exercises) {
        const { workout_id, sets, reps, weight } = ex;
        // split weight into value/unit
        const match = /^(\d+(?:\.\d+)?)(\D+)$/.exec(weight);
        const weight_value = match ? parseFloat(match[1]) : null;
        const weight_unit  = match ? match[2] : weight;

        try {
          await pool.query(
            `INSERT INTO user_program_schedule
               (user_id, program_id, day, workout_id, sets, reps, weight_value, weight_unit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, programId, day, workout_id, sets, reps, weight_value, weight_unit]
          );
        } catch (err) {
          console.error(`❌ Insert failed for day=${day}, workout_id=${workout_id}:`, err.message);
        }
      }
    }

    // 7) Return final JSON
    console.log('✅ personalizePlan complete');
    res.json({ program_id: programId, personalized });

  } catch (err) {
    console.error('🔥 Personalization Error:', err.stack || err);
    res.status(500).json({
      error:   'Failed to personalize plan',
      details: err.message
    });
  }
};
