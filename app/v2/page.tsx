"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "select-game"
  | "select-screen"
  | "pending"
  | "confirmed"
  | "committed";

type ScreenType = "house" | "flexible" | "premium";
type DisruptionLevel = "none" | "low" | "moderate" | "high";
type TimeSlotId = "pregame" | "kickoff" | "halftime";

type Game = {
  id: string;
  sport: string;
  sportEmoji: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  dateLabel: string;
  channel: string;
  pregameLabel: string;
  halftimeLabel: string;
  estimatedEnd: string;
};

type VenueScreen = {
  id: string;
  barName: string;
  neighborhood: string;
  distance: string;
  responseTime: string;
  screenName: string;
  type: ScreenType;
  currentlyShowing: string | null;
  occupiedSeats: number;
  totalSeats: number;
  disruption: DisruptionLevel;
  recommended: boolean;
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const GAMES: Game[] = [
  {
    id: "g1", sport: "NFL", sportEmoji: "🏈",
    homeTeam: "Denver Broncos", awayTeam: "Kansas City Chiefs",
    startTime: "7:30 PM", dateLabel: "Tonight", channel: "NBC",
    pregameLabel: "7:00 PM", halftimeLabel: "~9:15 PM", estimatedEnd: "~11:00 PM",
  },
  {
    id: "g2", sport: "NBA", sportEmoji: "🏀",
    homeTeam: "Denver Nuggets", awayTeam: "LA Lakers",
    startTime: "8:00 PM", dateLabel: "Tonight", channel: "ESPN",
    pregameLabel: "7:30 PM", halftimeLabel: "~9:15 PM", estimatedEnd: "~10:30 PM",
  },
  {
    id: "g3", sport: "NHL", sportEmoji: "🏒",
    homeTeam: "Colorado Avalanche", awayTeam: "Dallas Stars",
    startTime: "6:00 PM", dateLabel: "Tonight", channel: "TNT",
    pregameLabel: "5:30 PM", halftimeLabel: "~7:30 PM", estimatedEnd: "~8:45 PM",
  },
  {
    id: "g4", sport: "CFB", sportEmoji: "🏈",
    homeTeam: "Colorado Buffaloes", awayTeam: "Utah Utes",
    startTime: "9:00 PM", dateLabel: "Saturday", channel: "FOX",
    pregameLabel: "8:30 PM", halftimeLabel: "~10:45 PM", estimatedEnd: "~12:30 AM",
  },
];

// Flat list of all reservable + house screens across venues.
// Pre-sorted: flexible/none disruption → premium/none → flexible/low → flexible/moderate → house (not reservable).
// recommended=true marks the smart engine's top picks.
const SCREENS: VenueScreen[] = [
  // ── Best matches: flexible, idle ───────────────────────────────────────────
  {
    id: "s1", barName: "ViewHouse", neighborhood: "RiNo", distance: "0.3 mi",
    responseTime: "~3 min", screenName: "Patio TV", type: "flexible",
    currentlyShowing: null, occupiedSeats: 0, totalSeats: 8,
    disruption: "none", recommended: true,
  },
  {
    id: "s2", barName: "Fado Irish Pub", neighborhood: "LoDo", distance: "0.7 mi",
    responseTime: "~5 min", screenName: "Back Bar TV", type: "flexible",
    currentlyShowing: null, occupiedSeats: 0, totalSeats: 6,
    disruption: "none", recommended: true,
  },
  {
    id: "s3", barName: "The Tavern Downtown", neighborhood: "Downtown", distance: "0.9 mi",
    responseTime: "~7 min", screenName: "Booth B TV", type: "flexible",
    currentlyShowing: null, occupiedSeats: 0, totalSeats: 4,
    disruption: "none", recommended: true,
  },
  {
    id: "s4", barName: "Blake Street Tavern", neighborhood: "LoDo", distance: "1.1 mi",
    responseTime: "~4 min", screenName: "Side Patio TV", type: "flexible",
    currentlyShowing: null, occupiedSeats: 0, totalSeats: 6,
    disruption: "none", recommended: false,
  },
  // ── Premium screens (idle, needs approval) ─────────────────────────────────
  {
    id: "s5", barName: "ViewHouse", neighborhood: "RiNo", distance: "0.3 mi",
    responseTime: "~3 min", screenName: "VIP Booth Screen", type: "premium",
    currentlyShowing: null, occupiedSeats: 0, totalSeats: 4,
    disruption: "none", recommended: false,
  },
  // ── Flexible with active viewers ──────────────────────────────────────────
  {
    id: "s6", barName: "The Tavern Downtown", neighborhood: "Downtown", distance: "0.9 mi",
    responseTime: "~7 min", screenName: "Booth A TV", type: "flexible",
    currentlyShowing: "Local News", occupiedSeats: 2, totalSeats: 4,
    disruption: "low", recommended: false,
  },
  {
    id: "s7", barName: "Blake Street Tavern", neighborhood: "LoDo", distance: "1.1 mi",
    responseTime: "~4 min", screenName: "Main Bar TV", type: "flexible",
    currentlyShowing: "College Football Highlights", occupiedSeats: 4, totalSeats: 8,
    disruption: "moderate", recommended: false,
  },
  // ── House screens (not reservable — shown for transparency) ───────────────
  {
    id: "h1", barName: "ViewHouse", neighborhood: "RiNo", distance: "0.3 mi",
    responseTime: "", screenName: "Main Bar Screen", type: "house",
    currentlyShowing: "Broncos Pre-Game Show", occupiedSeats: 14, totalSeats: 20,
    disruption: "high", recommended: false,
  },
  {
    id: "h2", barName: "Fado Irish Pub", neighborhood: "LoDo", distance: "0.7 mi",
    responseTime: "", screenName: "Main Floor TV", type: "house",
    currentlyShowing: "Premier League: Arsenal vs Chelsea", occupiedSeats: 9, totalSeats: 12,
    disruption: "high", recommended: false,
  },
  {
    id: "h3", barName: "The Tavern Downtown", neighborhood: "Downtown", distance: "0.9 mi",
    responseTime: "", screenName: "Stage TV", type: "house",
    currentlyShowing: "Nuggets vs Lakers (3rd quarter)", occupiedSeats: 16, totalSeats: 20,
    disruption: "high", recommended: false,
  },
  {
    id: "h4", barName: "Blake Street Tavern", neighborhood: "LoDo", distance: "1.1 mi",
    responseTime: "", screenName: "Primary Bar TV", type: "house",
    currentlyShowing: "NFL RedZone", occupiedSeats: 6, totalSeats: 12,
    disruption: "high", recommended: false,
  },
];

// Separating reservable vs house for rendering
const RESERVABLE = SCREENS.filter((s) => s.type !== "house");
const HOUSE      = SCREENS.filter((s) => s.type === "house");

// Phase ordering for step bar
const PHASE_ORDER: Phase[] = [
  "select-game", "select-screen", "pending", "confirmed", "committed",
];
const PHASE_LABELS: Record<Phase, string> = {
  "select-game":   "Game",
  "select-screen": "Screen",
  "pending":       "Sent",
  "confirmed":     "Confirm",
  "committed":     "All Set",
};

// ─── Root component ───────────────────────────────────────────────────────────

export default function V2Page() {
  const [phase,            setPhase]            = useState<Phase>("select-game");
  const [selectedGame,     setSelectedGame]     = useState<Game | null>(null);
  const [selectedIds,      setSelectedIds]      = useState<string[]>([]);
  const [partySize,        setPartySize]        = useState(2);
  const [selectedSlot,     setSelectedSlot]     = useState<TimeSlotId>("kickoff");
  const [confirmedId,      setConfirmedId]      = useState<string | null>(null);
  const [countdown,        setCountdown]        = useState(6);
  const [houseExpanded,    setHouseExpanded]    = useState(false);

  // Demo: auto-confirm the first selected screen after countdown
  useEffect(() => {
    if (phase !== "pending") return;
    if (countdown <= 0) {
      setConfirmedId(selectedIds[0] ?? null);
      setPhase("confirmed");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, selectedIds]);

  function pickGame(game: Game) {
    setSelectedGame(game);
    setSelectedIds([]);
    setSelectedSlot("kickoff");
    setPhase("select-screen");
  }

  function toggleScreen(id: string) {
    const screen = SCREENS.find((s) => s.id === id);
    if (!screen || screen.type === "house") return;
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length < 3
        ? [...prev, id]
        : prev
    );
  }

  function sendRequest() {
    if (selectedIds.length === 0) return;
    setCountdown(6);
    setPhase("pending");
  }

  function reset() {
    setPhase("select-game");
    setSelectedGame(null);
    setSelectedIds([]);
    setPartySize(2);
    setSelectedSlot("kickoff");
    setConfirmedId(null);
    setCountdown(6);
    setHouseExpanded(false);
  }

  const confirmedScreen  = SCREENS.find((s) => s.id === confirmedId) ?? null;
  const selectedScreens  = SCREENS.filter((s) => selectedIds.includes(s.id));
  const releasedScreens  = selectedScreens.filter((s) => s.id !== confirmedId);

  function slotLabel(slot: TimeSlotId, game: Game): string {
    if (slot === "pregame")  return `${game.pregameLabel} — pre-game arrival`;
    if (slot === "kickoff")  return `${game.startTime} — from kickoff`;
    return `${game.halftimeLabel} — from halftime`;
  }

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
                  V2 PREVIEW · FIND YOUR GAME WITHOUT THE FRICTION
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {phase !== "select-game" && (
                <button onClick={reset} style={ghostBtnSt}>← New search</button>
              )}
              <a href="/" style={{ ...ghostBtnSt, textDecoration: "none", fontSize: 11, color: "#475569" }}>
                V1 App
              </a>
            </div>
          </div>
        </div>
      </header>

      <div style={{ ...contentSt, paddingTop: 32, paddingBottom: 80 }}>
        <StepBar phase={phase} />

        {phase === "select-game" && (
          <SelectGame onPick={pickGame} />
        )}

        {phase === "select-screen" && selectedGame && (
          <SelectScreen
            game={selectedGame}
            selectedIds={selectedIds}
            onToggle={toggleScreen}
            partySize={partySize}
            onPartySize={setPartySize}
            selectedSlot={selectedSlot}
            onSlot={setSelectedSlot}
            houseExpanded={houseExpanded}
            onToggleHouse={() => setHouseExpanded((v) => !v)}
            onSend={sendRequest}
            onBack={() => setPhase("select-game")}
          />
        )}

        {phase === "pending" && selectedGame && (
          <Pending
            game={selectedGame}
            screens={selectedScreens}
            partySize={partySize}
            slot={selectedSlot}
            countdown={countdown}
          />
        )}

        {phase === "confirmed" && selectedGame && confirmedScreen && (
          <Confirmed
            game={selectedGame}
            screen={confirmedScreen}
            partySize={partySize}
            slot={selectedSlot}
            releasedScreens={releasedScreens}
            slotLabel={slotLabel(selectedSlot, selectedGame)}
            onCommit={() => setPhase("committed")}
          />
        )}

        {phase === "committed" && selectedGame && confirmedScreen && (
          <Committed
            game={selectedGame}
            screen={confirmedScreen}
            partySize={partySize}
            slotLabel={slotLabel(selectedSlot, selectedGame)}
            onReset={reset}
          />
        )}
      </div>
    </main>
  );
}

