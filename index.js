// index.js
import dotenv from 'dotenv';
dotenv.config();  // ← must come first

import app from './app.js';

const PORT = process.env.PORT || 3000;

// Fail fast if JWT_SECRET is missing
if (!process.env.JWT_SECRET) {
  console.error('❌ Missing JWT_SECRET in environment');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
