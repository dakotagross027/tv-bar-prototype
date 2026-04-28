"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "select-game"
  | "select-bars"
  | "pending"
  | "confirmed"
  | "committed";

type Game = {
  id: string;
  sport: string;
  sportEmoji: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  dateLabel: string;
  channel: string;
};

type BarScreen = {
  tier: "Primary" | "Secondary";
  name: string;
};

type Bar = {
  id: string;
  name: string;
  neighborhood: string;
  distance: string;
  screens: BarScreen[];
  availableFrom: string;
  partyCapacity: number;
  responseTime: string;
  vibe: string;
  reliabilityPct: number;
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const GAMES: Game[] = [
  {
    id: "g1",
    sport: "NFL",
    sportEmoji: "🏈",
    homeTeam: "Denver Broncos",
    awayTeam: "Kansas City Chiefs",
    startTime: "7:30 PM",
    dateLabel: "Tonight",
    channel: "NBC",
  },
  {
    id: "g2",
    sport: "NBA",
    sportEmoji: "🏀",
    homeTeam: "Denver Nuggets",
    awayTeam: "LA Lakers",
    startTime: "8:00 PM",
    dateLabel: "Tonight",
    channel: "ESPN",
  },
  {
    id: "g3",
    sport: "NHL",
    sportEmoji: "🏒",
    homeTeam: "Colorado Avalanche",
    awayTeam: "Dallas Stars",
    startTime: "6:00 PM",
    dateLabel: "Tonight",
    channel: "TNT",
  },
  {
    id: "g4",
    sport: "CFB",
    sportEmoji: "🏈",
    homeTeam: "Colorado Buffaloes",
    awayTeam: "Utah Utes",
    startTime: "9:00 PM",
    dateLabel: "Saturday",
    channel: "FOX",
  },
];

const BARS: Bar[] = [
  {
    id: "b1",
    name: "ViewHouse",
    neighborhood: "RiNo",
    distance: "0.3 mi",
    screens: [{ tier: "Primary", name: "Main Bar Screen" }],
    availableFrom: "7:00 PM",
    partyCapacity: 8,
    responseTime: "~3 min",
    vibe: "Lively sports bar · rooftop",
    reliabilityPct: 98,
  },
  {
    id: "b2",
    name: "Fado Irish Pub",
    neighborhood: "LoDo",
    distance: "0.7 mi",
    screens: [{ tier: "Primary", name: "Main Floor Screen" }],
    availableFrom: "7:15 PM",
    partyCapacity: 6,
    responseTime: "~5 min",
    vibe: "Classic sports pub",
    reliabilityPct: 95,
  },
  {
    id: "b3",
    name: "The Tavern Downtown",
    neighborhood: "Downtown",
    distance: "0.9 mi",
    screens: [
      { tier: "Primary", name: "Bar-Side Screen" },
      { tier: "Secondary", name: "Patio Screen" },
    ],
    availableFrom: "7:30 PM",
    partyCapacity: 10,
    responseTime: "~7 min",
    vibe: "High-volume sports bar",
    reliabilityPct: 91,
  },
  {
    id: "b4",
    name: "Blake Street Tavern",
    neighborhood: "LoDo",
    distance: "1.1 mi",
    screens: [{ tier: "Secondary", name: "Second Floor Screen" }],
    availableFrom: "7:00 PM",
    partyCapacity: 4,
    responseTime: "~4 min",
    vibe: "Multi-floor sports bar",
    reliabilityPct: 93,
  },
  {
    id: "b5",
    name: "Punch Bowl Social",
    neighborhood: "LoHi",
    distance: "1.4 mi",
    screens: [{ tier: "Secondary", name: "Lounge Screen" }],
    availableFrom: "7:45 PM",
    partyCapacity: 12,
    responseTime: "~6 min",
    vibe: "Entertainment bar · groups welcome",
    reliabilityPct: 89,
  },
];

// ─── Phase ordering (for step indicator) ─────────────────────────────────────

const PHASE_ORDER: Phase[] = [
  "select-game",
  "select-bars",
  "pending",
  "confirmed",
  "committed",
];

const PHASE_LABELS: Record<Phase, string> = {
  "select-game": "Game",
  "select-bars": "Bars",
  "pending":     "Sent",
  "confirmed":   "Confirm",
  "committed":   "All Set",
};

// ─── Root component ───────────────────────────────────────────────────────────

export default function V2Page() {
  const [phase, setPhase] = useState<Phase>("select-game");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selectedBarIds, setSelectedBarIds] = useState<string[]>([]);
  const [partySize, setPartySize] = useState(2);
  const [confirmedBarId, setConfirmedBarId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);

  // Demo mechanic: auto-confirm the first selected bar after countdown
  useEffect(() => {
    if (phase !== "pending") return;
    if (countdown <= 0) {
      setConfirmedBarId(selectedBarIds[0] ?? null);
      setPhase("confirmed");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, selectedBarIds]);

  function pickGame(game: Game) {
    setSelectedGame(game);
    setSelectedBarIds([]);
    setPhase("select-bars");
  }

  function toggleBar(id: string) {
    setSelectedBarIds((prev) =>
      prev.includes(id)
        ? prev.filter((b) => b !== id)
        : prev.length < 3
        ? [...prev, id]
        : prev
    );
  }

  function sendRequest() {
    if (selectedBarIds.length === 0) return;
    setCountdown(5);
    setPhase("pending");
  }

  function reset() {
    setPhase("select-game");
    setSelectedGame(null);
    setSelectedBarIds([]);
    setPartySize(2);
    setConfirmedBarId(null);
    setCountdown(5);
  }

  const confirmedBar = BARS.find((b) => b.id === confirmedBarId) ?? null;
  const selectedBars = BARS.filter((b) => selectedBarIds.includes(b.id));
  const releasedBars = selectedBars.filter((b) => b.id !== confirmedBarId);

  return (
    <main style={mainSt}>
      {/* Sticky header */}
      <header style={headerSt}>
        <div style={contentSt}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>📺</span>
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.5px" }}>
                  BarTV
                </div>
                <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.06em" }}>
                  V2 PREVIEW · RESERVE YOUR SCREEN
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {phase !== "select-game" && (
                <button onClick={reset} style={ghostBtnSt}>
                  ← New search
                </button>
              )}
              <a href="/" style={{ ...ghostBtnSt, textDecoration: "none", fontSize: 11, color: "#475569" }}>
                V1 App
              </a>
            </div>
          </div>
        </div>
      </header>

      <div style={{ ...contentSt, paddingTop: 32, paddingBottom: 80 }}>
        {/* Step progress bar */}
        <StepBar phase={phase} />

        {/* Phase views */}
        {phase === "select-game" && (
          <SelectGame onPick={pickGame} />
        )}

        {phase === "select-bars" && selectedGame && (
          <SelectBars
            game={selectedGame}
            selectedBarIds={selectedBarIds}
            onToggle={toggleBar}
            partySize={partySize}
            onPartySize={setPartySize}
            onSend={sendRequest}
            onBack={() => setPhase("select-game")}
          />
        )}

        {phase === "pending" && selectedGame && (
          <Pending
            game={selectedGame}
            bars={selectedBars}
            partySize={partySize}
            countdown={countdown}
          />
        )}

        {phase === "confirmed" && selectedGame && confirmedBar && (
          <Confirmed
            game={selectedGame}
            bar={confirmedBar}
            partySize={partySize}
            releasedBars={releasedBars}
            onCommit={() => setPhase("committed")}
          />
        )}

        {phase === "committed" && selectedGame && confirmedBar && (
          <Committed
            game={selectedGame}
            bar={confirmedBar}
            partySize={partySize}
            onReset={reset}
          />
        )}
      </div>
    </main>
  );
}

// ─── StepBar ──────────────────────────────────────────────────────────────────

function StepBar({ phase }: { phase: Phase }) {
  const currentIdx = PHASE_ORDER.indexOf(phase);
  const total = PHASE_ORDER.length;
  const pct = total > 1 ? (currentIdx / (total - 1)) * 100 : 0;

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ height: 3, background: "#1e293b", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
            borderRadius: 2,
            transition: "width 0.5s ease",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {PHASE_ORDER.map((p, i) => {
          const done   = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div
              key={p}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: done ? "#4ade80" : active ? "#60a5fa" : "#334155",
              }}
            >
              {done ? `✓ ${PHASE_LABELS[p].toUpperCase()}` : PHASE_LABELS[p].toUpperCase()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SelectGame ───────────────────────────────────────────────────────────────

function SelectGame({ onPick }: { onPick: (g: Game) => void }) {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={h1St}>Where are you watching tonight?</h1>
        <p style={subtitleSt}>
          Pick a game. We&apos;ll find bars showing it near you — and hold your spot at the best screen.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {GAMES.map((game) => (
          <button key={game.id} onClick={() => onPick(game)} style={gameCardSt}>
            {/* Sport + channel row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={sportBadgeSt}>{game.sport}</div>
              <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>{game.channel}</div>
            </div>

            {/* Emoji */}
            <div style={{ fontSize: 36, marginBottom: 12 }}>{game.sportEmoji}</div>

            {/* Teams */}
            <div style={{ fontWeight: 800, fontSize: 16, color: "#f1f5f9", lineHeight: 1.35, marginBottom: 16 }}>
              {game.awayTeam}
              <span style={{ color: "#334155", fontWeight: 400, fontSize: 13 }}> vs </span>
              {game.homeTeam}
            </div>

            {/* Time row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                paddingTop: 14,
                borderTop: "1px solid #1e293b",
              }}
            >
              <span style={{ fontSize: 13, color: "#86efac", fontWeight: 700 }}>{game.dateLabel}</span>
              <span style={{ fontSize: 13, color: "#475569" }}>·</span>
              <span style={{ fontSize: 13, color: "#64748b" }}>{game.startTime}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── SelectBars ───────────────────────────────────────────────────────────────

function SelectBars({
  game,
  selectedBarIds,
  onToggle,
  partySize,
  onPartySize,
  onSend,
  onBack,
}: {
  game: Game;
  selectedBarIds: string[];
  onToggle: (id: string) => void;
  partySize: number;
  onPartySize: (n: number) => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const count  = selectedBarIds.length;
  const atMax  = count >= 3;

  return (
    <div>
      {/* Selected game recap */}
      <div style={gameRecapSt}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{game.sportEmoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {game.awayTeam} vs {game.homeTeam}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {game.dateLabel} · {game.startTime} · {game.channel}
          </div>
        </div>
        <button onClick={onBack} style={{ ...ghostBtnSt, flexShrink: 0 }}>Change</button>
      </div>

      {/* Section heading */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: "0 0 6px" }}>
          Bars showing this game
        </h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          Select up to 3. First bar to confirm wins your reservation — others are released instantly.
        </p>
      </div>

      {/* Selection counter pill */}
      <div style={selectionCounterSt(count)}>
        <span style={{ fontWeight: 700 }}>
          {count === 0 ? "No bars selected yet" : count === 1 ? "1 bar selected" : `${count} bars selected`}
        </span>
        {count > 0 && count < 3 && (
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {" "}· add up to {3 - count} more
          </span>
        )}
        {count === 3 && (
          <span style={{ fontSize: 12, opacity: 0.7 }}> · maximum reached</span>
        )}
      </div>

      {/* Bar cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        {BARS.map((bar) => {
          const isSelected = selectedBarIds.includes(bar.id);
          const isDisabled = !isSelected && atMax;
          return (
            <button
              key={bar.id}
              onClick={() => !isDisabled && onToggle(bar.id)}
              style={barCardSt(isSelected, isDisabled)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                {/* Left: bar info */}
                <div style={{ flex: 1, textAlign: "left" }}>
                  {/* Name + neighborhood + distance */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 17, color: "#f1f5f9" }}>{bar.name}</span>
                    <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>{bar.neighborhood}</span>
                    <span style={distancePillSt}>📍 {bar.distance}</span>
                  </div>

                  {/* Vibe */}
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>{bar.vibe}</div>

                  {/* Screens + availability pills */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {bar.screens.map((s) => (
                      <div key={s.name} style={screenPillSt(s.tier)}>
                        📺 {s.name}
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                            color: s.tier === "Primary" ? "#fbbf24" : "#64748b",
                          }}
                        >
                          {s.tier === "Primary" ? "★ PRIME" : "STANDARD"}
                        </span>
                      </div>
                    ))}
                    <div style={availPillSt}>⏰ From {bar.availableFrom}</div>
                    <div style={responsePillSt}>⚡ {bar.responseTime}</div>
                  </div>
                </div>

                {/* Right: select toggle */}
                <div style={checkboxSt(isSelected, isDisabled)}>
                  {isSelected ? "✓" : "+"}
                </div>
              </div>

              {/* Reliability bar */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #1e293b" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.05em" }}>
                    CONFIRMS {bar.reliabilityPct}% OF REQUESTS
                  </span>
                  <span style={{ fontSize: 10, color: "#475569" }}>Up to {bar.partyCapacity} guests</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: "#1e293b" }}>
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 2,
                      width: `${bar.reliabilityPct}%`,
                      background:
                        bar.reliabilityPct >= 95
                          ? "#22c55e"
                          : bar.reliabilityPct >= 90
                          ? "#f59e0b"
                          : "#ef4444",
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Party size + send panel */}
      <div style={requestPanelSt}>
        <div style={{ marginBottom: 22 }}>
          <label style={labelSt}>PARTY SIZE</label>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => onPartySize(Math.max(1, partySize - 1))} style={countBtnSt}>
              −
            </button>
            <span style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", minWidth: 28, textAlign: "center" }}>
              {partySize}
            </span>
            <button onClick={() => onPartySize(Math.min(12, partySize + 1))} style={countBtnSt}>
              +
            </button>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              {partySize === 1 ? "guest" : "guests"}
            </span>
          </div>
        </div>

        <button onClick={onSend} disabled={count === 0} style={sendBtnSt(count > 0)}>
          {count === 0
            ? "Select at least one bar to continue"
            : count === 1
            ? "Send Reservation Request →"
            : `Send to All ${count} Bars at Once →`}
        </button>

        {count > 0 && (
          <div style={{ fontSize: 12, color: "#475569", marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
            First bar to confirm wins. The others are released immediately — no action needed from you.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pending ──────────────────────────────────────────────────────────────────

function Pending({
  game,
  bars,
  partySize,
  countdown,
}: {
  game: Game;
  bars: Bar[];
  partySize: number;
  countdown: number;
}) {
  const progressPct = ((5 - countdown) / 5) * 100;

  return (
    <div>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>⚡</div>
        <h1 style={{ ...h1St, textAlign: "center" }}>
          Request sent to {bars.length} {bars.length === 1 ? "bar" : "bars"}
        </h1>
        <p style={{ ...subtitleSt, textAlign: "center" }}>
          Bars are competing to confirm first. Sit tight — this takes seconds.
        </p>
      </div>

      {/* Competing bar cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {bars.map((bar, i) => (
          <div key={bar.id} style={pendingBarCardSt}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>{bar.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {bar.screens[0].name} · {bar.neighborhood} · {bar.distance}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Animated waiting dots */}
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map((j) => (
                    <div
                      key={j}
                      className="live-pulse"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#3b82f6",
                        // Stagger offset per bar and dot
                        animationDelay: `${(i * 0.4 + j * 0.2).toFixed(1)}s`,
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: "#60a5fa", fontWeight: 700 }}>Waiting…</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Countdown progress (demo indicator) */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.05em" }}>
            DEMO AUTO-CONFIRMS IN
          </span>
          <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>{countdown}s</span>
        </div>
        <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              background: "linear-gradient(90deg, #1d4ed8, #60a5fa)",
              borderRadius: 2,
              width: `${progressPct}%`,
              transition: "width 1s linear",
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: "#334155", marginTop: 6, textAlign: "center" }}>
          In a real venue, staff confirms manually — typically in {bars[0]?.responseTime ?? "a few minutes"}
        </div>
      </div>

      {/* Request summary */}
      <div style={summaryCardSt}>
        <div style={summaryLabelSt}>YOUR REQUEST</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <Fact label="Game" value={`${game.awayTeam} vs ${game.homeTeam}`} />
          <Fact label="Date" value={`${game.dateLabel} · ${game.startTime}`} />
          <Fact label="Party" value={`${partySize} ${partySize === 1 ? "guest" : "guests"}`} />
        </div>
      </div>
    </div>
  );
}

// ─── Confirmed ────────────────────────────────────────────────────────────────

function Confirmed({
  game,
  bar,
  partySize,
  releasedBars,
  onCommit,
}: {
  game: Game;
  bar: Bar;
  partySize: number;
  releasedBars: Bar[];
  onCommit: () => void;
}) {
  return (
    <div>
      {/* Confirmed hero */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={confirmedCircleSt}>✓</div>
        <h1 style={{ ...h1St, textAlign: "center" }}>{bar.name} confirmed!</h1>
        <p style={{ ...subtitleSt, textAlign: "center" }}>
          Your screen is reserved. You have 5 minutes to commit — or it&apos;s released.
        </p>
      </div>

      {/* Green reservation card */}
      <div style={confirmedCardSt}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", letterSpacing: "0.08em", marginBottom: 18 }}>
          RESERVATION CONFIRMED
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <Fact label="Venue"         value={bar.name}                                   light />
          <Fact label="Screen"        value={bar.screens[0].name}                        light />
          <Fact label="Game"          value={`${game.homeTeam} vs ${game.awayTeam}`}     light />
          <Fact label="Starts"        value={`${game.dateLabel} · ${game.startTime}`}    light />
          <Fact label="Party"         value={`${partySize} ${partySize === 1 ? "guest" : "guests"}`} light />
          <Fact label="Neighborhood"  value={`${bar.neighborhood} · ${bar.distance}`}    light />
        </div>
      </div>

      {/* Released bars */}
      {releasedBars.length > 0 && (
        <div style={releasedCardSt}>
          <div style={summaryLabelSt}>AUTOMATICALLY RELEASED</div>
          {releasedBars.map((rb) => (
            <div
              key={rb.id}
              style={{ fontSize: 13, color: "#475569", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
            >
              <span style={{ color: "#374151", fontWeight: 700 }}>✕</span>
              {rb.name} — released, no action needed
            </div>
          ))}
        </div>
      )}

      {/* Commitment CTA */}
      <div style={commitPanelSt}>
        <div style={{ fontSize: 13, color: "#60a5fa", fontWeight: 700, marginBottom: 4 }}>
          ⚡ You have 5 minutes to confirm you&apos;re coming
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 20, lineHeight: 1.5 }}>
          If you don&apos;t tap below, {bar.name} gets their spot back and you&apos;ll need to search again.
        </div>
        <button onClick={onCommit} style={imComingBtnSt}>
          I&apos;m Coming →
        </button>
      </div>

      <div style={{ textAlign: "center", fontSize: 12, color: "#374155", marginTop: 12 }}>
        Changed your mind? Tap &ldquo;New search&rdquo; to cancel.
      </div>
    </div>
  );
}

// ─── Committed ────────────────────────────────────────────────────────────────

function Committed({
  game,
  bar,
  partySize,
  onReset,
}: {
  game: Game;
  bar: Bar;
  partySize: number;
  onReset: () => void;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🎉</div>
      <h1 style={{ ...h1St, textAlign: "center" }}>You&apos;re all set!</h1>
      <p style={{ ...subtitleSt, textAlign: "center", marginBottom: 36 }}>
        See you at {bar.name} tonight. Show this screen to the bartender when you arrive.
      </p>

      {/* Reservation summary */}
      <div style={{ ...summaryCardSt, textAlign: "left", marginBottom: 20 }}>
        <div style={summaryLabelSt}>YOUR RESERVATION</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ReservationRow
            icon="📺"
            label={bar.screens[0].name}
            sublabel={`${bar.screens[0].tier} screen · ${bar.name}`}
          />
          <ReservationRow
            icon={game.sportEmoji}
            label={`${game.awayTeam} vs ${game.homeTeam}`}
            sublabel={`${game.dateLabel} · ${game.startTime} · ${game.channel}`}
          />
          <ReservationRow
            icon="👥"
            label={`${partySize} ${partySize === 1 ? "guest" : "guests"}`}
            sublabel={bar.vibe}
          />
          <ReservationRow
            icon="📍"
            label={bar.neighborhood}
            sublabel={`${bar.distance} · respond time ${bar.responseTime}`}
          />
        </div>
      </div>

      {/* Bartender note */}
      <div style={bartenderNoteSt}>
        <span>ℹ️</span>
        Arrive within 30 minutes of game time. After that the bar may release your spot.
      </div>

      <button onClick={onReset} style={{ ...ghostBtnSt, marginTop: 24 }}>
        ← Search another game
      </button>
    </div>
  );
}

// ─── Shared small components ──────────────────────────────────────────────────

function Fact({
  label,
  value,
  light,
}: {
  label: string;
  value: string;
  light?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: light ? "#4ade80" : "#475569",
          marginBottom: 4,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: light ? "#f1f5f9" : "#e2e8f0" }}>
        {value}
      </div>
    </div>
  );
}

function ReservationRow({
  icon,
  label,
  sublabel,
}: {
  icon: string;
  label: string;
  sublabel: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
      <div style={{ fontSize: 22, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>{label}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{sublabel}</div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mainSt: React.CSSProperties = {
  minHeight: "100vh",
  background: "#080e1a",
  color: "#f1f5f9",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const contentSt: React.CSSProperties = {
  maxWidth: 700,
  margin: "0 auto",
  padding: "0 20px",
};

const headerSt: React.CSSProperties = {
  background: "rgba(8,14,26,0.95)",
  borderBottom: "1px solid #1e293b",
  padding: "14px 0",
  position: "sticky",
  top: 0,
  zIndex: 10,
  backdropFilter: "blur(12px)",
};

const ghostBtnSt: React.CSSProperties = {
  background: "none",
  border: "1px solid #1e293b",
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: 8,
  cursor: "pointer",
  letterSpacing: "0.01em",
};

const h1St: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  color: "#f1f5f9",
  margin: "0 0 8px",
  letterSpacing: "-0.5px",
  lineHeight: 1.2,
};

const subtitleSt: React.CSSProperties = {
  fontSize: 15,
  color: "#64748b",
  margin: 0,
  lineHeight: 1.5,
};

const gameCardSt: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 18,
  padding: 22,
  textAlign: "left",
  cursor: "pointer",
  color: "white",
  width: "100%",
  transition: "border-color 0.15s, background 0.15s",
};

const sportBadgeSt: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#60a5fa",
  background: "rgba(59,130,246,0.1)",
  border: "1px solid rgba(59,130,246,0.2)",
  padding: "3px 9px",
  borderRadius: 999,
};

const gameRecapSt: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 14,
  padding: "14px 18px",
  marginBottom: 24,
};

function selectionCounterSt(n: number): React.CSSProperties {
  return {
    marginBottom: 16,
    padding: "10px 16px",
    borderRadius: 10,
    background: n === 0 ? "#0f172a" : n < 3 ? "#0d1f3c" : "#0a1628",
    border: `1px solid ${n === 0 ? "#1e293b" : n < 3 ? "#1e3a5f" : "#2d4a8a"}`,
    color: n === 0 ? "#475569" : "#93c5fd",
    fontSize: 13,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 6,
  };
}

function barCardSt(isSelected: boolean, isDisabled: boolean): React.CSSProperties {
  return {
    background: isSelected ? "#0e1f3d" : "#0f172a",
    border: isSelected ? "2px solid #3b82f6" : "1px solid #1e293b",
    borderRadius: 16,
    padding: 18,
    textAlign: "left",
    cursor: isDisabled ? "not-allowed" : "pointer",
    color: "white",
    opacity: isDisabled ? 0.4 : 1,
    width: "100%",
    boxShadow: isSelected ? "0 0 0 4px rgba(59,130,246,0.1)" : "none",
    transition: "border-color 0.15s, background 0.15s",
  };
}

const distancePillSt: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#94a3b8",
  background: "#1e293b",
  padding: "2px 8px",
  borderRadius: 999,
};

function screenPillSt(tier: "Primary" | "Secondary"): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    background: tier === "Primary" ? "rgba(251,191,36,0.07)" : "#111827",
    border: `1px solid ${tier === "Primary" ? "rgba(251,191,36,0.2)" : "#1e293b"}`,
    color: tier === "Primary" ? "#fbbf24" : "#64748b",
    padding: "4px 10px",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    gap: 4,
    whiteSpace: "nowrap" as const,
  };
}

const availPillSt: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(34,197,94,0.07)",
  border: "1px solid rgba(34,197,94,0.18)",
  color: "#86efac",
  padding: "4px 10px",
  borderRadius: 8,
  whiteSpace: "nowrap",
};

const responsePillSt: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(59,130,246,0.07)",
  border: "1px solid rgba(59,130,246,0.18)",
  color: "#60a5fa",
  padding: "4px 10px",
  borderRadius: 8,
  whiteSpace: "nowrap",
};

