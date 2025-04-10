// server.js
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

let players = {};
let foods = [];

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PLAYER_SPEED = 3; 
const FOOD_COUNT = 50;
const FOOD_SIZE = 5;  
const FOOD_GROWTH = 1;  
const EAT_THRESHOLD = 1.1;     

function spawnFood() {
  return {
    id: Math.random().toString(36).substring(2, 10),
    x: Math.random() * (GAME_WIDTH - 2 * FOOD_SIZE) + FOOD_SIZE,
    y: Math.random() * (GAME_HEIGHT - 2 * FOOD_SIZE) + FOOD_SIZE,
    size: FOOD_SIZE,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16)
  };
}

for (let i = 0; i < FOOD_COUNT; i++) {
  foods.push(spawnFood());
}

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

io.on('connection', socket => {
  console.log(`Новое соединение: ${socket.id}`);

  socket.on('joinGame', data => {
    players[socket.id] = {
      id: socket.id,
      nickname: data.nickname || 'NoName',
      color: data.color,
      x: Math.random() * GAME_WIDTH,
      y: Math.random() * GAME_HEIGHT,
      targetX: Math.random() * GAME_WIDTH,
      targetY: Math.random() * GAME_HEIGHT,
      size: 15
    };

    socket.emit('currentState', { players, foods });
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  socket.on('playerMove', data => {
    if (players[socket.id]) {
      players[socket.id].targetX = data.x;
      players[socket.id].targetY = data.y;
    }
  });

  socket.on('disconnect', () => {
    console.log(`Отключился: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnect', socket.id);
  });
});

setInterval(() => {
  for (let id in players) {
    let player = players[id];
    let dx = player.targetX - player.x;
    let dy = player.targetY - player.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      player.x += (dx / dist) * PLAYER_SPEED;
      player.y += (dy / dist) * PLAYER_SPEED;
    }
    player.x = Math.max(player.size, Math.min(GAME_WIDTH - player.size, player.x));
    player.y = Math.max(player.size, Math.min(GAME_HEIGHT - player.size, player.y));
  }

  for (let pid in players) {
    let player = players[pid];
    for (let i = foods.length - 1; i >= 0; i--) {
      let food = foods[i];
      if (distance(player.x, player.y, food.x, food.y) < player.size + food.size) {
        player.size += FOOD_GROWTH;
        foods.splice(i, 1);
        foods.push(spawnFood());
      }
    }
  }

  const playerIds = Object.keys(players);
  for (let i = 0; i < playerIds.length; i++) {
    let playerA = players[playerIds[i]];
    for (let j = i + 1; j < playerIds.length; j++) {
      let playerB = players[playerIds[j]];
      let d = distance(playerA.x, playerA.y, playerB.x, playerB.y);
      if (d < playerA.size + playerB.size) {
        if (playerA.size > playerB.size * EAT_THRESHOLD) {
          playerA.size += playerB.size * 0.5;
          io.to(playerB.id).emit('gameOver', { reason: 'Вас поглотил игрок ' + playerA.nickname });
          delete players[playerB.id];
          io.emit('playerDisconnect', playerB.id);
        } else if (playerB.size > playerA.size * EAT_THRESHOLD) {
          playerB.size += playerA.size * 0.5;
          io.to(playerA.id).emit('gameOver', { reason: 'Вас поглотил игрок ' + playerB.nickname });
          delete players[playerA.id];
          io.emit('playerDisconnect', playerA.id);
        }
      }
    }
  }

  io.emit('stateUpdate', { players, foods });

}, 50);
