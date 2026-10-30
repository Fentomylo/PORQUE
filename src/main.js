import * as THREE from 'three';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';

const params = createParameters();

document.body.innerHTML = '<div id="app"><div id="canvas-container"></div></div>';

const app = document.querySelector('#app');
const canvasContainer = document.querySelector('#canvas-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080a18);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
canvasContainer.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.4));

const keyLight = new THREE.PointLight(0x8e76ff, 90, 40);
keyLight.position.set(4, 5, 8);
scene.add(keyLight);

const blueLight = new THREE.PointLight(0x54bfff, 65, 35);
blueLight.position.set(-6, -3, 5);
scene.add(blueLight);

const pinkLight = new THREE.PointLight(0xff8ed7, 40, 30);
pinkLight.position.set(2, -6, 4);
scene.add(pinkLight);

const grid = new THREE.GridHelper(30, 30, 0x6551b8, 0x27234e);
grid.position.y = -5.4;
grid.material.transparent = true;
grid.material.opacity = 0.38;
scene.add(grid);

const starGeometry = new THREE.BufferGeometry();
const starPositions = [];

for (let i = 0; i < 240; i++) {
  starPositions.push(
    (Math.random() - 0.5) * 32,
    (Math.random() - 0.5) * 20,
    -4 - Math.random() * 8
  );
}

starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));

const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0xc8c0ff,
    size: 0.035,
    transparent: true,
    opacity: 0.7
  })
);
scene.add(stars);

const simulation = createSimulation(scene, params);

let panel;
let currentMode = 'MOVE';
let selectedObject = null;
let firstConnection = null;
let dragging = false;
let movedDuringDrag = false;
let zoom = 16;
let careWasHigh = false;
let frameCount = 0;

// OBRA: estado general
let sceneTime = 0;
let lastVisitor = -100;
let handSeconds = 0;
let labOpen = false;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const dragPoint = new THREE.Vector3();

const drawingCanvas = document.createElement('canvas');
drawingCanvas.id = 'drawing-canvas';
canvasContainer.appendChild(drawingCanvas);

const drawingContext = drawingCanvas.getContext('2d');
let isDrawing = false;
let drawingPoints = [];

let effectSettings = {
  effect: 'NEON',
  color: '#8d65ff',
  intensity: 1,
  size: 2,
  speed: 1
};

function resizeDrawingCanvas() {
  const rect = canvasContainer.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  drawingCanvas.width = Math.round(rect.width * dpr);
  drawingCanvas.height = Math.round(rect.height * dpr);
  drawingCanvas.style.width = `${rect.width}px`;
  drawingCanvas.style.height = `${rect.height}px`;
  drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clearDrawing() {
  const rect = canvasContainer.getBoundingClientRect();
  drawingContext.clearRect(0, 0, rect.width, rect.height);
  drawingPoints = [];
}

function drawStroke() {
  const rect = canvasContainer.getBoundingClientRect();
  drawingContext.clearRect(0, 0, rect.width, rect.height);

  if (drawingPoints.length < 2) return;

  drawingContext.beginPath();
  drawingContext.moveTo(drawingPoints[0].x, drawingPoints[0].y);

  for (let i = 1; i < drawingPoints.length; i++) {
    drawingContext.lineTo(drawingPoints[i].x, drawingPoints[i].y);
  }

  const painting = currentMode === 'EFFECT';
  drawingContext.strokeStyle = painting ? effectSettings.color : '#d8baff';
  drawingContext.lineWidth = painting ? Math.max(8, effectSettings.size * 12) : 4;
  drawingContext.lineCap = 'round';
  drawingContext.lineJoin = 'round';
  drawingContext.shadowColor = painting ? effectSettings.color : '#a47aff';
  drawingContext.shadowBlur = painting ? 20 : 14;
  drawingContext.stroke();
  drawingContext.shadowBlur = 0;
}

function setPointerFromScreen(x, y) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function screenPointToWorld(point) {
  setPointerFromScreen(point.x, point.y);
  const worldPoint = new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane, worldPoint);
  return worldPoint;
}

function updateHistory() {
  if (!panel) return;
  panel.updateHistory(simulation.getHistory(), simulation.getComparisonStatus());
}