function checkboxSt(isSelected: boolean, isDisabled: boolean): React.CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: "50%",
    flexShrink: 0,
    background: isSelected ? "#3b82f6" : "#1e293b",
    border: `2px solid ${isSelected ? "#60a5fa" : "#334155"}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    fontWeight: 700,
    color: isSelected ? "white" : isDisabled ? "#374151" : "#64748b",
    marginTop: 4,
    transition: "background 0.15s",
  };
}

const requestPanelSt: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 18,
  padding: 24,
};

const labelSt: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  letterSpacing: "0.08em",
  marginBottom: 12,
};

const countBtnSt: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: "#1e293b",
  border: "1px solid #334155",
  color: "#f1f5f9",
  fontSize: 22,
  fontWeight: 400,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

function sendBtnSt(enabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "18px",
    borderRadius: 14,
    border: "none",
    background: enabled ? "linear-gradient(135deg, #1d4ed8, #2563eb)" : "#1e293b",
    color: enabled ? "white" : "#475569",
    fontWeight: 800,
    fontSize: 16,
    cursor: enabled ? "pointer" : "not-allowed",
    letterSpacing: "-0.2px",
    boxShadow: enabled ? "0 4px 20px rgba(37,99,235,0.25)" : "none",
    transition: "box-shadow 0.2s",
  };
}

const pendingBarCardSt: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e3a5f",
  borderRadius: 14,
  padding: "16px 20px",
};

const summaryCardSt: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 14,
  padding: "18px 20px",
};

const summaryLabelSt: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#475569",
  letterSpacing: "0.08em",
  marginBottom: 14,
};

const confirmedCircleSt: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #16a34a, #15803d)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 32,
  color: "white",
  fontWeight: 700,
  margin: "0 auto 20px",
  boxShadow: "0 0 0 12px rgba(22,163,74,0.1), 0 0 0 24px rgba(22,163,74,0.05)",
};

const confirmedCardSt: React.CSSProperties = {
  background: "linear-gradient(135deg, #041f0e, #0c1a10)",
  border: "1px solid #16a34a",
  borderRadius: 20,
  padding: 24,
  marginBottom: 16,
  boxShadow: "0 0 0 1px rgba(22,163,74,0.08)",
};

const releasedCardSt: React.CSSProperties = {
  marginBottom: 20,
  padding: "14px 18px",
  background: "#0f172a",
  borderRadius: 12,
  border: "1px solid #1e293b",
};

const commitPanelSt: React.CSSProperties = {
  background: "#0b1628",
  border: "1px solid #1e3a5f",
  borderRadius: 18,
  padding: "20px 24px",
  marginBottom: 16,
  textAlign: "center",
};

const imComingBtnSt: React.CSSProperties = {
  width: "100%",
  padding: "20px",
  borderRadius: 14,
  background: "linear-gradient(135deg, #16a34a, #15803d)",
  border: "none",
  color: "white",
  fontWeight: 800,
  fontSize: 19,
  cursor: "pointer",
  letterSpacing: "-0.3px",
  boxShadow: "0 4px 24px rgba(22,163,74,0.3)",
};

const bartenderNoteSt: React.CSSProperties = {
  padding: "14px 20px",
  background: "#0a1628",
  border: "1px solid #1e3a5f",
  borderRadius: 12,
  fontSize: 13,
  color: "#60a5fa",
  display: "flex",
  alignItems: "center",
  gap: 10,
  justifyContent: "center",
};
