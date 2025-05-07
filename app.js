// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const userProfile = require('./routes/userProfile');
const aiRoutes    = require('./routes/ai');
const schedule    = require('./routes/schedule');
const authRoutes  = require('./routes/auth'); // ✅ load auth route

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Mount this BEFORE module.exports
app.use('/api/auth', authRoutes);
app.use('/api/personalize', aiRoutes);
app.use('/api/user-profile', userProfile);
app.use('/', schedule); // ← this should stay last

module.exports = app;
