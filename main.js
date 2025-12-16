// canvas関連
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 定数
const judgeY = 500;
const speed = 300;
const laneX = [80, 160, 240, 320];

let audioCtx = new AudioContext();
let startTime = null;
//let musicBuffer = null;

let notes = [
  { time: 1.0, lane: 0, hit: false },
  { time: 1.5, lane: 1, hit: false },
  { time: 2.0, lane: 2, hit: false },
  { time: 2.5, lane: 3, hit: false },
  { time: 3.0, lane: 0, hit: false }
];

const keyToLane = {
  ArrowLeft: 0,
  ArrowUp: 1,
  ArrowDown: 2,
  ArrowRight: 3
};

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

    const y = judgeY - (note.time - t) * speed;
    const x = laneX[note.lane];

    ctx.fillRect(x, y, 60, 20);
  }
}

function checkMiss() {
  const t = now();

  for (let note of notes) {
    if (!note.hit && t > note.time + 0.15) {
      note.hit = true;
      console.log("Miss");
    }
  }
}

function drawJudgeLines() {
  ctx.strokeStyle = "white";
  for (let x of laneX) {
    ctx.strokeRect(x, judgeY, 60, 20);
  }
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawJudgeLine();
  drawNotes();
  requestAnimationFrame(gameLoop);
  checkMiss();
  drawJudgeLines();
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
  if (!(e.key in keyToLane)) return;
  if (startTime === null) return;

  const lane = keyToLane[e.key];
  const t = now();

  const candidates = notes.filter(
    n => !n.hit && n.lane === lane
  );

  if (candidates.length === 0) return;

  let note = candidates.reduce((a, b) =>
    Math.abs(a.time - t) < Math.abs(b.time - t) ? a : b
  );

  const diff = Math.abs(note.time - t);

  if (diff < 0.1) {
    note.hit = true;
    console.log("Good!", e.key);
  }
});
