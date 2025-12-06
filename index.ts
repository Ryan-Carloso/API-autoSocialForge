import express from 'express';
import dotenv from 'dotenv';
import { setupBullBoard } from './ui/bullBoard';
import { scheduleDailyJobs } from './scheduler/dailyScheduler';
import './workers/index'; // Start workers

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

setupBullBoard(app);

app.get('/', (req, res) => {
  res.send('API AutoPostBridge with BullMQ is running. Go to <a href="/admin/queues">/admin/queues</a>');
});

app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  
  // Schedule jobs on startup
  await scheduleDailyJobs();
});
