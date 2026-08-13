/* =========================================================
   NEON CHART EDITOR — FNF風音ゲー 譜面エディタ
   ========================================================= */

// ---- DOM ----
const canvas = document.getElementById("grid");
const ctx = canvas.getContext("2d");
const el = id => document.getElementById(id);

const LANE_COLORS = ["#ff5555", "#55ff55", "#5555ff", "#ffff55"];
const LANE_KEYS = ["D / ←", "F / ↑", "J / ↓", "K / →"];
const GUTTER = 46; // 左のビート番号表示幅

// ---- 状態 ----
let notes = [];                 // { beat, lane, type:"tap"|"hold", length? }
let bpmEvents = [{ beat: 0, bpm: 120 }];
let scrollEvents = [{ beat: 0, speed: 1.0 }];
let offset = 0;

let ppb = 80;                   // pixels per beat（ズーム）
let scrollBeat = 0;             // 画面上端のビート
let snap = 4;                   // 1拍の分割数

// オーディオ
const audioCtx = new AudioContext();
let audioBuffer = null;
let musicSource = null;
let isPlaying = false;
let playStartCtxTime = 0;       // 再生開始時の audioCtx.currentTime
let playStartSongTime = 0;      // 再生開始時の曲内時間(秒)
let pausedBeat = 0;             // 停止中の再生ヘッド位置(beat)
let lastTickBeat = 0;          // ノーツ音用
let lastMetBeat = 0;           // メトロノーム用

// ドラッグ状態
let drag = null; // { lane, startBeat, curBeat, existing }

// ========================================================
//  ビート ⇔ 秒 変換（ゲーム本体と互換）
// ========================================================
function sortedBpm() {
  return [...bpmEvents].sort((a, b) => a.beat - b.beat);
}

function beatToTime(beat) {
  const ev = sortedBpm();
  let time = 0;
  for (let i = 0; i < ev.length; i++) {
    const curr = ev[i];
    const next = ev[i + 1];
    const startBeat = curr.beat;
    const endBeat = next ? next.beat : beat;
    if (beat <= startBeat) break;
    const beats = Math.min(beat, endBeat) - startBeat;
    time += beats * (60 / curr.bpm);
  }
  return time;
}

function timeToBeat(time) {
  const ev = sortedBpm();
  let acc = 0; // ここまでの累積時間
  for (let i = 0; i < ev.length; i++) {
    const curr = ev[i];
    const next = ev[i + 1];
    const spb = 60 / curr.bpm;
    const segBeats = next ? (next.beat - curr.beat) : Infinity;
    const segTime = segBeats * spb;
    if (time <= acc + segTime || !next) {
      return curr.beat + (time - acc) / spb;
    }
    acc += segTime;
  }
  return 0;
}

