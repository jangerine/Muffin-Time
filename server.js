const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 임시 카드리스트 (원하는 대로 능력을 계속 추가할 수 있습니다)
const DECK = [
  { id: 1, name: "머핀 시간이야!", type: "action", desc: "모든 플레이어가 카드를 1장 뽑습니다." },
  { id: 2, name: "어이 버거!", type: "trap", desc: "누군가 카드를 뽑을 때 사용: 그 카드를 뺏어옵니다." },
  { id: 3, name: "당근 좋아해?", type: "action", desc: "카드를 2장 뽑습니다." },
  { id: 4, name: "피에로 등장", type: "action", desc: "다른 플레이어 1명의 카드를 버리게 합니다." },
  { id: 5, name: "지뢰 카트", type: "trap", desc: "누군가 나를 공격할 때 사용: 공격을 반사합니다." },
];

const rooms = {};

io.on('connection', (socket) => {
  console.log('유저 접속:', socket.id);

  // 방 생성 / 참여
  socket.on('joinRoom', ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        players: [],
        deck: [...DECK, ...DECK, ...DECK], // 덱 복사
        started: false,
        turnIndex: 0
      };
    }

    const room = rooms[roomId];
    
    // 이미 존재하는 플레이어인지 확인 후 없으면 추가
    let player = room.players.find(p => p.id === socket.id);
    if (!player) {
      player = { id: socket.id, name: username, hand: [], isMuffinTime: false };
      room.players.push(player);
    }

    io.to(roomId).emit('updateRoom', room);
  });

  // 카드 뽑기
  socket.on('drawCard', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player && room.deck.length > 0) {
      const drawnCard = room.deck.pop();
      player.hand.push(drawnCard);

      // 턴 넘기기
      room.turnIndex = (room.turnIndex + 1) % room.players.length;

      io.to(roomId).emit('updateRoom', room);
      io.to(roomId).emit('log', `${player.name} 님이 카드를 1장 뽑았습니다.`);
    }
  });

  // 머핀 타임 외치기! (카드가 10장 이상일 때 승리 선언 조건)
  socket.on('shoutMuffinTime', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

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

  // 연결 종료 처리
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('updateRoom', room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
