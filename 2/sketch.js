// 宣告角色、背景與特效的圖片變數
let idleSheet, walkSheet, runSheet, bgSheet, lightningSheet, explosionSheet;
// 宣告存放切割後畫格的陣列
let idleFrames = [], walkFrames = [], runFrames = [], lightningFrames = [];

// 閃電音效變數
let lightningSound = null;
let lastPlayedStrikeKey = null;

// 1. 靜止狀態設定（靜止/靜止.png）：6張，總寬 805，高 190
const IDLE_WIDTH = 805;
const IDLE_HEIGHT = 190;
const IDLE_TOTAL = 6;

// 2. 走路狀態設定（走路/走.png）：9張，總寬 1147，高 195
const WALK_WIDTH = 1147;
const WALK_HEIGHT = 195;
const WALK_TOTAL = 9;

// 3. 跑步狀態設定（跑/跑.png）：7張，總寬 1241，高 190
const RUN_WIDTH = 1241;
const RUN_HEIGHT = 190;
const RUN_TOTAL = 7;

// 4. 閃電設定（閃電/閃電.png）：連續 5 張，總寬 380，高 368
const LIGHTNING_WIDTH = 380;
const LIGHTNING_HEIGHT = 368;
const LIGHTNING_TOTAL = 5;

// 特效時間設定：每次閃電（連續 5 張圖）1 秒、爆炸 1 秒、共 3 次閃電 + 1 次爆炸 = 4000ms
const STEP_DURATION = 1000;
const LIGHTNING_COUNT = 3;
const TOTAL_EFFECT_CYCLE = STEP_DURATION * (LIGHTNING_COUNT + 1);

// 每張角色畫格切換時間（毫秒）
const FRAME_INTERVAL = 100;

// 角色狀態與移動控制變數
let currentState = 'idle'; // 'idle'（靜止）、'walk'（走路）、'run'（跑步）
let facing = 1;            // 1 為向右，-1 為向左（水平翻轉）
let charX;                 // 角色 X 軸中心座標
const WALK_SPEED = 3.5;    // 走路速度
const RUN_SPEED = 7;       // 跑步速度

// 背景捲動變數（3 張 bg.1.png.jpg 串接，總寬為 3 * bgDrawW）
let bgOffsetX = 0;

// 閃電與爆炸循環計時與「背景往回捲時跟著滑出」變數
let effectStartTime = null;
let rightEndBgOffsetX = null;
let wasAtRightEnd = false;

// 動畫播放變數
let currentFrame = 0;
let lastFrameTime = 0;

// 檢查圖片是否有效
function isSheetValid(sheet) {
  return Boolean(sheet && sheet.width && sheet.width > 1 && sheet.height && sheet.height > 1);
}

// 切割精靈圖為單格陣列
function sliceSheet(sheet, totalFrames, sheetWidth, frameHeight) {
  let frames = [];
  if (!isSheetValid(sheet)) return frames;
  let w = sheetWidth / totalFrames;
  for (let i = 0; i < totalFrames; i++) {
    let x = Math.floor(i * w);
    let nextX = Math.floor((i + 1) * w);
    frames.push(sheet.get(x, 0, nextX - x, frameHeight));
  }
  return frames;
}

// 播放單次閃電音效（避免同一道閃電重複觸發或爆音疊加）
function playLightningSoundOnce(strikeKey) {
  if (lastPlayedStrikeKey === strikeKey) {
    return;
  }
  lastPlayedStrikeKey = strikeKey;

  if (lightningSound && typeof lightningSound.play === 'function') {
    try {
      if (typeof lightningSound.isPlaying === 'function' && lightningSound.isPlaying()) {
        lightningSound.stop();
      }
      if (typeof lightningSound.jump === 'function') {
        lightningSound.jump(0);
      } else {
        lightningSound.play();
      }
    } catch (e) {
      // 忽略尚未解鎖音訊上下文的例外
    }
  }
}