// ========================================================
//  レイアウト
// ========================================================
function resize() {
  const wrap = document.getElementById("gridwrap");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = wrap.clientWidth * dpr;
  canvas.height = wrap.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", () => { resize(); });

function laneWidth() {
  return (canvas.clientWidth - GUTTER) / 4;
}
function laneX(lane) {
  return GUTTER + lane * laneWidth();
}
function beatToY(beat) {
  return (beat - scrollBeat) * ppb;
}
function yToBeat(y) {
  return scrollBeat + y / ppb;
}
function xToLane(x) {
  if (x < GUTTER) return -1;
  const lane = Math.floor((x - GUTTER) / laneWidth());
  return lane >= 0 && lane < 4 ? lane : -1;
}
function snapBeat(beat) {
  const step = 1 / snap;
  return Math.round(beat / step) * step;
}

// ========================================================
//  再生ヘッド（現在のビート）
// ========================================================
function currentBeat() {
  if (isPlaying) {
    const songTime = playStartSongTime + (audioCtx.currentTime - playStartCtxTime);
    return timeToBeat(Math.max(0, songTime - offset));
  }
  return pausedBeat;
}

// ========================================================
//  描画
// ========================================================
function draw() {
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const playBeat = currentBeat();

  // 再生中はヘッドを画面下1/4に保つよう自動スクロール
  if (isPlaying) {
    scrollBeat = playBeat - (H * 0.75) / ppb;
  }

  ctx.clearRect(0, 0, W, H);

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b0221");
  bg.addColorStop(1, "#04010c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // レーン
  for (let l = 0; l < 4; l++) {
    const x = laneX(l);
    const lw = laneWidth();
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(x, 0, lw, H);
    // レーン境界
    ctx.strokeStyle = "rgba(0,240,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // 右端の線
  ctx.beginPath();
  ctx.moveTo(GUTTER + 4 * laneWidth(), 0);
  ctx.lineTo(GUTTER + 4 * laneWidth(), H);
  ctx.stroke();

  // ビートライン（グリッド）
  const topBeat = scrollBeat;
  const botBeat = scrollBeat + H / ppb;
  const step = 1 / snap;
  const firstSub = Math.ceil(topBeat / step) * step;
  for (let b = firstSub; b <= botBeat; b += step) {
    const y = beatToY(b);
    const isBeat = Math.abs(b - Math.round(b)) < 1e-6;
    const isBar = isBeat && Math.round(b) % 4 === 0;
    ctx.strokeStyle = isBar ? "rgba(255,0,200,0.35)"
                    : isBeat ? "rgba(0,240,255,0.28)"
                             : "rgba(255,255,255,0.08)";
    ctx.lineWidth = isBar ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(GUTTER, y);
    ctx.lineTo(W, y);
    ctx.stroke();

    if (isBeat) {
      ctx.fillStyle = isBar ? "#ff8be6" : "#7fe9ff";
      ctx.font = isBar ? "bold 12px monospace" : "11px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(b)), GUTTER - 6, y);
    }
  }

  // レーン上部のカラーヘッダー
  for (let l = 0; l < 4; l++) {
    const x = laneX(l);
    const lw = laneWidth();
    ctx.fillStyle = LANE_COLORS[l];
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x + 1, 0, lw - 2, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(LANE_KEYS[l], x + lw / 2, 6);
  }

  // ノーツ描画
  for (const n of notes) {
    if (beatToY(n.beat) > H + 40) continue;
    const endBeat = n.type === "hold" ? n.beat + (n.length || 0) : n.beat;
    if (beatToY(endBeat) < -40) continue;
    drawNote(n);
  }

  // ドラッグ中のプレビュー
  if (drag && !drag.existing) {
    const len = drag.curBeat - drag.startBeat;
    if (len > step / 2) {
      drawNote({ beat: drag.startBeat, lane: drag.lane, type: "hold", length: len }, true);
    } else {
      drawNote({ beat: drag.startBeat, lane: drag.lane, type: "tap" }, true);
    }
  }

  // 再生ヘッド
  const py = beatToY(playBeat);
  ctx.strokeStyle = "#ffffff";
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(GUTTER, py);
  ctx.lineTo(W, py);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 読み取り値の更新
  const t = beatToTime(playBeat) + offset;
  el("timeReadout").textContent = `Beat ${playBeat.toFixed(2)} | ${t.toFixed(2)}s`;

  // 再生中のサウンド処理
  if (isPlaying) handlePlaybackSound(playBeat);

  requestAnimationFrame(draw);
}

function drawNote(n, preview = false) {
  const lw = laneWidth();
  const x = laneX(n.lane);
  const size = Math.min(lw - 12, 44);
  const cx = x + lw / 2;
  const color = LANE_COLORS[n.lane];

  ctx.save();
  ctx.globalAlpha = preview ? 0.55 : 1;

  if (n.type === "hold") {
    const yHead = beatToY(n.beat);
    const yEnd = beatToY(n.beat + (n.length || 0));
    // 胴体
    const bw = size * 0.4;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = (preview ? 0.4 : 0.55);
    ctx.fillRect(cx - bw / 2, yHead, bw, yEnd - yHead);
    ctx.globalAlpha = preview ? 0.55 : 1;
    // 頭
    ctx.fillRect(cx - size / 2, yHead - size / 2, size, size);
  } else {
    const y = beatToY(n.beat);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillRect(cx - size / 2, y - size / 2, size, size);
  }
  ctx.restore();
}

// ========================================================
//  再生サウンド（ノーツヒット音・メトロノーム）
// ========================================================
function beep(freq, dur = 0.05, gain = 0.2) {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = "square";
  g.gain.value = gain;
  osc.connect(g);
  g.connect(audioCtx.destination);
  const t0 = audioCtx.currentTime;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur);
}

function handlePlaybackSound(playBeat) {
  // ノーツヒット音
  if (el("tickChk").checked) {
    for (const n of notes) {
      if (n.beat > lastTickBeat && n.beat <= playBeat) {
        beep(880 + n.lane * 120, 0.04, 0.15);
      }
    }
  }
  // メトロノーム
  if (el("metChk").checked) {
    const nextBeat = Math.floor(lastMetBeat) + 1;
    if (playBeat >= nextBeat && nextBeat > lastMetBeat) {
      beep(nextBeat % 4 === 0 ? 1200 : 600, 0.03, 0.12);
    }
  }
  lastTickBeat = playBeat;
  lastMetBeat = playBeat;
}

// ========================================================
//  再生制御
// ========================================================
function play() {
  if (!audioBuffer) { setStatus("先に音源ファイルを読み込んでください", true); return; }
  if (isPlaying) return;
  audioCtx.resume();

  const startBeat = pausedBeat;
  playStartSongTime = beatToTime(startBeat) + offset;
  lastTickBeat = startBeat;
  lastMetBeat = startBeat;

  musicSource = audioCtx.createBufferSource();
  musicSource.buffer = audioBuffer;
  musicSource.connect(audioCtx.destination);
  playStartCtxTime = audioCtx.currentTime;
  musicSource.start(0, Math.max(0, playStartSongTime));
  musicSource.onended = () => { if (isPlaying) stop(); };
  isPlaying = true;
  el("playBtn").textContent = "⏸ 一時停止 (Space)";
}

function pause() {
  if (!isPlaying) return;
  pausedBeat = currentBeat();
  isPlaying = false;
  if (musicSource) { musicSource.onended = null; musicSource.stop(); musicSource = null; }
  el("playBtn").textContent = "▶ 再生 (Space)";
}

function stop() {
  isPlaying = false;
  if (musicSource) { musicSource.onended = null; try { musicSource.stop(); } catch (e) {} musicSource = null; }
  pausedBeat = 0;
  scrollBeat = 0;
  el("playBtn").textContent = "▶ 再生 (Space)";
}

function togglePlay() { isPlaying ? pause() : play(); }

// ========================================================
//  ノーツ操作
// ========================================================
function findNoteAt(lane, beat) {
  // クリック位置に近い/内包するノーツを返す
  const tol = 0.5 / snap + 0.05;
  let best = null, bestDist = Infinity;
  for (const n of notes) {
    if (n.lane !== lane) continue;
    if (n.type === "hold") {
      const end = n.beat + (n.length || 0);
      if (beat >= n.beat - tol && beat <= end + tol) {
        const d = Math.min(Math.abs(beat - n.beat), Math.abs(beat - end));
        if (d < bestDist) { bestDist = d; best = n; }
      }
    } else {
      const d = Math.abs(beat - n.beat);
      if (d <= tol && d < bestDist) { bestDist = d; best = n; }
    }
  }
  return best;
}

function addTap(lane, beat) {
  if (findNoteAt(lane, beat)) return;
  notes.push({ beat, lane, type: "tap" });
  notes.sort((a, b) => a.beat - b.beat);
  updateNoteCount();
}
function addHold(lane, beat, length) {
  notes.push({ beat, lane, type: "hold", length: Math.round(length * 1000) / 1000 });
  notes.sort((a, b) => a.beat - b.beat);
  updateNoteCount();
}
function removeNote(n) {
  const i = notes.indexOf(n);
  if (i >= 0) notes.splice(i, 1);
  updateNoteCount();
}
function updateNoteCount() { el("noteCount").textContent = notes.length; }

// ========================================================
//  マウス操作
// ========================================================
function evtPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener("mousedown", e => {
  const { x, y } = evtPos(e);
  const lane = xToLane(x);
  if (lane < 0) return;
  const beat = Math.max(0, snapBeat(yToBeat(y)));
  const existing = findNoteAt(lane, beat);
  drag = { lane, startBeat: beat, curBeat: beat, existing };
});

canvas.addEventListener("mousemove", e => {
  if (!drag) return;
  const { y } = evtPos(e);
  drag.curBeat = Math.max(drag.startBeat, snapBeat(yToBeat(y)));
});

window.addEventListener("mouseup", e => {
  if (!drag) return;
  const d = drag;
  drag = null;

  if (d.existing) {
    // 既存ノーツはクリックで削除
    removeNote(d.existing);
    return;
  }
  const len = d.curBeat - d.startBeat;
  if (len > (0.5 / snap)) {
    addHold(d.lane, d.startBeat, len);
  } else {
    addTap(d.lane, d.startBeat);
  }
});

// ホイールでスクロール（再生中は無効）
document.getElementById("gridwrap").addEventListener("wheel", e => {
  e.preventDefault();
  if (isPlaying) return;
  scrollBeat += (e.deltaY / ppb) * 0.5;
  pausedBeat = Math.max(0, pausedBeat); // keep valid
  if (scrollBeat < -2) scrollBeat = -2;
}, { passive: false });

// クリックで再生ヘッドを移動（ガター上のクリック）
canvas.addEventListener("dblclick", e => {
  const { x, y } = evtPos(e);
  if (x < GUTTER) {
    pausedBeat = Math.max(0, snapBeat(yToBeat(y)));
  }
});

// ========================================================
//  キーボード
// ========================================================
window.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
});

