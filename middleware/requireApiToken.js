// middleware/requireApiToken.js

const crypto = require('crypto');
const pool   = require('../db');

async function requireApiToken(req, res, next) {
  const token = req.headers['x-api-token'] || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'API token required' });
  }

  // Hash and lookup
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const [rows] = await pool.query(
      'SELECT id AS userId FROM user_profile WHERE api_token_hash = ?',
      [hash]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API token' });
    }
    req.userId = rows[0].userId;
    next();
  } catch (err) {
    console.error('🔥 Error verifying API token:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

module.exports = requireApiToken;