// ─── StepBar ──────────────────────────────────────────────────────────────────

function StepBar({ phase }: { phase: Phase }) {
  const idx = PHASE_ORDER.indexOf(phase);
  const pct = PHASE_ORDER.length > 1 ? (idx / (PHASE_ORDER.length - 1)) * 100 : 0;
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ height: 3, background: "#1e293b", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 2,
          width: `${pct}%`,
          background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
          transition: "width 0.5s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {PHASE_ORDER.map((p, i) => {
          const done   = i < idx;
          const active = i === idx;
          return (
            <div key={p} style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: done ? "#4ade80" : active ? "#60a5fa" : "#334155",
            }}>
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
          Pick a game. We&apos;ll match you to the right screen —
          without disrupting anyone already watching.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {GAMES.map((game) => (
          <button key={game.id} onClick={() => onPick(game)} style={gameCardSt}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={sportBadgeSt}>{game.sport}</div>
              <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>{game.channel}</div>
            </div>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{game.sportEmoji}</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#f1f5f9", lineHeight: 1.35, marginBottom: 16 }}>
              {game.awayTeam}
              <span style={{ color: "#334155", fontWeight: 400, fontSize: 13 }}> vs </span>
              {game.homeTeam}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 14, borderTop: "1px solid #1e293b" }}>
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

// ─── SelectScreen ─────────────────────────────────────────────────────────────

function SelectScreen({
  game, selectedIds, onToggle, partySize, onPartySize,
  selectedSlot, onSlot, houseExpanded, onToggleHouse, onSend, onBack,
}: {
  game: Game;
  selectedIds: string[];
  onToggle: (id: string) => void;
  partySize: number;
  onPartySize: (n: number) => void;
  selectedSlot: TimeSlotId;
  onSlot: (s: TimeSlotId) => void;
  houseExpanded: boolean;
  onToggleHouse: () => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const count = selectedIds.length;
  const atMax = count >= 3;

  const hasHighDisruptionSelected = selectedIds.some((id) => {
    const s = SCREENS.find((sc) => sc.id === id);
    return s && (s.disruption === "moderate" || s.disruption === "high");
  });

  return (
    <div>
      {/* Game recap */}
      <div style={gameRecapSt}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{game.sportEmoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {game.awayTeam} vs {game.homeTeam}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {game.dateLabel} · {game.startTime} · {game.channel}
          </div>
        </div>
        <button onClick={onBack} style={{ ...ghostBtnSt, flexShrink: 0 }}>Change</button>
      </div>

      {/* Headings */}
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: "0 0 6px" }}>
          Available screens
        </h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 4px" }}>
          Select up to 3. We ranked them by how little disruption they cause —
          the top options are already idle.
        </p>
        <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>
          Staff reviews and approves all requests. First bar to confirm wins your reservation.
        </p>
      </div>

      {/* Selection counter */}
      <div style={selectionCounterSt(count)}>
        <span style={{ fontWeight: 700 }}>
          {count === 0 ? "No screens selected" : count === 1 ? "1 screen selected" : `${count} screens selected`}
        </span>
        {count > 0 && count < 3 && (
          <span style={{ opacity: 0.7, fontSize: 12 }}> · add up to {3 - count} more</span>
        )}
        {count >= 3 && (
          <span style={{ opacity: 0.7, fontSize: 12 }}> · maximum reached</span>
        )}
      </div>

      {/* Disruption warning for selected moderate/high screens */}
      {hasHighDisruptionSelected && (
        <div style={disruptionWarningSt}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ One of your screens has active viewers</div>
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
            Staff will check whether switching affects guests who are already watching.
            They may suggest an alternative — or approve it if the timing works out.
          </div>
        </div>
      )}

      {/* Reservable screen list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {RESERVABLE.map((screen) => {
          const isSelected = selectedIds.includes(screen.id);
          const isDisabled = !isSelected && atMax;
          return (
            <button
              key={screen.id}
              onClick={() => !isDisabled && onToggle(screen.id)}
              style={screenCardSt(isSelected, isDisabled, screen.type)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                {/* Left content */}
                <div style={{ flex: 1, textAlign: "left" }}>
                  {/* Top row: badges */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, alignItems: "center" }}>
                    {screen.recommended && (
                      <div style={bestMatchBadgeSt}>★ BEST MATCH</div>
                    )}
                    <div style={screenTypeBadgeSt(screen.type)}>
                      {screen.type === "flexible" ? "✅ FLEXIBLE" : "⭐ PREMIUM"}
                    </div>
                    <div style={disruptionBadgeSt(screen.disruption)}>
                      {disruptionLabel(screen.disruption)}
                    </div>
                  </div>

                  {/* Screen + bar name */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: "#f1f5f9" }}>
                      {screen.screenName}
                    </span>
                    <span style={{ fontSize: 12, color: "#475569" }}>at</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#94a3b8" }}>
                      {screen.barName}
                    </span>
                    <span style={distancePillSt}>📍 {screen.distance}</span>
                  </div>

                  {/* Status line */}
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                    {screen.currentlyShowing
                      ? `Currently showing: ${screen.currentlyShowing} · ${screen.occupiedSeats} guest${screen.occupiedSeats !== 1 ? "s" : ""} watching`
                      : `Currently idle · ${screen.totalSeats} seat capacity`}
                  </div>

                  {/* Response time */}
                  {screen.responseTime && (
                    <div style={responsePillSt}>⚡ {screen.responseTime} response</div>
                  )}

                  {/* Premium note */}
                  {screen.type === "premium" && (
                    <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8, fontWeight: 600 }}>
                      Requires stronger staff approval · Prime screen
                    </div>
                  )}
                </div>

                {/* Right: checkbox */}
                <div style={checkboxSt(isSelected, isDisabled)}>
                  {isSelected ? "✓" : "+"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* House screens — collapsed section */}
      <div style={{ marginBottom: 28 }}>
        <button onClick={onToggleHouse} style={houseSectionToggleSt}>
          <span style={{ fontWeight: 700, color: "#64748b", fontSize: 13 }}>
            🔒 {HOUSE.length} house-controlled screen{HOUSE.length !== 1 ? "s" : ""} (not reservable)
          </span>
          <span style={{ color: "#475569", fontSize: 12 }}>{houseExpanded ? "▲ hide" : "▼ show"}</span>
        </button>

        {houseExpanded && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <p style={{ fontSize: 12, color: "#475569", margin: "0 0 8px", lineHeight: 1.5 }}>
              These screens are managed directly by staff — for major local games, playoffs, and prime viewing areas.
              They&apos;re not reservable through BarTV, which protects guests already watching.
            </p>
            {HOUSE.map((screen) => (
              <div key={screen.id} style={houseCardSt}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#6b7280" }}>
                        {screen.screenName}
                      </span>
                      <span style={{ fontSize: 11, color: "#4b5563" }}>at {screen.barName}</span>
                      <div style={houseTypeBadgeSt}>🔒 HOUSE</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#4b5563" }}>
                      {screen.currentlyShowing
                        ? `${screen.currentlyShowing} · ${screen.occupiedSeats}/${screen.totalSeats} seats occupied`
                        : "Idle"}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#374151", fontWeight: 600, flexShrink: 0 }}>
                    Staff only
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Request panel: time slot + party size + send */}
      <div style={requestPanelSt}>
        {/* Time block selection */}
        <div style={{ marginBottom: 22 }}>
          <label style={labelSt}>RESERVE FOR</label>
          <p style={{ fontSize: 12, color: "#475569", margin: "0 0 12px", lineHeight: 1.4 }}>
            Choose a future time block — not an immediate takeover.
            Staff confirms whether the timing works for the room.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["pregame", "kickoff", "halftime"] as TimeSlotId[]).map((slot) => {
              const isActive = selectedSlot === slot;
              return (
                <button
                  key={slot}
                  onClick={() => onSlot(slot)}
                  style={slotBtnSt(isActive)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: isActive ? "#f1f5f9" : "#94a3b8" }}>
                        {slot === "pregame"  ? "Pre-game arrival"  :
                         slot === "kickoff"  ? "From kickoff"      :
                                              "From halftime"}
                      </div>
                      <div style={{ fontSize: 12, color: isActive ? "#94a3b8" : "#475569", marginTop: 2 }}>
                        {slot === "pregame"  ? `Starts at ${game.pregameLabel} · until game end (est. ${game.estimatedEnd})` :
                         slot === "kickoff"  ? `Starts at ${game.startTime} · until game end (est. ${game.estimatedEnd})` :
                                              `Starts at ${game.halftimeLabel} · until game end (est. ${game.estimatedEnd})`}
                      </div>
                    </div>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${isActive ? "#3b82f6" : "#334155"}`,
                      background: isActive ? "#3b82f6" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isActive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Party size */}
        <div style={{ marginBottom: 22 }}>
          <label style={labelSt}>PARTY SIZE</label>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => onPartySize(Math.max(1, partySize - 1))} style={countBtnSt}>−</button>
            <span style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", minWidth: 28, textAlign: "center" }}>
              {partySize}
            </span>
            <button onClick={() => onPartySize(Math.min(12, partySize + 1))} style={countBtnSt}>+</button>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              {partySize === 1 ? "guest" : "guests"}
            </span>
          </div>
        </div>

        {/* Send */}
        <button onClick={onSend} disabled={count === 0} style={sendBtnSt(count > 0)}>
          {count === 0
            ? "Select at least one screen to continue"
            : count === 1
            ? "Send Reservation Request →"
            : `Send to All ${count} Venues at Once →`}
        </button>
        {count > 0 && (
          <div style={{ fontSize: 12, color: "#475569", marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
            Staff reviews and approves your request. First venue to confirm wins —
            others are released automatically.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pending ──────────────────────────────────────────────────────────────────

function Pending({
  game, screens, partySize, slot, countdown,
}: {
  game: Game;
  screens: VenueScreen[];
  partySize: number;
  slot: TimeSlotId;
  countdown: number;
}) {
  const progressPct = ((6 - countdown) / 6) * 100;

  const slotDescription =
    slot === "pregame" ? `Pre-game · ${game.pregameLabel}` :
    slot === "kickoff" ? `From kickoff · ${game.startTime}` :
                         `From halftime · ${game.halftimeLabel}`;

  return (
    <div>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <h1 style={{ ...h1St, textAlign: "center" }}>
          Staff is reviewing your request
        </h1>
        <p style={{ ...subtitleSt, textAlign: "center" }}>
          They&apos;ll check what&apos;s currently on and whether
          your time block works for the room. This takes seconds.
        </p>
      </div>

      {/* Competing screens */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {screens.map((screen, i) => (
          <div key={screen.id} style={pendingScreenCardSt}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>
                  {screen.screenName}
                  <span style={{ fontWeight: 400, color: "#475569", fontSize: 13 }}> at </span>
                  {screen.barName}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {screen.currentlyShowing
                    ? `Currently: ${screen.currentlyShowing} · ${screen.occupiedSeats} watching`
                    : "Currently idle"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map((j) => (
                    <div
                      key={j}
                      className="live-pulse"
                      style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: "#3b82f6",
                        animationDelay: `${(i * 0.4 + j * 0.2).toFixed(1)}s`,
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: "#60a5fa", fontWeight: 700 }}>Reviewing…</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* What staff sees — transparency panel */}
      <div style={staffPreviewCardSt}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", letterSpacing: "0.08em", marginBottom: 14 }}>
          📋 WHAT STAFF SEES WITH YOUR REQUEST
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <StaffPreviewRow icon="🎮" label="Game requested" value={`${game.awayTeam} vs ${game.homeTeam}`} />
          <StaffPreviewRow icon="⏰" label="Time block" value={slotDescription} />
          <StaffPreviewRow icon="👥" label="Party size" value={`${partySize} ${partySize === 1 ? "guest" : "guests"}`} />
          {screens.map((s) => (
            <div key={s.id} style={{ paddingTop: 8, borderTop: "1px solid #1e293b" }}>
              <StaffPreviewRow
                icon="📺"
                label={`${s.screenName} at ${s.barName}`}
                value={
                  s.disruption === "none"
                    ? "Currently idle — no disruption risk"
                    : s.disruption === "low"
                    ? `Showing: ${s.currentlyShowing} · ${s.occupiedSeats} guest${s.occupiedSeats !== 1 ? "s" : ""} · low risk`
                    : `Showing: ${s.currentlyShowing} · ${s.occupiedSeats} guest${s.occupiedSeats !== 1 ? "s" : ""} · staff will assess`
                }
              />
              <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.05em" }}>
                  DISRUPTION RISK:
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: disruptionColor(s.disruption),
                  background: disruptionBg(s.disruption),
                  padding: "2px 7px", borderRadius: 999,
                  border: `1px solid ${disruptionBorder(s.disruption)}`,
                }}>
                  {disruptionLabel(s.disruption).toUpperCase()}
                </span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#475569", paddingTop: 8, borderTop: "1px solid #1e293b", lineHeight: 1.5 }}>
            ℹ️ Staff retains full override at all times. They can suggest a less disruptive
            alternative or hold this request until the current game ends.
          </div>
        </div>
      </div>

      {/* Countdown (demo indicator) */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.05em" }}>
            DEMO AUTO-CONFIRMS IN
          </span>
          <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>{countdown}s</span>
        </div>
        <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2,
            width: `${progressPct}%`,
            background: "linear-gradient(90deg, #1d4ed8, #60a5fa)",
            transition: "width 1s linear",
          }} />
        </div>
        <div style={{ fontSize: 11, color: "#334155", marginTop: 6, textAlign: "center" }}>
          In a real venue, staff confirms manually via their dashboard
        </div>
      </div>
    </div>
  );
}

// ─── Confirmed ────────────────────────────────────────────────────────────────

function Confirmed({
  game, screen, partySize, releasedScreens, slotLabel, onCommit,
}: {
  game: Game;
  screen: VenueScreen;
  partySize: number;
  slot: TimeSlotId;
  releasedScreens: VenueScreen[];
  slotLabel: string;
  onCommit: () => void;
}) {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={confirmedCircleSt}>✓</div>
        <h1 style={{ ...h1St, textAlign: "center" }}>{screen.barName} confirmed!</h1>
        <p style={{ ...subtitleSt, textAlign: "center" }}>
          {screen.screenName} is reserved for your time block.
          You have <strong style={{ color: "#f1f5f9" }}>15 minutes</strong> to confirm you&apos;re coming.
        </p>
      </div>

      {/* Reservation card */}
      <div style={confirmedCardSt}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", letterSpacing: "0.08em", marginBottom: 18 }}>
          RESERVATION CONFIRMED
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <Fact label="Venue"       value={screen.barName}                                  light />
          <Fact label="Screen"      value={screen.screenName}                               light />
          <Fact label="Game"        value={`${game.awayTeam} vs ${game.homeTeam}`}          light />
          <Fact label="Time block"  value={slotLabel}                                       light />
          <Fact label="Party"       value={`${partySize} ${partySize === 1 ? "guest" : "guests"}`} light />
          <Fact label="Location"    value={`${screen.neighborhood} · ${screen.distance}`}   light />
        </div>
      </div>

      {/* Released screens */}
      {releasedScreens.length > 0 && (
        <div style={releasedCardSt}>
          <div style={summaryLabelSt}>AUTOMATICALLY RELEASED</div>
          {releasedScreens.map((rs) => (
            <div key={rs.id} style={{ fontSize: 13, color: "#475569", display: "flex", gap: 8, marginBottom: 4 }}>
              <span style={{ color: "#374151", fontWeight: 700 }}>✕</span>
              {rs.screenName} at {rs.barName} — released, no action needed
            </div>
          ))}
        </div>
      )}

      {/* Commitment CTA */}
      <div style={commitPanelSt}>
        <div style={{ fontSize: 13, color: "#60a5fa", fontWeight: 700, marginBottom: 4 }}>
          ⚡ Confirm within 15 minutes or your spot is released
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 20, lineHeight: 1.5 }}>
          If you don&apos;t tap below, {screen.barName} gets their slot back automatically.
          No ghost reservations — this keeps the bar protected.
        </div>
        <button onClick={onCommit} style={imComingBtnSt}>
          I&apos;m Coming →
        </button>
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: "#374155", marginTop: 10 }}>
        Changed your mind? Tap &ldquo;New search&rdquo; to cancel.
      </div>
    </div>
  );
}

// ─── Committed ────────────────────────────────────────────────────────────────

function Committed({
  game, screen, partySize, slotLabel, onReset,
}: {
  game: Game;
  screen: VenueScreen;
  partySize: number;
  slotLabel: string;
  onReset: () => void;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🎉</div>
      <h1 style={{ ...h1St, textAlign: "center" }}>You&apos;re all set!</h1>
      <p style={{ ...subtitleSt, textAlign: "center", marginBottom: 36 }}>
        See you at {screen.barName}. Show this screen to the bartender when you arrive.
      </p>

      <div style={{ ...summaryCardSt, textAlign: "left", marginBottom: 20 }}>
        <div style={summaryLabelSt}>YOUR RESERVATION</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ReservationRow icon="📺" label={screen.screenName} sublabel={`${screen.type === "premium" ? "⭐ Premium screen" : "✅ Flexible screen"} · ${screen.barName}`} />
          <ReservationRow icon={game.sportEmoji} label={`${game.awayTeam} vs ${game.homeTeam}`} sublabel={`${game.dateLabel} · ${game.channel}`} />
          <ReservationRow icon="⏰" label={slotLabel} sublabel={`Until game end (est. ${game.estimatedEnd})`} />
          <ReservationRow icon="👥" label={`${partySize} ${partySize === 1 ? "guest" : "guests"}`} sublabel={screen.neighborhood + " · " + screen.distance} />
        </div>
      </div>

      <div style={bartenderNoteSt}>
        <span>ℹ️</span>
        Arrive within 30 minutes of your time block. After that, staff may release your screen.
      </div>

      <button onClick={onReset} style={{ ...ghostBtnSt, marginTop: 24 }}>
        ← Search another game
      </button>
    </div>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

function Fact({ label, value, light }: { label: string; value: string; light?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: light ? "#4ade80" : "#475569", marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: light ? "#f1f5f9" : "#e2e8f0" }}>{value}</div>
    </div>
  );
}

function ReservationRow({ icon, label, sublabel }: { icon: string; label: string; sublabel: string }) {
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

function StaffPreviewRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em" }}>
          {label.toUpperCase()}
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Disruption helpers ───────────────────────────────────────────────────────

function disruptionLabel(d: DisruptionLevel): string {
  if (d === "none")     return "No disruption";
  if (d === "low")      return "Low impact";
  if (d === "moderate") return "Some guests";
  return "Active game";
}

function disruptionColor(d: DisruptionLevel): string {
  if (d === "none")     return "#86efac";
  if (d === "low")      return "#fde68a";
  if (d === "moderate") return "#fdba74";
  return "#fca5a5";
}

function disruptionBg(d: DisruptionLevel): string {
  if (d === "none")     return "rgba(34,197,94,0.08)";
  if (d === "low")      return "rgba(234,179,8,0.08)";
  if (d === "moderate") return "rgba(249,115,22,0.08)";
  return "rgba(239,68,68,0.08)";
}

function disruptionBorder(d: DisruptionLevel): string {
  if (d === "none")     return "rgba(34,197,94,0.2)";
  if (d === "low")      return "rgba(234,179,8,0.2)";
  if (d === "moderate") return "rgba(249,115,22,0.2)";
  return "rgba(239,68,68,0.2)";
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

const bestMatchBadgeSt: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  color: "#4ade80",
  background: "rgba(34,197,94,0.1)",
  border: "1px solid rgba(34,197,94,0.25)",
  padding: "2px 8px",
  borderRadius: 999,
};

function screenTypeBadgeSt(type: ScreenType): React.CSSProperties {
  if (type === "premium") {
    return {
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
      color: "#fbbf24", background: "rgba(251,191,36,0.08)",
      border: "1px solid rgba(251,191,36,0.2)",
      padding: "2px 8px", borderRadius: 999,
    };
  }
  return {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
    color: "#86efac", background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.18)",
    padding: "2px 8px", borderRadius: 999,
  };
}

function disruptionBadgeSt(d: DisruptionLevel): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
    color: disruptionColor(d),
    background: disruptionBg(d),
    border: `1px solid ${disruptionBorder(d)}`,
    padding: "2px 8px", borderRadius: 999,
  };
}

function selectionCounterSt(n: number): React.CSSProperties {
  return {
    marginBottom: 14,
    padding: "10px 16px",
    borderRadius: 10,
    background: n === 0 ? "#0f172a" : "#0d1f3c",
    border: `1px solid ${n === 0 ? "#1e293b" : "#1e3a5f"}`,
    color: n === 0 ? "#475569" : "#93c5fd",
    fontSize: 13,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 6,
  };
}

const disruptionWarningSt: React.CSSProperties = {
  marginBottom: 16,
  padding: "14px 16px",
  borderRadius: 12,
  background: "#1a0e00",
  border: "1px solid #78350f",
  color: "#fcd34d",
  fontSize: 14,
};

function screenCardSt(isSelected: boolean, isDisabled: boolean, type: ScreenType): React.CSSProperties {
  const borderColor = isSelected
    ? type === "premium" ? "#f59e0b" : "#3b82f6"
    : "#1e293b";
  const bg = isSelected
    ? type === "premium" ? "#1a1200" : "#0e1f3d"
    : "#0f172a";
  return {
    background: bg,
    border: isSelected ? `2px solid ${borderColor}` : "1px solid #1e293b",
    borderRadius: 16,
    padding: 18,
    textAlign: "left",
    cursor: isDisabled ? "not-allowed" : "pointer",
    color: "white",
    opacity: isDisabled ? 0.4 : 1,
    width: "100%",
    boxShadow: isSelected ? `0 0 0 4px ${type === "premium" ? "rgba(245,158,11,0.08)" : "rgba(59,130,246,0.1)"}` : "none",
    transition: "border-color 0.15s, background 0.15s",
  };
}

const distancePillSt: React.CSSProperties = {
  fontSize: 11, fontWeight: 600,
  color: "#94a3b8", background: "#1e293b",
  padding: "2px 8px", borderRadius: 999,
};

const responsePillSt: React.CSSProperties = {
  display: "inline-block",
  fontSize: 11, fontWeight: 600,
  background: "rgba(59,130,246,0.07)",
  border: "1px solid rgba(59,130,246,0.18)",
  color: "#60a5fa",
  padding: "4px 10px", borderRadius: 8,
};

function checkboxSt(isSelected: boolean, isDisabled: boolean): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
    background: isSelected ? "#3b82f6" : "#1e293b",
    border: `2px solid ${isSelected ? "#60a5fa" : "#334155"}`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, fontWeight: 700,
    color: isSelected ? "white" : isDisabled ? "#374151" : "#64748b",
    marginTop: 4, transition: "background 0.15s",
  };
}

const houseTypeBadgeSt: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
  color: "#6b7280", background: "rgba(107,114,128,0.1)",
  border: "1px solid rgba(107,114,128,0.2)",
  padding: "2px 8px", borderRadius: 999,
};

const houseSectionToggleSt: React.CSSProperties = {
  width: "100%", background: "none",
  border: "1px solid #1e293b", borderRadius: 10,
  padding: "10px 16px", cursor: "pointer",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};

const houseCardSt: React.CSSProperties = {
  background: "#0a0f1a",
  border: "1px solid #1a2030",
  borderRadius: 12,
  padding: "14px 16px",
  opacity: 0.7,
};

const requestPanelSt: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 18,
  padding: 24,
};

const labelSt: React.CSSProperties = {
  display: "block",
  fontSize: 11, fontWeight: 700,
  color: "#64748b", letterSpacing: "0.08em",
  marginBottom: 8,
};

function slotBtnSt(isActive: boolean): React.CSSProperties {
  return {
    width: "100%", background: isActive ? "#0e1f3d" : "#080e1a",
    border: isActive ? "2px solid #3b82f6" : "1px solid #1e293b",
    borderRadius: 12, padding: "14px 16px",
    cursor: "pointer", color: "white", textAlign: "left",
    boxShadow: isActive ? "0 0 0 3px rgba(59,130,246,0.08)" : "none",
    transition: "border-color 0.15s",
  };
}

const countBtnSt: React.CSSProperties = {
  width: 40, height: 40, borderRadius: "50%",
  background: "#1e293b", border: "1px solid #334155",
  color: "#f1f5f9", fontSize: 22, fontWeight: 400,
  cursor: "pointer", display: "flex",
  alignItems: "center", justifyContent: "center",
  lineHeight: 1,
};

function sendBtnSt(enabled: boolean): React.CSSProperties {
  return {
    width: "100%", padding: "18px", borderRadius: 14, border: "none",
    background: enabled ? "linear-gradient(135deg, #1d4ed8, #2563eb)" : "#1e293b",
    color: enabled ? "white" : "#475569",
    fontWeight: 800, fontSize: 16,
    cursor: enabled ? "pointer" : "not-allowed",
    letterSpacing: "-0.2px",
    boxShadow: enabled ? "0 4px 20px rgba(37,99,235,0.25)" : "none",
  };
}

const pendingScreenCardSt: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e3a5f",
  borderRadius: 14, padding: "16px 20px",
};

const staffPreviewCardSt: React.CSSProperties = {
  background: "#0e1000",
  border: "1px solid #3d2e00",
  borderRadius: 16, padding: "18px 20px",
};

const summaryCardSt: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 14, padding: "18px 20px",
};

const summaryLabelSt: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: "#475569", letterSpacing: "0.08em",
  marginBottom: 14,
};

const confirmedCircleSt: React.CSSProperties = {
  width: 72, height: 72, borderRadius: "50%",
  background: "linear-gradient(135deg, #16a34a, #15803d)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 32, color: "white", fontWeight: 700,
  margin: "0 auto 20px",
  boxShadow: "0 0 0 12px rgba(22,163,74,0.1), 0 0 0 24px rgba(22,163,74,0.05)",
};

const confirmedCardSt: React.CSSProperties = {
  background: "linear-gradient(135deg, #041f0e, #0c1a10)",
  border: "1px solid #16a34a",
  borderRadius: 20, padding: 24, marginBottom: 16,
};

const releasedCardSt: React.CSSProperties = {
  marginBottom: 20, padding: "14px 18px",
  background: "#0f172a", borderRadius: 12,
  border: "1px solid #1e293b",
};

const commitPanelSt: React.CSSProperties = {
  background: "#0b1628", border: "1px solid #1e3a5f",
  borderRadius: 18, padding: "20px 24px",
  marginBottom: 16, textAlign: "center",
};

const imComingBtnSt: React.CSSProperties = {
  width: "100%", padding: "20px", borderRadius: 14,
  background: "linear-gradient(135deg, #16a34a, #15803d)",
  border: "none", color: "white",
  fontWeight: 800, fontSize: 19,
  cursor: "pointer", letterSpacing: "-0.3px",
  boxShadow: "0 4px 24px rgba(22,163,74,0.3)",
};

const bartenderNoteSt: React.CSSProperties = {
  padding: "14px 20px",
  background: "#0a1628", border: "1px solid #1e3a5f",
  borderRadius: 12, fontSize: 13, color: "#60a5fa",
  display: "flex", alignItems: "center",
  gap: 10, justifyContent: "center",
};