// ========================================================
//  UI バインド
// ========================================================
el("bpm").addEventListener("change", () => {
  const v = parseFloat(el("bpm").value) || 120;
  bpmEvents = [{ beat: 0, bpm: v }];
  el("bpmEventsText").value = JSON.stringify(bpmEvents);
});
el("offset").addEventListener("change", () => {
  offset = parseFloat(el("offset").value) || 0;
});
el("snap").addEventListener("change", () => { snap = parseInt(el("snap").value); });
el("playBtn").addEventListener("click", togglePlay);
el("stopBtn").addEventListener("click", stop);
el("zoomIn").addEventListener("click", () => { ppb = Math.min(300, ppb * 1.2); });
el("zoomOut").addEventListener("click", () => { ppb = Math.max(20, ppb / 1.2); });
el("clearBtn").addEventListener("click", () => {
  if (notes.length && confirm("すべてのノーツを消去しますか？")) { notes = []; updateNoteCount(); }
});
el("applyAdvBtn").addEventListener("click", () => {
  try {
    bpmEvents = JSON.parse(el("bpmEventsText").value);
    scrollEvents = JSON.parse(el("scrollEventsText").value);
    if (bpmEvents[0]) el("bpm").value = bpmEvents[0].bpm;
    setStatus("詳細設定を適用しました");
  } catch (err) {
    setStatus("JSONの書式が不正です: " + err.message, true);
  }
});

