import { useState, useEffect, useRef } from 'react';
import { LobbyClient } from 'boardgame.io/client';
import { DalmutiClient } from '../../client/DalmutiClient';
import styles from './LobbyScreen.module.css';

interface LobbyScreenProps {
  serverURL: string;
}

interface MatchInfo {
  matchID: string;
  playerID: string;
  credentials: string;
  numPlayers: number;
  playerName: string;
}

type View = 'lobby' | 'waiting' | 'game';

const SESSION_KEY = 'dalmuti_session';

function saveSession(info: MatchInfo) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(info)); } catch { /* ignore */ }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

function loadSession(): MatchInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as MatchInfo) : null;
  } catch { return null; }
}

export function LobbyScreen({ serverURL }: LobbyScreenProps) {
  const savedSession = loadSession();
  const [view, setView] = useState<View>(savedSession ? 'game' : 'lobby');
  const [playerName, setPlayerName] = useState(savedSession?.playerName ?? '');
  const [numPlayers, setNumPlayers] = useState(4);
  const [matchIDInput, setMatchIDInput] = useState('');
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(savedSession);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [joinedCount, setJoinedCount] = useState(1); // at least the creator
  const [copied, setCopied] = useState(false);

  const lobbyClient = new LobbyClient({ server: serverURL });

  // Poll the match roster while in the waiting view so the player count stays fresh.
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (view !== 'waiting' || !matchInfo) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }
    const poll = async () => {
      try {
        const match = await lobbyClient.getMatch('great-dalmuti', matchInfo.matchID);
        setJoinedCount(match.players.filter((p: { name?: string }) => p.name).length);
      } catch {
        // ignore transient fetch errors
      }
    };
    poll();
    pollingRef.current = setInterval(poll, 2500);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [view, matchInfo]);

  const handleCreate = async () => {
    if (!playerName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { matchID } = await lobbyClient.createMatch('great-dalmuti', { numPlayers });
      const { playerCredentials } = await lobbyClient.joinMatch('great-dalmuti', matchID, {
        playerID: '0',
        playerName: playerName.trim(),
      });
      const info: MatchInfo = { matchID, playerID: '0', credentials: playerCredentials, numPlayers, playerName: playerName.trim() };
      setMatchInfo(info);
      saveSession(info);
      setJoinedCount(1);
      setView('waiting');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !matchIDInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const match = await lobbyClient.getMatch('great-dalmuti', matchIDInput.trim());

      // Check if this player already has a slot (reconnection by name)
      const existingSlot = match.players.find(
        (p: { id: number; name?: string }) => p.name === playerName.trim()
      );
      if (existingSlot) {
        setError('A player with that name is already in this game. If you disconnected, please use the same name you joined with — your session should have been saved. If not, try a different name.');
        return;
      }

      const freeSlot = match.players.find((p: { id: number; name?: string }) => !p.name);
      if (!freeSlot) {
        setError('This game is full.');
        return;
      }
      const { playerCredentials } = await lobbyClient.joinMatch(
        'great-dalmuti',
        matchIDInput.trim(),
        { playerID: String(freeSlot.id), playerName: playerName.trim() }
      );
      const joined = match.players.filter((p: { name?: string }) => p.name).length + 1;
      const info: MatchInfo = {
        matchID: matchIDInput.trim(),
        playerID: String(freeSlot.id),
        credentials: playerCredentials,
        numPlayers: match.players.length,
        playerName: playerName.trim(),
      };
      setMatchInfo(info);
      saveSession(info);
      setJoinedCount(joined);
      setView('waiting');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = () => {
    clearSession();
    setMatchInfo(null);
    setView('lobby');
    setError('');
  };

  const handleCopy = () => {
    if (!matchInfo) return;
    navigator.clipboard.writeText(matchInfo.matchID).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (view === 'game' && matchInfo) {
    return (
      <>
        <DalmutiClient
          matchID={matchInfo.matchID}
          playerID={matchInfo.playerID}
          credentials={matchInfo.credentials}
        />
        <button
          onClick={handleLeave}
          style={{
            position: 'fixed',
            bottom: '12px',
            left: '12px',
            zIndex: 9999,
            padding: '6px 12px',
            background: 'rgba(0,0,0,0.55)',
            color: '#ccc',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Leave Match
        </button>
      </>
    );
  }

  if (view === 'waiting' && matchInfo) {
    const isOwner = matchInfo.playerID === '0';
    const allJoined = joinedCount >= matchInfo.numPlayers;

    return (
      <div className={styles.lobby}>
        <div className={styles.card}>
          <h1 className={styles.title}>{isOwner ? 'Game Created!' : 'Joined!'}</h1>
          <p className={styles.subtitle}>
            {isOwner
              ? 'Share this code with other players so they can join.'
              : 'Share this code with friends who haven\'t joined yet.'}
          </p>

          <div className={styles.codeBlock}>
            <span className={styles.codeLabel}>Game Code</span>
            <div className={styles.codeRow}>
              <code className={styles.code}>{matchInfo.matchID}</code>
              <button className={styles.copyBtn} onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <p className={styles.waitingHint}>
            {allJoined
              ? `All ${matchInfo.numPlayers} players have joined!`
              : `${joinedCount} / ${matchInfo.numPlayers} players joined…`}
          </p>

          <button
            className={styles.primaryBtn}
            onClick={() => setView('game')}
          >
            Enter Game
          </button>
          <button
            className={styles.secondaryBtn}
            style={{ marginTop: '8px' }}
            onClick={handleLeave}
          >
            Leave Match
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.lobby}>
      <div className={styles.card}>
        <img src="/greatDalmutiTitle.png" alt="The Great Dalmuti" className={styles.titleImg} />

        <div className={styles.field}>
          <label className={styles.label} htmlFor="playerName">Your Name</label>
          <input
            id="playerName"
            className={styles.input}
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={24}
          />
        </div>

        <div className={styles.sections}>
          <section className={styles.section}>
            <h2>Create Game</h2>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="numPlayers">Players</label>
              <input
                id="numPlayers"
                className={styles.input}
                type="number"
                min={4}
                max={8}
                value={numPlayers}
                onChange={(e) => setNumPlayers(Math.min(8, Math.max(4, Number(e.target.value))))}
              />
            </div>
            <button
              className={styles.primaryBtn}
              onClick={handleCreate}
              disabled={!playerName.trim() || loading}
            >
              {loading ? 'Creating…' : 'Create & Join'}
            </button>
          </section>

          <div className={styles.divider} />

          <section className={styles.section}>
            <h2>Join Game</h2>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="matchID">Match ID</label>
              <input
                id="matchID"
                className={styles.input}
                type="text"
                value={matchIDInput}
                onChange={(e) => setMatchIDInput(e.target.value)}
                placeholder="Paste match ID"
              />
            </div>
            <button
              className={styles.secondaryBtn}
              onClick={handleJoin}
              disabled={!playerName.trim() || !matchIDInput.trim() || loading}
            >
              {loading ? 'Joining…' : 'Join'}
            </button>
          </section>
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