// 停止目前播放中的閃電音效
function stopLightningSound() {
  lastPlayedStrikeKey = null;
  if (lightningSound && typeof lightningSound.stop === 'function') {
    try {
      if (typeof lightningSound.isPlaying === 'function' && lightningSound.isPlaying()) {
        lightningSound.stop();
      }
    } catch (e) {
      // 忽略停止時的例外
    }
  }
}

// p5.js 預載入函式：載入資料夾 2 內的圖片與音效
function preload() {
  idleSheet = loadImage('靜止/靜止.png', null, () => console.error('找不到: 靜止/靜止.png'));
  walkSheet = loadImage('走路/走.png', null, () => console.error('找不到: 走路/走.png'));
  runSheet = loadImage('跑/跑.png', null, () => console.error('找不到: 跑/跑.png'));
  bgSheet = loadImage('bg.1.png.jpg', null, () => console.error('找不到: bg.1.png.jpg'));
  lightningSheet = loadImage('閃電/閃電.png', null, () => console.error('找不到: 閃電/閃電.png'));
  explosionSheet = loadImage('爆炸/爆炸.png', null, () => console.error('找不到: 爆炸/爆炸.png'));

  const soundPath = 'chrysalyn-clean-dramatic-lightning-crash-547378.mp3';
  if (typeof loadSound === 'function') {
    lightningSound = loadSound(soundPath, null, () => console.error('找不到音效:', soundPath));
  } else {
    const audioEl = new Audio(soundPath);
    lightningSound = {
      play: () => {
        audioEl.currentTime = 0;
        const p = audioEl.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      },
      stop: () => {
        audioEl.pause();
        audioEl.currentTime = 0;
      },
      isPlaying: () => !audioEl.paused
    };
  }
}

// p5.js 初始化設定函式
function setup() {
  createCanvas(windowWidth, windowHeight);
  charX = width * 2 / 3;

  idleFrames = sliceSheet(idleSheet, IDLE_TOTAL, IDLE_WIDTH, IDLE_HEIGHT);
  walkFrames = sliceSheet(walkSheet, WALK_TOTAL, WALK_WIDTH, WALK_HEIGHT);
  runFrames = sliceSheet(runSheet, RUN_TOTAL, RUN_WIDTH, RUN_HEIGHT);
  lightningFrames = sliceSheet(lightningSheet, LIGHTNING_TOTAL, LIGHTNING_WIDTH, LIGHTNING_HEIGHT);
}

// 取得目前狀態對應的單格原始寬度與高度
function getCurrentRawSize() {
  if (currentState === 'walk') {
    return { w: WALK_WIDTH / WALK_TOTAL, h: WALK_HEIGHT };
  }
  if (currentState === 'run') {
    return { w: RUN_WIDTH / RUN_TOTAL, h: RUN_HEIGHT };
  }
  return { w: IDLE_WIDTH / IDLE_TOTAL, h: IDLE_HEIGHT };
}

// 計算目前畫布尺寸下的等比例顯示寬度與高度（高度固定為畫布高的 1/3）
function getScaledCharacterSize(rawW, rawH) {
  let drawH = height / 3;
  let drawW = drawH * (rawW / rawH);
  return { drawW, drawH };
}

// 計算單張背景等比例撐滿畫布高度時的寬度，以及 3 張背景的最小/最大捲動偏移量
function getBackgroundMetrics() {
  let singleW = height * (bgSheet.width / bgSheet.height);
  let totalW = singleW * 3;
  let minOffset = min(0, width - totalW);
  let maxOffset = 0;
  return { singleW, totalW, minOffset, maxOffset };
}

// 判斷背景是否已經捲到最右端
function isBackgroundAtRightEnd() {
  if (!isSheetValid(bgSheet)) {
    return false;
  }
  let { totalW, minOffset } = getBackgroundMetrics();
  if (totalW <= width) {
    return true;
  }
  return bgOffsetX <= minOffset + 0.5;
}

