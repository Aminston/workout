// app.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes        from './routes/auth.js';
import aiRoutes          from './routes/ai.js';
import userProfileRoutes from './routes/userProfile.js';
import scheduleRoutes    from './routes/schedule.js';
import { errorHandler }  from './middleware/errorHandler.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/personalize', aiRoutes);
app.use('/user-profile', userProfileRoutes);
app.use('/schedule', scheduleRoutes);


app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use(errorHandler);

export default app;

