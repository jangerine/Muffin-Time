const socket = io();

let currentRoomId = '';
let myId = '';

socket.on('connect', () => {
  myId = socket.id;
});

function joinGame() {
  const username = document.getElementById('username').value;
  const roomId = document.getElementById('room-id').value;

  if (!username || !roomId) {
    alert('닉네임과 방 코드를 입력하세요.');
    return;
  }

  currentRoomId = roomId;
  socket.emit('joinRoom', { roomId, username });

  document.getElementById('login-sec').style.display = 'none';
  document.getElementById('game-sec').style.display = 'block';
  document.getElementById('display-room').innerText = roomId;
}

function startGame() {
  socket.emit('startGame', { roomId: currentRoomId });
}

function drawCard() {
  socket.emit('drawCard', { roomId: currentRoomId });
}

function shoutMuffinTime() {
  socket.emit('shoutMuffinTime', { roomId: currentRoomId });
}

// 서버로부터 방 상태 업데이트 수신
socket.on('updateRoom', (room) => {
  // 게임 시작 버튼 상태 업데이트
  const startBtn = document.getElementById('start-btn');
  if (room.started) {
    startBtn.innerText = '게임 진행 중...';
    startBtn.disabled = true;
  } else {
    startBtn.innerText = '▶️ 게임 시작';
    startBtn.disabled = false;
  }

  // 플레이어 리스트 갱신
  const playerList = document.getElementById('player-list');
  playerList.innerHTML = '';
  
  room.players.forEach((p, index) => {
    const isMyTurn = room.started && index === room.turnIndex;
    const li = document.createElement('li');
    li.innerText = `${p.name} (카드 ${p.hand.length}장) ${p.isMuffinTime ? '🧁[머핀 타임!]' : ''} ${isMyTurn ? '👈 현재 턴' : ''}`;
    playerList.appendChild(li);
  });

  // 내 카드 갱신
  const me = room.players.find(p => p.id === socket.id);
  if (me) {
    document.getElementById('hand-count').innerText = me.hand.length;
    const handDiv = document.getElementById('my-hand');
    handDiv.innerHTML = '';

    me.hand.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.className = `card ${card.type}`;
      cardEl.innerHTML = `<strong>${card.name}</strong><br><small>${card.desc}</small>`;
      handDiv.appendChild(cardEl);
    });
  }
});

// 로그 출력
socket.on('log', (msg) => {
  const logBox = document.getElementById('log-box');
  const p = document.createElement('p');
  p.style.margin = "2px 0";
  p.innerText = msg;
  logBox.appendChild(p);
  logBox.scrollTop = logBox.scrollHeight;
});