// 繪製 3 張無縫串接的背景（bg.1.png.jpg 左右各複製一份）
function drawBackground() {
  if (!isSheetValid(bgSheet)) {
    background('#87CEEB');
    return;
  }

  let { singleW, totalW, minOffset, maxOffset } = getBackgroundMetrics();
  bgOffsetX = constrain(bgOffsetX, minOffset, maxOffset);

  if (totalW < width) {
    background('#87CEEB');
  }

  let startX = Math.floor(bgOffsetX);
  for (let i = 0; i < 3; i++) {
    let x = startX + Math.floor(i * singleW);
    let drawW = Math.ceil(singleW) + (i < 2 ? 1 : 0);
    imageMode(CORNER);
    image(bgSheet, x, 0, drawW, height);
  }
}

// 計算單次閃電在指定進度下的顯示寬度
function getLightningStrikeWidth(progress) {
  let p = constrain(progress, 0, 1);
  let strikeH = max(8, height * p);
  let singleFrameW = LIGHTNING_WIDTH / LIGHTNING_TOTAL;
  return strikeH * (singleFrameW / LIGHTNING_HEIGHT);
}

// 繪製單次閃電：將 5 張連續畫格依 1 秒進度依序播放，並由上（0）往下打到最下方（height）
function drawLightningStrike(xCenter, progress) {
  let p = constrain(progress, 0, 1);
  let frameIdx = min(LIGHTNING_TOTAL - 1, floor(p * LIGHTNING_TOTAL));
  let strikeH = max(8, height * p);
  let strikeW = getLightningStrikeWidth(p);

  push();
  imageMode(CORNER);
  if (lightningFrames.length === LIGHTNING_TOTAL) {
    let frameImg = lightningFrames[frameIdx];
    image(frameImg, xCenter - strikeW / 2, 0, strikeW, strikeH);
  } else if (isSheetValid(lightningSheet)) {
    let cropH = max(1, Math.floor(lightningSheet.height * p));
    let subImg = lightningSheet.get(0, 0, lightningSheet.width, cropH);
    image(subImg, xCenter - strikeW / 2, 0, strikeW, strikeH);
  }
  pop();
}

// 繪製視窗底端的藍色爆炸（progress: 0 ~ 1，1 秒內完成）
function drawBlueExplosion(xCenter, progress) {
  let p = constrain(progress, 0, 1);
  let envelope = sin(p * PI);
  let maxRadius = min(width, height) * 0.24;
  let radius = max(24, maxRadius * (0.35 + 0.75 * p));
  let alpha = 240 * max(0.2, envelope);

  push();
  if (isSheetValid(explosionSheet)) {
    let expH = max(32, height * 0.28 * (0.5 + 0.6 * p));
    let expW = expH * (explosionSheet.width / explosionSheet.height);
    imageMode(CORNER);
    tint(120, 200, 255, alpha);
    image(explosionSheet, xCenter - expW / 2, height - expH, expW, expH);
    noTint();
  } else {
    noStroke();
    fill(15, 110, 255, alpha * 0.5);
    arc(xCenter, height, radius * 2.2, radius * 1.6, PI, TWO_PI);

    fill(45, 180, 255, alpha * 0.8);
    arc(xCenter, height, radius * 1.45, radius * 1.15, PI, TWO_PI);

    fill(190, 242, 255, alpha);
    arc(xCenter, height, radius * 0.75, radius * 0.65, PI, TWO_PI);
  }
  pop();
}

// 重設並停止閃電、爆炸與音效
function resetRightEndEffect() {
  effectStartTime = null;
  rightEndBgOffsetX = null;
  wasAtRightEnd = false;
  stopLightningSound();
}