function saveHumanAction(label) {
  simulation.countIntervention();
  simulation.recordHistory(label);
  simulation.saveHumanVersion();
  updateHistory();
}

function setDrawingMode(enabled) {
  drawingCanvas.classList.toggle('drawing-active', enabled);
  renderer.domElement.style.cursor = enabled ? 'crosshair' : 'grab';

  if (!enabled) {
    isDrawing = false;
    clearDrawing();
  }
}

panel = createLabPanel({
  onGenerate(prompt) {
    simulation.setOutcome(nextOutcome());
    simulation.generateFailure(prompt);
    careWasHigh = false;
    clearDrawing();
    updateHistory();
  },

  onToolChange(mode) {
    currentMode = mode;
    firstConnection = null;

    if (selectedObject) {
      selectedObject.userData.held = false;
      selectedObject.scale.setScalar(selectedObject.userData.baseScale);
      selectedObject = null;
      dragging = false;
    }

    setDrawingMode(mode === 'DRAW' || mode === 'EFFECT');

    if (mode === 'ALIGN') {
      simulation.alignObjects();
      updateHistory();
      panel.setStatus('YOUR COMPOSITION IS ALIGNED');
      currentMode = 'MOVE';
      setDrawingMode(false);

      panel.querySelectorAll('[data-mode]').forEach(button => {
        button.classList.toggle('active', button.dataset.mode === 'MOVE');
      });
    }
  },

  onEffectSettings(settings) {
    effectSettings = { ...effectSettings, ...settings };
    drawStroke();
  },

  onCompare(version) {
    if (version === 'AI') simulation.showAIResult();
    else simulation.showHumanVersion();

    clearDrawing();
    updateHistory();
  },

  onReset() {
    simulation.reset();
    firstConnection = null;
    selectedObject = null;
    dragging = false;
    careWasHigh = false;
    clearDrawing();
    updateHistory();
  },

  onQuickAction(action) {
    simulation.quickAction(action);
    updateHistory();
  },

  onClearDrawing() {
    clearDrawing();
  },

  onAuthorship(on) {
    return simulation.revealAuthorship(on);
  },

  onClose() {
    closeLab();
  },

  onDone() {
    finishLab();
  }
});

app.appendChild(panel);

// La obra se muestra sola; el panel queda guardado detrás del botón LAB.
panel.style.display = 'none';

function getObjectAt(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(simulation.objects, false);
  return hits.length ? hits[0].object : null;
}

function getWorldPoint(event) {
  setPointerFromScreen(event.clientX, event.clientY);
  raycaster.ray.intersectPlane(dragPlane, dragPoint);
  return dragPoint.clone();
}

// DRAW and EFFECT use the overlay canvas, but are separate actions.
drawingCanvas.addEventListener('pointerdown', event => {
  if (!['DRAW', 'EFFECT'].includes(currentMode) || event.button !== 0) return;

  isDrawing = true;
  drawingPoints = [{ x: event.clientX, y: event.clientY }];
  drawingCanvas.setPointerCapture(event.pointerId);
  drawStroke();
});

drawingCanvas.addEventListener('pointermove', event => {
  if (!isDrawing || !['DRAW', 'EFFECT'].includes(currentMode)) return;

  const last = drawingPoints[drawingPoints.length - 1];
  if (Math.hypot(event.clientX - last.x, event.clientY - last.y) < 4) return;

  drawingPoints.push({ x: event.clientX, y: event.clientY });
  drawStroke();
});

function finishDrawing() {
  if (!isDrawing) return;
  isDrawing = false;

  if (drawingPoints.length >= 2) {
    const worldPoints = drawingPoints
      .map(screenPointToWorld)
      .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));

    if (worldPoints.length >= 2) {
      if (currentMode === 'DRAW') {
        if (simulation.drawComposition(worldPoints)) {
          panel.setStatus('YOUR DRAWING BECAME THE COMPOSITION');
          updateHistory();
        }
      } else if (currentMode === 'EFFECT') {
        const count = simulation.applyEffectStroke(worldPoints, effectSettings);
        panel.setStatus(count ? `${effectSettings.effect} APPLIED TO ${count} OBJECTS` : 'NO OBJECTS IN BRUSH RANGE');
        updateHistory();
      }
    }
  }

  window.setTimeout(clearDrawing, 350);
}

