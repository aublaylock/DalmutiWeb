import { Server, Origins } from 'boardgame.io/server';
import { DalmutiGame } from '../src/game/DalmutiGame';

const PORT = Number(process.env.PORT ?? 8000);

const server = Server({
  games: [DalmutiGame],
  origins: [
    Origins.LOCALHOST_IN_DEVELOPMENT,
    // Add your production domain here when deploying:
    'https://dalmuti-web.vercel.app',
  ],
});

// Simple health-check endpoint so UptimeRobot can keep the Render instance warm.
server.router.get('/health', (ctx) => {
  ctx.status = 200;
  ctx.body = { status: 'ok' };
});

server.run(PORT, () => {
  console.log(`boardgame.io server listening on http://localhost:${PORT}`);
  console.log(`Lobby API: http://localhost:${PORT}/games/great-dalmuti`);
});