// 更新並繪製背景到最右端時的「連續 5 張圖組成 1 次閃電，打 3 次（各 1 秒）+ 1 次底部藍色爆炸（1 秒）」循環特效
function updateAndDrawRightEndEffect() {
  let atRightEnd = isBackgroundAtRightEnd();

  if (atRightEnd && !wasAtRightEnd) {
    effectStartTime = millis();
    rightEndBgOffsetX = bgOffsetX;
    lastPlayedStrikeKey = null;
  }
  wasAtRightEnd = atRightEnd;

  if (effectStartTime === null) {
    return;
  }

  if (rightEndBgOffsetX === null) {
    rightEndBgOffsetX = bgOffsetX;
  }

  let baseTargetX = width * 3 / 4;
  let scrollDelta = bgOffsetX - rightEndBgOffsetX;
  let currentEffectX = baseTargetX + scrollDelta;

  let totalElapsed = millis() - effectStartTime;
  let cycleIndex = floor(totalElapsed / TOTAL_EFFECT_CYCLE);
  let elapsedInCycle = totalElapsed % TOTAL_EFFECT_CYCLE;

  let isLightningPhase = elapsedInCycle < STEP_DURATION * LIGHTNING_COUNT;
  let strikeProgress = isLightningPhase
    ? ((elapsedInCycle % STEP_DURATION) / STEP_DURATION)
    : 1;
  let effectHalfW = isLightningPhase
    ? max(50, getLightningStrikeWidth(strikeProgress) / 2)
    : max(60, min(width, height) * 0.28);

  if (currentEffectX - effectHalfW > width) {
    resetRightEndEffect();
    return;
  }

  if (isLightningPhase) {
    let strikeNumberInCycle = floor(elapsedInCycle / STEP_DURATION);
    let strikeKey = `${cycleIndex}-${strikeNumberInCycle}`;
    playLightningSoundOnce(strikeKey);
    drawLightningStrike(currentEffectX, strikeProgress);
  } else {
    lastPlayedStrikeKey = null;
    let explosionProgress = (elapsedInCycle - STEP_DURATION * LIGHTNING_COUNT) / STEP_DURATION;
    drawBlueExplosion(currentEffectX, explosionProgress);
  }
}

// 判斷是否按下「往左跑（4）」
function isRunLeftPressed() {
  return keyIsDown(52) || keyIsDown(100) || key === '4';
}

// 判斷是否按下「往右跑（6）」
function isRunRightPressed() {
  return keyIsDown(54) || keyIsDown(102) || key === '6';
}

// p5.js 繪圖主迴圈
function draw() {
  background('#87CEEB');

  // 1. 處理鍵盤輸入、狀態切換、角色走位與背景捲動
  handleInputAndMovement();

  // 2. 繪製 3 張無縫串接的背景
  drawBackground();

  // 3. 更新動畫畫格
  updateAnimation();

  // 4. 繪製等比例縮放且站在畫布底部的角色
  drawCharacter();

  // 5. 當背景到最右端時，循環播放 3 次閃電 + 1 次底部藍色爆炸
  updateAndDrawRightEndEffect();
}

