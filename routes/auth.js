// src/routes/auth.js

import express from 'express';
import bcrypt from 'bcryptjs';                // pure-JS fallback for easier installs
import rateLimit from 'express-rate-limit';  // one import only
import db from '../db.js';
import authenticate from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { signToken } from '../utils/jwt.js';

const router = express.Router();

// ─── Slow down brute-force login attempts ───────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts, please try again later.' }
});

// ─── POST /api/auth/register ───────────────────────────────────────────────────
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400);
      throw new Error('Name, email, and password are required');
    }

    try {
      const hashed = await bcrypt.hash(password, 10);
      const result = await db.query(
        `INSERT INTO user_profile (name, email, password) VALUES (?, ?, ?)`,
        [name, email, hashed]
      );
      const userId = result.insertId;
      const token  = signToken({ userId });
      res.status(201).json({ token });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        res.status(400);
        throw new Error('That email is already registered');
      }
      throw err;
    }
  })
);

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400);
      throw new Error('Email and password are required');
    }

    const [rows] = await db.query(
      `SELECT id, password FROM user_profile WHERE email = ?`,
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401);
      throw new Error('Invalid credentials');
    }

    const token = signToken({ userId: user.id });
    res.json({ token });
  })
);

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(
      `SELECT 
         id, email, name, birthday, height, height_unit,
         weight, weight_unit, background,
         training_goal, training_experience, injury_caution_area
       FROM user_profile
       WHERE id = ?`,
      [req.user.userId]
    );
    const user = rows[0];
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }
    res.json(user);
  })
);

export default router;
