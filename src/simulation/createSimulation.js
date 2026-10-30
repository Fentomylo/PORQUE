import * as THREE from 'three';

export function createSimulation(scene, params) {
  const group = new THREE.Group();
  scene.add(group);

  const objects = [];
  const connections = new Map();
  const humanLinks = new Set(); // llaves de las conexiones hechas por el humano
  const history = [];

  let aiSnapshot = null;
  let humanSnapshot = null;
  let humanInterventions = 0;
  let connectionLines = null;
  let nextId = 0;

  // ESTADO DE LA DERIVA
  let clock = 0;
  let lastElapsed = 0;
  let lastActivity = 0;
  let aiActive = false;   // la IA solo empieza a ordenar despues de GENERATE
  let paused = false;     // congelado mientras comparas AI RESULT / YOUR VERSION
  let drift = 0;          // 0 = el humano esta actuando, 1 = la maquina ordena
  let avgCare = 0;
  let slotTimer = 0;

  // LA HIPOTESIS ABIERTA: cada vuelta puede terminar distinto
  let outcome = 'PLAIN';   // PLAIN (la maquina borra) | SURVIVES (la figura sobrevive) | BLOOM (el orden es hermoso)
  let authorsOn = false;   // mostrando quien decidio cada objeto

  const delta = new THREE.Vector3();

  const geometries = [
    new THREE.IcosahedronGeometry(1, 2),
    new THREE.BoxGeometry(1.5, 1.5, 1.5),
    new THREE.TorusGeometry(0.75, 0.22, 16, 48),
    new THREE.OctahedronGeometry(1, 1),
    new THREE.ConeGeometry(0.85, 1.6, 5),
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.TetrahedronGeometry(1, 0),
    new THREE.SphereGeometry(0.85, 32, 24),
    new THREE.TorusKnotGeometry(0.55, 0.16, 80, 12)
  ];

  const colors = [
    0x9b70ff, 0x69c9ff, 0xff91d5, 0xffd782,
    0xb9e8ff, 0x8d8bff, 0x8ce5c2, 0xff967c
  ];

  const baseColors = colors.map(color => new THREE.Color(color));
  const neutralColor = new THREE.Color(0x77758f);
  const baseHues = baseColors.map(color => color.getHSL({}).h);

  const materials = colors.map(color =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.23,
      metalness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.12
    })
  );

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomPosition(range = params.spaceSize) {
    return new THREE.Vector3(
      random(-range, range),
      random(-range * 0.65, range * 0.65),
      random(-2, 2)
    );
  }

  // ---------- CUIDADO Y ACTIVIDAD ----------

  function markActivity() {
    lastActivity = clock;
    paused = false;
  }

  function touchObject(object, amount = 1) {
    if (!object) return;
    object.userData.care = Math.max(object.userData.care, amount);
    if (amount >= 0.5) object.userData.authored = true; // una decision tuya
    markActivity();
  }

  function touchAll(amount) {
    objects.forEach(object => {
      object.userData.care = Math.max(object.userData.care, amount);
      if (amount >= 0.5) object.userData.authored = true;
    });
  }

  // ---------- EFECTOS VISUALES ----------

  function removeEffectVisual(object) {
    const aura = object.getObjectByName('effect-aura');
    if (aura) {
      object.remove(aura);
      aura.geometry.dispose();
      aura.material.dispose();
    }
  }

  function applyEffectVisual(object, effect, settings = {}) {
    removeEffectVisual(object);

    const intensity = settings.intensity ?? 1;
    const color = new THREE.Color(settings.color || '#8d65ff');

    object.userData.effect = effect;
    object.userData.effectColor = color.getHex();
    object.userData.effectIntensity = intensity;
    object.userData.effectSpeed = settings.speed ?? 1;

    const material = object.material;
    material.emissive.set(0x000000);
    material.emissiveIntensity = 0;
    material.metalness = 0.25;
    material.roughness = 0.23;
    material.wireframe = false;

    if (effect === 'NONE') {
      object.userData.effect = 'NONE';
      return;
    }

    if (effect === 'CHROME') {
      material.color.set(0xb9c8df);
      material.metalness = 1;
      material.roughness = Math.max(0.04, 0.25 - intensity * 0.1);
      material.clearcoat = 1;
      return;
    }

    if (effect === 'OUTLINE') {
      material.color.set(color);
      material.wireframe = true;
      material.emissive.set(color);
      material.emissiveIntensity = 0.3 * intensity;
      return;
    }

    if (effect === 'GLITCH') {
      material.color.set(color);
      material.emissive.set(color);
      material.emissiveIntensity = 0.65 * intensity;
      return;
    }

    if (effect === 'FIRE') {
      material.color.set(0xff6a16);
      material.emissive.set(0xff3b05);
      material.emissiveIntensity = 1.5 * intensity;
    } else if (effect === 'NEON') {
      material.color.set(color);
      material.emissive.set(color);
      material.emissiveIntensity = 1.25 * intensity;
    } else if (effect === 'GLOW') {
      material.color.set(color);
      material.emissive.set(color);
      material.emissiveIntensity = 0.8 * intensity;
    }

    const auraColor = effect === 'FIRE' ? 0xff5a12 : color;
    const auraMaterial = new THREE.MeshBasicMaterial({
      color: auraColor,
      transparent: true,
      opacity: effect === 'FIRE' ? 0.22 : 0.18,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const aura = new THREE.Mesh(object.geometry, auraMaterial);
    aura.name = 'effect-aura';
    aura.scale.setScalar(effect === 'NEON' ? 1.24 : effect === 'FIRE' ? 1.18 : 1.15);
    object.add(aura);
  }

  // ---------- OBJETOS Y CONEXIONES ----------

  function createObject(position = randomPosition()) {
    const geometry = geometries[Math.floor(Math.random() * geometries.length)];
    const colorIndex = Math.floor(Math.random() * materials.length);
    const material = materials[colorIndex].clone();
    const mesh = new THREE.Mesh(geometry, material);
    const scale = random(0.13, 0.34);

    mesh.scale.setScalar(scale);
    mesh.position.copy(position);
    mesh.rotation.set(random(0, Math.PI), random(0, Math.PI), random(0, Math.PI));

    mesh.userData = {
      id: nextId++,
      target: position.clone(),
      moving: false,
      baseScale: scale,
      rotationSpeed: random(0.001, 0.006),
      phase: random(0, Math.PI * 2),
      colorIndex,
      effect: 'NONE',
      effectColor: 0x8d65ff,
      effectIntensity: 1,
      effectSpeed: 1,

      // AGENTE
      care: 0,                 // cuanta atencion humana tiene (0 a 1)
      effectiveCare: 0,
      fade: 0,                 // cuanto se ha apagado su color
      held: false,             // el humano lo esta arrastrando
      authored: false,         // alguna vez lo decidio una mano
      yielded: 0,              // cuanto lo movio la maquina (segundos ponderados)
      velocity: new THREE.Vector3(),
      slot: position.clone()   // su lugar en el orden de la IA
    };

    group.add(mesh);
    objects.push(mesh);
    return mesh;
  }

  function createElements() {
    for (let i = 0; i < params.elementCount; i++) createObject();
  }

  function connectionKey(a, b) {
    return [a.userData.id, b.userData.id].sort((x, y) => x - y).join('-');
  }

  function clearConnections() {
    connections.clear();
    humanLinks.clear();
  }

  function linkCount(object) {
    let count = 0;
    for (const pair of connections.values()) {
      if (pair.includes(object)) count++;
    }
    return count;
  }

  function rebuildConnections() {
    if (connectionLines) {
      group.remove(connectionLines);
      connectionLines.geometry.dispose();
      connectionLines.material.dispose();
      connectionLines = null;
    }

    const positions = [];

    for (const [a, b] of connections.values()) {
      if (!a.parent || !b.parent) continue;
      positions.push(a.position.x, a.position.y, a.position.z);
      positions.push(b.position.x, b.position.y, b.position.z);
    }

    if (!positions.length) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    connectionLines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xb99aff,
        transparent: true,
        opacity: 0.7
      })
    );

    group.add(connectionLines);
  }

  // Devuelve false si no se pudo crear (limite de relaciones por objeto)
  function connectObjects(a, b) {
    if (!a || !b || a === b) return false;

    const key = connectionKey(a, b);

    if (connections.has(key)) {
      connections.delete(key);
      humanLinks.delete(key);
    } else {
      if (linkCount(a) >= params.maxConnections || linkCount(b) >= params.maxConnections) {
        return false;
      }
      connections.set(key, [a, b]);
      humanLinks.add(key);
      touchObject(a);
      touchObject(b);
    }

    rebuildConnections();
    return true;
  }

  function removeObject(object) {
    if (!object) return;

    group.remove(object);

    for (const [key, pair] of connections.entries()) {
      if (pair.includes(object)) {
        connections.delete(key);
        humanLinks.delete(key);
      }
    }

    const index = objects.indexOf(object);
    if (index !== -1) objects.splice(index, 1);

    rebuildConnections();
  }

  function moveObject(object, position) {
    if (!object) return;
    object.position.copy(position);
    object.userData.target.copy(position);
    object.userData.moving = false;
    touchObject(object);
    rebuildConnections();
  }

  function repairObject(object) {
    if (!object) return;

    object.rotation.set(0, 0, 0);
    object.scale.setScalar(object.userData.baseScale);

    const nearest = objects
      .filter(item => item !== object)
      .sort((a, b) => a.position.distanceTo(object.position) - b.position.distanceTo(object.position))[0];

    if (nearest) {
      const key = connectionKey(object, nearest);
      connections.set(key, [object, nearest]);
      humanLinks.add(key);
      touchObject(nearest, 0.6);
    }

    touchObject(object);
    rebuildConnections();
  }

  function applyHumanTool(object, tool) {
    if (!object) return false;

    switch (tool) {
      case 'SCALE':
        object.scale.multiplyScalar(1.25);
        if (object.scale.x > 1.15) object.scale.setScalar(0.16);
        break;

      case 'ROTATE':
        object.rotation.z += Math.PI / 4;
        object.rotation.x += Math.PI / 8;
        break;

      case 'COLOR': {
        const next = (object.userData.colorIndex + 1) % materials.length;
        object.userData.colorIndex = next;
        object.material.color.copy(materials[next].color);
        break;
      }

      case 'DUPLICATE': {
        if (objects.length >= 90) return false;

        const copy = createObject(object.position.clone().add(new THREE.Vector3(0.45, 0.35, 0.2)));
        copy.rotation.copy(object.rotation);
        copy.scale.copy(object.scale);
        copy.material.color.copy(object.material.color);
        copy.userData.colorIndex = object.userData.colorIndex;
        copy.userData.baseScale = object.userData.baseScale;
        touchObject(copy);
        break;
      }

      default:
        return false;
    }

    touchObject(object);
    humanInterventions++;
    recordHistory(tool);
    saveHumanVersion();
    return true;
  }

  function applyEffectStroke(points, settings = {}) {
    if (!points || points.length < 1) return 0;

    const effect = settings.effect || 'NEON';
    const radius = THREE.MathUtils.clamp(settings.size || 2, 0.5, 5);
    let affected = 0;

    objects.forEach(object => {
      let nearestDistance = Infinity;

      for (const point of points) {
        const distance = object.position.distanceTo(point);
        nearestDistance = Math.min(nearestDistance, distance);
      }

      if (nearestDistance > radius + object.userData.baseScale) return;

      applyEffectVisual(object, effect, settings);
      touchObject(object);
      affected++;
    });

    if (affected) {
      humanInterventions++;
      recordHistory(`${effect} BRUSH`);
      saveHumanVersion();
    }

    return affected;
  }

  function alignObjects() {
    if (objects.length < 2) return;

    const columns = Math.ceil(Math.sqrt(objects.length));
    const spacing = 1.25;
    const rows = Math.ceil(objects.length / columns);

    objects.forEach((object, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);

      object.userData.target.set(
        (column - (columns - 1) / 2) * spacing,
        ((rows - 1) / 2 - row) * spacing,
        random(-0.2, 0.2)
      );
      object.userData.moving = true;
    });

    // Ordenar todo de un clic casi no cuenta como cuidado
    touchAll(0.2);
    humanInterventions++;
    recordHistory('ALIGN');
    saveHumanVersion();
  }

  // ---------- HISTORIAL Y SNAPSHOTS ----------

  function createSnapshot(label) {
    return {
      label,
      objects: objects.map(object => ({
        id: object.userData.id,
        position: (object.userData.moving ? object.userData.target : object.position).toArray(),
        rotation: object.rotation.toArray(),
        scale: object.scale.toArray(),
        color: object.material.color.getHex(),
        colorIndex: object.userData.colorIndex,
        care: object.userData.care,
        effect: object.userData.effect || 'NONE',
        effectColor: object.userData.effectColor || 0x8d65ff,
        effectIntensity: object.userData.effectIntensity ?? 1,
        effectSpeed: object.userData.effectSpeed ?? 1
      })),
      connections: Array.from(connections.values()).map(([a, b]) => [a.userData.id, b.userData.id])
    };
  }

  function recordHistory(label) {
    markActivity();

    const snapshot = createSnapshot(label);

    history.unshift({
      label,
      elements: objects.length,
      links: connections.size,
      interventions: humanInterventions,
      snapshot
    });

    if (history.length > 20) history.pop();
    return snapshot;
  }

  function saveHumanVersion() {
    humanSnapshot = createSnapshot('YOUR VERSION');
    return humanSnapshot;
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) return;

    const byId = new Map(objects.map(object => [object.userData.id, object]));

    snapshot.objects.forEach(data => {
      const object = byId.get(data.id);
      if (!object) return;

      object.position.fromArray(data.position);
      object.userData.target.fromArray(data.position);
      object.userData.moving = false;
      object.userData.held = false;
      object.userData.care = data.care ?? 0;
      object.userData.fade = 0;
      object.userData.velocity.set(0, 0, 0);
      object.rotation.fromArray(data.rotation);
      object.scale.fromArray(data.scale);
      object.material.color.setHex(data.color);
      object.userData.colorIndex = data.colorIndex ?? 0;
      applyEffectVisual(object, data.effect || 'NONE', {
        color: `#${(data.effectColor || 0x8d65ff).toString(16).padStart(6, '0')}`,
        intensity: data.effectIntensity ?? 1,
        speed: data.effectSpeed ?? 1
      });
    });

    objects.slice().forEach(object => {
      if (!snapshot.objects.some(data => data.id === object.userData.id)) {
        group.remove(object);
        objects.splice(objects.indexOf(object), 1);
      }
    });

    snapshot.objects.forEach(data => {
      if (byId.has(data.id)) return;

      const object = createObject(new THREE.Vector3(...data.position));
      object.userData.id = data.id;
      object.userData.care = data.care ?? 0;
      object.rotation.fromArray(data.rotation);
      object.scale.fromArray(data.scale);
      object.material.color.setHex(data.color);
      object.userData.colorIndex = data.colorIndex ?? 0;

      applyEffectVisual(object, data.effect || 'NONE', {
        color: `#${(data.effectColor || 0x8d65ff).toString(16).padStart(6, '0')}`,
        intensity: data.effectIntensity ?? 1,
        speed: data.effectSpeed ?? 1
      });
    });

    clearConnections();

    const restored = new Map(objects.map(object => [object.userData.id, object]));
    snapshot.connections.forEach(([aId, bId]) => {
      const a = restored.get(aId);
      const b = restored.get(bId);
      if (a && b) connections.set(connectionKey(a, b), [a, b]);
    });

    rebuildConnections();
  }

  function showAIResult() {
    if (!aiSnapshot) return;
    restoreSnapshot(aiSnapshot);
    paused = true;
  }

  function showHumanVersion() {
    if (!humanSnapshot) return;
    restoreSnapshot(humanSnapshot);
    paused = true;
  }

  function getComparisonStatus() {
    return {
      hasAI: Boolean(aiSnapshot),
      hasHuman: Boolean(humanSnapshot),
      interventions: humanInterventions
    };
  }

  function getDriftStats() {
    return { care: avgCare, drift, active: aiActive };
  }

  // ---------- COMPOSICIONES ----------

  function drawComposition(points) {
    if (!points || points.length < 2 || objects.length === 0) return false;

    const curve = new THREE.CatmullRomCurve3(points);
    const sampled = curve.getPoints(Math.max(objects.length - 1, 1));

    objects.forEach((object, index) => {
      const point = sampled[index] || sampled[sampled.length - 1];

      object.userData.target.copy(point).add(new THREE.Vector3(
        random(-0.1, 0.1), random(-0.1, 0.1), random(-0.35, 0.35)
      ));

      object.userData.moving = true;
      object.rotation.set(random(-0.5, 0.5), random(-0.5, 0.5), random(-0.5, 0.5));

      if (index % 9 === 0) {
        object.userData.target.x += random(-0.55, 0.55);
        object.userData.target.y += random(-0.55, 0.55);
      }
    });

    clearConnections();
    rebuildConnections();
    touchAll(1);
    humanInterventions++;
    recordHistory('DRAWN BY HUMAN');
    saveHumanVersion();
    return true;
  }

  // La IA no usa el pincel de efectos ni las herramientas humanas.
  function generateFailure(prompt = '') {
    const text = prompt.toLowerCase();
    const mode = Math.floor(Math.random() * 4);

    aiActive = true;
    revealAuthorship(false);

    objects.forEach((object, index) => {
      let target;

      if (mode === 0) {
        const angle = (index / objects.length) * Math.PI * 2;
        target = new THREE.Vector3(Math.cos(angle) * 3.3, Math.sin(angle) * 3.3, random(-1.2, 1.2));
      } else if (mode === 1) {
        target = new THREE.Vector3(random(-1.2, 1.2), random(-5, 5), random(-1, 1));
      } else if (mode === 2) {
        const side = index % 2 === 0 ? -1 : 1;
        target = new THREE.Vector3(side * random(1, 4), random(-3, 3), random(-1, 1));
      } else {
        target = randomPosition(4);
      }

      if (text.includes('symmetry') || text.includes('simetr')) {
        target.x += index % 2 === 0 ? 1.1 : -1.1;
      }

      object.userData.target.copy(target);
      object.userData.moving = true;
      object.userData.care = 0;
      object.userData.fade = 0;
      object.userData.authored = false;
      object.userData.yielded = 0;
      object.userData.velocity.set(0, 0, 0);
      object.rotation.set(random(-2, 2), random(-2, 2), random(-2, 2));
      object.scale.setScalar(object.userData.baseScale * random(0.65, 1.7));
    });

    clearConnections();

    for (let i = 0; i < Math.floor(objects.length * 0.36); i++) {
      const a = objects[Math.floor(Math.random() * objects.length)];
      const b = objects[Math.floor(Math.random() * objects.length)];
      if (a !== b) connections.set(connectionKey(a, b), [a, b]);
    }

    rebuildConnections();
    aiSnapshot = createSnapshot('AI RESULT');
    humanSnapshot = createSnapshot('YOUR VERSION');
    recordHistory('AI RESULT');

    return aiSnapshot;
  }

  function arrangeObjects(style = 'orbit') {
    const count = objects.length;

    objects.forEach((object, index) => {
      let target;

      if (style === 'grid') {
        const columns = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / columns);
        target = new THREE.Vector3(
          (index % columns - (columns - 1) / 2) * 1.25,
          ((rows - 1) / 2 - Math.floor(index / columns)) * 1.1,
          random(-0.4, 0.4)
        );
      } else {
        const angle = (index / count) * Math.PI * 2;
        const radius = 3.3 + (index % 3) * 0.65;
        target = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.7, random(-0.7, 0.7));
      }

      object.userData.target.copy(target);
      object.userData.moving = true;
    });

    rebuildConnections();
  }

  function quickAction(action) {
    if (action === 'scatter') {
      objects.forEach(object => {
        object.userData.target.copy(randomPosition(4.5));
        object.userData.moving = true;
      });
    }

    if (action === 'orbit') arrangeObjects('orbit');
    if (action === 'grid') arrangeObjects('grid');

    if (action === 'spiral') {
      objects.forEach((object, index) => {
        const angle = index * 2.399;
        const radius = 0.55 * Math.sqrt(index);
        object.userData.target.set(Math.cos(angle) * radius, Math.sin(angle) * radius, random(-0.8, 0.8));
        object.userData.moving = true;
      });
    }

    // Un experimento de un clic cuenta menos que trabajar objeto por objeto
    touchAll(0.35);
    humanInterventions++;
    rebuildConnections();
    recordHistory(action.toUpperCase());
    saveHumanVersion();
  }

  function reset() {
    revealAuthorship(false);

    objects.forEach(object => {
      object.position.copy(randomPosition());
      object.userData.target.copy(object.position);
      object.userData.moving = false;
      object.userData.held = false;
      object.userData.care = 0;
      object.userData.fade = 0;
      object.userData.authored = false;
      object.userData.yielded = 0;
      object.userData.velocity.set(0, 0, 0);
      object.rotation.set(random(0, 2), random(0, 2), random(0, 2));
      object.scale.setScalar(object.userData.baseScale);
      applyEffectVisual(object, 'NONE');
      object.material.color.copy(baseColors[object.userData.colorIndex] || baseColors[0]);
    });

    clearConnections();
    history.length = 0;
    humanInterventions = 0;
    aiSnapshot = null;
    aiActive = false;
    paused = false;
    drift = 0;
    avgCare = 0;
    humanSnapshot = createSnapshot('YOUR VERSION');

    rebuildConnections();
    recordHistory('NEW BEGINNING');
  }

  // ---------- LA HIPOTESIS ABIERTA ----------

  // PLAIN: la maquina borra lo que nadie cuida (la tesis comoda)
  // SURVIVES: la figura de la mano sobrevive, sostenida por sus conexiones
  // BLOOM: el orden de la maquina resulta hermoso
  // Congela la obra tal como esta (para mostrar el final sin que la maquina siga ordenando)
  function freeze() {
    paused = true;
  }

  function setOutcome(name) {
    outcome = ['PLAIN', 'SURVIVES', 'BLOOM'].includes(name) ? name : 'PLAIN';
    slotTimer = 0;
  }

  // cuanto protege una relacion humana contra la IA, segun el desenlace
  function shieldValue() {
    if (outcome === 'SURVIVES') return params.survivorShield;
    if (outcome === 'BLOOM') return params.linkShield * (1 - drift); // la belleza suelta la figura
    return params.linkShield;
  }

  // ---------- QUIEN DECIDIO ----------
  // HAND: lo decidiste tu y nadie lo movio.
  // SHARED: lo pusiste tu, pero despues lo movio la maquina.
  // MACHINE: nunca lo decidio una mano.

  const authorColors = { HAND: 0xffd9a0, SHARED: 0x7fe3c2, MACHINE: 0xc9b6ff };

  function authorOf(object) {
    const u = object.userData;
    if (!u.authored) return 'MACHINE';
    return u.yielded > 1.5 ? 'SHARED' : 'HAND';
  }

  function getAuthorshipCounts() {
    const counts = { HAND: 0, SHARED: 0, MACHINE: 0 };
    objects.forEach(object => counts[authorOf(object)]++);
    return counts;
  }

  function revealAuthorship(on) {
    authorsOn = Boolean(on);

    objects.forEach(object => {
      const old = object.getObjectByName('author-halo');
      if (old) {
        object.remove(old);
        old.material.dispose(); // la geometria es compartida: no se libera
      }
    });

    if (!authorsOn) return null;

    objects.forEach(object => {
      const halo = new THREE.Mesh(
        object.geometry,
        new THREE.MeshBasicMaterial({
          color: authorColors[authorOf(object)],
          transparent: true,
          opacity: 0.5,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      halo.name = 'author-halo';
      halo.scale.setScalar(1.6);
      object.add(halo);
    });

    return getAuthorshipCounts();
  }

  // ---------- AGENTES: reglas locales y deriva ----------

  // PLAIN: la IA "ordena" en filas, de arriba a abajo, de izquierda a derecha.
  function assignGridSlots() {
    const count = objects.length;
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const spacing = 1.25;

    const byHeight = objects.slice().sort((a, b) => b.position.y - a.position.y);

    for (let row = 0; row < rows; row++) {
      const rowObjects = byHeight
        .slice(row * columns, (row + 1) * columns)
        .sort((a, b) => a.position.x - b.position.x);

      const offset = (columns - rowObjects.length) / 2;

      rowObjects.forEach((object, i) => {
        object.userData.slot.set(
          (i + offset - (columns - 1) / 2) * spacing,
          ((rows - 1) / 2 - row) * spacing,
          0
        );
      });
    }
  }

  // SURVIVES: la cuadricula se acomoda alrededor de lo que sobrevive.
  function assignGridAroundSurvivors() {
    const kept = objects.filter(object => object.userData.effectiveCare >= 0.5);
    const open = objects.filter(object => object.userData.effectiveCare < 0.5);

    if (!kept.length) {
      assignGridSlots();
      return;
    }

    kept.forEach(object => object.userData.slot.copy(object.position));

    const spacing = 1.25;
    let cells = [];

    for (let rows = 4; rows < 14; rows++) {
      const columns = Math.ceil(rows * 1.5);
      cells = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          const cell = new THREE.Vector3(
            (c - (columns - 1) / 2) * spacing,
            ((rows - 1) / 2 - r) * spacing,
            0
          );

          const free = kept.every(object =>
            Math.hypot(object.position.x - cell.x, object.position.y - cell.y) > 0.95
          );

          if (free) cells.push(cell);
        }
      }

      if (cells.length >= open.length) break;
    }

    open
      .slice()
      .sort((a, b) => b.position.y - a.position.y || a.position.x - b.position.x)
      .forEach(object => {
        let best = 0;
        let bestDistance = Infinity;

        cells.forEach((cell, i) => {
          const distance = cell.distanceToSquared(object.position);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
          }
        });

        object.userData.slot.copy(cells[best] || object.position);
        cells.splice(best, 1);
      });
  }

  // BLOOM: la IA no ordena en filas: ordena como una flor.
  // Espiral aurea, de centro a borde segun el matiz del color.
  function assignBloomSlots() {
    const spin = clock * 0.08;

    objects
      .slice()
      .sort((a, b) => baseHues[a.userData.colorIndex] - baseHues[b.userData.colorIndex])
      .forEach((object, i) => {
        const angle = i * 2.399963 + spin;
        const radius = 0.62 * Math.sqrt(i + 1);

        object.userData.slot.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * 0.85,
          Math.sin(i * 0.7) * 0.25
        );
      });
  }

  function assignSlots() {
    if (!objects.length) return;

    if (outcome === 'BLOOM') assignBloomSlots();
    else if (outcome === 'SURVIVES') assignGridAroundSurvivors();
    else assignGridSlots();
  }

  function stepAgents(dt) {
    if (!objects.length) {
      avgCare = 0;
      return;
    }

    // Quienes estan protegidos por una relacion hecha por el humano
    const linked = new Set();
    for (const [key, pair] of connections.entries()) {
      if (humanLinks.has(key)) {
        linked.add(pair[0]);
        linked.add(pair[1]);
      }
    }

    objects.forEach(object => object.userData.velocity.set(0, 0, 0));

    // 1. SEPARACION: los objetos no se montan unos sobre otros
    const minDist = params.separationDistance;

    for (let i = 0; i < objects.length; i++) {
      const a = objects[i];
      if (a.userData.moving) continue;

      for (let j = i + 1; j < objects.length; j++) {
        const b = objects[j];
        if (b.userData.moving) continue;

        delta.copy(a.position).sub(b.position);
        const dist = delta.length();
        if (dist >= minDist) continue;

        if (dist < 1e-4) delta.set(random(-1, 1), random(-1, 1), 0).normalize();
        else delta.divideScalar(dist);

        const push = (minDist - dist) * params.separationStrength;
        a.userData.velocity.addScaledVector(delta, push);
        b.userData.velocity.addScaledVector(delta, -push);
      }
    }

    // 2. RELACIONES: las conexiones humanas tiran de los objetos si se estiran
    for (const [key, pair] of connections.entries()) {
      if (!humanLinks.has(key)) continue;

      const [a, b] = pair;
      if (!a.parent || !b.parent) continue;

      delta.copy(b.position).sub(a.position);
      const dist = delta.length();
      if (dist <= params.linkLength) continue;

      const hold = outcome === 'BLOOM' ? 1 - drift : 1; // la belleza suelta las relaciones
      delta.multiplyScalar(((dist - params.linkLength) * params.linkStrength * hold) / dist);

      if (!a.userData.moving) a.userData.velocity.add(delta);
      if (!b.userData.moving) b.userData.velocity.sub(delta);
    }

    // 3. LA DERIVA: la IA lleva al orden lo que nadie cuida
    if (drift > 0) {
      slotTimer -= dt;
      if (slotTimer <= 0) {
        assignSlots();
        slotTimer = 0.6;
      }
    } else {
      slotTimer = 0;
    }

    let careSum = 0;

    objects.forEach(object => {
      const u = object.userData;
      const effective = Math.max(u.care, linked.has(object) ? shieldValue() : 0);
      u.effectiveCare = effective;
      careSum += effective;

      const openness = drift * (1 - effective);
      u.yielded += openness * dt; // cuanto la maquina decidio por ti

      if (drift > 0) {
        // tu cuidado se olvida mientras no haces nada
        const decay = params.careDecay * (outcome === 'BLOOM' ? 4 : 1);
        u.care = Math.max(0, u.care - decay * drift * dt);

        if (!u.moving && !u.held) {
          delta.copy(u.slot).sub(object.position);
          const pull = params.aiPull * (outcome === 'BLOOM' ? params.bloomPull : 1);
          u.velocity.addScaledVector(delta, pull * openness);
        }

        // la IA tambien endereza lo que estaba torcido
        object.rotation.z -= object.rotation.z * Math.min(1, 0.8 * openness * dt);
      }

      // 4. VISUAL: lo que cuidas brilla, lo que nadie cuida se apaga
      const fadeTarget = outcome === 'BLOOM' ? 0 : openness * params.fadeAmount;
      u.fade += (fadeTarget - u.fade) * Math.min(1, dt * 3);

      if (u.effect === 'NONE') {
        const material = object.material;
        material.color
          .copy(baseColors[u.colorIndex] || baseColors[0])
          .lerp(neutralColor, u.fade);
        material.emissive.copy(material.color);
        const glow = params.glowAmount * effective;
        material.emissiveIntensity = outcome === 'BLOOM'
          ? Math.max(glow, params.bloomGlow * drift)
          : glow;
      }
    });

    avgCare = careSum / objects.length;

    // 5. MOVIMIENTO
    objects.forEach(object => {
      const u = object.userData;
      if (u.moving || u.held) return;

      const speed = u.velocity.length();
      if (speed < 1e-5) return;
      if (speed > params.maxSpeed) u.velocity.multiplyScalar(params.maxSpeed / speed);

      object.position.addScaledVector(u.velocity, dt);
      u.target.copy(object.position);
    });
  }

  function update(elapsed = 0) {
    const dt = Math.min(Math.max(elapsed - lastElapsed, 0), 0.05);
    lastElapsed = elapsed;
    clock = elapsed;

    // mientras arrastras, la maquina espera
    if (objects.some(object => object.userData.held)) markActivity();

    const idle = clock - lastActivity;

    drift = aiActive && !paused
      ? THREE.MathUtils.smoothstep(idle, params.graceSeconds, params.graceSeconds + params.rampSeconds)
      : 0;

    if (!paused) stepAgents(dt);

    objects.forEach(object => {
      if (object.userData.moving) {
        object.position.lerp(object.userData.target, params.autoMoveSpeed);

        if (object.position.distanceTo(object.userData.target) < 0.025) {
          object.position.copy(object.userData.target);
          object.userData.moving = false;
        }
      }

      object.rotation.y += object.userData.rotationSpeed;
      object.rotation.x += object.userData.rotationSpeed * 0.5;

      const effect = object.userData.effect;
      const speed = object.userData.effectSpeed || 1;
      const intensity = object.userData.effectIntensity || 1;
      const aura = object.getObjectByName('effect-aura');

      if (authorsOn) {
        const halo = object.getObjectByName('author-halo');
        if (halo) halo.material.opacity = 0.5 + Math.sin(elapsed * 2.2 + object.userData.phase) * 0.15;
      }

      if (effect === 'FIRE') {
        const flicker = 1 + Math.sin(elapsed * 13 * speed + object.userData.phase) * 0.12 * intensity;
        object.material.emissiveIntensity = 1.5 * intensity * flicker;
        if (aura) {
          aura.scale.setScalar(1.15 + Math.sin(elapsed * 10 * speed + object.userData.phase) * 0.12);
          aura.material.opacity = 0.14 + Math.abs(Math.sin(elapsed * 12 * speed + object.userData.phase)) * 0.16;
        }
      } else if (effect === 'NEON' || effect === 'GLOW') {
        const pulse = 0.8 + Math.sin(elapsed * 3 * speed + object.userData.phase) * 0.2;
        object.material.emissiveIntensity = (effect === 'NEON' ? 1.25 : 0.8) * intensity * pulse;
        if (aura) aura.material.opacity = 0.12 + pulse * 0.12;
      } else if (effect === 'GLITCH') {
        const glitch = Math.sin(elapsed * 22 * speed + object.userData.phase);
        object.position.x += glitch * 0.002 * intensity;
        object.material.emissiveIntensity = 0.45 + Math.abs(glitch) * intensity;
      }
    });

    if (connectionLines) {
      const positions = connectionLines.geometry.attributes.position;
      let index = 0;

      connectionLines.material.opacity = outcome === 'BLOOM' ? 0.7 * (1 - 0.9 * drift) : 0.7;

      for (const [a, b] of connections.values()) {
        if (!a.parent || !b.parent) continue;
        positions.setXYZ(index++, a.position.x, a.position.y, a.position.z);
        positions.setXYZ(index++, b.position.x, b.position.y, b.position.z);
      }

      positions.needsUpdate = true;
    }
  }

  createElements();
  humanSnapshot = createSnapshot('YOUR VERSION');
  recordHistory('NEW BEGINNING');

  return {
    objects,
    update,
    reset,
    generateFailure,
    moveObject,
    touchObject,
    connectObjects,
    removeObject,
    repairObject,
    rebuildConnections,
    recordHistory,
    saveHumanVersion,
    getHistory: () => history,
    showAIResult,
    showHumanVersion,
    getComparisonStatus,
    getDriftStats,
    quickAction,
    drawComposition,
    applyHumanTool,
    applyEffectStroke,
    alignObjects,
    setOutcome,
    freeze,
    revealAuthorship,
    getAuthorshipCounts,
    countIntervention: () => humanInterventions++
  };
}