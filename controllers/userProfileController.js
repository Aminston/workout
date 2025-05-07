const pool = require('../db');

exports.updateUserProfile = async (req, res) => {
  const userId = req.user.userId;
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

  // Check for duplicate email (if updating)
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

  // Build update query dynamically
  const updates = [];
  const params = [];

  if (email !== undefined)       { updates.push('email = ?');        params.push(email.trim()); }
  if (name !== undefined)        { updates.push('name = ?');         params.push(name); }
  if (birthday !== undefined)    { updates.push('birthday = ?');     params.push(birthday); }
  if (height !== undefined)      { updates.push('height = ?');       params.push(height); }
  if (height_unit !== undefined) { updates.push('height_unit = ?');  params.push(height_unit); }
  if (weight !== undefined)      { updates.push('weight = ?');       params.push(weight); }
  if (weight_unit !== undefined) { updates.push('weight_unit = ?');  params.push(weight_unit); }
  if (background !== undefined)  { updates.push('background = ?');   params.push(background); }

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
};

