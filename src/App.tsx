import { useEffect } from 'react';
import { LobbyScreen } from './components/Lobby/LobbyScreen';

const SERVER_URL = import.meta.env.VITE_SERVER_URL
  ?? `${window.location.protocol}//${window.location.hostname}:8000`;

/** Kick off background loads for all 82 card images so they are cached before play. */
function usePreloadCards() {
  useEffect(() => {
    const urls: string[] = ['/cards/back.jpeg', '/cards/jester-1.jpeg', '/cards/jester-2.jpeg'];
    for (let rank = 1; rank <= 12; rank++) {
      for (let copy = 1; copy <= rank; copy++) {
        urls.push(
          `/cards/${rank.toString().padStart(2, '0')}-${copy.toString().padStart(2, '0')}.jpeg`
        );
      }
    }
    for (const url of urls) {
      const img = new Image();
      img.src = url;
    }
  }, []);
}

export function App() {
  usePreloadCards();
  return <LobbyScreen serverURL={SERVER_URL} />;
}
