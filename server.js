// server.js
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const os = require('os');

const PORT = process.env.PORT || 3000;

const io = new Server(server, {
  perMessageDeflate: {
    threshold: 1024,
  }
});

const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

(async () => {
  try {
    const pubClient = createClient();
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Redis adapter подключен.');
    startServer();
  } catch (err) {
    console.error('Ошибка подключения Redis:', err);
  }
})();

app.use(express.static('public'));

const GAME_WIDTH = 5000;
const GAME_HEIGHT = 5000;
const PLAYER_SPEED = 3;
const FOOD_COUNT = 600;
const FOOD_SIZE = 5;
const FOOD_GROWTH = 1;
const SPIKE_COUNT = 10;
const SPIKE_SIZE = 20;
const EAT_THRESHOLD = 1.1;

function getServerLoad() {
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const usedMem = totalMem - freeMem;
  const loadAvg = os.platform() === 'win32' ? '-' : os.loadavg()[0].toFixed(2);
  let totalPlayers = 0;
  for (let room in rooms) {
    totalPlayers += Object.keys(rooms[room].players).length;
  }
  return {
    usedMemMB: (usedMem / 1024 / 1024).toFixed(1),
    totalMemMB: (totalMem / 1024 / 1024).toFixed(1),
    loadAvg,
    connections: totalPlayers
  };
}

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
  console.log(`Новое соединение: ${socket.id} (Worker ${process.pid})`);

  socket.on('pingCheck', () => {
    socket.emit('pongCheck');
  });

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
      skin: skin || null,
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
  
    const MAP_SIZE = GAME_WIDTH;
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
        const dx = food.x - player.x;
        const dy = food.y - player.y;
        const rSum = player.size + food.size;
        if (dx * dx + dy * dy < rSum * rSum) {
          player.size += FOOD_GROWTH;
          foods.splice(i, 1);
          foods.push(spawnFood());
        }
      }
    }

    for (let pid in players) {
      let player = players[pid];
      spikes.forEach(spike => {
        const dx = spike.x - player.x;
        const dy = spike.y - player.y;
        const rSum = player.size + spike.size;
        if (dx * dx + dy * dy < rSum * rSum) {
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
        const dx = playerA.x - playerB.x;
        const dy = playerA.y - playerB.y;
        const rSum = playerA.size + playerB.size;
        if (dx * dx + dy * dy < rSum * rSum) {
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
}, 40);


setInterval(() => {
  const load = getServerLoad();
  io.emit('serverLoad', load);
}, 2000);