// 處理按鍵移動、先回中央再捲背景、背景到盡頭後角色走到視窗邊緣
function handleInputAndMovement() {
  let isWalkLeft = keyIsDown(LEFT_ARROW);
  let isWalkRight = keyIsDown(RIGHT_ARROW);
  let isRunLeft = isRunLeftPressed();
  let isRunRight = isRunRightPressed();

  let rawSize = getCurrentRawSize();
  let { drawW } = getScaledCharacterSize(rawSize.w, rawSize.h);
  let halfWidth = drawW / 2;
  let centerX = width / 2;
  let minCharX = halfWidth;
  let maxCharX = max(halfWidth, width - halfWidth);

  let bgMetrics = isSheetValid(bgSheet) ? getBackgroundMetrics() : null;
  let canScrollBg = Boolean(bgMetrics && bgMetrics.totalW > width);

  if (isRunRight || isWalkRight) {
    let targetState = isRunRight ? 'run' : 'walk';
    let speed = isRunRight ? RUN_SPEED : WALK_SPEED;

    if (currentState !== targetState || facing !== 1) {
      currentState = targetState;
      facing = 1;
      currentFrame = 0;
      lastFrameTime = millis();
    }

    if (charX < centerX) {
      charX = min(centerX, charX + speed);
    } else if (canScrollBg && bgOffsetX > bgMetrics.minOffset) {
      charX = centerX;
      bgOffsetX = max(bgMetrics.minOffset, bgOffsetX - speed);
    } else {
      charX = min(maxCharX, charX + speed);
    }
  } else if (isRunLeft || isWalkLeft) {
    let targetState = isRunLeft ? 'run' : 'walk';
    let speed = isRunLeft ? RUN_SPEED : WALK_SPEED;

    if (currentState !== targetState || facing !== -1) {
      currentState = targetState;
      facing = -1;
      currentFrame = 0;
      lastFrameTime = millis();
    }

    if (charX > centerX) {
      charX = max(centerX, charX - speed);
    } else if (canScrollBg && bgOffsetX < bgMetrics.maxOffset) {
      charX = centerX;
      bgOffsetX = min(bgMetrics.maxOffset, bgOffsetX + speed);
    } else {
      charX = max(minCharX, charX - speed);
    }
  } else {
    if (currentState !== 'idle') {
      currentState = 'idle';
      currentFrame = 0;
      lastFrameTime = millis();
    }
  }

  charX = constrain(charX, minCharX, maxCharX);
  if (bgMetrics) {
    bgOffsetX = constrain(bgOffsetX, bgMetrics.minOffset, bgMetrics.maxOffset);
  }
}

// 更新動畫畫格索引
function updateAnimation() {
  if (millis() - lastFrameTime >= FRAME_INTERVAL) {
    lastFrameTime = millis();

    if (currentState === 'idle') {
      currentFrame = (currentFrame + 1) % IDLE_TOTAL;
    } else if (currentState === 'walk') {
      currentFrame++;
      if (currentFrame > 5) {
        currentFrame = 3;
      }
    } else if (currentState === 'run') {
      currentFrame = (currentFrame + 1) % RUN_TOTAL;
    }
  }
}

// 繪製角色（等比例縮放、站在畫布底部、支援水平翻轉）
function drawCharacter() {
  let frames = idleFrames;
  if (currentState === 'walk' && walkFrames.length > 0) {
    frames = walkFrames;
  } else if (currentState === 'run' && runFrames.length > 0) {
    frames = runFrames;
  }

  if (!frames || frames.length === 0) return;
  currentFrame = constrain(currentFrame, 0, frames.length - 1);

  let currentImg = frames[currentFrame];
  if (!currentImg || currentImg.width <= 1) return;

  let { drawW, drawH } = getScaledCharacterSize(currentImg.width, currentImg.height);
  let centerY = height - (drawH / 2);

  push();
  translate(Math.floor(charX), Math.floor(centerY));
  scale(facing, 1);
  imageMode(CENTER);
  image(currentImg, 0, 0, drawW, drawH);
  pop();
}

// 鍵盤按下事件（使用 event.repeat 避免長按重複觸發重置）
function keyPressed(event) {
  if (event && event.repeat) {
    return;
  }

  if (keyCode === RIGHT_ARROW || keyCode === LEFT_ARROW) {
    let newFacing = (keyCode === RIGHT_ARROW) ? 1 : -1;
    if (currentState !== 'walk' || facing !== newFacing) {
      facing = newFacing;
      currentState = 'walk';
      currentFrame = 0;
      lastFrameTime = millis();
    }
  } else if (isRunLeftPressed() || isRunRightPressed() || key === '4' || key === '6') {
    let isLeft = keyIsDown(52) || keyIsDown(100) || key === '4';
    let newFacing = isLeft ? -1 : 1;
    if (currentState !== 'run' || facing !== newFacing) {
      facing = newFacing;
      currentState = 'run';
      currentFrame = 0;
      lastFrameTime = millis();
    }
  }
}

// 當瀏覽器視窗放大或縮小時自動更新畫布大小
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}