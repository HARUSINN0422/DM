const socket = io();

const $ = id => document.getElementById(id);
let cards = [];
let selectedDeck = [];
let myIndex = -1;

socket.on("connect", () => $("status").textContent = "接続済み");
socket.on("disconnect", () => $("status").textContent = "切断");

socket.on("matchWaiting", () => {
  $("matchInfo").textContent = "対戦相手を待っています...";
});

socket.on("matched", data => {
  myIndex = data.playerIndex;
  $("matchInfo").textContent = "対戦相手が見つかりました。40枚デッキを作って準備完了してください。";
  $("ready").disabled = false;
});

socket.on("gameStarted", () => {
  $("lobby").classList.add("hidden");
  $("battle").classList.remove("hidden");
});

socket.on("opponentDisconnected", () => {
  $("battle").classList.add("hidden");
  $("lobby").classList.remove("hidden");
  $("find").disabled = false;
  $("matchInfo").textContent = "相手が切断しました。";
});

socket.on("roomState", state => renderRoom(state));

$("name").addEventListener("change", () => socket.emit("setName", $("name").value));

$("find").onclick = () => {
  socket.emit("setName", $("name").value);
  socket.emit("findMatch");
  $("find").disabled = true;
};

$("ready").onclick = () => {
  if (selectedDeck.length < 40) {
    $("matchInfo").textContent = "デッキを40枚にしてください。現在 " + selectedDeck.length + "枚";
    return;
  }
  socket.emit("setDeck", selectedDeck);
  socket.emit("setReady", true);
  $("ready").disabled = true;
  $("matchInfo").textContent = "準備完了。相手を待っています...";
};

$("draw").onclick = () => socket.emit("draw", 1);
$("endTurn").onclick = () => socket.emit("endTurn");

async function loadCards() {
  try {
    const res = await fetch("/api/cards");
    const data = await res.json();
    cards = data.cards;
    $("matchInfo").textContent = "カード画像 " + data.count + "枚。クリックでデッキに追加。";

    for (const card of cards) {
      const div = document.createElement("div");
      div.className = "card";
      div.title = "クリックでデッキに追加";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = card.image;
      const small = document.createElement("small");
      small.textContent = card.file;
      div.append(img, small);
      div.onclick = () => {
        if (selectedDeck.length >= 40) return;
        selectedDeck.push({ file: card.file });
        $("matchInfo").textContent = "デッキ " + selectedDeck.length + "/40";
      };
      $("cardGrid").appendChild(div);
    }
  } catch (e) {
    $("matchInfo").textContent = "カード一覧の取得に失敗しました。";
    console.error(e);
  }
}

function renderRoom(state) {
  const me = state.players[myIndex];
  const opponent = state.players[myIndex === 0 ? 1 : 0];
  if (!me || !opponent) return;

  $("playerName").textContent = me.name;
  $("opponentName").textContent = opponent.name;
  $("playerShields").textContent = me.shieldCount;
  $("playerHand").textContent = me.handCount;
  $("playerMana").textContent = me.manaCount;
  $("opponentShields").textContent = opponent.shieldCount;
  $("opponentHand").textContent = opponent.handCount;
  $("turnInfo").textContent = state.started
    ? ((state.turnPlayer === myIndex ? "あなたのターン" : "相手のターン") + " / " + state.turnNumber)
    : "準備中";
}

loadCards();
