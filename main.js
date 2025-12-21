// canvas関連
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 定数
const judgeY = 500;
const speed = 500;
const baseSpeed = 500;
const NOTE_SIZE = 40;   // 正方形の一辺
const judgeCenterY = judgeY + NOTE_SIZE / 2;
const laneX = [80, 160, 240, 320];
const pressedKeys = {};
const particles = [];
const SCORE_TABLE = {
  Sick: 1000,
  Good: 500,
  Bad: 100,
  Miss: 0
};
const LANE_COLORS = [
  "#ff5555", // 左
  "#55ff55", // 上
  "#5555ff", // 下
  "#ffff55"  // 右
];
let gameState = "select"; // "select" | "playing"

// ★ スコア・コンボ関連
let score = 0;
let combo = 0;
let maxCombo = 0;

const audioCtx = new AudioContext();
let musicSource = null;
let startTime = 0;
let lastJudge = "";
let judgeTimer = 0;
let offset = 0

const keyToLane = {
  ArrowLeft: 0,
  ArrowUp: 1,
  ArrowDown: 2,
  ArrowRight: 3,

  d: 0,
  f: 1,
  j: 2,
  k: 3
};

const JUDGE = [
  { name: "Sick", time: 0.05 },
  { name: "Good", time: 0.1 },
  { name: "Bad",  time: 0.15 }
];

const charts = [
  { title: "チャーリーダッシュ！", file: "charlie.json" },
  { title: "23時54分、陽の旅路へのプレリュード",   file: "2354_prelude.json" }
];

let selectedChartIndex = 0;
let music = "";

