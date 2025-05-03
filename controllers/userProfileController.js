// controllers/userProfileController.js

const pool   = require('../db');
const crypto = require('crypto');

// 1) Create a brand-new profile (and return an API token)
exports.createUserProfile = async (req, res) => {
  const {
    name, email, birthday,
    height, height_unit,
    weight, weight_unit,
    background
  } = req.body;

  // Validate required fields
  if (!name || !email || !birthday ||
      !height || !height_unit ||
      !weight || !weight_unit) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Generate & hash token
    const token     = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Insert user + tokenHash
    const [result] = await pool.query(
      `INSERT INTO user_profile
         (name, email, birthday,
          height, height_unit,
          weight, weight_unit,
          background, api_token_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, birthday,
       height, height_unit,
       weight, weight_unit,
       background, tokenHash]
    );

    return res.status(201).json({
      message:  'Profile created successfully',
      userId:   result.insertId,
      apiToken: token
    });
  } catch (err) {
    console.error('🔥 Error inserting user profile:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    return res.status(500).json({ error: 'Database error' });
  }
};

// 2) Get your own profile (requires valid token)
exports.getUserProfile = async (req, res) => {
  const userId = req.userId;
  try {
    const [rows] = await pool.query(
      `SELECT
         id           AS userId,
         name,
         email,
         birthday,
         height,
         height_unit AS heightUnit,
         weight,
         weight_unit AS weightUnit,
         background
       FROM user_profile
       WHERE id = ?`,
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('🔥 Error fetching user profile:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

// 3) Update your own profile (requires valid token)
exports.updateUserProfile = async (req, res) => {
  const userId = req.userId;
  const {
    email,
    name,
    birthday,
    height,
    height_unit,
    weight,
    weight_unit,
    background
  } = req.body;

  // 1) If they're trying to change email, make sure it's not already taken
  if (email !== undefined) {
    try {
      const [conflicts] = await pool.query(
        `SELECT id
           FROM user_profile
          WHERE email = ?
            AND id <> ?`,
        [email.trim(), userId]
      );
      if (conflicts.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    } catch (err) {
      console.error('🔥 Error checking email uniqueness:', err);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  // 2) Collect only the fields they actually sent
  const updates = [];
  const params  = [];

  if (email         !== undefined) { updates.push('email = ?');         params.push(email.trim()); }
  if (name          !== undefined) { updates.push('name = ?');          params.push(name);        }
  if (birthday      !== undefined) { updates.push('birthday = ?');      params.push(birthday);    }
  if (height        !== undefined) { updates.push('height = ?');        params.push(height);      }
  if (height_unit   !== undefined) { updates.push('height_unit = ?');   params.push(height_unit); }
  if (weight        !== undefined) { updates.push('weight = ?');        params.push(weight);      }
  if (weight_unit   !== undefined) { updates.push('weight_unit = ?');   params.push(weight_unit); }
  if (background    !== undefined) { updates.push('background = ?');    params.push(background);  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  // 3) Execute the update
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
    // catch any rare race-condition duplicate errors
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already in use' });
    }
    console.error('🔥 Error updating profile:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};
