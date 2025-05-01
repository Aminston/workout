// ✅ Controller for user profile operations
const pool = require('../db');

exports.createOrUpdateUserProfile = async (req, res) => {
  const { user_id, birthday, height, height_unit, weight, weight_unit, background } = req.body;

  if (!user_id || !birthday || !height || !height_unit || !weight || !weight_unit) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await pool.query(
      `INSERT INTO user_profile (user_id, birthday, height, height_unit, weight, weight_unit, background)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE birthday=?, height=?, height_unit=?, weight=?, weight_unit=?, background=?`,
      [user_id, birthday, height, height_unit, weight, weight_unit, background,
       birthday, height, height_unit, weight, weight_unit, background]
    );
    res.status(201).json({ message: 'Profile saved or updated successfully' });
  } catch (err) {
    console.error('🔥 Error saving user profile:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

exports.getUserProfile = async (req, res) => {
  const { user_id } = req.params;

  try {
    const [rows] = await pool.query('SELECT * FROM user_profile WHERE user_id = ?', [user_id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('🔥 Error fetching user profile:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

exports.updateUserProfile = async (req, res) => {
  const { user_id } = req.params;
  const { birthday, height, height_unit, weight, weight_unit, background } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE user_profile SET birthday=?, height=?, height_unit=?, weight=?, weight_unit=?, background=?
       WHERE user_id = ?`,
      [birthday, height, height_unit, weight, weight_unit, background, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found to update' });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('🔥 Error updating user profile:', err);
    res.status(500).json({ error: 'Database error' });
  }
};
