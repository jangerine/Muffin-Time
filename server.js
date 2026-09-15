const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// 전체 덱 데이터 (원하는 대로 카드를 계속 추가할 수 있습니다)
const CARD_DECK = [
  { name: "머핀 등장!", text: "누군가 저를 먹어주길 바라고 있어요! (카드 1장 획득)", type: "action", draw: 1 },
  { name: "함정 카드!", text: "상대방의 머핀을 훔칩니다. (카드 1장 스틸)", type: "action", steal: 1 },
  { name: "폭발하는 샌드위치", text: "모든 플레이어가 카드를 1장 버립니다.", type: "action", discardAll: 1 },
  { name: "도망쳐!", text: "다음 한 바퀴 동안 공격을 무효화합니다.", type: "counter" },
  { name: "시간 여행", text: "카드 2장을 덱에서 뽑습니다.", type: "action", draw: 2 },
  { name: "유령 머핀", text: "아무 효과 없이 손에 머무릅니다.", type: "action" }
];

let players = {};
let turnOrder = [];
let currentTurnIndex = 0;

io.on("connection", (socket) => {
  console.log("플레이어 접속:", socket.id);

  // 1. 방 입장
  socket.on("joinGame", (name) => {
    players[socket.id] = {
      id: socket.id,
      name: name || `플레이어_${socket.id.substring(0, 4)}`,
      hand: getRandomCards(3), // 기본 카드 3장 제공
    };
    turnOrder.push(socket.id);
    updateGameState();
  });

  // 2. 카드 뽑기
  socket.on("drawCard", () => {
    if (turnOrder[currentTurnIndex] !== socket.id) return;
    const newCard = getRandomCards(1)[0];
    players[socket.id].hand.push(newCard);
    nextTurn();
  });

  // 3. 카드 내기 (머핀 타임 외치기 조건 체크)
  socket.on("playCard", (cardIndex) => {
    if (turnOrder[currentTurnIndex] !== socket.id) return;
    const player = players[socket.id];
    
    if (cardIndex >= 0 && cardIndex < player.hand.length) {
      const playedCard = player.hand.splice(cardIndex, 1)[0];
      
      // 카드 효과 간단 처리
      if (playedCard.draw) {
        player.hand.push(...getRandomCards(playedCard.draw));
      }
      
      nextTurn();
    }
  });

  // 4. "머핀 타임!" 외치기 버튼 (카드가 정확히 10장일 때 승리)
  socket.on("callMuffinTime", () => {
    const player = players[socket.id];
    if (player && player.hand.length === 10) {
      io.emit("gameOver", `${player.name}님이 '머핀 타임!'을 외쳐 승리하셨습니다! 🧁🎉`);
    } else {
      socket.emit("message", "카드가 정확히 10장이어야 머핀 타임을 외칠 수 있습니다!");
    }
  });

  // 5. 연결 해제
  socket.on("disconnect", () => {
    delete players[socket.id];
    turnOrder = turnOrder.filter((id) => id !== socket.id);
    if (currentTurnIndex >= turnOrder.length) currentTurnIndex = 0;
    updateGameState();
  });
});

function getRandomCards(count) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * CARD_DECK.length);
    result.push({ ...CARD_DECK[randomIndex] });
  }
  return result;
}

function nextTurn() {
  if (turnOrder.length > 0) {
    currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
  }
  updateGameState();
}

function updateGameState() {
  io.emit("gameState", {
    players: Object.values(players).map((p) => ({
      name: p.name,
      cardCount: p.hand.length,
      isTurn: turnOrder[currentTurnIndex] === p.id,
    })),
    currentTurn: turnOrder[currentTurnIndex],
  });

  // 각 개별 유저에게 본인의 손패 전달
  Object.keys(players).forEach((id) => {
    io.to(id).emit("myHand", players[id].hand);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
