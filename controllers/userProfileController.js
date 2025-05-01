// controllers/userProfileController.js

const pool = require('../db');

// 1) Create a brand‐new profile
exports.createUserProfile = async (req, res) => {
  const {
    name,
    email,
    birthday,
    height,
    height_unit,
    weight,
    weight_unit,
    background
  } = req.body;

  // Validate
  if (!name || !email || !birthday || !height || !height_unit || !weight || !weight_unit) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO user_profile
         (name, email, birthday, height, height_unit, weight, weight_unit, background)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, birthday, height, height_unit, weight, weight_unit, background]
    );

    return res.status(201).json({
      message: 'Profile created successfully',
      userId: result.insertId
    });
  } catch (err) {
    console.error('🔥 Error inserting user profile:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    return res.status(500).json({ error: 'Database error' });
  }
};

// 2) Get a profile by numeric ID
exports.getUserProfile = async (req, res) => {
  const userId = req.params.userId;
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

// 3) Update an existing profile
exports.updateUserProfile = async (req, res) => {
  const userId = req.params.userId;
  const {
    name,
    email,
    birthday,
    height,
    height_unit,
    weight,
    weight_unit,
    background
  } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE user_profile
         SET name=?, email=?, birthday=?, height=?, height_unit=?, weight=?, weight_unit=?, background=?
       WHERE id = ?`,
      [name, email, birthday, height, height_unit, weight, weight_unit, background, userId]
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
