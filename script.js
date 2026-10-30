const screen = document.getElementById("screen");
const soundToggle = document.getElementById("soundToggle");
const TRAINING_PASSWORD = "H3ro!Key";
const DODGE_DURATION = 8;
const AUTHENTICATOR_WORDS = Object.freeze([
  "amber", "anchor", "apricot", "badger", "birch", "breeze",
  "canyon", "cedar", "comet", "coral", "cricket", "dawn",
  "delta", "ember", "falcon", "fern", "flint", "forest",
  "harbor", "hazel", "heron", "island", "juniper", "lantern",
  "maple", "meadow", "meteor", "moss", "mountain", "nectar",
  "ocean", "otter", "pebble", "pepper", "planet", "plume",
  "raven", "river", "saffron", "shadow", "silver", "sparrow",
  "spruce", "stone", "summit", "tiger", "velvet", "willow"
]);
const SECURITY_FACTS = Object.freeze([
  "MFA requires two or more authenticators to prove your identity.",
  "Using the same factor twice does not count as MFA.",
  "Hardware keys are one of the most secure options for adding account protection.",
  "Authenticator apps and hardware keys are stronger options than phone numbers and email.",
  "MFA makes accounts 99% less likely to get hacked.",
  "Security questions are an outdated and low-security authentication option."
]);

let soundEnabled = false;
let audioContext;
let cipherAttempts;
let currentAuthenticatorChallenge;
let dodgeFrame;
let dodgeKeys;
let dodgeKeyHandler;
let dodgeKeyUpHandler;
let dodgeNextChallenge;
let dodgeFact;
let finalGauntlet = false;

function show(html) {
  stopDodge();
  screen.innerHTML = html;
  screen.classList.remove("screen-enter");
  void screen.offsetWidth;
  screen.classList.add("screen-enter");
}

function updateLayers(current, completed = 0) {
  const progress = completed === 3
    ? 100
    : completed * 33 + (current > completed ? 8 : 0);
  document.getElementById("progressFill").style.width = progress + "%";
  document.getElementById("progressLabel").textContent =
    progress + "% COMPLETE";

  for (let i = 1; i <= 3; i++) {
    const badge = document.getElementById("badge" + i);
    badge.className = "layer";

    if (i <= completed) {
      badge.classList.add("done");
      badge.setAttribute("aria-label", "Layer " + i + " complete");
    } else if (i === current) {
      badge.classList.add("active");
      badge.setAttribute("aria-current", "step");
      badge.setAttribute("aria-label", "Layer " + i + " active");
    } else {
      badge.setAttribute("aria-label", "Layer " + i + " locked");
    }

    if (i !== current) badge.removeAttribute("aria-current");
  }
}

function reportFeedback(message, type = "error") {
  const feedback = document.getElementById("feedback");
  feedback.textContent = message;
  feedback.className = type === "success"
    ? "feedback-success"
    : "feedback-error";
}

function getRandomSecurityFact() {
  return SECURITY_FACTS[randomInteger(SECURITY_FACTS.length)];
}

function playTone(frequency, duration = 0.09, type = "sine") {
  if (!soundEnabled) return;

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;

  audioContext = audioContext || new AudioContextConstructor();
  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  volume.gain.setValueAtTime(0.045, audioContext.currentTime);
  volume.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + duration
  );
  oscillator.connect(volume);
  volume.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function startGame() {
  updateLayers(1);

  show(`
    <p class="eyebrow">INCOMING TRANSMISSION · HERO HQ</p>
    <h2>Mission briefing<span class="success">_</span></h2>
    <div class="villain">
      <strong>VILLAIN:</strong> That legendary crystal is practically
      mine. The hero's base has a door, right? How complicated can it be?
    </div>
    <p>Pass three security challenges and dodge the base's laser grid between them.</p>
    <div class="briefing-grid">
      <div class="briefing-card"><span>YOUR OBJECTIVE</span><strong>Reach the crystal vault</strong></div>
      <div class="briefing-card"><span>CONTROLS</span><strong>Arrow keys or WASD</strong></div>
    </div>
    <button onclick="layer1()">ACCEPT MISSION &nbsp; →</button>
  `);
}

