const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3008);
const HOST = process.env.HOST || "0.0.0.0";
const CARD_IMAGE_DIR = process.env.CARD_IMAGE_DIR || "/home/harusinn/dm_card_images";
const UPDATE_INTERVAL = Number(process.env.UPDATE_INTERVAL || 60 * 1000);
const BRANCH = process.env.GITHUB_BRANCH || "main";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

if (fs.existsSync(CARD_IMAGE_DIR)) {
  app.use("/cards", express.static(CARD_IMAGE_DIR, { maxAge: "1d" }));
} else {
  console.warn("[cards] image directory does not exist:", CARD_IMAGE_DIR);
}

function imageFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const allowed = /\.(png|jpe?g|webp|gif)$/i;
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && allowed.test(e.name))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

app.get("/api/config", (_req, res) => {
  res.json({
    port: PORT,
    cardImageDirectory: CARD_IMAGE_DIR,
    cardImageDirectoryConfigured: fs.existsSync(CARD_IMAGE_DIR)
  });
});

app.get("/api/cards", (_req, res) => {
  const files = imageFiles(CARD_IMAGE_DIR);
  res.json({
    count: files.length,
    cards: files.map((file, index) => ({
      id: String(index + 1),
      file,
      image: "/cards/" + encodeURIComponent(file)
    }))
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, cards: imageFiles(CARD_IMAGE_DIR).length });
});

const rooms = new Map();
const waiting = [];

function createPlayer(socket) {
  return {
    socketId: socket.id,
    name: "Player",
    ready: false,
    deck: [],
    hand: [],
    shields: [],
    mana: [],
    battleZone: [],
    graveyard: [],
    deckIndex: 0
  };
}

function publicState(room) {
  return {
    id: room.id,
    started: room.started,
    turnPlayer: room.turnPlayer,
    turnNumber: room.turnNumber,
    players: room.players.map((p, index) => ({
      index,
      name: p.name,
      ready: p.ready,
      handCount: p.hand.length,
      shieldCount: p.shields.length,
      manaCount: p.mana.length,
      battleZone: p.battleZone,
      graveyardCount: p.graveyard.length
    }))
  };
}

function emitRoom(room) {
  io.to(room.id).emit("roomState", publicState(room));
}

function draw(player, count = 1) {
  for (let i = 0; i < count; i++) {
    if (player.deckIndex >= player.deck.length) return;
    player.hand.push(player.deck[player.deckIndex++]);
  }
}

function startGame(room) {
  if (room.started || room.players.length !== 2) return;
  if (!room.players.every(p => p.ready)) return;

  room.started = true;
  room.turnNumber = 1;
  room.turnPlayer = 0;

  for (const player of room.players) {
    player.shields = player.deck.slice(0, 5);
    player.deckIndex = 5;
    player.hand = [];
    player.mana = [];
    player.battleZone = [];
    player.graveyard = [];
    draw(player, 5);
  }

  emitRoom(room);
  room.players.forEach(p => io.to(p.socketId).emit("gameStarted"));
}

function getRoom(socket) {
  return rooms.get(socket.data.roomId);
}

function removeWaiting(socketId) {
  const i = waiting.indexOf(socketId);
  if (i >= 0) waiting.splice(i, 1);
}

function joinMatchmaking(socket) {
  removeWaiting(socket.id);

  const otherId = waiting.shift();
  if (!otherId) {
    waiting.push(socket.id);
    socket.emit("matchWaiting");
    return;
  }

  const other = io.sockets.sockets.get(otherId);
  if (!other || other.id === socket.id) {
    waiting.unshift(socket.id);
    socket.emit("matchWaiting");
    return;
  }

  const roomId = Math.random().toString(36).slice(2, 10);
  const room = {
    id: roomId,
    started: false,
    turnPlayer: 0,
    turnNumber: 0,
    players: [createPlayer(other), createPlayer(socket)]
  };

  rooms.set(roomId, room);
  other.join(roomId);
  socket.join(roomId);
  other.data.roomId = roomId;
  socket.data.roomId = roomId;

  other.emit("matched", { roomId, playerIndex: 0 });
  socket.emit("matched", { roomId, playerIndex: 1 });
  emitRoom(room);
}

io.on("connection", socket => {
  socket.on("setName", name => {
    const room = getRoom(socket);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (player) player.name = String(name || "Player").slice(0, 20);
    emitRoom(room);
  });

  socket.on("findMatch", () => joinMatchmaking(socket));

  socket.on("setReady", ready => {
    const room = getRoom(socket);
    if (!room || room.started) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    player.ready = Boolean(ready);
    emitRoom(room);
    startGame(room);
  });

  socket.on("setDeck", deck => {
    const room = getRoom(socket);
    if (!room || room.started) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !Array.isArray(deck)) return;

    player.deck = deck
      .filter(c => c && typeof c.file === "string")
      .slice(0, 40)
      .map(c => ({ file: path.basename(c.file) }));

    emitRoom(room);
  });

  socket.on("draw", count => {
    const room = getRoom(socket);
    if (!room || !room.started) return;
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex !== room.turnPlayer) return;
    draw(room.players[playerIndex], Math.min(Number(count) || 1, 5));
    emitRoom(room);
  });

  socket.on("endTurn", () => {
    const room = getRoom(socket);
    if (!room || !room.started) return;
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex !== room.turnPlayer) return;

    room.turnPlayer = room.turnPlayer === 0 ? 1 : 0;
    room.turnNumber++;
    draw(room.players[room.turnPlayer], 1);
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    removeWaiting(socket.id);
    const room = getRoom(socket);
    if (!room) return;

    io.to(room.id).emit("opponentDisconnected");
    rooms.delete(room.id);
  });
});

function run(cmd, args) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd: __dirname }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

let updating = false;

async function autoUpdate() {
  if (updating || !fs.existsSync(path.join(__dirname, ".git"))) return;
  updating = true;

  try {
    const fetchResult = await run("git", ["fetch", "origin", BRANCH]);
    if (fetchResult.error) {
      console.error("[update] git fetch failed:", fetchResult.stderr || fetchResult.error.message);
      return;
    }

    const local = await run("git", ["rev-parse", "HEAD"]);
    const remote = await run("git", ["rev-parse", "origin/" + BRANCH]);

    if (local.error || remote.error || local.stdout.trim() === remote.stdout.trim()) return;

    console.log("[update] GitHub update detected. Pulling...");
    const pull = await run("git", ["pull", "--ff-only", "origin", BRANCH]);
    if (pull.error) {
      console.error("[update] git pull failed:", pull.stderr || pull.error.message);
      return;
    }

    const install = await run("npm", ["install", "--omit=dev"]);
    if (install.error) {
      console.error("[update] npm install failed:", install.stderr || install.error.message);
      return;
    }

    console.log("[update] Restarting DM server...");
    const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
      cwd: __dirname,
      detached: true,
      stdio: "inherit",
      env: process.env
    });
    child.unref();
    setTimeout(() => process.exit(0), 300);
  } finally {
    updating = false;
  }
}

setInterval(autoUpdate, UPDATE_INTERVAL);

server.listen(PORT, HOST, () => {
  console.log("DM server running on http://" + HOST + ":" + PORT);
  console.log("Card image directory:", CARD_IMAGE_DIR);
});
