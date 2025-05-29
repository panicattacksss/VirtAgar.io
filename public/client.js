// public/client.js
const socket = io();
const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');

function resizeCanvas() {
  gameCanvas.width = window.innerWidth;
  gameCanvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let players = {};
let foods = [];
let spikes = [];
let selfId = '';
let currentRoom = '';

const menu = document.getElementById('menu');
const nicknameInput = document.getElementById('nicknameInput');
const roomInput = document.getElementById('roomInput');
const startButton = document.getElementById('startButton');
const refreshRoomsButton = document.getElementById('refreshRoomsButton');
const roomsListDiv = document.getElementById('roomsList');
const leaderList = document.getElementById('leaderList');
const roomInfoDiv = document.getElementById('roomInfo');

const videoElement = document.getElementById('inputVideo');
const mpCanvas = document.getElementById('mpCanvas'); // для отладки
const mpCtx = mpCanvas.getContext('2d');

function getRandomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

const skinInput = document.getElementById('skinInput');

startButton.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim() || 'Guest';
  const room = roomInput.value.trim() || 'Default';
  currentRoom = room;
  const color = getRandomColor();

  const join = (skinDataUrl) => {
    socket.emit('joinGame', { nickname, color, room, skin: skinDataUrl });
    menu.style.display = 'none';
    startMediapipe();
  };

  if (skinInput.files && skinInput.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      join(e.target.result); // e.target.result — Data URL картинки
    };
    reader.readAsDataURL(skinInput.files[0]);
  } else {
    join(null); 
  }
});


refreshRoomsButton.addEventListener('click', () => {
  socket.emit('getRooms');
});

socket.on('roomsList', rooms => {
  roomsListDiv.innerHTML = '';
  rooms.forEach(r => {
    const roomDiv = document.createElement('div');
    roomDiv.textContent = r;
    roomDiv.style.cursor = 'pointer';
    roomDiv.addEventListener('click', () => {
      roomInput.value = r;
    });
    roomsListDiv.appendChild(roomDiv);
  });
});

socket.on('connect', () => {
  selfId = socket.id;
  console.log('Подключено с id:', selfId);
});
socket.on('serverLoad', data => {
  document.getElementById('cpu').innerText = `CPU: ${data.loadAvg}`;
  document.getElementById('ram').innerText = `RAM: ${data.usedMemMB}/${data.totalMemMB} MB`;
  document.getElementById('online').innerText = `Players: ${data.connections}`;
});
let lastPing = Date.now();

setInterval(() => {
  socket.emit('pingCheck');
  lastPing = Date.now();
}, 1000);

socket.on('pongCheck', () => {
  const now = Date.now();
  const ping = now - lastPing;
  document.getElementById('ping').innerText = `Ping: ${ping} ms`;
});

socket.on('currentState', data => {
  players = data.players;
  foods = data.foods;
  spikes = data.spikes || [];
  roomInfoDiv.textContent = `Комната: ${data.roomName} | Игроков: ${data.connections}`;
  requestAnimationFrame(render);
});

socket.on('newPlayer', player => {
  players[player.id] = player;
});

socket.on('playerDisconnect', playerId => {
  delete players[playerId];
});

socket.on('stateUpdate', data => {
  players = data.players;
  foods = data.foods;
  spikes = data.spikes || [];
  roomInfoDiv.textContent = `Комната: ${data.roomName} | Игроков: ${data.connections}`;
});

socket.on('gameOver', data => {
  alert('Game Over: ' + data.reason);
});

function updateLeaderboard() {
  const playerArray = Object.values(players);
  playerArray.sort((a, b) => b.size - a.size);
  leaderList.innerHTML = '';
  playerArray.forEach(player => {
    const li = document.createElement('li');
    li.textContent = `${player.nickname}: ${Math.floor(player.size)}`;
    leaderList.appendChild(li);
  });
}

const cacheImages = {};

function drawPlayer(player, offsetX, offsetY) {
  const x = player.x - offsetX;
  const y = player.y - offsetY;
  
  if (player.skin) {
    if (!cacheImages[player.id] && player.skin) {
      const img = new Image();
      img.src = player.skin;
      cacheImages[player.id] = img;
    }
    const img = cacheImages[player.id];
    if (img.complete) {
      const size = player.size * 2; // Диаметр кругового изображения
      gameCtx.save();
      gameCtx.beginPath();
      // Создаем окружность для обтравки (clip)
      gameCtx.arc(x, y, size / 2, 0, 2 * Math.PI);
      gameCtx.closePath();
      gameCtx.clip();
      // Рисуем изображение так, чтобы оно заполнило всю область окружности
      gameCtx.drawImage(img, x - size / 2, y - size / 2, size, size);
      gameCtx.restore();
    } else {
      // Пока изображение не загружено — рисуем круг-заглушку.
      gameCtx.beginPath();
      gameCtx.arc(x, y, player.size, 0, 2 * Math.PI);
      gameCtx.fillStyle = player.color || (player.id === selfId ? 'blue' : 'red');
      gameCtx.fill();
      gameCtx.stroke();
    }
  } else {
    gameCtx.beginPath();
    gameCtx.arc(x, y, player.size, 0, 2 * Math.PI);
    gameCtx.fillStyle = player.color || (player.id === selfId ? 'blue' : 'red');
    gameCtx.fill();
    gameCtx.stroke();
  }
}