function layer1() {
  updateLayers(1);

  show(`
    <p class="eyebrow">CHALLENGE 01 // THE FIRST CHECK</p>
    <h2>The Password Gate</h2>
    <p>The villain finds a note beside the terminal:</p>
    <div class="panel">
      <p><strong>Security clue:</strong> Passwords can be found in many ways. Including notes, sticky notes, and even hidden messages hidden within Inspect Elements.</p>
    </div>
    <label for="password">Enter the training password:</label>
    <input id="password" placeholder="Enter password" autocomplete="off" />
    <button onclick="checkPassword()">UNLOCK GATE</button>
    <p id="feedback"></p>
  `);
}

function checkPassword() {
  if (document.getElementById("password").value === TRAINING_PASSWORD) {
    playTone(680, 0.14);
    updateLayers(1, 1);
    show(`
      <p class="eyebrow">CHECK PASSED</p>
      <h2 class="success">First layer unlocked.</h2>
      <div class="panel"><p><strong>MFA is when you have to provide two or more authenticators in order to prove your identity.</strong></p></div>
      <button onclick="startDodge(cipherChallenge, 'The use of MFA makes your account 99% less likely to get hacked.')">ENTER THE LASER GRID &nbsp; →</button>
    `);
  } else {
    reportFeedback("ACCESS DENIED. Check the clue and try again.");
    playTone(170, 0.18, "sawtooth");
  }
}

function cipherChallenge() {
  updateLayers(2, 1);
  cipherAttempts = 0;
  currentAuthenticatorChallenge = generateAuthenticatorChallenge();
  show(`
    <p class="eyebrow">CHALLENGE 02 // INCOMING TRANSMISSION</p>
    <h2>Verify the authenticator.</h2>
    <p>Hero HQ sent you an authenticator message. Enter the words it contains.</p>
    <div class="panel">
      <p><strong>AUTHENTICATOR MESSAGE</strong></p>
      <div class="big transmission-text" id="cipherText">CONNECTING...</div>
    </div>
    <label for="cipherAnswer">Enter the authenticator words:</label>
    <input id="cipherAnswer" type="text" maxlength="128" placeholder="Enter the words" autocomplete="off" autocapitalize="none" spellcheck="false" />
    <button onclick="checkCipher()">VERIFY</button>
    <p id="feedback" aria-live="polite"></p>
  `);

  const cipherText = document.getElementById("cipherText");
  if (cipherText) cipherText.textContent = currentAuthenticatorChallenge.message;
}

function randomInteger(maxExclusive) {
  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);

  return value[0] % maxExclusive;
}

function generateAuthenticatorChallenge() {
  const firstWord = AUTHENTICATOR_WORDS[randomInteger(AUTHENTICATOR_WORDS.length)];
  let secondWord = AUTHENTICATOR_WORDS[randomInteger(AUTHENTICATOR_WORDS.length)];
  while (secondWord === firstWord) {
    secondWord = AUTHENTICATOR_WORDS[randomInteger(AUTHENTICATOR_WORDS.length)];
  }

  const phrase = firstWord + " " + secondWord;
  const shift = randomInteger(25) + 1;

  return {
    phrase,
    shift,
    message: createCiphertext(phrase, shift)
  };
}

function createCiphertext(phrase, shift) {
  return [...phrase].map((character) => {
    if (character < "a" || character > "z") return character;
    const position = character.charCodeAt(0) - 97;
    return String.fromCharCode(97 + (position + shift) % 26);
  }).join("");
}

function checkCipher() {
  const answer = document.getElementById("cipherAnswer").value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (currentAuthenticatorChallenge &&
      answer === currentAuthenticatorChallenge.phrase) {
    playTone(760, 0.16);
    updateLayers(2, 2);
    show(`
      <p class="eyebrow">CHECK PASSED</p>
      <h2 class="success">Authenticator verified. Second layer unlocked.</h2>
      <div class="panel">
        <p class="eyebrow">SECURITY FACT</p>
        <p><strong>Using the same factor twice does not count as MFA.</strong></p>
      </div>
      <button onclick="startDodge(factorChallenge, 'Using phone numbers and emails are great but there are other options such as hardware keys or authenticator apps which are better.')">DODGE THE LASERS &nbsp; →</button>
    `);
  } else {
    cipherAttempts++;
    const hint = "Hint: Each letter was shifted forward " +
      currentAuthenticatorChallenge.shift +
      " places in the alphabet. Shift each letter back that many places. Ignore spaces.";
    reportFeedback(cipherAttempts === 1
      ? "Not quite. " + hint
      : "Still not quite. " + hint);
    playTone(170, 0.18, "sawtooth");
  }
}

