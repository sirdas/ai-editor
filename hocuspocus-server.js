import { Server } from '@hocuspocus/server';
import { Logger } from '@hocuspocus/extension-logger';

const server = new Server({
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 1234,
  extensions: [
    new Logger(),
  ],
});

server.listen().then(({ port }) => {
  console.log(`Hocuspocus server listening on ws://127.0.0.1:${port}`);
});
