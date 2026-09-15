const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// 풍부한 원작 스타일 카드 덱 정의
const CARD_DECK = [
  // --- ACTION (액션 카드) ---
  { name: "머핀 등장!", text: "저를 먹어주세요! (덱에서 카드 2장 드로우)", type: "action", effect: "draw2" },
  { name: "지뢰 가북이", text: "밟았습니다! (상대 1명의 카드를 1장 버리게 함)", type: "action", effect: "discardOpponent" },
  { name: "폭발하는 샌드위치", text: "콰쾅! (모든 플레이어가 카드 1장씩 버림)", type: "action", effect: "discardAll" },
  { name: "강도 강아지", text: "총 들어! (상대 1명의 카드를 1장 강탈)", type: "action", effect: "steal" },
  { name: "시간 여행", text: "과거로 돌아갑니다. (덱에서 카드 3장 드로우)", type: "action", effect: "draw3" },
  { name: "우유 한 잔", text: "마음을 가다듬습니다. (카드 1장 드로우)", type: "action", effect: "draw1" },
  { name: "카드 교환", text: "손에 있는 카드를 다른 사람과 랜덤 1장 교환합니다.", type: "action", effect: "swap" },

  // --- TRAP (트랩 카드 - 깔아두는 카드) ---
  { name: "트랩: 파리 채", text: "누군가 카드를 뽑을 때 발동! 그 플레이어의 카드를 1장 빼앗습니다.", type: "trap", effect: "trapDraw" },
  { name: "트랩: 바나나 껍질", text: "누군가 '머핀 타임'을 외칠 때 발동! 그 사람의 카드를 2장 버리게 만듭니다.", type: "trap", effect: "trapMuffin" },

  // --- COUNTER (카운터 카드 - 방어용) ---
  { name: "도망쳐!", text: "상대방의 공격 효과를 즉시 무효화합니다.", type: "counter", effect: "defend" },
  { name: "NO!", text: "방금 일어난 액션을 취소시킵니다.", type: "counter", effect: "cancel" }
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
      hand: getRandomCards(3),
      traps: [], // 세팅된 트랩 카드
      muffinTimeCalled: false // 머핀 타임 선언 여부
    };
    turnOrder.push(socket.id);
    updateGameState();
  });

  // 2. 카드 뽑기
  socket.on("drawCard", () => {
    if (turnOrder[currentTurnIndex] !== socket.id) return;
    
    const player = players[socket.id];
    player.hand.push(...getRandomCards(1));

    // 트랩 발동 체크 (파리 채 트랩)
    checkTrapsOnDraw(socket.id);

    nextTurn();
  });

  // 3. 카드 사용
  socket.on("playCard", ({ cardIndex, targetId }) => {
    if (turnOrder[currentTurnIndex] !== socket.id) return;
    
    const player = players[socket.id];
    if (cardIndex < 0 || cardIndex >= player.hand.length) return;

    const card = player.hand.splice(cardIndex, 1)[0];

    // 카드 타입별 처리
    if (card.type === "action") {
      executeActionEffect(socket.id, card, targetId);
    } else if (card.type === "trap") {
      player.traps.push(card);
      io.emit("log", `${player.name}님이 비밀 트랩 카드를 1장 세팅했습니다! 💣`);
    }

    nextTurn();
  });

  // 4. 머핀 타임 선언
  socket.on("callMuffinTime", () => {
    const player = players[socket.id];
    if (!player) return;

    if (player.hand.length === 10) {
      player.muffinTimeCalled = true;
      io.emit("log", `🧁 [경고] ${player.name}님이 '머핀 타임!'을 외쳤습니다! 카드가 10장입니다! 다음 차례까지 저지하세요!`);
      
      // 머핀 타임 방해 트랩 체크
      checkTrapsOnMuffinTime(socket.id);
      updateGameState();
    } else {
      socket.emit("message", "카드가 정확히 10장이어야 '머핀 타임!'을 외칠 수 있습니다!");
    }
  });

  // 5. 퇴장 처리
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