function factorChallenge() {
  updateLayers(3, 2);
  startDodge(
    completeMission,
    "Using hardware keys are one of the most secure options when you want to add layers of defense to your account.",
    true
  );
}

function completeMission() {
  updateLayers(3, 3);

  show(`
    <p class="eyebrow">OPERATION DEBRIEF · TRANSMISSION SECURE</p>
    <h2 class="success">Mission complete.</h2>
    <div class="panel">
      <p class="eyebrow">SECURITY FACT</p>
      <p><strong>Using hardware keys are one of the most secure options when you want to add layers of defense to your account.</strong></p>
    </div>
    <div class="panel">
      <p class="eyebrow">SECURITY FACT</p>
      <p><strong>Security questions are an outdated and traditional authentication which isn't as useful as it was back then, it is even rated as the lowest security option compared to the rest.</strong></p>
    </div>
    <button onclick="startGame()">RUN SIMULATION AGAIN &nbsp; ↻</button>
  `);
}

function giveUpFinalGauntlet() {
  updateLayers(3, 2);
  show(`
    <p class="eyebrow">OPERATION DEBRIEF · VAULT SEALED</p>
    <h2>The hero's base remains secure.</h2>
    <p class="muted">MISSION ABORTED</p>
    <div class="panel">
      <p class="eyebrow">SECURITY FACT</p>
      <p><strong>Using hardware keys are one of the most secure options when you want to add layers of defense to your account.</strong></p>
    </div>
    <div class="panel">
      <p class="eyebrow">SECURITY FACT</p>
      <p><strong>Security questions are an outdated and traditional authentication which isn't as useful as it was back then, it is even rated as the lowest security option compared to the rest.</strong></p>
    </div>
    <button onclick="startGame()">RUN SIMULATION AGAIN &nbsp; ↻</button>
  `);
}

function stopDodge() {
  if (dodgeFrame) {
    cancelAnimationFrame(dodgeFrame);
    dodgeFrame = undefined;
  }
  if (dodgeKeyHandler) {
    window.removeEventListener("keydown", dodgeKeyHandler);
    dodgeKeyHandler = undefined;
  }
  if (dodgeKeyUpHandler) {
    window.removeEventListener("keyup", dodgeKeyUpHandler);
    dodgeKeyUpHandler = undefined;
  }
  dodgeKeys = undefined;
  dodgeNextChallenge = undefined;
  dodgeFact = undefined;
}

function startDodge(onWin, fact, isFinalGauntlet = false) {
  finalGauntlet = isFinalGauntlet;
  const roundDuration = finalGauntlet ? 18 : DODGE_DURATION;
  show(`
    <p class="eyebrow">${finalGauntlet ? "CHALLENGE 03 // VAULT DEFENSE" : "INTERMISSION // LASER GRID"}</p>
    <h2>${finalGauntlet ? "Final vault." : "Dodge the security lasers."}</h2>
    <div class="dodge-hud"><span id="dodgeStatus">READY</span><span id="dodgeLives">INTEGRITY: 3</span><span id="dodgeTimer">${roundDuration}.0 SEC${finalGauntlet ? " TO SURVIVE" : " · 0% TO EXIT"}</span></div>
    <canvas class="dodge-arena" id="dodgeArena" width="720" height="250" aria-label="Laser dodge game"></canvas>
    <div class="dodge-controls" aria-label="Touch controls">
      <button type="button" data-direction="up" aria-label="Move up">↑</button>
      <button type="button" data-direction="left" aria-label="Move left">←</button>
      <button type="button" data-direction="down" aria-label="Move down">↓</button>
      <button type="button" data-direction="right" aria-label="Move right">→</button>
    </div>
    <p class="muted">${finalGauntlet ? "↑ ↓ ← → / WASD" : "Move with arrow keys or WASD. On touch screens, use the direction buttons. Move right to the exit and steer through each moving beam's gap. You can take up to 3 hits."}</p>
    <button id="dodgeStart" onclick="runDodge()">START DODGING</button>
    ${finalGauntlet ? '<button class="danger" onclick="giveUpFinalGauntlet()">GIVE UP</button>' : ""}
    <p id="feedback"></p>
  `);

  const keys = new Set();
  dodgeKeys = keys;
  dodgeKeyHandler = (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      keys.add(key);
    }
  };
  dodgeKeyUpHandler = (event) => keys.delete(event.key.toLowerCase());
  window.addEventListener("keydown", dodgeKeyHandler);
  window.addEventListener("keyup", dodgeKeyUpHandler);

  for (const button of screen.querySelectorAll("[data-direction]")) {
    const direction = button.dataset.direction;
    const directionKeys = {
      up: "arrowup",
      down: "arrowdown",
      left: "arrowleft",
      right: "arrowright"
    };
    const key = directionKeys[direction];
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      keys.add(key);
    });
    for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
      button.addEventListener(eventName, () => keys.delete(key));
    }
  }

  drawArena(screen.querySelector("#dodgeArena"), 90, 125, [], 0);
  screen.querySelector("#dodgeStart").focus();
  dodgeNextChallenge = onWin;
  dodgeFact = fact;
}

