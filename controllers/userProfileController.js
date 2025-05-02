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
    name, email, birthday,
    height, height_unit,
    weight, weight_unit,
    background
  } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE user_profile
         SET name=?, email=?, birthday=?,
             height=?, height_unit=?,
             weight=?, weight_unit=?,
             background=?
       WHERE id = ?`,
      [ name, email, birthday,
        height, height_unit,
        weight, weight_unit,
        background, userId ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found to update' });
    }
    return res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('🔥 Error updating user profile:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};
