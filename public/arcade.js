/* DocSpace R5.1.0 — Arcade Hub: Tetris Versus, Neon Maze 3D, Pulse Pong */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const sock = () => {
    try {
      return socket || null;
    } catch (_) {
      return null;
    }
  };
  let boundSocket = null;
  let gameEvents = new AbortController();
  function esc(s) {
    return String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function ensureHub() {
    if ($("dsArcadeHub")) return;
    gameEvents = new AbortController();
    $("page").replaceChildren();
    const hub = document.createElement("div");
    hub.id = "dsArcadeHub";
    hub.innerHTML = `<div class="ds-arcade-shell">
<div class="ds-arcade-header"><div class="ds-arcade-title"><div style="font-size:36px">🎮</div><div><h1>Arcade DocSpace</h1><span>Tetris Versus · Neon Maze 3D · Pulse Pong</span></div></div><div style="display:flex;gap:8px;align-items:center"><span class="ds-fly-badge" id="dsFlyBadge">Serveur · …</span><button class="ds-arcade-back" id="dsArcadeBack">Retour au serveur</button></div></div>
<div class="ds-arcade-lobby" id="dsArcadeLobby"><div class="ds-arcade-grid">
<div class="ds-game-card" data-game="tetris"><div class="icon">🧱</div><h2>Tetris Versus</h2><p>Tetris complet avec solo et duel 1v1 en temps réel. Les lignes doubles/triples/Tetris envoient des lignes de pénalité à l'adversaire.</p><div class="ds-game-tags"><span class="ds-game-tag online">MULTI 1v1</span><span class="ds-game-tag">CLAVIER</span></div></div>
<div class="ds-game-card" data-game="maze"><div class="icon">🌌</div><h2>Neon Maze 3D</h2><p>Un vrai petit moteur 3D raycasting dans le navigateur. Explore le labyrinthe, récupère les orbes et vois les autres joueurs dans l'arène.</p><div class="ds-game-tags"><span class="ds-game-tag online">MULTI 8</span><span class="ds-game-tag">3D</span></div></div>
<div class="ds-game-card" data-game="pong"><div class="icon">⚡</div><h2>Pulse Pong</h2><p>Un Pong néon contre une IA ou un ami en ligne. Premier à 7 points.</p><div class="ds-game-tags"><span class="ds-game-tag online">MULTI 1v1</span><span class="ds-game-tag">SOLO</span></div></div>
</div></div>
<div class="ds-arcade-stage" id="dsStageTetris"></div><div class="ds-arcade-stage" id="dsStageMaze"></div><div class="ds-arcade-stage" id="dsStagePong"></div>
</div>`;
    document.getElementById("page").appendChild(hub);
    $("dsArcadeBack").onclick = returnToArcade;
    hub
      .querySelectorAll("[data-game]")
      .forEach((c) => (c.onclick = () => openStage(c.dataset.game)));
    installRailButton();
    loadFlyBadge();
  }
  function installRailButton() {
    const rail = $("docspaceAppRailR3");
    if (rail && !$("dsArcadeRail")) {
      const btn = document.createElement("button");
      btn.id = "dsArcadeRail";
      btn.className = "ds-r4-server-btn ds-arcade-rail-btn";
      btn.title = "Arcade DocSpace";
      btn.innerHTML = '🎮<span class="dot"></span>';
      btn.onclick = (e) => {
        e.stopPropagation();
        openGames();
      };
      const spacer = rail.querySelector(".ds-r4-rail-spacer");
      rail.insertBefore(btn, spacer || null);
    }
    installSidebarArcade();
  }
  function installSidebarArcade() {
    if ($("dsArcadeChannel")) return;
    const jeux = document.querySelector('.channel-item[data-channel="jeux"]');
    if (!jeux) return;
    const row = document.createElement("div");
    row.id = "dsArcadeChannel";
    row.className = "channel-item ds-arcade-channel";
    row.innerHTML =
      '<span class="channel-icon">🕹️</span><span class="channel-name">Arcade DocSpace</span><span style="margin-left:auto;font-size:9px;color:#23d18b">NEW</span>';
    row.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openGames();
    };
    jeux.insertAdjacentElement("afterend", row);
  }
  async function loadFlyBadge() {
    try {
      const r = await fetch("/api/runtime/fly", { cache: "no-store" });
      const d = await r.json();
      const b = $("dsFlyBadge");
      if (b)
        b.textContent = `${d.platform === "fly.io" ? "Fly.io" : "Serveur"}${d.region ? " · " + d.region : ""} · ${d.turnConfigured ? "TURN ✓" : "P2P"}`;
    } catch (_) {}
  }
  function openGames() {
    ensureHub();
    document.body.classList.add("ds-games-active");
    document.body.classList.remove(
      "ds-r5-dm-page",
      "ds-r5-friends-page",
      "ds-voice-view-active",
    );
    try {
      closeDMSidebar?.();
    } catch (_) {}
    try {
      hideVoiceView?.();
    } catch (_) {}
    showLobby();
    bindSocket();
  }
  function closeGames() {
    stopAllGames();
    gameEvents.abort();
    document.body.classList.remove("ds-games-active");
    $("dsArcadeHub")?.remove();
  }
  function returnToArcade() { closeGames(); window.DocSpace.navigate("arcade"); }
  function showLobby() {
    ["Tetris", "Maze", "Pong"].forEach((n) => {
      const e = $("dsStage" + n);
      if (e) e.classList.remove("active");
    });
    $("dsArcadeLobby")?.classList.remove("hidden");
  }
  function openStage(game) {
    stopAllGames();
    $("dsArcadeLobby")?.classList.add("hidden");
    ["Tetris", "Maze", "Pong"].forEach((n) => {
      const e = $("dsStage" + n);
      if (e) e.classList.toggle("active", n.toLowerCase() === game);
    });
    if (game === "tetris") mountTetris();
    if (game === "maze") mountMaze();
    if (game === "pong") mountPong();
  }
  function stageTop(title, extra = "") {
    return `<div class="ds-game-topbar"><button class="ds-game-btn" data-back>← Arcade</button><h2>${title}</h2><div class="grow"></div>${extra}</div>`;
  }
  function bindSocket() {
    const s = sock();
    if (!s || boundSocket === s) return;
    boundSocket = s;
    s.on('pong_state', onPongState);
    s.on('pong_peer_left', () => {if(pong.room)statusMsg('Adversaire parti — en attente d’un autre joueur.');});
    s.on('pong_expired', () => {stopPong();statusMsg('La partie a expiré. Rejoins une nouvelle partie.');});
    s.on('disconnect', () => {stopAllGames();statusMsg('Connexion perdue. Rejoins la partie après reconnexion.');});
    s.on("arcade_error", (d) => {
      statusMsg(d?.message || "Erreur partie");
    });
    s.on("arcade_tetris_room", onTetrisRoom);
    s.on("arcade_tetris_start", onTetrisStart);
    s.on("arcade_tetris_peer_state", onTetrisPeerState);
    s.on("arcade_tetris_garbage", (d) => {
      tetris.garbage += +d.lines || 1;
      statusMsg(`${d.from || "Adversaire"} t’envoie ${d.lines} ligne(s) !`);
    });
    s.on("arcade_tetris_win", (d) => {
      tetris.running = false;
      statusMsg(`🏆 ${d.winner || "Adversaire"} gagne la manche`);
    });
    s.on("arcade_tetris_peer_left", () => {
      tetris.running = false;
      statusMsg("Adversaire parti — en attente…");
    });
    s.on("arcade_maze_snapshot", onMazeSnapshot);
    s.on("arcade_maze_peer_join", (p) => {
      maze.peers[p.socketId] = p;
    });
    s.on("arcade_maze_peer_move", (p) => {
      maze.peers[p.socketId] = { ...(maze.peers[p.socketId] || {}), ...p };
    });
    s.on("arcade_maze_peer_left", (d) => {
      delete maze.peers[d.socketId];
    });
    s.on("arcade_maze_orb", (d) => {
      maze.orbs[d.orbId] = d.active !== false;
      if (d.by) statusMsg(`✨ ${d.by} récupère un orbe (${d.score})`);
    });
  }
  function statusMsg(text) {
    const e = document.querySelector(
      ".ds-arcade-stage.active .ds-game-side .ds-game-status",
    );
    if (e) e.textContent = text;
  }
  function stopAllGames() {
    stopTetris();
    stopMaze();
    stopPong();
    maze.keys = {}; pong.keys = {};
  }
  // ===== TETRIS =====
  const TETROMINO = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  };
  const TCOL = {
    I: "#35d8ff",
    J: "#5578ff",
    L: "#ff9b38",
    O: "#ffe15a",
    S: "#43df89",
    T: "#b56cff",
    Z: "#ff5c6c",
  };
  const tetris = {
    board: null,
    piece: null,
    x: 0,
    y: 0,
    score: 0,
    lines: 0,
    level: 1,
    running: false,
    paused: false,
    last: 0,
    drop: 700,
    raf: 0,
    room: "",
    garbage: 0,
    rng: Math.random,
    peer: null,
    solo: false,
    bag: [],
  };
  function seeded(seed) {
    let x = (seed || 123456789) >>> 0;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  }
  function emptyBoard() {
    return Array.from({ length: 20 }, () => Array(10).fill(""));
  }
  function cloneShape(s) {
    return s.map((r) => r.slice());
  }
  function nextPiece() {
    if (!tetris.bag.length) {
      tetris.bag = Object.keys(TETROMINO);
      for (let i = 6; i > 0; i--) {
        const j = Math.floor(tetris.rng() * (i + 1));
        [tetris.bag[i], tetris.bag[j]] = [tetris.bag[j], tetris.bag[i]];
      }
    }
    const k = tetris.bag.pop();
    tetris.piece = { k, shape: cloneShape(TETROMINO[k]) };
    tetris.x = Math.floor((10 - tetris.piece.shape[0].length) / 2);
    tetris.y = -1;
    if (collide(tetris.x, tetris.y, tetris.piece.shape)) {
      gameOverTetris();
    }
  }
  function collide(px, py, shape) {
    for (let y = 0; y < shape.length; y++)
      for (let x = 0; x < shape[y].length; x++)
        if (shape[y][x]) {
          const bx = px + x,
            by = py + y;
          if (
            bx < 0 ||
            bx >= 10 ||
            by >= 20 ||
            (by >= 0 && tetris.board[by][bx])
          )
            return true;
        }
    return false;
  }
  function rotate(shape) {
    const n = shape.length;
    return Array.from({ length: n }, (_, y) =>
      Array.from({ length: n }, (_, x) => shape[n - 1 - x][y]),
    );
  }
  function moveT(dx, dy) {
    if (!tetris.running) return false;
    if (!collide(tetris.x + dx, tetris.y + dy, tetris.piece.shape)) {
      tetris.x += dx;
      tetris.y += dy;
      return true;
    }
    if (dy > 0) lockPiece();
    return false;
  }
  function rotT() {
    if (!tetris.running) return;
    const r = rotate(tetris.piece.shape);
    for (const kick of [0, -1, 1, -2, 2])
      if (!collide(tetris.x + kick, tetris.y, r)) {
        tetris.x += kick;
        tetris.piece.shape = r;
        break;
      }
  }
  function hardDrop() {
    if (!tetris.running) return;
    let d = 0;
    while (!collide(tetris.x, tetris.y + 1, tetris.piece.shape)) {
      tetris.y++;
      d++;
    }
    tetris.score += d * 2;
    lockPiece();
  }
  function lockPiece() {
    if (
      tetris.piece.shape.some((row, y) =>
        row.some((v) => v && tetris.y + y < 0),
      )
    ) {
      gameOverTetris();
      return;
    }
    for (let y = 0; y < tetris.piece.shape.length; y++)
      for (let x = 0; x < tetris.piece.shape[y].length; x++)
        if (tetris.piece.shape[y][x]) {
          const by = tetris.y + y;
          if (by >= 0) tetris.board[by][tetris.x + x] = tetris.piece.k;
        }
    let cleared = 0;
    for (let y = 19; y >= 0; y--)
      if (tetris.board[y].every(Boolean)) {
        tetris.board.splice(y, 1);
        tetris.board.unshift(Array(10).fill(""));
        cleared++;
        y++;
      }
    if (cleared) {
      const pts = [0, 100, 300, 500, 800][cleared] * tetris.level;
      tetris.score += pts;
      tetris.lines += cleared;
      tetris.level = 1 + Math.floor(tetris.lines / 10);
      tetris.drop = Math.max(90, 700 - (tetris.level - 1) * 55);
      const atk = [0, 0, 1, 2, 4][cleared];
      if (atk && !tetris.solo)
        sock()?.emit("arcade_tetris_attack", { code: tetris.room, lines: atk });
    }
    applyGarbage();
    nextPiece();
    sendTetrisState();
    drawTetris();
  }
  function applyGarbage() {
    while (tetris.garbage > 0) {
      tetris.garbage--;
      tetris.board.shift();
      const hole = Math.floor(tetris.rng() * 10);
      tetris.board.push(
        Array.from({ length: 10 }, (_, i) => (i === hole ? "" : "G")),
      );
    }
  }
  function startTetris(seed = Date.now(), solo = false) {
    document.activeElement?.blur?.();
    tetris.board = emptyBoard();
    tetris.bag = [];
    tetris.score = 0;
    tetris.lines = 0;
    tetris.level = 1;
    tetris.drop = 700;
    tetris.garbage = 0;
    tetris.rng = seeded(seed);
    tetris.running = true;
    tetris.paused = false;
    tetris.solo = solo;
    tetris.peer = null;
    nextPiece();
    tetris.last = performance.now();
    cancelAnimationFrame(tetris.raf);
    tetris.raf = requestAnimationFrame(tetrisLoop);
    drawTetris();
    statusMsg(solo ? "Solo démarré" : "Duel démarré !");
  }
  function tetrisLoop(now) {
    if (!tetris.running) return;
    if (tetris.paused) {
      tetris.last = now;
      tetris.raf = requestAnimationFrame(tetrisLoop);
      return;
    }
    if (now - tetris.last > tetris.drop) {
      moveT(0, 1);
      tetris.last = now;
      drawTetris();
    }
    tetris.raf = requestAnimationFrame(tetrisLoop);
  }
  function gameOverTetris() {
    tetris.running = false;
    statusMsg("💥 Game Over");
    if (!tetris.solo)
      sock()?.emit("arcade_tetris_gameover", {
        code: tetris.room,
        score: tetris.score,
      });
  }
  function sendTetrisState() {
    if (tetris.solo || !tetris.room) return;
    sock()?.emit("arcade_tetris_state", {
      code: tetris.room,
      score: tetris.score,
      lines: tetris.lines,
      level: tetris.level,
      board: tetris.board.map((r) => r.map(Boolean)),
    });
  }
  function drawBoard(ctx, board, cell) {
    board = board || emptyBoard();
    ctx.fillStyle = "#070a10";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 10; x++) {
        const v = board[y]?.[x];
        if (v) {
          ctx.fillStyle = TCOL[v] || "#39445c";
          ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        } else {
          ctx.strokeStyle = "rgba(255,255,255,.035)";
          ctx.strokeRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
        }
      }
  }
  function drawTetris() {
    const c = $("dsTetrisCanvas");
    if (!c) return;
    const ctx = c.getContext("2d"),
      cell = 28;
    drawBoard(ctx, tetris.board, cell);
    if (tetris.piece && tetris.running) {
      let ghostY = tetris.y;
      while (!collide(tetris.x, ghostY + 1, tetris.piece.shape)) ghostY++;
      ctx.fillStyle = "rgba(154,150,255,.18)";
      for (let y = 0; y < tetris.piece.shape.length; y++)
        for (let x = 0; x < tetris.piece.shape[y].length; x++)
          if (tetris.piece.shape[y][x] && ghostY + y >= 0)
            ctx.fillRect(
              (tetris.x + x) * cell + 1,
              (ghostY + y) * cell + 1,
              cell - 2,
              cell - 2,
            );
      ctx.fillStyle = TCOL[tetris.piece.k];
      for (let y = 0; y < tetris.piece.shape.length; y++)
        for (let x = 0; x < tetris.piece.shape[y].length; x++)
          if (tetris.piece.shape[y][x] && tetris.y + y >= 0)
            ctx.fillRect(
              (tetris.x + x) * cell + 1,
              (tetris.y + y) * cell + 1,
              cell - 2,
              cell - 2,
            );
    }
    $("dsTsScore").textContent = tetris.score;
    $("dsTsLines").textContent = tetris.lines;
    $("dsTsLevel").textContent = tetris.level;
    const oc = $("dsTetrisOpponentCanvas");
    if (oc) {
      const octx = oc.getContext("2d");
      drawBoard(octx, tetris.peer?.board || emptyBoard(), 15);
    }
    if ($("dsTsPeer"))
      $("dsTsPeer").textContent = tetris.peer
        ? `${tetris.peer.username} · ${tetris.peer.score || 0}`
        : "En attente…";
  }
  function mountTetris() {
    const st = $("dsStageTetris");
    if (!st.dataset.mounted) {
      st.dataset.mounted = "1";
      st.innerHTML =
        stageTop(
          "🧱 Tetris Versus",
          `<input id="dsTetrisCode" class="ds-game-input" maxlength="16" value="DUEL" placeholder="Code partie"><button id="dsTetrisJoin" class="ds-game-btn primary">Rejoindre 1v1</button><button id="dsTetrisSolo" class="ds-game-btn">Solo</button>`,
        ) +
        `<div class="ds-game-layout"><div class="ds-game-main"><div class="ds-tetris-wrap"><canvas id="dsTetrisCanvas" class="ds-tetris-board" width="280" height="560"></canvas><div class="ds-tetris-opponent"><h3>Adversaire</h3><canvas id="dsTetrisOpponentCanvas" width="150" height="300"></canvas><div id="dsTsPeer" class="ds-game-status">En attente…</div></div></div></div><div class="ds-game-side"><h3>Partie</h3><div class="ds-game-status">Choisis Solo ou rejoins un code à deux.</div><div class="ds-game-statrow"><div class="ds-game-stat"><strong id="dsTsScore">0</strong><span>Score</span></div><div class="ds-game-stat"><strong id="dsTsLines">0</strong><span>Lignes</span></div><div class="ds-game-stat"><strong id="dsTsLevel">1</strong><span>Niveau</span></div></div><div class="ds-keyhelp">← → déplacer<br>↓ descendre<br>↑ / X tourner<br>Espace : hard drop<br>P : pause solo</div></div></div>`;
      st.querySelector("[data-back]").onclick = () => {
        stopTetris();
        returnToArcade();
      };
      $("dsTetrisJoin").onclick = () => {
        stopTetris();
        bindSocket();
        tetris.room = ($("dsTetrisCode").value || "DUEL").toUpperCase();
        tetris.solo = false;
        sock()?.emit("arcade_tetris_join", { code: tetris.room });
        statusMsg("En attente d’un adversaire…");
      };
      $("dsTetrisSolo").onclick = () => {
        stopTetris();
        startTetris(Date.now(), true);
      };
      document.addEventListener("keydown", tetrisKeys, {signal:gameEvents.signal});
      addTouchControls(
        st,
        [
          ["←", "ArrowLeft"],
          ["↻", "ArrowUp"],
          ["↓", "ArrowDown"],
          ["→", "ArrowRight"],
          ["Chute", " "],
          ["Pause", "p"],
        ],
        (key, down) => { if(down) tetrisKeys({ key, preventDefault() {} }); },
      );
    }
    drawTetris();
    statusMsg(
      tetris.running
        ? "Partie en cours"
        : "Choisis Solo pour commencer, ou un code pour jouer à deux.",
    );
  }
  function tetrisKeys(e) {
    if (document.querySelector("dialog[open]")) return;
    if (e.repeat && ["ArrowUp"," ","p","P","x","X"].includes(e.key)) {e.preventDefault();return;}
    if (e.target?.closest?.("input,textarea,[contenteditable]")) return;
    if (!$("dsStageTetris")?.classList.contains("active") || !tetris.running)
      return;
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowDown",
        "ArrowUp",
        " ",
        "x",
        "X",
        "z",
        "Z",
        "p",
        "P",
      ].includes(e.key)
    )
      e.preventDefault();
    if (e.key.toLowerCase() === "p") {
      if (!tetris.solo) {
        statusMsg("La pause est disponible en solo.");
        return;
      }
      tetris.paused = !tetris.paused;
      tetris.last = performance.now();
      statusMsg(tetris.paused ? "⏸ Partie en pause" : "▶ Partie reprise");
      drawTetris();
      return;
    }
    if (tetris.paused) return;
    if (e.key === "ArrowLeft") moveT(-1, 0);
    if (e.key === "ArrowRight") moveT(1, 0);
    if (e.key === "ArrowDown") moveT(0, 1);
    if (
      e.key === "ArrowUp" ||
      e.key.toLowerCase() === "x" ||
      e.key.toLowerCase() === "z"
    )
      rotT();
    if (e.key === " ") hardDrop();
    drawTetris();
  }
  function onTetrisRoom(d) {
    if (!tetris.room || d.code !== tetris.room) return;
    statusMsg(
      d.players?.length < 2
        ? "En attente d’un adversaire…"
        : d.started
          ? "Partie en cours"
          : "Préparation…",
    );
  }
  function onTetrisStart(d) {
    if (d.code !== tetris.room) return;
    startTetris(d.seed, false);
  }
  function onTetrisPeerState(d) {
    if (!tetris.room) return;
    tetris.peer = d;
    drawTetris();
  }
  function stopTetris() {
    cancelAnimationFrame(tetris.raf);
    tetris.running = false;
    if (tetris.room) sock()?.emit("arcade_tetris_leave", { code: tetris.room });
    tetris.room = "";
  }
  // ===== NEON MAZE 3D (raycaster) =====
  const MAP = [
    "1111111111111111",
    "1000000000000001",
    "1011100111011101",
    "1000100100010001",
    "1110100111010111",
    "1000100000010001",
    "1011101111011101",
    "1000001000000001",
    "1011101011110101",
    "1000000000000001",
    "1111111111111111",
  ].map((r) => [...r].map(Number));
  const maze = {
    x: 1.5,
    y: 1.5,
    a: 0,
    keys: {},
    running: false,
    raf: 0,
    last: 0,
    room: "",
    peers: {},
    orbs: {},
    score: 0,
    lastNet: 0,
    pointer: false,
  };
  function wall(x, y) {
    return MAP[Math.floor(y)]?.[Math.floor(x)] !== 0;
  }
  function moveMaze(dt) {
    const speed = 2.5 * dt,
      rot = 1.8 * dt;
    let nx = maze.x,
      ny = maze.y;
    if (maze.keys.arrowleft || maze.keys.a || maze.keys.q) maze.a -= rot;
    if (maze.keys.arrowright || maze.keys.d) maze.a += rot;
    let f =
        (maze.keys.arrowup || maze.keys.w || maze.keys.z ? 1 : 0) -
        (maze.keys.arrowdown || maze.keys.s ? 1 : 0),
      str = (maze.keys.e ? 1 : 0) - (maze.keys.c ? 1 : 0);
    nx +=
      Math.cos(maze.a) * f * speed +
      Math.cos(maze.a + Math.PI / 2) * str * speed;
    ny +=
      Math.sin(maze.a) * f * speed +
      Math.sin(maze.a + Math.PI / 2) * str * speed;
    if (!wall(nx, maze.y)) maze.x = nx;
    if (!wall(maze.x, ny)) maze.y = ny;
    for (const [id, active] of Object.entries(maze.orbs))
      if (active) {
        const o = ORB_LOOKUP[id];
        if (o && Math.hypot(maze.x - o.x, maze.y - o.y) < 0.62) {
          if (maze.room) {
            sock()?.emit("arcade_maze_collect", { code: maze.room, orbId: id });
            maze.orbs[id] = false;
          } else {
            maze.orbs[id] = false;
            maze.score++;
            if (maze.score === 6)
              statusMsg(
                "Les six orbes sont à toi ! Retourne à l’Arcade pour rejouer.",
              );
          }
        }
      }
  }
  const ORB_LOOKUP = {
    o0: { x: 2.5, y: 1.5 },
    o1: { x: 7.5, y: 2.5 },
    o2: { x: 11.5, y: 3.5 },
    o3: { x: 5.5, y: 6.5 },
    o4: { x: 9.5, y: 7.5 },
    o5: { x: 13.5, y: 8.5 },
  };
  function renderMaze() {
    const c = $("dsMazeCanvas");
    if (!c) return;
    const ctx = c.getContext("2d"),
      w = c.width,
      h = c.height;
    ctx.fillStyle = "#08101c";
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = "#07080d";
    ctx.fillRect(0, h / 2, w, h / 2);
    const fov = Math.PI / 3,
      rays = 320;
    const depth = new Array(rays);
    for (let i = 0; i < rays; i++) {
      const ra = maze.a - fov / 2 + (fov * i) / rays;
      let d = 0.03;
      while (
        d < 20 &&
        !wall(maze.x + Math.cos(ra) * d, maze.y + Math.sin(ra) * d)
      )
        d += 0.03;
      d *= Math.cos(ra - maze.a);
      depth[i] = d;
      const wh = Math.min(h, h / (d * 0.82));
      const shade = Math.max(30, 210 - d * 14) | 0;
      ctx.fillStyle = `rgb(${Math.floor(shade * 0.33)},${Math.floor(shade * 0.48)},${shade})`;
      const sw = w / rays + 1;
      ctx.fillRect((i * w) / rays, h / 2 - wh / 2, sw, wh);
    }
    const sprites = [];
    for (const [id, active] of Object.entries(maze.orbs))
      if (active) {
        const o = ORB_LOOKUP[id];
        if (o) sprites.push({ x: o.x, y: o.y, color: "#51f6ff", label: "✦" });
      }
    for (const p of Object.values(maze.peers))
      sprites.push({
        x: p.x,
        y: p.y,
        color: "#ff5dd7",
        label: (p.username || "?").slice(0, 7),
      });
    sprites.sort(
      (a, b) =>
        Math.hypot(maze.x - b.x, maze.y - b.y) -
        Math.hypot(maze.x - a.x, maze.y - a.y),
    );
    for (const sp of sprites) {
      const dx = sp.x - maze.x,
        dy = sp.y - maze.y,
        dist = Math.hypot(dx, dy);
      let ang = Math.atan2(dy, dx) - maze.a;
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      if (Math.abs(ang) > fov * 0.65) continue;
      const sx = (0.5 + ang / fov) * w,
        size = Math.min(95, h / (dist * 1.3));
      const ray = Math.max(0, Math.min(rays - 1, Math.floor((sx / w) * rays)));
      if (dist > depth[ray] + 0.5) continue;
      ctx.globalAlpha = Math.max(0.35, 1 - dist / 18);
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.arc(sx, h / 2, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(10, size * 0.12)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(sp.label, sx, h / 2 - size * 0.32);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = "rgba(255,255,255,.45)";
    ctx.beginPath();
    ctx.moveTo(w / 2 - 7, h / 2);
    ctx.lineTo(w / 2 + 7, h / 2);
    ctx.moveTo(w / 2, h / 2 - 7);
    ctx.lineTo(w / 2, h / 2 + 7);
    ctx.stroke();
    if ($("dsMazeScore")) $("dsMazeScore").textContent = maze.score;
  }
  function mazeLoop(now) {
    if (!maze.running) return;
    const dt = Math.min(0.04, (now - maze.last) / 1000 || 0.016);
    maze.last = now;
    moveMaze(dt);
    renderMaze();
    if (now - maze.lastNet > 100) {
      maze.lastNet = now;
      if (maze.room)
        sock()?.volatile.emit("arcade_maze_move", {
          code: maze.room,
          x: maze.x,
          y: maze.y,
          a: maze.a,
        });
    }
    maze.raf = requestAnimationFrame(mazeLoop);
  }
  function gameListen(target,event,callback) { target.addEventListener(event,callback,{signal:gameEvents.signal}); }
  function mountMaze() {
    const st = $("dsStageMaze");
    if (!st.dataset.mounted) {
      st.dataset.mounted = "1";
      st.innerHTML =
        stageTop(
          "🌌 Neon Maze 3D",
          `<input id="dsMazeCode" class="ds-game-input" maxlength="16" value="MAZE" placeholder="Code arène"><button id="dsMazeJoin" class="ds-game-btn primary">Rejoindre l’arène</button>`,
        ) +
        `<div class="ds-game-layout"><div class="ds-game-main"><div class="ds-canvas-wrap"><canvas id="dsMazeCanvas" width="960" height="540" tabindex="0"></canvas><div class="ds-maze-overlay">Flèches / ZQSD / WASD · C/E pas de côté · clic pour regarder<br>Orbes: <strong id="dsMazeScore">0</strong></div></div></div><div class="ds-game-side"><h3>Arène 3D</h3><div class="ds-game-status">Joue en solo ou saisis le même code qu’un ami.</div><div class="ds-keyhelp">Le rendu 3D est calculé localement : Fly.io ne transporte que les positions, donc le trafic réseau reste léger.<br><br>Jusqu’à 8 joueurs par arène.</div></div></div>`;
      st.querySelector("[data-back]").onclick = () => {
        stopMaze();
        returnToArcade();
      };
      $("dsMazeJoin").onclick = () => {
        bindSocket();
        maze.room = ($("dsMazeCode").value || "MAZE").toUpperCase();
        maze.peers = {};
        maze.score = 0;
        sock()?.emit("arcade_maze_join", { code: maze.room });
        startMaze();
      };
      const c = $("dsMazeCanvas");
      gameListen(window, "keydown", (e) => {
        if (
          st.classList.contains("active") &&
          !e.target.closest("input,textarea")
        ) {
          if (document.querySelector("dialog[open]")) return;
          maze.keys[e.key.toLowerCase()] = true;
          if (e.key.startsWith("Arrow")) e.preventDefault();
        }
      });
      gameListen(window, "keyup", (e) => {
        maze.keys[e.key.toLowerCase()] = false;
      }, {signal:gameEvents.signal});
      c.addEventListener("click", () => c.requestPointerLock?.());
      gameListen(document, "mousemove", (e) => {
        if (document.pointerLockElement === c && maze.running)
          maze.a += e.movementX * 0.0024;
      });
      addTouchControls(
        st,
        [
          ["↶", "arrowleft"],
          ["↑", "arrowup"],
          ["↓", "arrowdown"],
          ["↷", "arrowright"],
        ],
        (key, down) => (maze.keys[key] = down),
        true,
      );
    }
    maze.x = 1.5;
    maze.y = 1.5;
    maze.a = 0;
    maze.score = 0;
    maze.orbs = {};
    startMaze();
  }
  function startMaze() {
    if (maze.running) return;
    maze.running = true;
    maze.last = performance.now();
    maze.raf = requestAnimationFrame(mazeLoop);
    if (!Object.keys(maze.orbs).length)
      Object.keys(ORB_LOOKUP).forEach((id) => (maze.orbs[id] = true));
  }
  function onMazeSnapshot(d) {
    if (maze.room && d.code !== maze.room) return;
    maze.peers = {};
    for (const p of d.players || [])
      if (p.socketId !== sock()?.id) maze.peers[p.socketId] = p;
    maze.orbs = {};
    for (const o of d.orbs || []) maze.orbs[o.id] = o.active !== false;
    const me = (d.players || []).find((p) => p.socketId === sock()?.id);
    if (me) {
      maze.x = me.x;
      maze.y = me.y;
      maze.score = me.score || 0;
    }
    statusMsg(`Arène ${d.code} · ${(d.players || []).length} joueur(s)`);
  }
  function stopMaze() {
    cancelAnimationFrame(maze.raf);
    maze.running = false;
    maze.keys = {};
    if (maze.room) sock()?.emit("arcade_maze_leave", { code: maze.room });
    maze.room = "";
    if (document.pointerLockElement) document.exitPointerLock?.();
  }
  // ===== PULSE PONG =====
  const pong = {
    room:'',phase:'solo',sentAt:0,inputY:.5,
    running: false,
    raf: 0,
    last: 0,
    pY: 0.5,
    aY: 0.5,
    bx: 0.5,
    by: 0.5,
    vx: 0.42,
    vy: 0.18,
    me: 0,
    ai: 0,
    keys: {},
  };
  function mountPong() {
    const st = $("dsStagePong");
    if (!st.dataset.mounted) {
      st.dataset.mounted = "1";
      st.innerHTML =
        stageTop(
          "⚡ Pulse Pong",
          `<input id="dsPongCode" class="ds-game-input" maxlength="20" value="PONG" aria-label="Code de partie"><button id="dsPongJoin" class="ds-game-btn primary">Rejoindre 1v1</button><button data-game-invite-to="" class="ds-game-btn">Inviter</button><button id="dsPongStart" class="ds-game-btn">Solo</button>`,
        ) +
        `<div class="ds-game-layout"><div class="ds-game-main"><canvas id="dsPongCanvas" width="960" height="540"></canvas></div><div class="ds-game-side"><h3>Duel · 7 points</h3><div class="ds-game-status">Premier à 7 points.</div><div class="ds-game-statrow"><div class="ds-game-stat"><strong id="dsPongMe">0</strong><span>Toi</span></div><div class="ds-game-stat"><strong id="dsPongAI">0</strong><span id="dsPongOpponent">IA</span></div><div class="ds-game-stat"><strong>↕</strong><span>Clavier / toucher</span></div></div></div></div>`;
      st.querySelector("[data-back]").onclick = () => {
        stopPong();
        returnToArcade();
      };
      $("dsPongStart").onclick = resetPong;
      $("dsPongJoin").onclick = () => joinPong($("dsPongCode").value);
      gameListen(window, "keydown", (e) => {
        if (
          st.classList.contains("active") &&
          !e.target.closest("input,textarea")
        ) {
          pong.keys[e.key.toLowerCase()] = true;
          if (e.key.startsWith("Arrow")) e.preventDefault();
        }
      });
      gameListen(window,
        "keyup",
        (e) => (pong.keys[e.key.toLowerCase()] = false),
      );
      const c = $("dsPongCanvas");
      c.style.touchAction = "none";
      const pointer = (e) => {
        if (e.buttons || e.pointerType === "touch") {
          const rect = c.getBoundingClientRect();
          pong.inputY = pong.pY = Math.max(
            0.12,
            Math.min(0.88, (e.clientY - rect.top) / rect.height),
          );
        }
      };
      c.addEventListener("pointerdown", (e) => {
        c.setPointerCapture(e.pointerId);
        pointer(e);
      });
      c.addEventListener("pointermove", pointer);
    }
    resetPong();
  }
  function resetBall(dir = 1) {
    pong.bx = 0.5;
    pong.by = 0.5;
    pong.vx = 0.42 * dir;
    pong.vy = (Math.random() - 0.5) * 0.42;
  }
  function resetPong() {
    stopPong();pong.phase="solo";statusMsg("Solo contre l’IA — premier à 7 points.");if($("dsPongOpponent"))$("dsPongOpponent").textContent="IA";
    pong.me = 0;
    pong.ai = 0;
    pong.pY = 0.5;
    pong.aY = 0.5;
    resetBall(Math.random() < 0.5 ? -1 : 1);
    pong.running = true;
    pong.last = performance.now();
    cancelAnimationFrame(pong.raf);
    pong.raf = requestAnimationFrame(pongLoop);
  }
  function pongLoop(now) {
    if (!pong.running) return;
    const dt = Math.min(0.035, (now - pong.last) / 1000 || 0.016);
    pong.last = now;
    const sp = 0.75 * dt;
    if (pong.keys.w || pong.keys.z || pong.keys.arrowup) pong.pY -= sp;
    if (pong.keys.s || pong.keys.arrowdown) pong.pY += sp;
    pong.pY = Math.max(0.12, Math.min(0.88, pong.pY));
    if(pong.room){
      if(now-pong.sentAt>50){sock()?.emit('pong_move',{code:pong.room,y:pong.pY});pong.sentAt=now;}
      drawPong();pong.raf=requestAnimationFrame(pongLoop);return;
    }
    pong.aY += (pong.by - pong.aY) * Math.min(1, dt * 2.4);
    pong.bx += pong.vx * dt;
    pong.by += pong.vy * dt;
    if (pong.by < 0.035 || pong.by > 0.965) {
      pong.vy *= -1;
      pong.by = Math.max(0.035, Math.min(0.965, pong.by));
    }
    if (pong.bx < 0.075 && pong.vx < 0 && Math.abs(pong.by - pong.pY) < 0.13) {
      pong.vx = Math.abs(pong.vx) * 1.035;
      pong.vy += (pong.by - pong.pY) * 1.7;
    }
    if (pong.bx > 0.925 && pong.vx > 0 && Math.abs(pong.by - pong.aY) < 0.13) {
      pong.vx = -Math.abs(pong.vx) * 1.035;
      pong.vy += (pong.by - pong.aY) * 1.5;
    }
    if (pong.bx < 0) {
      pong.ai++;
      resetBall(1);
    }
    if (pong.bx > 1) {
      pong.me++;
      resetBall(-1);
    }
    if (pong.me >= 7 || pong.ai >= 7) {
      pong.running = false;
      statusMsg(
        pong.me > pong.ai ? "🏆 Victoire !" : "🤖 L’IA gagne. Revanche ?",
      );
    }
    drawPong();
    pong.raf = requestAnimationFrame(pongLoop);
  }
  function drawPong() {
    const c = $("dsPongCanvas");
    if (!c) return;
    const x = c.getContext("2d"),
      w = c.width,
      h = c.height;
    x.fillStyle = "#050811";
    x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(88,101,242,.3)";
    x.setLineDash([10, 14]);
    x.beginPath();
    x.moveTo(w / 2, 0);
    x.lineTo(w / 2, h);
    x.stroke();
    x.setLineDash([]);
    x.fillStyle = "#7d8cff";
    x.fillRect(w * .04, pong.pY * h - 58, w * .015, 116);
    x.fillStyle = "#ff5dd7";
    x.fillRect(w * .945, pong.aY * h - 58, w * .015, 116);
    x.fillStyle = "#fff";
    x.shadowColor = "#5ee7ff";
    x.shadowBlur = 20;
    x.beginPath();
    x.arc(pong.bx * w, pong.by * h, 11, 0, Math.PI * 2);
    x.fill();
    x.shadowBlur = 0;
    if ($("dsPongMe")) $("dsPongMe").textContent = pong.me;
    if ($("dsPongAI")) $("dsPongAI").textContent = pong.ai;
  }
  function stopPong() {
    if(pong.room)sock()?.emit('pong_leave',{});pong.room='';
    pong.running = false;
    pong.keys = {};
    cancelAnimationFrame(pong.raf);
  }

  function onPongState(d){
    if(!pong.room||d.code!==pong.room)return;
    const index=d.players.findIndex(p=>p.socketId===sock()?.id);if(index<0)return;
    const other=1-index;pong.aY=d.paddles[other]??.5;pong.bx=index===0?d.ball.x:1-d.ball.x;pong.by=d.ball.y;
    pong.me=d.scores[index]||0;pong.ai=d.scores[other]||0;pong.phase=d.phase;
    if($('dsPongOpponent'))$('dsPongOpponent').textContent=d.players[other]?.username||'En attente';
    statusMsg(d.phase==='waiting'?'En attente d’un ami · code '+d.code:d.phase==='finished'?(d.winner===index?'🏆 Victoire !':'Fin de manche — revanche avec une nouvelle invitation ?'):'En ligne contre '+d.players[other]?.username+' · Premier à 7 points');
    drawPong();
  }
  function joinPong(code){
    if(!sock()?.connected)return window.DocSpace.toast('Connecte-toi pour jouer en ligne.');
    stopPong();pong.room=String(code).trim().toUpperCase();pong.pY=.5;pong.phase='waiting';pong.sentAt=0;
    const requested=pong.room;statusMsg('Connexion à la partie…');
    sock().timeout(8000).emit('pong_join',{code:requested},(error,r)=>{
      if(pong.room!==requested)return;
      if(error||!r?.success){stopPong();statusMsg(r?.message||'Connexion à la partie impossible.');return;}
      onPongState(r.state);pong.running=true;pong.last=performance.now();pong.raf=requestAnimationFrame(pongLoop);
    });
  }
  window.DocSpaceArcade={startOnline(game,code){
    if(!['pong','tetris','maze'].includes(game))return;
    openGames();openStage(game);
    const name={pong:'Pong',tetris:'Tetris',maze:'Maze'}[game];
    $('ds'+name+'Code').value=code;$('ds'+name+'Join').click();
  }};
  function addTouchControls(stage, buttons, action, hold = false) {
    const row = document.createElement("div");
    row.className = "game-touch-controls";
    for (const [label, key] of buttons) {
      const b = document.createElement("button");
      b.textContent = label;
      b.type = "button";
      b.setAttribute("aria-label", label);
      if (hold) {
        b.onpointerdown = (e) => {
          e.preventDefault();
          b.setPointerCapture(e.pointerId);
          action(key, true);
        };
        b.onpointerup = () => action(key, false);
        b.onpointercancel = () => action(key, false);
        b.onlostpointercapture = () => action(key, false);
      } else b.onclick = () => action(key, true);
      row.append(b);
    }
    stage.append(row);
  }
  window.addEventListener("blur", () => {
    maze.keys = {};
    pong.keys = {};
    if (tetris.running && tetris.solo) tetris.paused = true;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      maze.keys = {};
      pong.keys = {};
      if (tetris.running && tetris.solo) tetris.paused = true;
    }
  });
  window.openDocSpaceGames = openGames;
  window.closeDocSpaceGames = closeGames;
  window.openDocSpaceStage = openStage;
})();