function drawArena(canvas, playerX, playerY, beams, timeLeft) {
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#071018";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "#70efd00c";
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 36) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 36) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  for (const beam of beams) {
    const gapTop = Math.max(0, beam.gapY - beam.gapSize / 2);
    const gapBottom = Math.min(height, beam.gapY + beam.gapSize / 2);
    context.beginPath();
    context.moveTo(beam.x, 0);
    context.lineTo(beam.x, gapTop);
    context.moveTo(beam.x, gapBottom);
    context.lineTo(beam.x, height);
    context.strokeStyle = "#ff455f";
    context.lineWidth = 6;
    context.shadowBlur = 18;
    context.shadowColor = "#ff455f";
    context.stroke();
    context.shadowBlur = 0;

    context.fillStyle = "#ff455f18";
    context.fillRect(beam.x - 8, 0, 16, gapTop);
    context.fillRect(beam.x - 8, gapBottom, 16, height - gapBottom);

    context.strokeStyle = "#ff879566";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(beam.x, gapTop);
    context.lineTo(beam.x, gapBottom);
    context.stroke();
  }

  context.fillStyle = "#70efd0";
  context.fillRect(width - 5, height / 2 - 30, 2, 60);
  context.font = "11px Consolas, monospace";
  context.fillText("EXIT →", width - 58, height / 2 + 4);

  context.beginPath();
  context.arc(playerX, playerY, 9, 0, Math.PI * 2);
  context.fillStyle = "#70efd0";
  context.shadowBlur = 18;
  context.shadowColor = "#70efd0";
  context.fill();
  context.shadowBlur = 0;

}

