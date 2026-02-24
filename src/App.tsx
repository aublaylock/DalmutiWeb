import { LobbyScreen } from './components/Lobby/LobbyScreen';

const SERVER_URL = import.meta.env.VITE_SERVER_URL
  ?? `${window.location.protocol}//${window.location.hostname}:8000`;

export function App() {
  return <LobbyScreen serverURL={SERVER_URL} />;
}
