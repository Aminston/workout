// app.js
require('dotenv').config();
const express     = require('express');
const cors        = require('cors');

const userProfile = require('./routes/userProfile');
const aiRoutes    = require('./routes/ai');
const schedule    = require('./routes/schedule');

const app = express();
app.use(cors());
app.use(express.json());

// Your personalized-OpenAI API
app.use('/api/personalize', aiRoutes);

// User profiles (if you have them)
app.use('/api/user-profile', userProfile);

// Public schedule endpoint
app.use('/', schedule);

module.exports = app;