function runDodge() {
  const canvas = screen.querySelector("#dodgeArena");
  const status = screen.querySelector("#dodgeStatus");
  const livesDisplay = screen.querySelector("#dodgeLives");
  const timer = screen.querySelector("#dodgeTimer");
  const startButton = screen.querySelector("#dodgeStart");
  if (!canvas || !status || !livesDisplay || !timer || !startButton || !dodgeKeys) return;

  startButton.disabled = true;
  status.textContent = "LASERS ACTIVE";
  let playerX = 90;
  let playerY = canvas.height / 2;
  let lives = 3;
  let invulnerableUntil = 0;
  let previousFrame = performance.now();
  const startedAt = previousFrame;
  let nextBeam = 0.3;
  const beams = [];
  const speed = finalGauntlet ? 340 : 260;
  const beamSpeed = finalGauntlet ? 440 : 300;
  const gapSize = finalGauntlet ? 58 : 96;
  const roundDuration = finalGauntlet ? 18 : DODGE_DURATION;
  const beamInterval = finalGauntlet ? 0.82 : 1.65;
  const invulnerabilityDuration = 0.18;

  screen.querySelector("#feedback").textContent = "";

  function finishDodge(won) {
    if (won) {
      const nextChallenge = dodgeNextChallenge;
      const completedFact = dodgeFact;
      stopDodge();
      playTone(740, 0.2);
      show(`
        <p class="eyebrow">LASER GRID CLEARED</p>
        <h2 class="success">Corridor secured.</h2>
        <div class="panel">
          <p class="eyebrow">SECURITY FACT</p>
          <p><strong>${completedFact}</strong></p>
        </div>
        <button onclick="continueDodge()">CONTINUE &nbsp; →</button>
      `);
      dodgeNextChallenge = nextChallenge;
      dodgeFact = completedFact;
    } else {
      if (dodgeFrame) {
        cancelAnimationFrame(dodgeFrame);
        dodgeFrame = undefined;
      }
      playTone(150, 0.25, "sawtooth");
      status.textContent = "HIT DETECTED";
      const feedback = screen.querySelector("#feedback");
      if (feedback) {
        feedback.textContent =
          "SYSTEM RESET. " + getRandomSecurityFact();
        feedback.className = "feedback-error";
      }
      const retry = screen.querySelector("#dodgeStart");
      if (retry) {
        retry.disabled = false;
        retry.textContent = "TRY AGAIN";
      }
      drawArena(canvas, 90, canvas.height / 2, [], roundDuration);
    }
  }

  function frame(now) {
    const delta = Math.min((now - previousFrame) / 1000, 0.04);
    previousFrame = now;
    const elapsed = (now - startedAt) / 1000;
    const timeLeft = Math.max(0, roundDuration - elapsed);

    if (dodgeKeys.has("arrowup") || dodgeKeys.has("w")) playerY -= speed * delta;
    if (dodgeKeys.has("arrowdown") || dodgeKeys.has("s")) playerY += speed * delta;
    if (dodgeKeys.has("arrowleft") || dodgeKeys.has("a")) playerX -= speed * delta;
    if (dodgeKeys.has("arrowright") || dodgeKeys.has("d")) playerX += speed * delta;
    playerX = Math.max(12, Math.min(canvas.width - 12, playerX));
    playerY = Math.max(12, Math.min(canvas.height - 12, playerY));

    if (elapsed >= nextBeam) {
      beams.push({
        x: canvas.width + 8,
        baseGapY: finalGauntlet
          ? gapSize / 2 + Math.random() * (canvas.height - gapSize)
          : 45 + Math.random() * (canvas.height - 90),
        phase: Math.random() * Math.PI * 2,
        gapY: canvas.height / 2,
        gapSize,
        amplitude: finalGauntlet ? 75 : 38,
        frequency: finalGauntlet ? 3.2 : 2.2
      });
      nextBeam = elapsed + beamInterval;
    }

    for (const beam of beams) {
      beam.x -= beamSpeed * delta;
      beam.gapY = Math.max(
        gapSize / 2,
        Math.min(
          canvas.height - gapSize / 2,
          beam.baseGapY +
            Math.sin(elapsed * beam.frequency + beam.phase) * beam.amplitude
        )
      );
      const insideGap = Math.abs(playerY - beam.gapY) < gapSize / 2 - 9;
      if (elapsed >= invulnerableUntil && Math.abs(playerX - beam.x) < 14 && !insideGap) {
        lives--;
        livesDisplay.textContent = "INTEGRITY: " + lives;
        beams.splice(beams.indexOf(beam), 1);
        invulnerableUntil = elapsed + invulnerabilityDuration;
        playerX = 90;
        playerY = canvas.height / 2;
        playTone(150, 0.18, "sawtooth");

        if (lives === 0) {
          finishDodge(false);
          return;
        }

        status.textContent = "RESET — BACK TO ENTRY";
        const feedback = screen.querySelector("#feedback");
        if (feedback) {
          feedback.textContent =
            "You were hit and sent back to the start. SECURITY FACT: " +
            getRandomSecurityFact();
          feedback.className = "feedback-error";
        }
        break;
      }
    }

    if (elapsed >= invulnerableUntil && status.textContent === "RESET — BACK TO ENTRY") {
      status.textContent = "LASERS ACTIVE";
    }

    for (let i = beams.length - 1; i >= 0; i--) {
      if (beams[i].x < -8) beams.splice(i, 1);
    }

    drawArena(canvas, playerX, playerY, beams, timeLeft);
    timer.textContent = finalGauntlet
      ? timeLeft.toFixed(1) + " SEC TO SURVIVE"
      : timeLeft.toFixed(1) + " SEC · " +
        Math.round((playerX / canvas.width) * 100) + "% TO EXIT";

    if (!finalGauntlet && playerX >= canvas.width - 22) {
      finishDodge(true);
      return;
    }
    if (elapsed >= roundDuration) {
      finishDodge(finalGauntlet);
      return;
    }
    dodgeFrame = requestAnimationFrame(frame);
  }

  dodgeFrame = requestAnimationFrame(frame);
}

function continueDodge() {
  if (dodgeNextChallenge) dodgeNextChallenge();
}

soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  soundToggle.setAttribute(
    "aria-label",
    soundEnabled ? "Disable sound effects" : "Enable sound effects"
  );
  soundToggle.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
  playTone(soundEnabled ? 620 : 330, 0.12);
});

document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("#screen button")) {
    playTone(420, 0.045);
  }
});

startGame();
