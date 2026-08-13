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
  { title: "チャーリーダッシュ！", file: "charlie.json", artist: "??? ", bpm: "120-160" },
  { title: "23時54分、陽の旅路へのプレリュード",   file: "2354_prelude.json", artist: "???", bpm: "—" }
];

let selectedChartIndex = 0;
let music = "";

// ★ ネオン演出用のアニメーション時間
function animClock() {
  return performance.now() / 1000;
}

// ネオン文字を描画するヘルパー
function neonText(text, x, y, {
  font = "24px sans-serif",
  color = "#00f0ff",
  glow = "#00f0ff",
  blur = 16,
  align = "center"
} = {}) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = glow;
  ctx.shadowBlur = blur;
  // 二度描きで発光を強調
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = blur * 0.5;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// 角丸矩形パス
function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ネオン風の背景（動くグリッド + ビネット）
function drawNeonBackground(t) {
  // ベースの縦グラデーション
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#0b0221");
  bg.addColorStop(0.5, "#170733");
  bg.addColorStop(1, "#04010f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 遠近感のあるスクロールグリッド（下半分）
  ctx.save();
  ctx.strokeStyle = "rgba(0, 240, 255, 0.12)";
  ctx.lineWidth = 1;
  const horizon = canvas.height * 0.55;
  const scroll = (t * 60) % 40;
  // 横線（奥に行くほど間隔が狭い）
  for (let i = 0; i < 18; i++) {
    const p = i / 18;
    const y = horizon + (canvas.height - horizon) * (p * p) + scroll * (1 - p);
    if (y < horizon || y > canvas.height) continue;
    ctx.globalAlpha = 0.08 + p * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  // 縦線（消失点に集まる）
  ctx.globalAlpha = 0.15;
  const vpx = canvas.width / 2;
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(vpx + i * 12, horizon);
    ctx.lineTo(vpx + i * 90, canvas.height);
    ctx.stroke();
  }
  ctx.restore();

  // 上部のネオングロー玉（ゆらぎ）
  ctx.save();
  const glowX = canvas.width / 2 + Math.sin(t * 0.7) * 60;
  const g = ctx.createRadialGradient(glowX, 90, 10, glowX, 90, 220);
  g.addColorStop(0, "rgba(255, 0, 200, 0.28)");
  g.addColorStop(1, "rgba(255, 0, 200, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

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

function isLanePressed(lane) {
  // pressedKeys は小文字キーで保持されるため小文字で判定する
  return Object.keys(keyToLane).some(
    k => keyToLane[k] === lane && pressedKeys[k.toLowerCase()]
  );
}

function drawJudgeLine() {
  ctx.save();
  for (let i = 0; i < laneX.length; i++) {
    const x = laneX[i];
    ctx.strokeStyle = LANE_COLORS[i];
    ctx.shadowColor = LANE_COLORS[i];
    ctx.shadowBlur = isLanePressed(i) ? 18 : 6;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, judgeY, NOTE_SIZE, NOTE_SIZE);
  }
  ctx.restore();
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
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

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
      let bodyTop = yEnd + NOTE_SIZE;   // 胴体の上
      let bodyBottom = yStart;         // 胴体の下（頭の直前）

      // ★ ホールド中はヒットボックスで止める
      if (note.holding) {
        bodyBottom = Math.min(bodyBottom, judgeCenterY);
      }

      const bodyHeight = bodyBottom - bodyTop;

      if (bodyHeight > 0) {
        ctx.fillRect(bodyX, bodyTop, bodyWidth, bodyHeight);
      }
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
  ctx.save();
  ctx.font = "20px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 8;
  ctx.fillText(`Score: ${score}`, 10, 30);
  ctx.fillStyle = combo > 0 ? "#ff8be6" : "#ffffff";
  ctx.shadowColor = "#ff00c8";
  ctx.fillText(`Combo: ${combo}`, 10, 55);
  ctx.restore();
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
  const t = animClock();
  drawNeonBackground(t);

  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  neonText("FNF風リズムゲーム", canvas.width / 2, 210, {
    font: "bold 34px sans-serif",
    color: "#ffffff",
    glow: "#ff00c8",
    blur: 14 + pulse * 12
  });
  neonText("クリックしてスタート", canvas.width / 2, 300, {
    font: "20px sans-serif",
    color: "#00f0ff",
    glow: "#00f0ff",
    blur: 8 + pulse * 8
  });
}

// 曲カードの座標を計算（クリック判定と描画で共有）
const CARD = { x: 40, w: 320, h: 78, gap: 16, top: 200 };
function cardRect(i) {
  return {
    x: CARD.x,
    y: CARD.top + i * (CARD.h + CARD.gap),
    w: CARD.w,
    h: CARD.h
  };
}

// エディタボタンの矩形
function editorButtonRect() {
  return { x: 110, y: canvas.height - 56, w: 180, h: 34 };
}

function drawChartSelect() {
  const t = animClock();
  drawNeonBackground(t);

  // タイトル
  neonText("SELECT SONG", canvas.width / 2, 90, {
    font: "bold 34px sans-serif",
    color: "#ffffff",
    glow: "#00f0ff",
    blur: 18
  });
  // タイトル下のネオンライン
  ctx.save();
  ctx.strokeStyle = "#ff00c8";
  ctx.shadowColor = "#ff00c8";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 108);
  ctx.lineTo(canvas.width - 60, 108);
  ctx.stroke();
  ctx.restore();

  // 曲カード
  charts.forEach((chart, i) => {
    const r = cardRect(i);
    const selected = i === selectedChartIndex;
    const accent = LANE_COLORS[i % LANE_COLORS.length];
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);

    ctx.save();
    // カード背景
    roundRectPath(r.x, r.y, r.w, r.h, 12);
    const cardGrad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    if (selected) {
      cardGrad.addColorStop(0, "rgba(0, 240, 255, 0.18)");
      cardGrad.addColorStop(1, "rgba(255, 0, 200, 0.14)");
    } else {
      cardGrad.addColorStop(0, "rgba(255,255,255,0.05)");
      cardGrad.addColorStop(1, "rgba(255,255,255,0.02)");
    }
    ctx.fillStyle = cardGrad;
    ctx.fill();

    // 枠線（選択時は発光）
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeStyle = selected ? "#00f0ff" : "rgba(255,255,255,0.25)";
    if (selected) {
      ctx.shadowColor = "#00f0ff";
      ctx.shadowBlur = 10 + pulse * 14;
    }
    ctx.stroke();
    ctx.restore();

    // 左端のレーンカラーのアクセントバー
    ctx.save();
    roundRectPath(r.x, r.y, 6, r.h, 3);
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = selected ? 12 : 4;
    ctx.fill();
    ctx.restore();

    // 曲名
    neonText(chart.title, r.x + 20, r.y + 34, {
      font: (selected ? "bold " : "") + "17px sans-serif",
      color: "#ffffff",
      glow: selected ? "#00f0ff" : "rgba(0,0,0,0)",
      blur: selected ? 10 : 0,
      align: "left"
    });

    // メタ情報（BPMなど）
    ctx.save();
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = selected ? "#ff8be6" : "rgba(255,255,255,0.5)";
    ctx.fillText(`BPM ${chart.bpm ?? "—"}   ♪ ${chart.artist ?? ""}`, r.x + 20, r.y + 58);
    ctx.restore();

    // 選択インジケータ（右端の▶）
    if (selected) {
      neonText("▶", r.x + r.w - 22, r.y + r.h / 2 + 8, {
        font: "20px sans-serif",
        color: "#00f0ff",
        glow: "#00f0ff",
        blur: 12,
        align: "center"
      });
    }
  });

  // 操作ヒント
  ctx.save();
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText("↑ ↓ / クリックで選択   Enter で決定", canvas.width / 2, CARD.top + charts.length * (CARD.h + CARD.gap) + 24);
  ctx.restore();

  // 譜面エディタへのボタン
  const eb = editorButtonRect();
  ctx.save();
  roundRectPath(eb.x, eb.y, eb.w, eb.h, 10);
  ctx.fillStyle = "rgba(255, 0, 200, 0.12)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ff00c8";
  ctx.shadowColor = "#ff00c8";
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();
  neonText("✎ 譜面エディタ", eb.x + eb.w / 2, eb.y + 23, {
    font: "14px sans-serif",
    color: "#ffffff",
    glow: "#ff00c8",
    blur: 8
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

// ★ 曲選択画面でのマウス操作
function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

canvas.addEventListener("mousemove", e => {
  if (gameState !== "select") return;
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  let hover = false;
  for (let i = 0; i < charts.length; i++) {
    if (pointInRect(px, py, cardRect(i))) hover = true;
  }
  if (pointInRect(px, py, editorButtonRect())) hover = true;
  canvas.style.cursor = hover ? "pointer" : "default";
});

canvas.addEventListener("click", e => {
  if (gameState !== "select") return;
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);

  // 譜面エディタボタン
  if (pointInRect(px, py, editorButtonRect())) {
    window.location.href = "editor.html";
    return;
  }

  // 曲カード：1クリックで選択、選択済みをもう一度クリックで決定
  for (let i = 0; i < charts.length; i++) {
    if (pointInRect(px, py, cardRect(i))) {
      if (i === selectedChartIndex) {
        audioCtx.resume().then(() => {
          startGameWithChart(charts[selectedChartIndex].file);
        });
      } else {
        selectedChartIndex = i;
      }
      return;
    }
  }
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
