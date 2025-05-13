// src/db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config(); // Load .env vars before pool creation

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,     // match your .env key (DB_PASS)
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,        // add comma here

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
