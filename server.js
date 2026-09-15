const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 카드 데이터베이스 (필요에 따라 계속 추가 가능)
const DECK = [
  { id: 1, name: "머핀 시간이야!", type: "action", desc: "모든 플레이어가 카드를 1장 뽑습니다." },
  { id: 2, name: "어이 버거!", type: "trap", desc: "누군가 카드를 뽑을 때 사용: 그 카드를 뺏어옵니다." },
  { id: 3, name: "당근 좋아해?", type: "action", desc: "카드를 2장 뽑습니다." },
  { id: 4, name: "피에로 등장", type: "action", desc: "다른 플레이어 1명의 카드를 버리게 합니다." },
  { id: 5, name: "지뢰 카트", type: "trap", desc: "누군가 나를 공격할 때 사용: 공격을 반사합니다." },
  { id: 6, name: "우유 파티", type: "action", desc: "덱에서 카드를 1장 뽑습니다." },
  { id: 7, name: "함정 발동!", type: "trap", desc: "상대방의 행동을 무효화합니다." },
  { id: 8, name: "강제 교환", type: "action", desc: "다른 플레이어 한 명과 손에 든 카드를 바꿉니다." }
];

// 덱 셔플 함수 (피셔-예이츠 셔플 알고리즘)
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const rooms = {};

io.on('connection', (socket) => {
  console.log('유저 접속:', socket.id);

  // 방 생성 및 참여
  socket.on('joinRoom', ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        players: [],
        deck: shuffle([...DECK, ...DECK, ...DECK]), // 덱 생성 및 셔플
        started: false,
        turnIndex: 0
      };
    }

    const room = rooms[roomId];

    let player = room.players.find(p => p.id === socket.id);
    if (!player) {
      player = { id: socket.id, name: username, hand: [], isMuffinTime: false };
      room.players.push(player);
    }

    io.to(roomId).emit('updateRoom', room);
  });

  // 게임 시작 요청 처리
  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.started) {
      socket.emit('log', '이미 게임이 시작되었습니다.');
      return;
    }

    if (room.players.length === 0) {
      socket.emit('log', '플레이어가 없습니다.');
      return;
    }

    // 게임 상태 업데이트 및 초기화
    room.started = true;
    room.deck = shuffle([...DECK, ...DECK, ...DECK, ...DECK]);
    room.turnIndex = 0;

    // 모든 플레이어에게 초기 카드 3장씩 지급
    room.players.forEach(player => {
      player.hand = [];
      player.isMuffinTime = false;
      for (let i = 0; i < 3; i++) {
        if (room.deck.length > 0) {
          player.hand.push(room.deck.pop());
        }
      }
    });

    io.to(roomId).emit('updateRoom', room);
    io.to(roomId).emit('log', '🎮 게임이 시작되었습니다! 모든 플레이어에게 카드 3장씩 지급되었습니다.');
  });

  // 카드 뽑기
  socket.on('drawCard', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!room.started) {
      socket.emit('log', '게임이 아직 시작되지 않았습니다.');
      return;
    }

    const currentPlayer = room.players[room.turnIndex];
    if (currentPlayer && currentPlayer.id !== socket.id) {
      socket.emit('log', '당신의 턴이 아닙니다!');
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (player && room.deck.length > 0) {
      const drawnCard = room.deck.pop();
      player.hand.push(drawnCard);

      // 턴 넘기기
      room.turnIndex = (room.turnIndex + 1) % room.players.length;

      io.to(roomId).emit('updateRoom', room);
      io.to(roomId).emit('log', `${player.name} 님이 카드를 1장 뽑았습니다.`);
    } else if (room.deck.length === 0) {
      io.to(roomId).emit('log', '덱에 더 이상 카드가 없습니다!');
    }
  });

  // 머핀 타임 외치기
  socket.on('shoutMuffinTime', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!room.started) {
      socket.emit('log', '게임이 아직 시작되지 않았습니다.');
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      if (player.hand.length >= 10) {
        player.isMuffinTime = true;
        io.to(roomId).emit('log', `🎉 ${player.name} 님이 "머핀 타임!"을 외쳤습니다! 다음 턴까지 유지하면 승리합니다!`);
      } else {
        socket.emit('log', '카드가 10장 이상이어야 "머핀 타임!"을 외칠 수 있습니다!');
      }
      io.to(roomId).emit('updateRoom', room);
    }
  });

  // 접속 종료
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        // 턴 인덱스 범위 초과 방지
        if (room.turnIndex >= room.players.length) {
          room.turnIndex = 0;
        }
        io.to(roomId).emit('updateRoom', room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