const foodImages = [];
const foodPaths = [
  '/images/food/cola.png',
  '/images/food/burger.png',
  '/images/food/potato.png'
];

foodPaths.forEach(path => {
  const img = new Image();
  img.src = path;
  foodImages.push(img);
});
const spikeImages = [];
const spikeImg1 = new Image();
spikeImg1.src = '/images/orig-Photoroom.png';
spikeImages.push(spikeImg1);

function drawNeonBackground(ctx, width, height) {
  let gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1e1e2f');
  gradient.addColorStop(1, '#3a3a5e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 255, 204, 0.15)'; 

  for (let x = 0; x < width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function render(timestamp) {
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  drawNeonBackground(gameCtx, gameCanvas.width, gameCanvas.height);

  let offsetX = 0, offsetY = 0;
  if (players[selfId]) {
    offsetX = players[selfId].x - gameCanvas.width / 2;
    offsetY = players[selfId].y - gameCanvas.height / 2;
  }

  foods.forEach((food, i) => {
    const x = food.x - offsetX;
    const y = food.y - offsetY;
    const img = foodImages[i % foodImages.length];
  
    if (img.complete) {
      const size = 32;
      gameCtx.drawImage(img, x - size / 2, y - size / 2, size, size);
    } else {
      gameCtx.beginPath();
      gameCtx.arc(x, y, 16, 0, 2 * Math.PI);
      gameCtx.fillStyle = food.color || 'green';
      gameCtx.fill();
      gameCtx.stroke();
    }
  });

  spikes.forEach((spike, i) => {
    const x = spike.x - offsetX;
    const y = spike.y - offsetY;
    const img = spikeImages[i % spikeImages.length];
  
    if (img.complete) {
      const size = 64;
      gameCtx.drawImage(img, x - size / 2, y - size / 2, size, size);
    } else {
      gameCtx.beginPath();
      gameCtx.arc(x, y, spike.size, 0, 2 * Math.PI);
      gameCtx.fillStyle = spike.color || 'black';
      gameCtx.fill();
      gameCtx.stroke();
    }
  });

  for (let id in players) {
    drawPlayer(players[id], offsetX, offsetY);
  }

  updateLeaderboard();
  requestAnimationFrame(render);
}


const centerX = 0.5;
const centerY = 0.5;
let lastSent = Date.now();

function onMediapipeResults(results) {
  if (!results.poseLandmarks || results.poseLandmarks.length === 0) return;

  mpCtx.save();
  mpCtx.clearRect(0, 0, mpCanvas.width, mpCanvas.height);
  mpCtx.drawImage(results.image, 0, 0, mpCanvas.width, mpCanvas.height);

  window.drawConnectors(mpCtx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: 'white' });
  window.drawLandmarks(mpCtx, results.poseLandmarks, { color: 'white', fillColor: 'rgb(255,138,0)' });

  mpCtx.restore();

  const nose = results.poseLandmarks[0];
  const mirroredX = 1 - nose.x; 
  const dx = (mirroredX - 0.5) * 2; 
  const dy = (nose.y - 0.5) * 2;

  const MAX_SPEED = 15;
  const magnitude = Math.sqrt(dx * dx + dy * dy);
  let speedX = dx * MAX_SPEED;
  let speedY = dy * MAX_SPEED;

  const DEAD_ZONE = 0.1;
  if (Math.abs(dx) < DEAD_ZONE) speedX = 0;
  if (Math.abs(dy) < DEAD_ZONE) speedY = 0;

  socket.emit('joystickMove', { dx: speedX, dy: speedY });
}


function startMediapipe() {
  const holistic = new window.Holistic({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
  });
  holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  holistic.onResults(onMediapipeResults);

  const camera = new window.Camera(videoElement, {
    onFrame: async () => {
      await holistic.send({ image: videoElement });
    },
    width: 640,
    height: 480
  });
  camera.start();
}
document.getElementById('skinButton').addEventListener('click', () => {
  document.getElementById('skinInput').click();
});

document.getElementById('skinInput').addEventListener('change', (e) => {
  const fileName = e.target.files[0]?.name || 'Файл не выбран';
  document.getElementById('skinFileName').textContent = fileName;
});
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function drawNeonBackground() {
  let gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#1e1e2f');
  gradient.addColorStop(1, '#3a3a5e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 255, 204, 0.15)';

  for (let x = 0; x < canvas.width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function gameLoop() {
  drawNeonBackground();
  requestAnimationFrame(gameLoop);
}

gameLoop();
