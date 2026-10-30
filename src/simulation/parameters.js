export function createParameters() {
  return {
    elementCount: 48,
    spaceSize: 11,
    autoMoveSpeed: 0.018,

    // AGENTES: reglas locales entre objetos
    separationDistance: 0.45,   // distancia minima antes de empujarse
    separationStrength: 3,      // que tan fuerte se empujan
    maxConnections: 4,          // relaciones maximas por objeto (CONNECT)
    linkLength: 1.8,            // las relaciones tiran hasta esta distancia
    linkStrength: 0.8,          // fuerza de las relaciones
    linkShield: 0.6,            // cuanto protege una relacion contra la IA (0 a 1)
    maxSpeed: 3,

    // LA DERIVA: la maquina ordena lo que nadie cuida
    graceSeconds: 6,            // segundos quieto antes de que la IA empiece a ordenar
    rampSeconds: 6,             // segundos en llegar a su maxima fuerza
    aiPull: 0.22,               // fuerza con la que la IA lleva todo a su orden
    careDecay: 0.04,            // cuanto tarda tu cuidado en olvidarse (por segundo)
    fadeAmount: 0.8,            // cuanto se apaga el color de lo que nadie cuida
    glowAmount: 0.3,            // brillo de lo que si cuidas

    // LA HIPOTESIS ABIERTA: a veces la obra contradice su propia tesis
    survivorShield: 0.97,       // si la figura de la mano sobrevive: cuanto la protegen sus relaciones
    bloomGlow: 0.45,            // si el orden de la maquina es hermoso: cuanto brilla
    bloomPull: 2.2              // que tan rapido florece ese orden (multiplica aiPull)
  };
}