const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const sprintFill = document.getElementById("sprintFill");
const powerLabel = document.getElementById("powerLabel");
const statusLabel = document.getElementById("statusLabel");
const restartButton = document.getElementById("restartButton");

const field = {
  width: canvas.width,
  height: canvas.height,
  endZoneHeight: 80,
  sidelines: 30,
};

const player = {
  x: field.width / 2,
  y: field.height - 120,
  radius: 18,
  speed: 2.7,
  sprintSpeed: 4.2,
  color: "#00338d",
  jersey: "#c60c30",
  sprintEnergy: 100,
  sprintCooldown: 0,
  isSprinting: false,
  truckActive: false,
  hurdleActive: false,
  hurdleArc: 0,
  hurdleTimer: 0,
  truckTimer: 0,
  powerUses: 0,
  pendingPower: null,
};

const gameState = {
  running: true,
  message: "Run it in!",
  defenders: [],
  powerUp: null,
  powerUpTimer: 0,
  difficulty: 1,
  distanceProgress: 0,
  lastSpawn: 0,
};

const keys = new Set();

const POWER_TYPES = {
  TRUCK: "TRUCK",
  HURDLE: "HURDLE",
};

const sounds = {
  truck: new Audio(),
  hurdle: new Audio(),
  tackle: new Audio(),
  touchdown: new Audio(),
};

// Placeholder beep using Web Audio API when needed.
function playBeep(type) {
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.connect(gain);
  gain.connect(context.destination);
  osc.type = "square";
  osc.frequency.value = type === "touchdown" ? 660 : 220;
  gain.gain.value = 0.05;
  osc.start();
  setTimeout(() => {
    osc.stop();
    context.close();
  }, 180);
}

function resetGame() {
  player.x = field.width / 2;
  player.y = field.height - 120;
  player.sprintEnergy = 100;
  player.sprintCooldown = 0;
  player.isSprinting = false;
  player.truckActive = false;
  player.hurdleActive = false;
  player.hurdleArc = 0;
  player.hurdleTimer = 0;
  player.truckTimer = 0;
  player.powerUses = 0;
  player.pendingPower = null;

  gameState.running = true;
  gameState.message = "Run it in!";
  gameState.defenders = [];
  gameState.powerUp = null;
  gameState.powerUpTimer = 0;
  gameState.difficulty = 1;
  gameState.distanceProgress = 0;
  gameState.lastSpawn = 0;

  spawnDefenderWave(3);
}

function spawnDefenderWave(count) {
  for (let i = 0; i < count; i += 1) {
    gameState.defenders.push(createDefender());
  }
}

function createDefender() {
  const x = Math.random() * (field.width - field.sidelines * 2) + field.sidelines;
  const y = Math.random() * 200 + 40;
  return {
    x,
    y,
    radius: 16,
    speed: 1.5 + Math.random() * 0.8 + gameState.difficulty * 0.25,
    angleBias: Math.random() > 0.5 ? 1 : -1,
    knockedDown: false,
    recoverTimer: 0,
  };
}

function spawnPowerUp() {
  if (gameState.powerUp) {
    return;
  }
  const type = Math.random() > 0.5 ? POWER_TYPES.TRUCK : POWER_TYPES.HURDLE;
  gameState.powerUp = {
    type,
    x: Math.random() * (field.width - field.sidelines * 2) + field.sidelines,
    y: Math.random() * (field.height - field.endZoneHeight - 200) + 140,
    radius: 12,
  };
  gameState.powerUpTimer = 0;
}

function activateTruck() {
  if (player.pendingPower !== POWER_TYPES.TRUCK) {
    return;
  }
  player.truckActive = true;
  player.truckTimer = 180;
  player.powerUses = 2;
  player.pendingPower = null;
  statusLabel.textContent = "TRUCK MODE!";
  playBeep("truck");
}

function activateHurdle() {
  if (player.pendingPower !== POWER_TYPES.HURDLE) {
    return;
  }
  player.hurdleActive = true;
  player.hurdleTimer = 50;
  player.hurdleArc = 0;
  player.pendingPower = null;
  statusLabel.textContent = "HURDLE!";
  playBeep("hurdle");
}