drawingCanvas.addEventListener('pointerup', finishDrawing);
drawingCanvas.addEventListener('pointercancel', finishDrawing);

// OBJECT TOOLS
renderer.domElement.addEventListener('pointerdown', event => {
  lastVisitor = sceneTime; // alguien está tocando la obra

  if (currentMode === 'DRAW' || currentMode === 'EFFECT' || event.button !== 0) return;

  const object = getObjectAt(event);
  if (!object) {
    if (firstConnection) {
      firstConnection.scale.setScalar(firstConnection.userData.baseScale);
    }
    firstConnection = null;
    return;
  }

  if (currentMode === 'DELETE') {
    simulation.removeObject(object);
    saveHumanAction('DELETE');
    return;
  }

  if (currentMode === 'REPAIR') {
    simulation.repairObject(object);
    saveHumanAction('REPAIR');
    return;
  }

  if (currentMode === 'CONNECT') {
    if (!firstConnection) {
      firstConnection = object;
      object.scale.multiplyScalar(1.35);
      panel.setStatus('SELECT ANOTHER OBJECT');
    } else {
      firstConnection.scale.setScalar(firstConnection.userData.baseScale);

      const created = simulation.connectObjects(firstConnection, object);
      firstConnection = null;

      if (!created) {
        panel.setStatus('THAT OBJECT ALREADY HAS ENOUGH RELATIONSHIPS');
        return;
      }

      saveHumanAction('CONNECT');
      panel.setStatus('RELATIONSHIP CREATED');
    }
    return;
  }

  if (['SCALE', 'ROTATE', 'COLOR', 'DUPLICATE'].includes(currentMode)) {
    const success = simulation.applyHumanTool(object, currentMode);
    if (success) {
      updateHistory();
      panel.setStatus(`${currentMode} APPLIED`);
    } else if (currentMode === 'DUPLICATE') {
      panel.setStatus('OBJECT LIMIT REACHED');
    }
    return;
  }

  if (currentMode === 'MOVE') {
    selectedObject = object;
    selectedObject.userData.held = true;
    dragging = true;
    movedDuringDrag = false;
    selectedObject.scale.multiplyScalar(1.2);
    renderer.domElement.setPointerCapture(event.pointerId);
  }
});

renderer.domElement.addEventListener('pointermove', event => {
  if (!dragging || !selectedObject) return;

  lastVisitor = sceneTime;

  const point = getWorldPoint(event);
  selectedObject.position.lerp(point, 0.85);
  selectedObject.userData.target.copy(selectedObject.position);
  movedDuringDrag = true;
  simulation.rebuildConnections();
});

renderer.domElement.addEventListener('pointerup', () => {
  if (dragging && selectedObject) {
    selectedObject.scale.setScalar(selectedObject.userData.baseScale);
    selectedObject.userData.held = false;

    if (movedDuringDrag) {
      simulation.touchObject(selectedObject);
      simulation.rebuildConnections();
      saveHumanAction('MOVE');
    } else {
      // un toque también es atención, aunque pese menos que mover
      simulation.touchObject(selectedObject, 0.7);
    }
  }

  selectedObject = null;
  dragging = false;
  movedDuringDrag = false;
});

renderer.domElement.addEventListener('wheel', event => {
  event.preventDefault();
  zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.008, 10, 24);
  camera.position.z = zoom;
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeDrawingCanvas();
});

resizeDrawingCanvas();

/* =========================================================
   LA OBRA: textos, mano fantasma y director de fases
   ========================================================= */

// ---------- TEXTOS EN PANTALLA ----------

const overlay = document.createElement('div');
overlay.id = 'obra-overlay';
overlay.style.cssText =
  "position:absolute;inset:0;z-index:4;pointer-events:none;font-family:'Space Grotesk',sans-serif;color:#ece8ff;";

