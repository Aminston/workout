// db.js
require('dotenv').config();     // ← MUST be first
const mysql = require('mysql2');

if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error('❌ Missing DB_USER or DB_PASSWORD in .env');
  process.exit(1);
}

const pool = mysql
  .createPool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     process.env.DB_PORT
  })
  .promise();

module.exports = pool;