function handleInput() {
  let moveX = 0;
  let moveY = 0;
  if (keys.has("ArrowUp") || keys.has("w")) moveY -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) moveY += 1;
  if (keys.has("ArrowLeft") || keys.has("a")) moveX -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) moveX += 1;

  const magnitude = Math.hypot(moveX, moveY) || 1;
  const normalizedX = moveX / magnitude;
  const normalizedY = moveY / magnitude;

  player.isSprinting = keys.has("Shift") && player.sprintEnergy > 0;
  const speed = player.isSprinting ? player.sprintSpeed : player.speed;

  player.x += normalizedX * speed;
  player.y += normalizedY * speed;

  player.x = Math.min(Math.max(player.x, field.sidelines), field.width - field.sidelines);
  player.y = Math.min(
    Math.max(player.y, field.endZoneHeight + player.radius),
    field.height - field.sidelines
  );

  if (player.isSprinting) {
    player.sprintEnergy = Math.max(player.sprintEnergy - 0.9, 0);
    if (player.sprintEnergy === 0) {
      player.sprintCooldown = 120;
    }
  } else if (player.sprintCooldown <= 0) {
    player.sprintEnergy = Math.min(player.sprintEnergy + 0.5, 100);
  }

  if (player.sprintCooldown > 0 && !player.isSprinting) {
    player.sprintCooldown -= 1;
  }
}

function updateDefenders() {
  gameState.defenders.forEach((defender) => {
    if (defender.knockedDown) {
      defender.recoverTimer -= 1;
      if (defender.recoverTimer <= 0) {
        defender.knockedDown = false;
      }
      return;
    }
    const leadFactor = 0.4 + gameState.difficulty * 0.05;
    const targetX = player.x + defender.angleBias * 30 * leadFactor;
    const targetY = player.y - 10 * leadFactor;
    const dx = targetX - defender.x;
    const dy = targetY - defender.y;
    const distance = Math.hypot(dx, dy) || 1;
    defender.x += (dx / distance) * defender.speed;
    defender.y += (dy / distance) * defender.speed;
  });
}

function checkCollisions() {
  for (const defender of gameState.defenders) {
    if (defender.knockedDown) continue;
    const distance = Math.hypot(player.x - defender.x, player.y - defender.y);
    if (distance < player.radius + defender.radius - player.hurdleArc) {
      if (player.truckActive && player.powerUses > 0) {
        defender.knockedDown = true;
        defender.recoverTimer = 120;
        player.powerUses -= 1;
        playBeep("truck");
        if (player.powerUses === 0) {
          player.truckActive = false;
          statusLabel.textContent = "Truck spent";
        }
        continue;
      }
      if (player.hurdleActive && player.hurdleTimer > 0 && player.hurdleArc > 6) {
        // Clean hurdle, no tackle.
        continue;
      }
      endGame("Tackled! Game Over.");
      playBeep("tackle");
      return;
    }
  }
}

function updatePowerUp() {
  if (!gameState.powerUp) {
    if (player.pendingPower || player.truckActive || player.hurdleActive) {
      return;
    }
    gameState.powerUpTimer += 1;
    if (gameState.powerUpTimer > 260) {
      spawnPowerUp();
    }
    return;
  }
  const distance = Math.hypot(player.x - gameState.powerUp.x, player.y - gameState.powerUp.y);
  if (distance < player.radius + gameState.powerUp.radius) {
    statusLabel.textContent = `Grabbed ${gameState.powerUp.type}!`;
    player.pendingPower = gameState.powerUp.type;
    gameState.powerUp = null;
    gameState.powerUpTimer = 0;
  }
}

function advanceRun() {
  gameState.distanceProgress = (field.height - player.y) / (field.height - field.endZoneHeight);
  if (gameState.distanceProgress > 0.5 && gameState.difficulty < 2) {
    gameState.difficulty = 2;
    spawnDefenderWave(2);
  }
  if (gameState.distanceProgress > 0.75 && gameState.difficulty < 3) {
    gameState.difficulty = 3;
    spawnDefenderWave(2);
  }
  if (player.y <= field.endZoneHeight + player.radius) {
    endGame("Touchdown! You win!");
    playBeep("touchdown");
  }
}

