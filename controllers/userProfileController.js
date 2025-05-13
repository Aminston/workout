// src/controllers/userProfileController.js

import pool from '../db.js';
import {
  TRAINING_GOALS,
  EXPERIENCE_LEVELS,
  INJURY_AREAS
} from '../constants/enums.js';
import { isEnumValid } from '../utils/validation.js';

/**
 * GET /api/user-profile
 * Fetch the current user's profile
 */
export async function getUserProfile(req, res) {
  const userId = req.user.userId;
  try {
    const [rows] = await pool.query(
      `SELECT 
        id,
        name,
        email,
        birthday,
        height,
        height_unit,
        weight,
        weight_unit,
        background,
        training_goal,
        training_experience,
        injury_caution_area,
        unit_preference,
        created_at
       FROM user_profile
       WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('🔥 Failed to fetch user profile:', err);
    return res.status(500).json({ error: 'Database error' });
  }
}

/**
 * PUT /api/user-profile
 * Update the current user's profile
 */
export async function updateUserProfile(req, res) {
  const userId = req.user.userId;
  const {
    email,
    name,
    birthday,
    height,
    height_unit,
    weight,
    weight_unit,
    background,
    training_goal,
    training_experience,
    injury_caution_area
  } = req.body;

  // Validate enum values
  if (!isEnumValid(training_goal, TRAINING_GOALS)) {
    return res.status(400).json({ error: 'Invalid training goal' });
  }
  if (!isEnumValid(training_experience, EXPERIENCE_LEVELS)) {
    return res.status(400).json({ error: 'Invalid training experience' });
  }
  if (!isEnumValid(injury_caution_area, INJURY_AREAS)) {
    return res.status(400).json({ error: 'Invalid injury caution area' });
  }

  // Check for duplicate email if provided
  if (email !== undefined) {
    try {
      const [conflicts] = await pool.query(
        `SELECT id FROM user_profile WHERE email = ? AND id <> ?`,
        [email.trim(), userId]
      );
      if (conflicts.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    } catch (err) {
      console.error('🔥 Email uniqueness check failed:', err);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  // Build dynamic update query
  const updates = [];
  const params = [];
  if (email !== undefined)               { updates.push('email = ?');               params.push(email.trim()); }
  if (name !== undefined)                { updates.push('name = ?');                params.push(name); }
  if (birthday !== undefined)            { updates.push('birthday = ?');            params.push(birthday); }
  if (height !== undefined)              { updates.push('height = ?');              params.push(height); }
  if (height_unit !== undefined)         { updates.push('height_unit = ?');         params.push(height_unit); }
  if (weight !== undefined)              { updates.push('weight = ?');              params.push(weight); }
  if (weight_unit !== undefined)         { updates.push('weight_unit = ?');         params.push(weight_unit); }
  if (background !== undefined)          { updates.push('background = ?');          params.push(background); }
  if (training_goal !== undefined)       { updates.push('training_goal = ?');       params.push(training_goal); }
  if (training_experience !== undefined) { updates.push('training_experience = ?'); params.push(training_experience); }
  if (injury_caution_area !== undefined) { updates.push('injury_caution_area = ?'); params.push(injury_caution_area); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  const sql = `
    UPDATE user_profile
    SET ${updates.join(', ')}
    WHERE id = ?
  `;
  params.push(userId);

  try {
    const [result] = await pool.query(sql, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('🔥 Profile update failed:', err);
    return res.status(500).json({ error: 'Database error' });
  }
}