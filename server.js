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

const GAME_WIDTH = 5000;
const GAME_HEIGHT = 5000;
const PLAYER_SPEED = 3;
const FOOD_COUNT = 600;
const FOOD_SIZE = 5;
const FOOD_GROWTH = 1;
const SPIKE_COUNT = 10;
const SPIKE_SIZE = 20;
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

function spawnSpike() {
  return {
    id: 'spike_' + Math.random().toString(36).substring(2, 10),
    x: Math.random() * (GAME_WIDTH - 2 * SPIKE_SIZE) + SPIKE_SIZE,
    y: Math.random() * (GAME_HEIGHT - 2 * SPIKE_SIZE) + SPIKE_SIZE,
    size: SPIKE_SIZE,
    color: 'black'
  };
}

let rooms = {}; // { roomName: { players: {}, foods: [], spikes: [] } }

io.on('connection', socket => {
  console.log(`Новое соединение: ${socket.id}`);

  socket.on('joinGame', data => {
    const { nickname, color, room, skin } = data;
  socket.join(room);
  socket.room = room;

    if (!rooms[room]) {
      rooms[room] = { players: {}, foods: [], spikes: [] };
      for (let i = 0; i < FOOD_COUNT; i++) {
        rooms[room].foods.push(spawnFood());
      }
      for (let i = 0; i < SPIKE_COUNT; i++) {
        rooms[room].spikes.push(spawnSpike());
      }
    }

    rooms[room].players[socket.id] = {
      id: socket.id,
      nickname: nickname || 'NoName',
      color: color,
      skin: skin || null,  // сохраняем ссылку на скин (Data URL)
      x: Math.random() * GAME_WIDTH,
      y: Math.random() * GAME_HEIGHT,
      targetX: Math.random() * GAME_WIDTH,
      targetY: Math.random() * GAME_HEIGHT,
      size: 15
    };

    socket.emit('currentState', { 
      players: rooms[room].players, 
      foods: rooms[room].foods, 
      spikes: rooms[room].spikes,
      roomName: room, 
      connections: Object.keys(rooms[room].players).length 
    });
    socket.to(room).emit('newPlayer', rooms[room].players[socket.id]);
  });

  socket.on('joystickMove', data => {
    const room = socket.room;
    const player = room && rooms[room]?.players[socket.id];
    if (!player) return;
  
    player.x += data.dx;
    player.y += data.dy;
  
    const MAP_SIZE = 5000;
    player.x = Math.max(0, Math.min(MAP_SIZE, player.x));
    player.y = Math.max(0, Math.min(MAP_SIZE, player.y));
  });
  

  socket.on('getRooms', () => {
    const activeRooms = Object.keys(rooms).filter(r => Object.keys(rooms[r].players).length > 0);
    socket.emit('roomsList', activeRooms);
  });

  socket.on('disconnect', () => {
    const room = socket.room;
    if (room && rooms[room]) {
      delete rooms[room].players[socket.id];
      io.to(room).emit('playerDisconnect', socket.id);
      if (Object.keys(rooms[room].players).length === 0) {
        delete rooms[room];
      }
    }
    console.log(`Отключился: ${socket.id}`);
  });
});

setInterval(() => {
  for (let room in rooms) {
    const roomData = rooms[room];
    const players = roomData.players;
    const foods = roomData.foods;
    const spikes = roomData.spikes;

    for (let id in players) {
  let player = players[id];
  
  player.x = Math.max(player.size, Math.min(GAME_WIDTH - player.size, player.x));
  player.y = Math.max(player.size, Math.min(GAME_HEIGHT - player.size, player.y));
}


    for (let pid in players) {
      let player = players[pid];
      for (let i = foods.length - 1; i >= 0; i--) {
        let food = foods[i];
        let d = Math.sqrt((food.x - player.x) ** 2 + (food.y - player.y) ** 2);
        if (d < player.size + food.size) {
          player.size += FOOD_GROWTH;
          foods.splice(i, 1);
          foods.push(spawnFood());
        }
      }
    }


    for (let pid in players) {
      let player = players[pid];
      spikes.forEach(spike => {
        let d = Math.sqrt((spike.x - player.x) ** 2 + (spike.y - player.y) ** 2);
        if (d < player.size + spike.size) {
          if (player.size > 30) {
            player.size = Math.max(15, player.size / 2);
          }
        }
      });
    }

    const playerIds = Object.keys(players);
    for (let i = 0; i < playerIds.length; i++) {
      let playerA = players[playerIds[i]];
      for (let j = i + 1; j < playerIds.length; j++) {
        let playerB = players[playerIds[j]];
        let d = Math.sqrt((playerA.x - playerB.x) ** 2 + (playerA.y - playerB.y) ** 2);
        if (d < playerA.size + playerB.size) {
          if (playerA.size > playerB.size * EAT_THRESHOLD) {
            playerA.size += playerB.size * 0.5;
            io.to(playerB.id).emit('gameOver', { reason: 'Вас поглотил игрок ' + playerA.nickname });
            delete players[playerB.id];
            io.to(room).emit('playerDisconnect', playerB.id);
          } else if (playerB.size > playerA.size * EAT_THRESHOLD) {
            playerB.size += playerA.size * 0.5;
            io.to(playerA.id).emit('gameOver', { reason: 'Вас поглотил игрок ' + playerB.nickname });
            delete players[playerA.id];
            io.to(room).emit('playerDisconnect', playerA.id);
          }
        }
      }
    }

    io.to(room).emit('stateUpdate', { 
      players, 
      foods, 
      spikes,
      roomName: room, 
      connections: Object.keys(players).length 
    });
  }
}, 50);
