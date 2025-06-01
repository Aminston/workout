// src/utils/jwt.js
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('Missing JWT_SECRET in environment');

export function signToken(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a non-empty object');
  }

  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}
