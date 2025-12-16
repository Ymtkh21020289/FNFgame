// canvas関連
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 定数
const judgeY = 500;
const speed = 300;

let audioCtx = new AudioContext();
let startTime = null;
//let musicBuffer = null;

let notes = [
  { time: 1.5, lane: 0, hit: false },
  { time: 2.0, lane: 0, hit: false },
  { time: 2.5, lane: 0, hit: false }
];

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
    ctx.fillRect(160, y, 80, 20);
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

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawJudgeLine();
  drawNotes();
  requestAnimationFrame(gameLoop);
  checkMiss();
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
  if (e.key !== "ArrowLeft") return;
  if (startTime === null) return;

  const t = now();

  // レーン0の未ヒットノーツだけ
  const candidates = notes.filter(
    n => !n.hit && n.lane === 0
  );

  if (candidates.length === 0) return;

  // 一番近いノーツ
  let note = candidates.reduce((a, b) =>
    Math.abs(a.time - t) < Math.abs(b.time - t) ? a : b
  );

  const diff = Math.abs(note.time - t);

  if (diff < 0.1) {
    note.hit = true;
    console.log("Good!");
  }
});
