const pool      = require('../db');

exports.createUserProfile = async (req, res) => {
  const { name, email, birthday, height, height_unit, weight, weight_unit, background } = req.body;

  // 1️⃣ Validate required
  if (!name || !email || !birthday || !height || !height_unit || !weight || !weight_unit) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 2️⃣ Insert new profile
    const [result] = await pool.query(
      `INSERT INTO user_profile
         (name, email, birthday, height, height_unit, weight, weight_unit, background)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, birthday, height, height_unit, weight, weight_unit, background]
    );

    // 3️⃣ Return the auto-incremented id
    res.status(201).json({
      message: 'Profile created successfully',
      userId:  result.insertId
    });

  } catch (err) {
    console.error('🔥 Error inserting user profile:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Database error' });
  }
};

exports.getUserProfile = async (req, res) => {
  const userId = req.params.userId;
  try {
    const [rows] = await pool.query(
      `SELECT id   AS userId,
              name,
              email,
              birthday,
              height,
              height_unit  AS heightUnit,
              weight,
              weight_unit  AS weightUnit,
              background
       FROM user_profile
       WHERE id = ?`,
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('🔥 Error fetching profile:', err);
    res.status(500).json({ error: 'Database error' });
  }
};
