// canvas関連
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 定数
const judgeY = 500;
const speed = 300;
const laneX = [80, 160, 240, 320];

let audioCtx = new AudioContext();
let startTime = null;
let lastJudge = "";
let judgeTimer = 0;
//let musicBuffer = null;

const keyToLane = {
  ArrowLeft: 0,
  ArrowUp: 1,
  ArrowDown: 2,
  ArrowRight: 3
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
    notes = data.notes.map(n => ({
      time: beatToTime(n.beat, data.bpmEvents),
      lane: n.lane,
      hit: false
    }));
    console.log("chart loaded");
  });

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
      lastJudge = "Miss";
      judgeTimer = 30;
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

  const judge = getJudge(diff);

  if (judge !== "Miss") {
    note.hit = true;
    lastJudge = judge;
    judgeTimer = 30; // フレーム数
  }
});
