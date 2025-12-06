import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { imagePostQueue } from '../queue/imagePost.queue';
import express from 'express';

export function setupBullBoard(app: express.Application) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(imagePostQueue)],
    serverAdapter,
  });

  app.use('/admin/queues', serverAdapter.getRouter());
  console.log('BullBoard UI available at /admin/queues');
}