function executeActionEffect(casterId, card, targetId) {
  const caster = players[casterId];

  switch (card.effect) {
    case "draw1":
      caster.hand.push(...getRandomCards(1));
      break;
    case "draw2":
      caster.hand.push(...getRandomCards(2));
      break;
    case "draw3":
      caster.hand.push(...getRandomCards(3));
      break;
    case "discardOpponent":
      if (targetId && players[targetId] && players[targetId].hand.length > 0) {
        players[targetId].hand.pop();
        io.emit("log", `${caster.name}님이 ${players[targetId].name}님의 카드 1장을 버리게 했습니다!`);
      }
      break;
    case "steal":
      if (targetId && players[targetId] && players[targetId].hand.length > 0) {
        const stolenCard = players[targetId].hand.pop();
        caster.hand.push(stolenCard);
        io.emit("log", `${caster.name}님이 ${players[targetId].name}님의 카드를 1장 빼앗아왔습니다!`);
      }
      break;
    case "discardAll":
      Object.keys(players).forEach((id) => {
        if (players[id].hand.length > 0) players[id].hand.pop();
      });
      io.emit("log", "💣 폭발하는 샌드위치! 모든 플레이어가 카드를 1장씩 버렸습니다.");
      break;
  }
}

function checkTrapsOnDraw(drawerId) {
  Object.keys(players).forEach((id) => {
    if (id === drawerId) return;
    const player = players[id];
    const trapIndex = player.traps.findIndex((t) => t.effect === "trapDraw");
    if (trapIndex !== -1) {
      player.traps.splice(trapIndex, 1);
      if (players[drawerId].hand.length > 0) {
        const stolen = players[drawerId].hand.pop();
        player.hand.push(stolen);
        io.emit("log", `🪤 트랩 발동! ${player.name}님의 [파리 채] 트랩이 발동하여 ${players[drawerId].name}님의 카드를 빼앗았습니다!`);
      }
    }
  });
}

function checkTrapsOnMuffinTime(callerId) {
  Object.keys(players).forEach((id) => {
    if (id === callerId) return;
    const player = players[id];
    const trapIndex = player.traps.findIndex((t) => t.effect === "trapMuffin");
    if (trapIndex !== -1) {
      player.traps.splice(trapIndex, 1);
      const caller = players[callerId];
      caller.hand.splice(0, 2); // 2장 버림
      caller.muffinTimeCalled = false;
      io.emit("log", `🪤 트랩 발동! ${player.name}님의 [바나나 껍질] 트랩으로 인해 ${caller.name}님의 머핀 타임이 취소되고 카드가 2장 버려졌습니다!`);
    }
  });
}

function nextTurn() {
  if (turnOrder.length === 0) return;

  currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
  const currentTurnPlayerId = turnOrder[currentTurnIndex];
  const currentTurnPlayer = players[currentTurnPlayerId];

  // 승리 조건 체크: 차례가 다시 돌아왔을 때 여전히 머핀 타임 유효 & 카드 10장 이상
  if (currentTurnPlayer && currentTurnPlayer.muffinTimeCalled) {
    if (currentTurnPlayer.hand.length >= 10) {
      io.emit("gameOver", `🎉🎉 ${currentTurnPlayer.name}님이 '머핀 타임'을 성공적으로 유지하여 최종 승리하셨습니다! 🎉🎉`);
      return;
    } else {
      currentTurnPlayer.muffinTimeCalled = false; // 조건 미달 시 해제
    }
  }

  updateGameState();
}

function updateGameState() {
  io.emit("gameState", {
    players: Object.values(players).map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      trapCount: p.traps.length,
      muffinTimeCalled: p.muffinTimeCalled,
      isTurn: turnOrder[currentTurnIndex] === p.id,
    })),
    currentTurn: turnOrder[currentTurnIndex],
  });

  // 개별 플레이어의 손패 전달
  Object.keys(players).forEach((id) => {
    io.to(id).emit("myHand", players[id].hand);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`머핀 타임 서버 실행 중: 포트 ${PORT}`);
});