overlay.innerHTML = `
  <div style="position:absolute;top:22px;left:26px;">
    <div style="font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.28em;color:#a99bdc;">WHY BOTHER?</div>
    <div style="margin-top:6px;font-size:15px;letter-spacing:-.01em;color:#d9d2f7;opacity:.85;">¿Para qué tomarte el trabajo?</div>
  </div>

  <div style="position:absolute;top:22px;right:26px;text-align:right;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.18em;line-height:1.9;color:#a99bdc;">
    <div>MÁQUINA &nbsp;<span id="hud-machine" style="color:#c9b6ff;">—</span></div>
    <div>MANO &nbsp;<span id="hud-hand" style="color:#ffd9a0;">00:00</span></div>
  </div>

  <div id="obra-caption" style="position:absolute;left:50%;bottom:11%;transform:translateX(-50%);width:min(920px,88vw);text-align:center;opacity:0;transition:opacity .45s ease;">
    <div id="obra-main" style="font-size:clamp(22px,3.3vw,46px);font-weight:500;letter-spacing:-.025em;line-height:1.15;text-shadow:0 0 28px rgba(141,101,255,.55);"></div>
    <div id="obra-sub" style="margin-top:12px;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.2em;color:#a99bdc;"></div>
  </div>

  <div id="obra-final-bar" style="position:absolute;left:50%;bottom:22px;transform:translateX(-50%);display:flex;gap:10px;opacity:0;pointer-events:none;transition:opacity .45s ease;">
    <button type="button" id="final-edit" style="padding:9px 14px;border:1px solid #6551b8;border-radius:4px;background:rgba(14,12,34,.72);color:#d8baff;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.14em;cursor:pointer;">↩ SEGUIR EDITANDO</button>
    <button type="button" id="final-restart" style="padding:9px 14px;border:1px solid #6551b8;border-radius:4px;background:rgba(14,12,34,.72);color:#d8baff;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.14em;cursor:pointer;">↻ EMPEZAR DE NUEVO</button>
  </div>

  <div id="obra-legend" style="position:absolute;left:26px;bottom:22px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.14em;line-height:2;color:#a99bdc;opacity:0;transition:opacity .45s ease;">
    <div><span style="color:#ffd9a0;">●</span> LO DECIDÍ YO</div>
    <div><span style="color:#7fe3c2;">●</span> LO PUSE YO, LO MOVIÓ ELLA</div>
    <div><span style="color:#c9b6ff;">●</span> LO DECIDIÓ LA MÁQUINA</div>
  </div>
`;

app.appendChild(overlay);

const captionEl = overlay.querySelector('#obra-caption');
const mainEl = overlay.querySelector('#obra-main');
const subEl = overlay.querySelector('#obra-sub');
const hudMachine = overlay.querySelector('#hud-machine');
const hudHand = overlay.querySelector('#hud-hand');
const legendEl = overlay.querySelector('#obra-legend');
const finalBar = overlay.querySelector('#obra-final-bar');
mainEl.style.whiteSpace = 'pre-line';

let captionToken = 0;

function setCaption(main, sub = '') {
  const token = ++captionToken;
  captionEl.style.opacity = '0';

  window.setTimeout(() => {
    if (token !== captionToken) return;
    mainEl.textContent = main;
    subEl.textContent = sub;
    captionEl.style.opacity = '1';
  }, 450);
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ---------- BOTÓN PARA ABRIR EL LAB ----------

const labButton = document.createElement('button');
labButton.type = 'button';
labButton.textContent = '✦ ABRIR EL LAB';
labButton.style.cssText =
  "position:absolute;z-index:6;bottom:20px;right:24px;padding:9px 14px;border:1px solid #6551b8;border-radius:4px;background:rgba(14,12,34,.72);color:#d8baff;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.14em;cursor:pointer;";
app.appendChild(labButton);

// ---------- LA MANO FANTASMA ----------

const hand = new THREE.Group();

const handCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.1, 20, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff5d6 })
);

const handHalo = new THREE.Mesh(
  new THREE.SphereGeometry(0.42, 24, 18),
  new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);

