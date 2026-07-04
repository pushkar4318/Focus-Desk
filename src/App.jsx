import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Plus, X, Check, Bell, BellOff, Pencil } from "lucide-react";

const DURATIONS = [15, 25, 45, 60];

const COLORS = {
  ink: "#16232F",
  inkPanel: "#1D3040",
  paper: "#F6F3EC",
  paperDim: "#EAE5D8",
  brass: "#C7973F",
  brassDim: "#8A6B32",
  slate: "#8FA3B0",
  slateDark: "#5C7080",
  ember: "#C1502E",
  mist: "#2B3B4A",
};

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Plays a short two-tone chime using the Web Audio API — no external audio file needed.
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.4);
    });
    setTimeout(() => ctx.close(), 1200);
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    // Web Audio unavailable — fail silently.
  }
}
// Exposed for manual testing from the browser console: just run `playChime()`.
if (typeof window !== "undefined") {
  window.playChime = playChime;
}

function Dial({ progress, running, timeLabel, label }) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = 118;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - progress);

  const ticks = [];
  const majorEvery = 5;
  const totalTicks = 60;
  for (let i = 0; i < totalTicks; i++) {
    const angle = (i / totalTicks) * 2 * Math.PI - Math.PI / 2;
    const isMajor = i % majorEvery === 0;
    const outerR = r + 14;
    const innerR = isMajor ? r + 2 : r + 7;
    const x1 = cx + outerR * Math.cos(angle);
    const y1 = cy + outerR * Math.sin(angle);
    const x2 = cx + innerR * Math.cos(angle);
    const y2 = cy + innerR * Math.sin(angle);
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={isMajor ? COLORS.brass : COLORS.slateDark}
        strokeWidth={isMajor ? 2 : 1}
        strokeLinecap="round"
      />
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <circle cx={cx} cy={cy} r={r + 26} fill="none" stroke={COLORS.mist} strokeWidth={1} />
      {ticks}
      <circle cx={cx} cy={cy} r={r} fill={COLORS.inkPanel} stroke={COLORS.mist} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={COLORS.mist} strokeWidth={6} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={running ? COLORS.brass : COLORS.slateDark}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.9s linear" }}
      />
      <text x={cx} y={cy - 6} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="42" fontWeight="500" fill={COLORS.paper}>
        {timeLabel}
      </text>
      <text x={cx} y={cy + 26} textAnchor="middle" fontFamily="'Inter', sans-serif" fontSize="11" letterSpacing="2" fill={COLORS.slate}>
        {label}
      </text>
    </svg>
  );
}

// Reads/writes a piece of state to localStorage under the given key.
// Falls back to the initial value if localStorage is unavailable or empty.
function usePersistedState(key, initialValue, reviver) {
  const [state, setState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return initialValue;
      const parsed = JSON.parse(stored);
      return reviver ? reviver(parsed) : parsed;
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // Storage unavailable (private browsing, quota, etc.) — app still works, just won't persist.
    }
  }, [key, state]);
  return [state, setState];
}

