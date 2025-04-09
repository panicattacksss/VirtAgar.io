// public/client.js
const socket = io();
const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');

let players = {};
let foods = [];
let selfId = '';

// Элементы главного меню и лидерборда
const menu = document.getElementById('menu');
const nicknameInput = document.getElementById('nicknameInput');
const startButton = document.getElementById('startButton');
const leaderList = document.getElementById('leaderList');

// Элементы для медиапайпа
const videoElement = document.getElementById('inputVideo');
const mpCanvas = document.getElementById('mpCanvas'); // для отладки, можно скрыть
const mpCtx = mpCanvas.getContext('2d');

// Функция генерации случайного цвета
function getRandomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

// При нажатии на кнопку «Старт»
startButton.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim() || 'Guest';
  const color = getRandomColor();
  // Отправляем событие joinGame на сервер с ником и цветом
  socket.emit('joinGame', { nickname, color });
  // Скрываем главное меню
  menu.style.display = 'none';
  // После старта запускаем медиапайп
  startMediapipe();
});

// Работа с Socket.IO
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

/// Функция обновления лидерборда (без изменений)
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

/// Рендер игрового поля (без изменений, можно доработать)
function render() {
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Рисуем еду
  foods.forEach(food => {
    gameCtx.beginPath();
    gameCtx.arc(food.x, food.y, food.size, 0, 2 * Math.PI);
    gameCtx.fillStyle = food.color || 'green';
    gameCtx.fill();
    gameCtx.stroke();
  });

  // Рисуем игроков
  for (let id in players) {
    const player = players[id];
    gameCtx.beginPath();
    gameCtx.arc(player.x, player.y, player.size, 0, 2 * Math.PI);
    // Используем цвет, назначенный сервером
    gameCtx.fillStyle = player.color || (id === selfId ? 'blue' : 'red');
    gameCtx.fill();
    gameCtx.stroke();
  }

  updateLeaderboard();
  requestAnimationFrame(render);
}

/// Убираем ранее использованный mousemove (если он был) – теперь управление через медиапайп
// gameCanvas.addEventListener('mousemove', function(event) { ... });


// === Интеграция Mediapipe ===

// Функция, которая будет вызываться при получении результатов от Mediapipe
function onMediapipeResults(results) {
  if (!results.poseLandmarks || results.poseLandmarks.length === 0) return;

  // Отрисовка результатов на mpCanvas (для отладки)
  mpCtx.save();
  mpCtx.clearRect(0, 0, mpCanvas.width, mpCanvas.height);
  mpCtx.drawImage(results.image, 0, 0, mpCanvas.width, mpCanvas.height);
  if (results.poseLandmarks) {
    // Для отладки можно отрисовать точки
    window.drawConnectors(mpCtx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: 'white' });
    window.drawLandmarks(mpCtx, results.poseLandmarks, { color: 'white', fillColor: 'rgb(255,138,0)' });
  }
  mpCtx.restore();

  // Извлекаем координаты носа (обычно первый ключ – нос)
  const nose = results.poseLandmarks[0];
  const mirroredX = 1 - nose.x; // инверсия X

  // nose.x и nose.y имеют нормализованные значения (0–1). Преобразуем их в координаты игрового canvas.
  const targetX = mirroredX * gameCanvas.width;
  const targetY = nose.y * gameCanvas.height;

  // Отправляем серверу обновление положения игрока
  socket.emit('playerMove', { x: targetX, y: targetY });
}

/// Функция запуска медиапайпа
function startMediapipe() {
  // Инициализируем Holistic
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

  // Создаем видеопоток с камеры
  const camera = new window.Camera(videoElement, {
    onFrame: async () => {
      await holistic.send({ image: videoElement });
    },
    width: 640,
    height: 480
  });
  camera.start();
}

//
// Примечания по интеграции:
// — Если вы хотите использовать оба вида управления (мышь и нос), можно оставить слушатель mousemove или переключаться по какому-либо условию.
// — Этот пример использует глобальные объекты из библиотеки Mediapipe (например, window.Holistic). Убедитесь, что ссылки в index.html подгружают нужные скрипты.
// — Возможно, вам потребуется доработать настройки камеры или масштабирование координат, чтобы управление было комфортным.
//
// Таким образом, вместо движения мышью теперь координаты носа (обновляемые в onMediapipeResults) обновляют целевую позицию игрока,
// что позволяет управлять игровым персонажем с помощью головы.
//

