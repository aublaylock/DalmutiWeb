import React from 'react';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { DalmutiGame } from '../game/DalmutiGame';
import { Board } from '../components/Board/Board';

// In development, Vite proxies /socket.io to localhost:8000.
// In production, set VITE_SERVER_URL to the deployed server origin.
const SERVER = import.meta.env.VITE_SERVER_URL
  ?? `${window.location.protocol}//${window.location.host}`;

// boardgame.io/react's Client() returns a class component with a complex type.
// We cast to ComponentType to make it compatible with React 18 function JSX.
const _DalmutiClientImpl = Client({
  game: DalmutiGame,
  board: Board,
  multiplayer: SocketIO({ server: SERVER }),
  debug: false,
}) as React.ComponentType<{ matchID: string; playerID: string; credentials: string }>;

export const DalmutiClient = _DalmutiClientImpl;