async function loadMusic(url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

function playMusic(buffer) {
  musicSource = audioCtx.createBufferSource();
  musicSource.buffer = buffer;
  musicSource.connect(audioCtx.destination);

  startTime = Math.max(audioCtx.currentTime + offset, 0); // ★ 超重要
  musicSource.start(startTime);
}

function applyJudge(judge) {
  lastJudge = judge;
  judgeTimer = 30;

  if (judge === "Miss" || judge === "Bad") {
    combo = 0;
    return;
  }

  combo++;
  if (combo > maxCombo) maxCombo = combo;

  score += SCORE_TABLE[judge] || 0;
}

function getJudge(diff) {
  for (let j of JUDGE) {
    if (diff <= j.time) return j.name;
  }
  return "Miss";
}

function beatToTime(beat, bpmEvents) {
  let time = 0;

  for (let i = 0; i < bpmEvents.length; i++) {
    const curr = bpmEvents[i];
    const next = bpmEvents[i + 1];

    const startBeat = curr.beat;
    const endBeat = next ? next.beat : beat;

    if (beat <= startBeat) break;

    const beats = Math.min(beat, endBeat) - startBeat;
    time += beats * (60 / curr.bpm);
  }

  return time;
}

let notes = [];

function spawnHoldParticle(lane) {
  const x = laneX[lane] + 30; // レーン中央
  const y = judgeY;

  particles.push({
    x: x + (Math.random() - 0.5) * 60,
    y: y + Math.random() * 10,
    vy: -1 - Math.random() * 1.5,
    life: 20 + Math.random() * 10
  });
}

function updateParticles() {
  for (let p of particles) {
    p.y += p.vy;
    p.life--;
  }

  // 寿命切れを削除
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  ctx.fillStyle = "rgba(0, 255, 255, 0.8)";

  for (let p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function now() {
  return audioCtx.currentTime + offset - startTime;
}

function drawJudgeLine() {
  ctx.strokeStyle = "black";
  for (let x of laneX) {
    ctx.strokeRect(x, judgeY, NOTE_SIZE, NOTE_SIZE);
  }
}

function drawNotes() {
  const t = now();
  for (let note of notes) {
    if (note.hit) continue;

    // ★ タップノーツのMiss判定
    if (note.type === "tap") {
      if (t > note.time + 0.15) {
        note.hit = true;
        applyJudge("Miss");
        continue;
      }
    }

    if (note.type === "hold" && note.holding) {
      if (t >= note.endTime) {
        note.hit = true;
        note.holding = false;
        applyJudge("Sick");
        continue;
      }
    }
    const x = laneX[note.lane];
    const color = LANE_COLORS[note.lane];
    ctx.fillStyle = color;

    if (note.type === "tap") {
      const dist = calcScrollDistance(
        note.time,
        t,
        scrollEvents,
        bpmEvents
      );
      const y = judgeCenterY - dist * baseSpeed;
      ctx.fillRect(x, y, NOTE_SIZE, NOTE_SIZE);
    }

    if (note.type === "hold") {
      const startDist = calcScrollDistance(note.startTime, t, scrollEvents, bpmEvents);
      const endDist   = calcScrollDistance(note.endTime, t, scrollEvents, bpmEvents);
      
      let yStartCenter;

      if (note.holding) {
        // ★ ホールド中：頭を判定ラインに固定
        yStartCenter = judgeCenterY;
      } else {
        // 通常時：時間で降ってくる
        yStartCenter = judgeCenterY
      }
      const yStart = yStartCenter - startDist * baseSpeed;
      const yEnd   = yStartCenter - endDist * baseSpeed;


      const bodyWidth = NOTE_SIZE / 3;
      const bodyX = x + (NOTE_SIZE - bodyWidth) / 2;

      ctx.fillRect(
        bodyX,
        yEnd + NOTE_SIZE,
        bodyWidth,
        yStart - yEnd - NOTE_SIZE
      );
      if (!note.holding) {
        
        ctx.fillRect(x, yStart, NOTE_SIZE, NOTE_SIZE); // 頭
      }
      if (note.holding) {
        spawnHoldParticle(note.lane);
      }
    }
  }
}

function checkMiss() {
  const t = now();

  for (let note of notes) {
    if (note.type === "hold" && note.holding) {
      const laneKeyPressed = Object.entries(keyToLane)
        .some(([key, lane]) =>
          lane === note.lane && pressedKeys[key]
        );

      // 押していないのに holding
      if (!laneKeyPressed) {
        note.holding = false;
        note.hit = true;
        applyJudge("Miss");
      }
    }
    if (
      note.type === "hold" &&
      !note.holding &&
      !note.hit &&
      note.startTime < t - JUDGE[JUDGE.length - 1].time
    ) {
      note.hit = true;   // 完全に消す
      applyJudge("Miss");
    }
  }
}

function drawJudgeLines() {
  ctx.strokeStyle = "white";
  for (let x of laneX) {
    ctx.strokeRect(x, judgeY, 60, 20);
  }
}

function drawJudgeText() {
  if (judgeTimer <= 0) return;

  ctx.save(); // ★ 描画状態を保存

  ctx.font = "32px sans-serif";
  ctx.textAlign = "center";

  let color = "white";
  if (lastJudge === "Sick") color = "cyan";
  if (lastJudge === "Good") color = "lime";
  if (lastJudge === "Bad")  color = "orange";
  if (lastJudge === "Miss") color = "red";

  ctx.fillStyle = color;
  ctx.fillText(lastJudge, canvas.width / 2, judgeY - 40);

  ctx.restore(); // ★ 描画状態を元に戻す

  judgeTimer--;
}

function drawScore() {
  ctx.font = "20px sans-serif";
  ctx.fillStyle = "black";
  ctx.textAlign = "left";

  ctx.fillText(`Score: ${score}`, 10, 30);
  ctx.fillText(`Combo: ${combo}`, 10, 55);
}

function calcScrollDistance(noteTime, nowTime, scrollEvents, bpmEvents) {
  let distance = 0;

  const dir = Math.sign(noteTime - nowTime);
  const t0 = Math.min(nowTime, noteTime);
  const t1 = Math.max(nowTime, noteTime);

  for (let i = 0; i < scrollEvents.length; i++) {
    const curr = scrollEvents[i];
    const next = scrollEvents[i + 1];

    const startTime = beatToTime(curr.beat, bpmEvents);
    const endTime = next
      ? beatToTime(next.beat, bpmEvents)
      : t1;

    if (t0 >= endTime) continue;
    if (t1 <= startTime) break;

    const from = Math.max(t0, startTime);
    const to   = Math.min(t1, endTime);

    if (to > from) {
      distance += (to - from) * curr.speed;
    }
  }

  return distance * dir;
}

function drawMenu() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "black";
  ctx.textAlign = "center";

  ctx.font = "40px sans-serif";
  ctx.fillText("FNF風リズムゲーム", canvas.width / 2, 200);

  ctx.font = "24px sans-serif";
  ctx.fillText("クリックしてスタート", canvas.width / 2, 300);
}

function drawChartSelect() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";

  ctx.fillStyle = "white";
  ctx.font = "36px sans-serif";
  ctx.fillText("SELECT CHART", canvas.width / 2, 120);

  ctx.font = "24px sans-serif";

  charts.forEach((chart, i) => {
    if (i === selectedChartIndex) {
      ctx.fillStyle = "cyan";
      ctx.fillText("> " + chart.title + " <", canvas.width / 2, 200 + i * 40);
    } else {
      ctx.fillStyle = "white";
      ctx.fillText(chart.title, canvas.width / 2, 200 + i * 40);
    }
  });
}

async function startGameWithChart(chartFile) {
  const res = await fetch(chartFile);
  const data = await res.json();
  offset = data.offset ?? 0;
  bpmEvents = data.bpmEvents || [{ beat: 0, bpm: data.bpm }];
  scrollEvents = data.scrollEvents || [{ beat: 0, speed: 1.0 }];

  notes = data.notes.map(n => {
    const startTime = beatToTime(n.beat, bpmEvents);

    if (n.type === "hold") {
      const endTime = beatToTime(n.beat + n.length, bpmEvents);
      return {
        type: "hold",
        lane: n.lane,
        startTime,
        endTime,
        holding: false,
        hit: false
      };
    }

    return {
      type: "tap",
      lane: n.lane,
      time: startTime,
      hit: false
    };
  });

  // リセット
  startTime = audioCtx.currentTime + offset;
  combo = 0;
  score = 0;
  lastJudge = "";
  judgeTimer = 0;

  // 🎵 曲再生
  const musicBuffer = await loadMusic(data.music);
  playMusic(musicBuffer);

  gameState = "playing";
  gameLoop();
}

function gameLoop() {
  if (gameState === "select") {
    drawChartSelect();
    requestAnimationFrame(gameLoop);
    return;
  }

  if (gameState === "playing") {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawJudgeLine();
    drawNotes();
    checkMiss();
    updateParticles();
    drawParticles();
    drawJudgeLines();
    drawJudgeText();
    drawScore();
    requestAnimationFrame(gameLoop);
  }
}

document.addEventListener("click", async () => {
  if (gameState !== "menu") return;

  await audioCtx.resume();

  startTime = audioCtx.currentTime;
  gameState = "playing";

  gameLoop();
});

document.addEventListener("keydown", e => {
  if (gameState !== "select") return;

  if (e.key === "ArrowUp") {
    selectedChartIndex =
      (selectedChartIndex - 1 + charts.length) % charts.length;
  }

  if (e.key === "ArrowDown") {
    selectedChartIndex =
      (selectedChartIndex + 1) % charts.length;
  }

  if (e.key === "Enter") {
    audioCtx.resume().then(() => {
      startGameWithChart(charts[selectedChartIndex].file);
    });
  }
});

document.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();
  if (!(key in keyToLane)) return;
  if (pressedKeys[key]) return; // 押しっぱなし防止
  pressedKeys[key] = true;

  const lane = keyToLane[key];
  const t = now();

  const candidates = notes.filter(
    n =>
      !n.hit &&
      n.lane === lane &&
      (
        n.type === "tap" ||
        (n.type === "hold" && !n.holding)
      )
  );

  if (candidates.length === 0) return;

  const note = candidates.reduce((a, b) =>
    Math.abs((a.type === "tap" ? a.time : a.startTime) - t) <
    Math.abs((b.type === "tap" ? b.time : b.startTime) - t)
      ? a
      : b
  );

  const noteTime = note.type === "tap" ? note.time : note.startTime;
  const diff = Math.abs(noteTime - t);
  const judge = getJudge(diff);

  if (judge === "Miss") return;

  if (note.type === "tap") {
    note.hit = true;
  }

  if (note.type === "hold") {
    note.holding = true;
  }

  applyJudge(judge);
});

document.addEventListener("keyup", e => {
  const key = e.key.toLowerCase();
  pressedKeys[key] = false;

  if (!(key in keyToLane)) return;

  const lane = keyToLane[key];
  const t = now();

  const note = notes.find(
    n =>
      n.type === "hold" &&
      n.lane === lane &&
      n.holding &&
      !n.hit
  );

  if (!note) return;

  // ★ 終点前に離したら Miss
  if (t < note.endTime) {
    note.holding = false;
    note.hit = true;
    applyJudge("Miss");
  }
});

gameLoop();
