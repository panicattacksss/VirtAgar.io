// public/client.js
const socket = io();
const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');

let players = {};
let foods = [];
let selfId = '';

const menu = document.getElementById('menu');
const nicknameInput = document.getElementById('nicknameInput');
const startButton = document.getElementById('startButton');
const leaderList = document.getElementById('leaderList');

const videoElement = document.getElementById('inputVideo');
const mpCanvas = document.getElementById('mpCanvas'); // для отладки, можно скрыть
const mpCtx = mpCanvas.getContext('2d');

function getRandomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

startButton.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim() || 'Guest';
  const color = getRandomColor();
  socket.emit('joinGame', { nickname, color });
  menu.style.display = 'none';
  startMediapipe();
});

socket.on('connect', () => {
  selfId = socket.id;
  console.log('Подключено с id:', selfId);
});

socket.on('currentState', data => {
  players = data.players;
  foods = data.foods;
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

function render() {
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  foods.forEach(food => {
    gameCtx.beginPath();
    gameCtx.arc(food.x, food.y, food.size, 0, 2 * Math.PI);
    gameCtx.fillStyle = food.color || 'green';
    gameCtx.fill();
    gameCtx.stroke();
  });

  for (let id in players) {
    const player = players[id];
    gameCtx.beginPath();
    gameCtx.arc(player.x, player.y, player.size, 0, 2 * Math.PI);
    gameCtx.fillStyle = player.color || (id === selfId ? 'blue' : 'red');
    gameCtx.fill();
    gameCtx.stroke();
  }

  updateLeaderboard();
  requestAnimationFrame(render);
}

function onMediapipeResults(results) {
  if (!results.poseLandmarks || results.poseLandmarks.length === 0) return;

  mpCtx.save();
  mpCtx.clearRect(0, 0, mpCanvas.width, mpCanvas.height);
  mpCtx.drawImage(results.image, 0, 0, mpCanvas.width, mpCanvas.height);
  if (results.poseLandmarks) {
    window.drawConnectors(mpCtx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: 'white' });
    window.drawLandmarks(mpCtx, results.poseLandmarks, { color: 'white', fillColor: 'rgb(255,138,0)' });
  }
  mpCtx.restore();

  const nose = results.poseLandmarks[0];
  const mirroredX = 1 - nose.x; // инверсия зеркала
  const targetX = mirroredX * gameCanvas.width;
  const targetY = nose.y * gameCanvas.height;

  socket.emit('playerMove', { x: targetX, y: targetY });
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
