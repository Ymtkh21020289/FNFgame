// canvas関連
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 定数
const judgeY = 500;
const speed = 300;

let audioCtx = new AudioContext();
let startTime = null;
//let musicBuffer = null;

let note = {
  time: 2.0,
  lane: 0,
  hit: false
};

function now() {
  return audioCtx.currentTime - startTime;
}

function drawJudgeLine() {
  ctx.fillRect(0, judgeY, canvas.width, 4);
}

function drawNote() {
  if (note.hit) return;
  const t = now();
  const y = judgeY - (note.time - t) * speed;
  ctx.fillRect(160, y, 80, 20);
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawJudgeLine();
  drawNote();
  requestAnimationFrame(gameLoop);
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
  if (note.hit || startTime === null) return;

  const t = now();
  const diff = Math.abs(note.time - t);

  if (diff < 0.1) {
    note.hit = true;
    console.log("Good!");
  }
});
