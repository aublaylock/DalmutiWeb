import { Server, Origins } from 'boardgame.io/server';
import { DalmutiGame } from '../src/game/DalmutiGame';

const PORT = Number(process.env.PORT ?? 8000);

const server = Server({
  games: [DalmutiGame],
  origins: [
    Origins.LOCALHOST_IN_DEVELOPMENT,
    // Add your production domain here when deploying:
    'https://dalmuti-web.vercel.app/',
  ],
});

server.run(PORT, () => {
  console.log(`boardgame.io server listening on http://localhost:${PORT}`);
  console.log(`Lobby API: http://localhost:${PORT}/games/great-dalmuti`);
});