const handRing = new THREE.Mesh(
  new THREE.RingGeometry(0.55, 0.6, 48),
  new THREE.MeshBasicMaterial({
    color: 0xffe3b0,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);

hand.add(handCore, handHalo, handRing);
hand.visible = false;
scene.add(hand);

const handState = { active: false, appear: 0, energy: 1 };
const handTarget = new THREE.Vector3();
const handWork = {
  queue: [],
  current: null,
  done: 0,
  total: 1,
  finished: true,
  center: null,
  ring: []
};

function startHand() {
  const sorted = simulation.objects
    .slice()
    .sort((a, b) => a.position.lengthSq() - b.position.lengthSq())
    .slice(0, 13);

  handWork.queue = [];
  handWork.current = null;
  handWork.done = 0;
  handWork.finished = false;

  if (sorted.length < 4) {
    handWork.finished = true;
    handWork.total = 1;
    return;
  }

  const center = sorted[0];
  const ring = sorted
    .slice(1)
    .sort((a, b) => Math.atan2(a.position.y, a.position.x) - Math.atan2(b.position.y, b.position.x));

  handWork.center = center;
  handWork.ring = ring;

  handWork.queue.push({ object: center, slot: new THREE.Vector3(0, 0, 0), ringIndex: null });

  ring.forEach((object, i) => {
    const angle = Math.PI / 2 + (i / ring.length) * Math.PI * 2;
    handWork.queue.push({
      object,
      slot: new THREE.Vector3(Math.cos(angle) * 2.7, Math.sin(angle) * 2.3, 0),
      ringIndex: i
    });
  });

  handWork.total = handWork.queue.length;

  handTarget.copy(center.position);
  hand.position.set(center.position.x, center.position.y, 0.8);
  handState.active = true;
  handState.energy = 1;
}

// suelta lo que la mano tenga agarrado y la hace desaparecer
function stopHand() {
  if (handWork.current) {
    handWork.current.object.userData.held = false;
    handWork.current = null;
  }

  handWork.queue = [];
  handWork.finished = true;
  handState.active = false;
}

function placeObject(task) {
  const object = task.object;

  object.userData.held = false;
  object.userData.moving = false;
  object.position.copy(task.slot);
  object.userData.target.copy(task.slot);

  simulation.touchObject(object, 1);

  // pequeño pulso al colocar
  object.scale.multiplyScalar(1.35);
  window.setTimeout(() => object.scale.multiplyScalar(1 / 1.35), 220);

  if (task.ringIndex !== null) {
    const ring = handWork.ring;
    const i = task.ringIndex;

    if (i > 0) simulation.connectObjects(ring[i], ring[i - 1]);
    if (i === ring.length - 1) simulation.connectObjects(ring[i], ring[0]);
    if (i % 3 === 0) simulation.connectObjects(handWork.center, ring[i]);
  }

  saveHumanAction('HAND');
}

function updateHandWork(dt) {
  if (handWork.finished) return;

  if (!handWork.current) {
    const next = handWork.queue.shift();

    if (!next) {
      handWork.finished = true;
      return;
    }

    handWork.current = { ...next, stage: 'REACH', t: 0 };
  }

  const task = handWork.current;
  task.t += dt;

  // mientras hay una mano trabajando, la máquina espera
  simulation.touchObject(task.object, 0);
  handTarget.copy(task.object.position);

  if (task.stage === 'REACH') {
    if (task.t > 1) {
      task.stage = 'CARRY';
      task.t = 0;
      task.object.userData.moving = false;
      task.object.userData.held = true;
    }
  } else {
    task.object.position.lerp(task.slot, 1 - Math.exp(-3.2 * dt));
    task.object.userData.target.copy(task.object.position);
    simulation.rebuildConnections();

    if (task.object.position.distanceTo(task.slot) < 0.06 || task.t > 5) {
      placeObject(task);
      handWork.done++;
      handWork.current = null;
    }
  }

  handState.energy = 1 - 0.9 * (handWork.done / handWork.total);
}

function updateHand(dt, elapsed) {
  const rate = handState.active ? 3 : 1.2;
  handState.appear += ((handState.active ? 1 : 0) - handState.appear) * (1 - Math.exp(-dt * rate));

  hand.visible = handState.appear > 0.02;
  if (!hand.visible) return;

  const follow = 1 - Math.exp(-dt * 7);
  hand.position.x += (handTarget.x - hand.position.x) * follow;
  hand.position.y += (handTarget.y - hand.position.y) * follow;
  hand.position.z = 0.8;

  const energy = handState.energy;
  hand.scale.setScalar(handState.appear * (0.55 + 0.45 * energy));
  handHalo.material.opacity = 0.1 + 0.28 * energy;
  handRing.material.opacity = 0.25 + 0.35 * energy;
  handRing.rotation.z = elapsed * 0.8;
  handRing.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.06);
}

// ---------- EL DIRECTOR ----------
// INTRO -> RESULT -> HAND -> TIRED -> TIDY -> QUESTION -> RESTART -> INTRO ...
// Si alguien toca la obra: VISITOR (la máquina espera mientras tocas).

const PROMPTS = [
  'un jardín flotante, simetría perfecta, caos organizado',
  'algo hermoso, simetría perfecta, que tenga alma',
  'una obra original, simetría perfecta, con sentido'
];

// ---------- LA HIPÓTESIS ABIERTA ----------
// La obra no siempre da la misma respuesta. Cada vuelta termina distinto:
//   PLAIN    -> la máquina borra lo que nadie cuida (la tesis cómoda)
//   SURVIVES -> la figura de la mano sobrevive, sostenida por sus conexiones
//   BLOOM    -> el orden de la máquina resulta hermoso
// Así la respuesta deja de ser "esfuerzo bueno, máquina mala" y pasa a ser:
// cuesta darse cuenta de qué decidí yo y qué decidió el sistema.

let outcomeBag = [];
let lastOutcome = null;

function nextOutcome() {
  const forced = (new URLSearchParams(window.location.search).get('final') || '').toUpperCase();
  if (['PLAIN', 'SURVIVES', 'BLOOM'].includes(forced)) return forced;

  if (!outcomeBag.length) {
    outcomeBag = ['PLAIN', 'SURVIVES', 'BLOOM'].sort(() => Math.random() - 0.5);
    if (outcomeBag[0] === lastOutcome) outcomeBag.push(outcomeBag.shift());
  }

  lastOutcome = outcomeBag.shift();
  return lastOutcome;
}

// 'at' y 'end' son segundos desde que la deriva está completa
const TIDY_PLAN = {
  PLAIN: {
    beats: [{ at: 10, main: 'No lo destruye. Lo promedia.', sub: 'ORDEN SIN AUTOR' }],
    end: 20
  },
  SURVIVES: {
    beats: [
      { at: 3, main: 'Algo sobrevivió.', sub: 'LAS RELACIONES SOSTUVIERON LA FIGURA' },
      { at: 10, main: 'Sobrevivió por una regla que yo escribí.', sub: 'YO ELEGÍ CUÁNTO PROTEGE UNA RELACIÓN' }
    ],
    end: 17
  },
  BLOOM: {
    beats: [
      { at: 4, main: 'A veces el orden de la máquina es hermoso.', sub: 'NADIE SE EQUIVOCÓ' },
      { at: 11, main: '¿Lo que me gusta lo elegí yo?', sub: 'EL ORDEN ES AJENO. ¿Y EL GUSTO?' }
    ],
    end: 18
  }
};

const director = {
  phase: 'OFF',
  t0: 0,
  stage: 0,
  prompt: PROMPTS[0],
  typed: -1,
  generated: false,
  outcome: 'PLAIN',
  settled: 0
};

function enterPhase(name, arg) {
  director.phase = name;
  director.t0 = sceneTime;
  director.stage = 0;

  if (name !== 'AUTHORSHIP') simulation.revealAuthorship(false);
  legendEl.style.opacity = name === 'AUTHORSHIP' || name === 'FINAL' ? '1' : '0';
  finalBar.style.opacity = name === 'FINAL' ? '1' : '0';
  finalBar.style.pointerEvents = name === 'FINAL' ? 'auto' : 'none';

  if (name === 'INTRO') {
    stopHand();
    simulation.reset();

    director.outcome = nextOutcome();
    simulation.setOutcome(director.outcome);
    clearDrawing();
    updateHistory();

    director.prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    director.typed = -1;
    director.generated = false;
    handSeconds = 0;
    hudMachine.textContent = '—';

    captionToken++;
    mainEl.textContent = '';
    subEl.textContent = '';
    captionEl.style.opacity = '1';
  }

  if (name === 'RESULT') {
    simulation.generateFailure(director.prompt);
    director.generated = true;
    updateHistory();
    hudMachine.textContent = '< 1 s';
    setCaption('La máquina respondió en menos de un segundo.', 'MÁQUINA · MENOS DE 1 s');
  }

  if (name === 'HAND') {
    setCaption('Yo tardé en hacerlo mío.', 'CADA OBJETO CUESTA TIEMPO');
    startHand();
  }

  if (name === 'TIRED') {
    handState.active = false;
    setCaption('El cuidado se cansa.', 'LA MANO SE DETIENE');
  }

  if (name === 'TIDY') {
    director.settled = 0;
    setCaption(
      arg === 'visitor'
        ? 'Dejaste de tocarlo.'
        : 'Lo que nadie cuida se ordena hasta no ser de nadie.',
      'LA MÁQUINA NO SE CANSA'
    );
  }

  if (name === 'AUTHORSHIP') {
    const c = simulation.revealAuthorship(true);
    setCaption(
      '¿Cuáles de estas decisiones fueron mías?',
      `YO ${c.HAND} · LOS DOS ${c.SHARED} · LA MÁQUINA ${c.MACHINE}`
    );
  }

  if (name === 'FINAL') {
    const c = simulation.revealAuthorship(true);
    const mine = c.HAND + c.SHARED;
    let line;

    if (mine === 0) line = 'Esto lo decidió la máquina.';
    else if (c.SHARED > 0) line = `${c.SHARED} de tus decisiones las movió la máquina.`;
    else line = `${c.HAND} decisiones siguen siendo tuyas.`;

    setCaption(
      `${line}\n¿Para qué tomarte el trabajo?`,
      `YO ${c.HAND} · LOS DOS ${c.SHARED} · LA MÁQUINA ${c.MACHINE} — MI PREGUNTA SIGUE ABIERTA`
    );
  }

  if (name === 'QUESTION') {
    setCaption('¿Para qué tomarte el trabajo?', 'MI PREGUNTA SIGUE ABIERTA. ¿Y LA TUYA? TOCA ALGO');
  }

  if (name === 'RESTART') {
    setCaption('Otra vez.', '');
  }

  if (name === 'VISITOR') {
    stopHand();
    setCaption('Ahora el trabajo es tuyo.', 'MIENTRAS TOQUES, LA MÁQUINA ESPERA');
  }
}

function updateDirector() {
  if (labOpen || director.phase === 'OFF') return;

  const t = sceneTime - director.t0;
  const visitorActive = sceneTime - lastVisitor < 9;
  const stats = simulation.getDriftStats();

  // alguien toma el relevo
  if (
    visitorActive &&
    director.generated &&
    !['INTRO', 'RESTART', 'VISITOR', 'FINAL'].includes(director.phase)
  ) {
    enterPhase('VISITOR');
    return;
  }

  switch (director.phase) {
    case 'INTRO': {
      const typedCount = Math.max(0, Math.floor((t - 1) * 16));
      const shown = Math.min(typedCount, director.prompt.length);

      if (shown !== director.typed) {
        director.typed = shown;
        const cursor = shown < director.prompt.length ? '_' : '';
        mainEl.textContent = `> ${director.prompt.slice(0, shown)}${cursor}`;
      }

      if (typedCount > director.prompt.length + 16) enterPhase('RESULT');
      break;
    }

    case 'RESULT':
      if (director.stage === 0 && t > 3) {
        director.stage = 1;
        setCaption('Está terminado. ¿Está bien?', 'TÉCNICAMENTE, SÍ');
      }
      if (t > 5.5) enterPhase('HAND');
      break;

    case 'HAND':
      updateHandWork(simulationDelta);
      if (handWork.finished) enterPhase('TIRED');
      break;

    case 'TIRED':
      if (t > 4) enterPhase('TIDY');
      break;

    case 'TIDY': {
      const plan = TIDY_PLAN[director.outcome] || TIDY_PLAN.PLAIN;

      if (stats.drift > 0.9) director.settled += simulationDelta;

      const beat = plan.beats[director.stage];
      if (beat && director.settled > beat.at) {
        director.stage++;
        setCaption(beat.main, beat.sub);
      }

      if (director.settled > plan.end || t > 90) enterPhase('AUTHORSHIP');
      break;
    }

    case 'AUTHORSHIP':
      if (director.stage === 0 && t > 8) {
        director.stage = 1;
        setCaption(
          'No sé si delegar es malo.',
          'LO QUE SÍ SÉ: CUESTA DARSE CUENTA DE QUÉ DECIDÍ YO Y QUÉ DECIDIÓ EL SISTEMA'
        );
      }
      if (t > 17) enterPhase('QUESTION');
      break;

    case 'QUESTION':
      if (t > 14) enterPhase('RESTART');
      break;

    case 'RESTART':
      if (t > 2.8) enterPhase('INTRO');
      break;

    case 'VISITOR':
      if (!visitorActive) enterPhase('TIDY', 'visitor');
      break;

    default:
      break;
  }
}

// ---------- OBRA <-> LAB ----------

function openLab() {
  labOpen = true;
  director.phase = 'OFF';
  stopHand();
  simulation.revealAuthorship(false);

  panel.style.display = '';
  overlay.style.display = 'none';

  labButton.textContent = '← VOLVER A LA OBRA';
  labButton.style.right = 'auto';
  labButton.style.left = '24px';
}

// vuelve a la obra sin decidir que fase sigue
function leaveLab() {
  labOpen = false;

  const moveButton = panel.querySelector('[data-mode="MOVE"]');
  if (moveButton) moveButton.click();

  panel.style.display = 'none';
  overlay.style.display = '';

  labButton.textContent = '✦ ABRIR EL LAB';
  labButton.style.left = 'auto';
  labButton.style.right = '24px';

  lastVisitor = -100;
}

// VOLVER A LA OBRA: la obra automatica empieza otra vez
function closeLab() {
  if (!labOpen) return;
  leaveLab();
  enterPhase('INTRO');
}

// LISTO: sin tiempos. El final aparece cuando tu lo pides,
// con la composicion tal como la dejaste.
function finishLab() {
  if (!labOpen) return;
  leaveLab();
  director.generated = true;
  simulation.freeze();
  enterPhase('FINAL');
}

overlay.querySelector('#final-edit').addEventListener('click', () => openLab());
overlay.querySelector('#final-restart').addEventListener('click', () => enterPhase('INTRO'));

labButton.addEventListener('click', () => {
  if (labOpen) closeLab();
  else openLab();
});

/* ========================================================= */

const clock = new THREE.Clock();
let lastLoopTime = 0;
let simulationDelta = 0;

renderer.setAnimationLoop(() => {
  const elapsed = clock.getElapsedTime();
  simulationDelta = Math.min(Math.max(elapsed - lastLoopTime, 0), 0.05);
  lastLoopTime = elapsed;
  sceneTime = elapsed;

  // tiempo de trabajo humano: la mano o alguien tocando
  if (!labOpen && (director.phase === 'HAND' || sceneTime - lastVisitor < 1.5)) {
    handSeconds += simulationDelta;
  }

  updateDirector();

  simulation.update(elapsed);
  updateHand(simulationDelta, elapsed);

  stars.rotation.z = elapsed * 0.006;
  grid.position.z = Math.sin(elapsed * 0.2) * 0.05;

  frameCount++;
  if (frameCount % 6 === 0) {
    const stats = simulation.getDriftStats();
    panel.setCare(stats);
    hudHand.textContent = formatTime(handSeconds);

    if (labOpen) {
      if (stats.care > 0.3) careWasHigh = true;

      if (careWasHigh && stats.active && stats.drift > 0.9 && stats.care < 0.08) {
        careWasHigh = false;
        panel.say('You stopped. I tidied everything up. You are welcome.');
      }
    }
  }

  renderer.render(scene, camera);
});

updateHistory();
enterPhase('INTRO');