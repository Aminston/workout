const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authenticate = require('../middleware/auth');

const router = express.Router();

// ✅ Register
router.post('/register', async (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO user_profile (name, email, password) VALUES (?, ?, ?)`,
      [name, email, hashed]
    );

    const userId = result.insertId;
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token });
  } catch (err) {
    next(err);
    console.error('REGISTRATION ERROR:', err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const [rows] = await db.query(`SELECT * FROM user_profile WHERE email = ?`, [email]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// ✅ Get profile of logged-in user
router.get('/me', authenticate, async (req, res) => {
  try {
    console.log('✅ req.user from JWT:', req.user);

    const [rows] = await db.query(
      `SELECT id, email, name, birthday, height, height_unit, weight, weight_unit, background
       FROM user_profile WHERE id = ?`,
      [req.user.userId]
    );

    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error('ME ROUTE ERROR:', err);
    res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});

// ✅ Logout (stateless)
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out successfully — token should be removed client-side' });
});

module.exports = router;