// 音源読み込み
el("audioFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  setStatus("読み込み中...");
  try {
    const buf = await file.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(buf);
    el("audioLabel").firstChild.textContent = "🎵 " + file.name + " ";
    if (!el("musicName").value) el("musicName").value = file.name;
    if (!el("songTitle").value) el("songTitle").value = file.name.replace(/\.[^.]+$/, "");
    setStatus(`読み込み完了（${audioBuffer.duration.toFixed(1)}秒）`);
  } catch (err) {
    setStatus("音源の読み込みに失敗: " + err.message, true);
  }
});

// 譜面インポート
el("importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    loadChart(data);
    setStatus(`譜面を読み込みました（ノーツ ${notes.length}）`);
  } catch (err) {
    setStatus("譜面の読み込みに失敗: " + err.message, true);
  }
});

function loadChart(data) {
  bpmEvents = data.bpmEvents || [{ beat: 0, bpm: data.bpm || 120 }];
  scrollEvents = data.scrollEvents || [{ beat: 0, speed: 1.0 }];
  offset = data.offset ?? 0;
  notes = (data.notes || []).map(n => ({
    beat: n.beat,
    lane: n.lane,
    type: n.type || "tap",
    ...(n.type === "hold" ? { length: n.length || 0 } : {})
  }));
  notes.sort((a, b) => a.beat - b.beat);
  el("bpm").value = bpmEvents[0] ? bpmEvents[0].bpm : 120;
  el("offset").value = offset;
  el("bpmEventsText").value = JSON.stringify(bpmEvents);
  el("scrollEventsText").value = JSON.stringify(scrollEvents);
  if (data.music) el("musicName").value = data.music;
  if (data.title) el("songTitle").value = data.title;
  updateNoteCount();
}

// 出力
function buildChart() {
  const outNotes = notes.map(n => {
    if (n.type === "hold") return { beat: n.beat, lane: n.lane, type: "hold", length: n.length };
    return { beat: n.beat, lane: n.lane, type: "tap" };
  });
  const chart = {
    scrollEvents,
    music: el("musicName").value || "song.ogg",
    offset,
    bpmEvents,
    notes: outNotes
  };
  if (el("songTitle").value) chart.title = el("songTitle").value;
  return chart;
}

el("exportBtn").addEventListener("click", () => {
  const chart = buildChart();
  const blob = new Blob([JSON.stringify(chart, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const base = (el("musicName").value || "chart").replace(/\.[^.]+$/, "");
  a.download = base + ".json";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("JSONをダウンロードしました");
});

el("copyBtn").addEventListener("click", async () => {
  const text = JSON.stringify(buildChart(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setStatus("クリップボードにコピーしました");
  } catch (err) {
    setStatus("コピー失敗（ブラウザの権限を確認）", true);
  }
});

function setStatus(msg, isError = false) {
  const s = el("status");
  s.textContent = msg;
  s.style.color = isError ? "#ff6a9e" : "var(--cyan)";
}

// ========================================================
//  初期化
// ========================================================
resize();
updateNoteCount();
requestAnimationFrame(draw);
