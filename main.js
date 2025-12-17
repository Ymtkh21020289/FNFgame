// canvas関連
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 定数
const judgeY = 500;
const speed = 500;
const laneX = [80, 160, 240, 320];
const pressedKeys = {};
const particles = [];

let audioCtx = new AudioContext();
let startTime = null;
let lastJudge = "";
let judgeTimer = 0;
//let musicBuffer = null;

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

fetch("chart.json")
  .then(res => res.json())
  .then(data => {
    notes = data.notes.map(n => {
      const startTime = beatToTime(n.beat, data.bpmEvents || [{ beat: 0, bpm: data.bpm }]);
      if (n.type === "hold") {
        const endTime = beatToTime(n.beat + n.length, data.bpmEvents || [{ beat: 0, bpm: data.bpm }]);
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
    console.log("chart loaded");
  });

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
  return audioCtx.currentTime - startTime;
}

function drawJudgeLine() {
  ctx.fillRect(0, judgeY, canvas.width, 4);
}

function drawNotes() {
  const t = now();

  for (let note of notes) {
    if (note.hit) continue;

    // ★ タップノーツのMiss判定
    if (note.type === "tap") {
      if (t > note.time + 0.15) {
        note.hit = true;
        lastJudge = "Miss";
        judgeTimer = 30;
        continue;
      }
    }

    if (note.type === "hold" && note.holding) {
      if (t >= note.endTime) {
        note.hit = true;
        note.holding = false;
        lastJudge = "Sick";
        judgeTimer = 30;
        continue;
      }
    }
    const x = laneX[note.lane];

    if (note.type === "tap") {
      const y = judgeY - (note.time - t) * speed;
      ctx.fillRect(x, y, 60, 20);
    }

    if (note.type === "hold") {
      const yStart = judgeY - (note.startTime - t) * speed;
      const yEnd   = judgeY - (note.endTime   - t) * speed;

      ctx.fillRect(x + 20, yEnd, 20, yStart - yEnd); // 本体
      ctx.fillRect(x, yStart, 60, 20);              // 頭
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
        lastJudge = "Miss";
        judgeTimer = 30;
      }
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

  ctx.font = "32px sans-serif";
  ctx.textAlign = "center";

  let color = "white";
  if (lastJudge === "Sick") color = "cyan";
  if (lastJudge === "Good") color = "lime";
  if (lastJudge === "Bad")  color = "orange";
  if (lastJudge === "Miss") color = "red";

  ctx.fillStyle = color;
  ctx.fillText(lastJudge, canvas.width / 2, judgeY - 40);

  judgeTimer--;
}

function gameLoop() {
  if (notes.length === 0) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawJudgeLine();
  drawNotes();
  requestAnimationFrame(gameLoop);
  checkMiss();
  updateParticles();
  drawParticles();
  drawJudgeLines();
  drawJudgeText();
}

document.addEventListener("click", async () => {
  if (startTime !== null) return;

  await audioCtx.resume();

  //const res = await fetch("music.mp3");
  //const buf = await res.arrayBuffer();
  //musicBuffer = await audioCtx.decodeAudioData(buf);

  //const source = audioCtx.createBufferSource();
  //source.buffer = musicBuffer;
  //source.connect(audioCtx.destination);

  startTime = audioCtx.currentTime;
  //source.start(startTime);

  gameLoop();
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

  lastJudge = judge;
  judgeTimer = 30;
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
    lastJudge = "Miss";
    judgeTimer = 30;
  }
});
