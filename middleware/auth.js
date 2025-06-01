import jwt from 'jsonwebtoken';

/**
 * Express middleware to authenticate requests using JWT in the Authorization header.
 *
 * Expects header: "Authorization: Bearer <token>"
 * On success, attaches { userId } to req.user and calls next().
 * On failure, responds with 401 or 403 status and JSON error.
 */
export default function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: token required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.userId) {
      return res.status(403).json({ error: 'Invalid token payload' });
    }

    // Attach userId to request
    req.user = { userId: decoded.userId };
    next();
  } catch (err) {
    console.error('JWT VERIFY ERROR:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