export default function App() {
  const [durationMin, setDurationMin] = usePersistedState("fd_durationMin", 25);
  const [secondsLeft, setSecondsLeft] = useState(() => durationMin * 60);
  const [running, setRunning] = useState(false);
  const [intention, setIntention] = usePersistedState("fd_intention", "");
  const [tasks, setTasks] = usePersistedState("fd_tasks", []);
  const [newTask, setNewTask] = useState("");
  const [sessions, setSessions] = usePersistedState("fd_sessions", [], (parsed) =>
    parsed.map((s) => ({ ...s, endedAt: new Date(s.endedAt) }))
  );
  const [soundOn, setSoundOn] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const intervalRef = useRef(null);

  const totalSeconds = durationMin * 60;
  const progress = 1 - secondsLeft / totalSeconds;
  const completedRef = useRef(false);

  const logSession = useCallback(
    (completed) => {
      setSessions((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          intention: intention || "Untitled session",
          minutes: durationMin,
          completedTasks: tasks.filter((t) => t.done).length,
          totalTasks: tasks.length,
          completed,
          endedAt: new Date(),
        },
      ]);
    },
    [setSessions, intention, durationMin, tasks]
  );

  // Ticks the countdown down. This updater is kept pure — no side effects here —
  // since React Strict Mode can invoke setState updater functions twice.
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  // Fires exactly once when the countdown reaches zero, guarded by a ref
  // so Strict Mode's double-render in development can't trigger it twice.
  useEffect(() => {
    if (secondsLeft === 0 && running && !completedRef.current) {
      completedRef.current = true;
      setRunning(false);
      logSession(true);
      if (soundOn) playChime();
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Focus session complete", {
          body: intention ? `"${intention}" — ${durationMin}m done` : `${durationMin}m session done`,
        });
      }
    }
    if (secondsLeft > 0) {
      completedRef.current = false;
    }
  }, [secondsLeft, running, soundOn, logSession, intention, durationMin]);

  const handleStartPause = () => {
    if (secondsLeft === 0) {
      setSecondsLeft(totalSeconds);
    }
    if (!running && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setRunning((r) => !r);
  };

  const handleReset = () => {
    const wasStarted = secondsLeft !== totalSeconds;
    setRunning(false);
    if (wasStarted && secondsLeft > 0) {
      logSession(false);
    }
    setSecondsLeft(totalSeconds);
  };

  const handleDuration = (min) => {
    if (running) return;
    setDurationMin(min);
    setSecondsLeft(min * 60);
  };

  const addTask = () => {
    const text = newTask.trim();
    if (!text) return;
    setTasks((prev) => [...prev, { id: Date.now(), text, done: false }]);
    setNewTask("");
  };

  const toggleTask = (id) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const removeTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const deleteSession = (id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const startEditing = (s) => {
    setEditingId(s.id);
    setEditingText(s.intention);
  };

  const commitEdit = (id) => {
    const text = editingText.trim();
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, intention: text || s.intention } : s)));
    setEditingId(null);
    setEditingText("");
  };

  const dialLabel = secondsLeft === 0 ? "complete" : running ? "in session" : "ready";

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        background: COLORS.ink,
        color: COLORS.paper,
        minHeight: "100vh",
        padding: "0",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        input[type="text"]::placeholder { color: ${COLORS.slateDark}; }
        .fd-btn {
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          border: 1px solid ${COLORS.mist};
          background: transparent;
          color: ${COLORS.paper};
          transition: all 0.15s ease;
        }
        .fd-btn:hover { border-color: ${COLORS.brass}; color: ${COLORS.brass}; }
        .fd-btn:active { transform: scale(0.97); }
        .fd-btn-primary {
          background: ${COLORS.brass};
          border-color: ${COLORS.brass};
          color: ${COLORS.ink};
          font-weight: 600;
        }
        .fd-btn-primary:hover { background: #d8a852; color: ${COLORS.ink}; border-color: #d8a852; }
        .fd-scroll::-webkit-scrollbar { width: 6px; }
        .fd-scroll::-webkit-scrollbar-thumb { background: ${COLORS.mist}; border-radius: 3px; }
        .fd-icon-btn {
          background: transparent;
          border: none;
          color: ${COLORS.slateDark};
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 2px;
        }
        .fd-icon-btn:hover { color: ${COLORS.brass}; }
      `}</style>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 24px 64px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 36,
            borderBottom: `1px solid ${COLORS.mist}`,
            paddingBottom: 16,
          }}
        >
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, letterSpacing: 0.3 }}>
              Focus deck
            </div>
            <div style={{ fontSize: 12, color: COLORS.slate, marginTop: 2, letterSpacing: 0.5 }}>
              a logbook for deep work
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => setSoundOn((v) => !v)}
              className="fd-icon-btn"
              aria-label={soundOn ? "Mute session end sound" : "Unmute session end sound"}
              title={soundOn ? "Sound on" : "Sound off"}
            >
              {soundOn ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
            <div style={{ fontSize: 12, color: COLORS.slate, textAlign: "right" }}>
              session {sessions.length + 1}
              <br />
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </div>
          </div>
        </div>

        {/* Intention */}
        <div style={{ marginBottom: 28 }}>
          <label
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              color: COLORS.brass,
              textTransform: "uppercase",
              display: "block",
              marginBottom: 8,
            }}
          >
            What are you focusing on
          </label>
          <input
            type="text"
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            placeholder="e.g. Draft the Q3 proposal outline"
            disabled={running}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              borderBottom: `1px solid ${COLORS.mist}`,
              color: COLORS.paper,
              fontSize: 18,
              fontFamily: "'Fraunces', serif",
              padding: "6px 2px",
              outline: "none",
            }}
          />
        </div>

        {/* Main grid: dial + tasks */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: 40,
            alignItems: "start",
          }}
        >
          {/* Dial column */}
          <div style={{ textAlign: "center" }}>
            <Dial
              progress={secondsLeft === 0 ? 1 : progress}
              running={running}
              timeLabel={formatTime(secondsLeft)}
              label={dialLabel}
            />

            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 18 }}>
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => handleDuration(d)}
                  disabled={running}
                  className="fd-btn"
                  style={{
                    padding: "5px 10px",
                    fontSize: 12,
                    borderRadius: 4,
                    opacity: running && durationMin !== d ? 0.4 : 1,
                    background: durationMin === d ? COLORS.mist : "transparent",
                    borderColor: durationMin === d ? COLORS.brass : COLORS.mist,
                    color: durationMin === d ? COLORS.brass : COLORS.paper,
                    cursor: running ? "not-allowed" : "pointer",
                  }}
                >
                  {d}m
                </button>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
              <button
                onClick={handleStartPause}
                className="fd-btn fd-btn-primary"
                style={{
                  padding: "9px 20px",
                  borderRadius: 4,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {running ? <Pause size={14} /> : <Play size={14} />}
                {running ? "Pause" : secondsLeft === 0 ? "Restart" : secondsLeft === totalSeconds ? "Start" : "Resume"}
              </button>
              <button
                onClick={handleReset}
                className="fd-btn"
                style={{
                  padding: "9px 14px",
                  borderRadius: 4,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
          </div>

          {/* Task log column */}
          <div>
            <label
              style={{
                fontSize: 11,
                letterSpacing: 1.5,
                color: COLORS.brass,
                textTransform: "uppercase",
                display: "block",
                marginBottom: 10,
              }}
            >
              Task log
            </label>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                placeholder="Add a task for this session"
                style={{
                  flex: 1,
                  background: COLORS.inkPanel,
                  border: `1px solid ${COLORS.mist}`,
                  color: COLORS.paper,
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 4,
                  outline: "none",
                  fontFamily: "'Inter', sans-serif",
                }}
              />
              <button
                onClick={addTask}
                className="fd-btn"
                style={{ padding: "0 12px", borderRadius: 4, display: "flex", alignItems: "center" }}
                aria-label="Add task"
              >
                <Plus size={16} />
              </button>
            </div>

            <div
              className="fd-scroll"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 260,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {tasks.length === 0 && (
                <div style={{ fontSize: 13, color: COLORS.slateDark, fontStyle: "italic", padding: "8px 2px" }}>
                  No tasks yet — add what you plan to get done.
                </div>
              )}
              {tasks.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    background: COLORS.inkPanel,
                    border: `1px solid ${COLORS.mist}`,
                    borderRadius: 4,
                  }}
                >
                  <button
                    onClick={() => toggleTask(t.id)}
                    aria-label={t.done ? "Mark incomplete" : "Mark complete"}
                    style={{
                      width: 18,
                      height: 18,
                      minWidth: 18,
                      borderRadius: 4,
                      border: `1px solid ${t.done ? COLORS.brass : COLORS.slateDark}`,
                      background: t.done ? COLORS.brass : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    {t.done && <Check size={12} color={COLORS.ink} />}
                  </button>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13.5,
                      color: t.done ? COLORS.slateDark : COLORS.paper,
                      textDecoration: t.done ? "line-through" : "none",
                    }}
                  >
                    {t.text}
                  </span>
                  <button
                    onClick={() => removeTask(t.id)}
                    aria-label="Remove task"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: COLORS.slateDark,
                      cursor: "pointer",
                      display: "flex",
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Session logbook */}
        <div style={{ marginTop: 44, borderTop: `1px solid ${COLORS.mist}`, paddingTop: 20 }}>
          <label
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              color: COLORS.brass,
              textTransform: "uppercase",
              display: "block",
              marginBottom: 12,
            }}
          >
            Logbook
          </label>
          {sessions.length === 0 ? (
            <div style={{ fontSize: 13, color: COLORS.slateDark, fontStyle: "italic" }}>
              Completed and stopped sessions will appear here.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {sessions
                .slice()
                .reverse()
                .map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "70px 1fr 90px 60px 56px",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 0",
                      borderBottom: `1px solid ${COLORS.mist}`,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: COLORS.slate, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                      {s.endedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>

                    {editingId === s.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && commitEdit(s.id)}
                        onBlur={() => commitEdit(s.id)}
                        style={{
                          background: COLORS.inkPanel,
                          border: `1px solid ${COLORS.brass}`,
                          color: COLORS.paper,
                          fontSize: 13,
                          padding: "4px 6px",
                          borderRadius: 4,
                          outline: "none",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => startEditing(s)}
                        style={{ color: COLORS.paper, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                        title="Click to rename"
                      >
                        {s.intention}
                        <Pencil size={11} color={COLORS.slateDark} />
                      </span>
                    )}

                    <span style={{ color: COLORS.slate, fontSize: 12 }}>
                      {s.totalTasks > 0 ? `${s.completedTasks}/${s.totalTasks} tasks` : "—"}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        textAlign: "right",
                        color: s.completed ? COLORS.brass : COLORS.ember,
                        fontWeight: 500,
                      }}
                    >
                      {s.completed ? `${s.minutes}m done` : "stopped"}
                    </span>
                    <button
                      onClick={() => deleteSession(s.id)}
                      className="fd-icon-btn"
                      style={{ justifyContent: "flex-end" }}
                      aria-label="Delete session"
                      title="Delete entry"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