function updatePowerTimers() {
  if (player.truckActive) {
    player.truckTimer -= 1;
    if (player.truckTimer <= 0) {
      player.truckActive = false;
      statusLabel.textContent = "Truck expired";
    }
  }
  if (player.hurdleActive) {
    player.hurdleTimer -= 1;
    player.hurdleArc = Math.sin((player.hurdleTimer / 50) * Math.PI) * 10;
    if (player.hurdleTimer <= 0) {
      player.hurdleActive = false;
      player.hurdleArc = 0;
      statusLabel.textContent = "Back down";
    }
  }
}

function endGame(message) {
  gameState.running = false;
  gameState.message = message;
  statusLabel.textContent = message;
}

function drawField() {
  ctx.clearRect(0, 0, field.width, field.height);
  ctx.fillStyle = "#0e5a2f";
  ctx.fillRect(0, 0, field.width, field.height);

  // End zone
  ctx.fillStyle = "#00338d";
  ctx.fillRect(0, 0, field.width, field.endZoneHeight);
  ctx.fillStyle = "#f2c94c";
  ctx.font = "bold 28px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("BILLS END ZONE", field.width / 2, 50);

  // Yard lines
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  for (let y = field.endZoneHeight + 40; y < field.height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(field.sidelines, y);
    ctx.lineTo(field.width - field.sidelines, y);
    ctx.stroke();
  }

  // Sidelines
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(field.sidelines, field.endZoneHeight, field.width - field.sidelines * 2, field.height - field.endZoneHeight - 10);
  ctx.lineWidth = 1;
}

function drawPlayer() {
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 6, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hurdle arc
  ctx.save();
  ctx.translate(player.x, player.y - player.hurdleArc);

  ctx.fillStyle = player.truckActive ? "#f2c94c" : player.color;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = player.jersey;
  ctx.fillRect(-8, -10, 16, 20);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("17", 0, 4);

  ctx.restore();

  if (player.truckActive) {
    ctx.strokeStyle = "rgba(242, 201, 76, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y - player.hurdleArc, player.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function drawDefenders() {
  gameState.defenders.forEach((defender) => {
    ctx.fillStyle = defender.knockedDown ? "rgba(200, 16, 46, 0.4)" : "#c8102e";
    ctx.beginPath();
    ctx.arc(defender.x, defender.y, defender.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f2c94c";
    ctx.beginPath();
    ctx.arc(defender.x + 6, defender.y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPowerUp() {
  if (!gameState.powerUp) return;
  ctx.fillStyle = gameState.powerUp.type === POWER_TYPES.TRUCK ? "#f2c94c" : "#7dd3fc";
  ctx.beginPath();
  ctx.arc(gameState.powerUp.x, gameState.powerUp.y, gameState.powerUp.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1b1b1b";
  ctx.font = "bold 10px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(gameState.powerUp.type === POWER_TYPES.TRUCK ? "T" : "H", gameState.powerUp.x, gameState.powerUp.y + 3);
}

function drawOverlay() {
  if (gameState.running) return;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, field.width, field.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(gameState.message, field.width / 2, field.height / 2);
}

function updateUI() {
  sprintFill.style.width = `${player.sprintEnergy}%`;
  if (player.truckActive) {
    powerLabel.textContent = `TRUCK x${player.powerUses}`;
  } else if (player.hurdleActive) {
    powerLabel.textContent = "HURDLE";
  } else if (player.pendingPower) {
    powerLabel.textContent = player.pendingPower;
  } else if (!gameState.powerUp) {
    powerLabel.textContent = "None";
  }
}

function update() {
  if (!gameState.running) {
    drawField();
    drawDefenders();
    drawPlayer();
    drawOverlay();
    return;
  }

  handleInput();
  updateDefenders();
  updatePowerTimers();
  checkCollisions();
  updatePowerUp();
  advanceRun();

  drawField();
  drawPowerUp();
  drawDefenders();
  drawPlayer();
  drawOverlay();
  updateUI();

  requestAnimationFrame(update);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key);
  if (event.key === "q" || event.key === "Q") {
    activateTruck();
  }
  if (event.key === "e" || event.key === "E") {
    activateHurdle();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

restartButton.addEventListener("click", () => {
  resetGame();
  statusLabel.textContent = "Ready";
  requestAnimationFrame(update);
});

resetGame();
requestAnimationFrame(update);
