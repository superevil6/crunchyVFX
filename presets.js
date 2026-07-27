"use strict";
// CrunchyVFX preset library — data only, no logic. Every preset is a PARTIAL patch: applyPreset
// resets every param to its PARAMS default first, then overlays these keys. So only list what
// the effect actually needs, and never rely on a default staying put.
//
// Categories mirror the CrunchySFX preset browser so the two apps read as siblings.

window.PRESETS = {
  // ---------- Explosions ----------
  // NOTE on the burst presets: a small emitRadius + a few frames of emitTime matter more than
  // they look. Spawning 200 additive sprites on one pixel clamps straight to white for the first
  // few frames; spreading births over a small disc and a couple of frames keeps the colour.
  "Explosion": {
    shape: 0, emitter: 0, count: 220, emitRadius: 0.04, emitTime: 0.06,
    speed: 330, speedVar: 0.55, drag: 0.5,
    gravity: 180, life: 0.5, lifeVar: 0.4, size: 22, sizeVar: 0.5, grow: -0.7,
    fadeOut: 0.6, hue: 32, hueLife: -34, hueVar: 0.06, coreWhite: 0.6, opacity: 0.85,
    flash: 0.85, flashSize: 0.36, flashLife: 0.08, wave: 0.45, waveSpeed: 0.9, waveLife: 0.35,
    glow: 0.45, glowRadius: 10, duration: 0.8, fps: 24,
  },
  "Big Boom": {
    shape: 0, emitter: 0, count: 420, emitRadius: 0.06, emitTime: 0.08,
    speed: 380, speedVar: 0.6, drag: 0.55,
    gravity: 140, turb: 0.25, life: 0.75, lifeVar: 0.45, size: 30, sizeVar: 0.6, grow: -0.5,
    fadeOut: 0.65, hue: 26, hueLife: -30, coreWhite: 0.65, opacity: 0.8,
    flash: 0.9, flashSize: 0.44, flashLife: 0.1, flashRays: 6,
    wave: 0.6, waveSpeed: 1, waveLife: 0.5,
    shots: 3, shotDelay: 0.1, shotScale: 0.62, shotSpread: 0.45,
    glow: 0.6, glowRadius: 14, duration: 1.2, fps: 24, frameSize: 5,
  },
  "Shockwave": {
    shape: 0, count: 1, opacity: 0, wave: 1, waveSpeed: 0.9, waveWidth: 0.14,
    waveLife: 0.5, waveSquash: 0.55, hue: 200, sat: 0.4, coreWhite: 0.8,
    glow: 0.5, glowRadius: 8, duration: 0.55, fps: 24,
  },
  "Fire Jet": {
    shape: 5, emitter: 1, count: 260, emitAngle: 0, emitSpread: 26, emitTime: 1, emitRadius: 0.03,
    speed: 210, speedVar: 0.5, drag: 0.35, gravity: -90, turb: 0.4, turbScale: 3, turbSpeed: 1.6,
    life: 0.55, lifeVar: 0.4, size: 26, sizeVar: 0.4, grow: 0.5, fadeIn: 0.12, fadeOut: 0.7,
    hue: 40, hueLife: -46, coreWhite: 0.65, smokeSoft: 0.7,
    originY: 0.8, glow: 0.4, duration: 1.4, fps: 24, loopBlend: 0.5,
  },

  // ---------- Impacts ----------
  "Hit Spark": {
    shape: 1, emitter: 0, count: 26, speed: 520, speedVar: 0.5, drag: 0.75,
    life: 0.18, lifeVar: 0.4, size: 13, sizeVar: 0.5, grow: -0.85, fadeOut: 0.7,
    sparkLen: 0.85, sparkTaper: 0.75, hue: 48, hueLife: -20, coreWhite: 0.9,
    flash: 0.7, flashSize: 0.32, flashLife: 0.07,
    glow: 0.4, duration: 0.3, fps: 30, frameSize: 3,
  },
  "Muzzle Flash": {
    shape: 1, emitter: 1, count: 18, emitAngle: 90, emitSpread: 44,
    speed: 620, speedVar: 0.5, drag: 0.85, life: 0.12, size: 12, grow: -0.9, fadeOut: 0.8,
    sparkLen: 0.9, hue: 44, hueLife: -22, coreWhite: 0.95,
    flash: 1, flashSize: 0.42, flashLife: 0.06, flashRays: 4,
    glow: 0.55, duration: 0.18, fps: 30, frameSize: 3,
  },
  "Dust Kick": {
    shape: 5, emitter: 4, count: 40, emitRadius: 0.22, emitAngle: 0, emitSpread: 80,
    speed: 90, speedVar: 0.7, drag: 0.7, gravity: -30, life: 0.7, lifeVar: 0.4,
    size: 26, sizeVar: 0.5, grow: 0.7, fadeIn: 0.15, fadeOut: 0.75,
    hue: 38, hueLife: 0, sat: 0.22, bright: 0.75, coreWhite: 0, blend: 1, opacity: 0.7,
    smokeSoft: 0.85, originY: 0.72, duration: 0.9, fps: 24,
  },
  "Blood Splat": {
    shape: 6, emitter: 1, count: 46, emitAngle: 45, emitSpread: 110,
    speed: 380, speedVar: 0.7, drag: 0.35, gravity: 900, spin: 220, spinVar: 1,
    life: 0.6, lifeVar: 0.5, size: 9, sizeVar: 0.7, grow: -0.3, fadeOut: 0.35,
    shardSides: 3, shardRatio: 0.8, hue: 355, hueLife: -14, sat: 0.9, bright: 0.8,
    coreWhite: 0.1, blend: 1, alphaCut: 0.5, duration: 0.8, fps: 24,
  },

  // ---------- Magic ----------
  "Magic Sparkle": {
    shape: 3, emitter: 3, count: 70, emitRadius: 0.16, emitTime: 0.7,
    speed: 70, speedVar: 0.8, drag: 0.4, gravity: -60, swirl: 120, spin: 180, spinVar: 1,
    life: 0.8, lifeVar: 0.5, size: 11, sizeVar: 0.6, grow: -0.4, fadeIn: 0.2, fadeOut: 0.6,
    starPoints: 4, starInner: 0.24, hue: 288, hueLife: 48, hueVar: 0.2, coreWhite: 0.7,
    glow: 0.5, glowRadius: 8, duration: 1.2, fps: 24,
  },
  "Aura Loop": {
    shape: 0, emitter: 2, count: 120, emitRadius: 0.3, emitTime: 1,
    speed: 40, speedVar: 0.6, drag: 0.5, gravity: -110, swirl: 90,
    life: 1, lifeVar: 0.3, size: 14, sizeVar: 0.5, grow: -0.5, fadeIn: 0.25, fadeOut: 0.5,
    hue: 190, hueLife: 30, sat: 0.75, coreWhite: 0.6,
    glow: 0.5, duration: 1.6, fps: 24, loopBlend: 0.8,
  },
  "Lightning Zap": {
    shape: 7, emitter: 0, count: 14, speed: 260, speedVar: 0.8, drag: 0.6,
    life: 0.16, lifeVar: 0.5, size: 44, sizeVar: 0.5, grow: -0.2, fadeOut: 0.5,
    spin: 0, boltSegs: 10, boltJitter: 0.55, boltBranch: 0.35,
    hue: 205, hueLife: 55, sat: 0.7, coreWhite: 0.95,
    flash: 0.55, flashSize: 0.35, flashLife: 0.06,
    glow: 0.7, glowRadius: 10, duration: 0.35, fps: 30,
  },
  "Heal Rise": {
    shape: 3, emitter: 4, count: 34, emitRadius: 0.24, emitTime: 0.85,
    speed: 60, speedVar: 0.5, drag: 0.3, gravity: -220, swirl: 40,
    life: 1, lifeVar: 0.35, size: 12, sizeVar: 0.4, grow: -0.5, fadeIn: 0.25, fadeOut: 0.5,
    starPoints: 4, starInner: 0.3, hue: 130, hueLife: 26, sat: 0.8, coreWhite: 0.6,
    originY: 0.82, glow: 0.45, duration: 1.4, fps: 24,
  },

  // ---------- Pickups ----------
  "Coin Pickup": {
    shape: 3, emitter: 0, count: 14, speed: 200, speedVar: 0.5, drag: 0.5,
    gravity: 620, spin: 420, spinVar: 0.8,
    life: 0.6, lifeVar: 0.3, size: 12, sizeVar: 0.3, grow: -0.3, fadeOut: 0.4,
    starPoints: 5, starInner: 0.42, hue: 46, hueLife: -10, sat: 1, coreWhite: 0.55,
    flash: 0.5, flashSize: 0.3, flashLife: 0.1,
    glow: 0.4, duration: 0.7, fps: 24, frameSize: 3,
  },
  "Pixel Burst": {
    shape: 4, emitter: 0, count: 90, speed: 260, speedVar: 0.5, drag: 0.55,
    gravity: 260, life: 0.45, lifeVar: 0.35, size: 9, sizeVar: 0.4, grow: -0.6, fadeOut: 0.5,
    hue: 285, hueLife: 60, hueVar: 0.25, sat: 1, coreWhite: 0.4,
    pixelate: 4, posterize: 6, alphaCut: 0.5, outline: 1, outlineTone: 0.05,
    duration: 0.6, fps: 12, frameSize: 3,
  },

  // ---------- Ice / frost ----------
  "Ice Blast": {
    shape: 6, emitter: 0, count: 60, emitRadius: 0.05, speed: 300, speedVar: 0.6, drag: 0.62,
    gravity: 90, spin: 160, spinVar: 1,
    life: 0.55, lifeVar: 0.45, size: 15, sizeVar: 0.6, grow: -0.5, fadeOut: 0.55,
    shardSides: 4, shardRatio: 0.55, hue: 186, hueLife: 16, sat: 0.5, coreWhite: 0.85,
    flash: 0.7, flashSize: 0.3, flashLife: 0.08,
    wave: 0.4, waveSpeed: 0.8, waveWidth: 0.12, waveLife: 0.35,
    glow: 0.45, glowRadius: 8, duration: 0.75, fps: 24,
  },
  "Frost Nova": {
    shape: 14, emitter: 2, count: 34, emitRadius: 0.08, speed: 130, speedVar: 0.5, drag: 0.55,
    spin: 70, spinVar: 0.8,
    life: 0.95, lifeVar: 0.35, size: 20, sizeVar: 0.5, grow: -0.35, fadeIn: 0.08, fadeOut: 0.5,
    flakeArms: 6, flakeBranch: 0.6, hue: 190, hueLife: 12, sat: 0.42, coreWhite: 0.9,
    wave: 0.75, waveSpeed: 0.95, waveWidth: 0.1, waveLife: 0.55, waveSquash: 0.5,
    glow: 0.5, glowRadius: 9, duration: 1.1, fps: 24, frameSize: 5,
  },
  "Ember Rise": {
    shape: 0, emitter: 3, count: 90, emitRadius: 0.14, emitTime: 1,
    speed: 45, speedVar: 0.7, drag: 0.45, gravity: -110, turb: 0.28, turbScale: 2.5, turbSpeed: 0.8,
    life: 1.3, lifeVar: 0.5, size: 8, sizeVar: 0.6, grow: -0.4, fadeIn: 0.15, fadeOut: 0.55,
    hue: 22, hueLife: -14, hueVar: 0.1, coreWhite: 0.45,
    originY: 0.85, glow: 0.5, duration: 1.8, fps: 24, loopBlend: 0.7,
  },

  // ---------- Structures (growth / beam / ribbon layers, not particles) ----------
  "Frost Growth": {
    shape: 0, count: 1, opacity: 0,
    growth: 1, growSeeds: 5, growBranch: 0.75, growAngle: 34, growLen: 0.42, growWidth: 2.4,
    growTaper: 0.3, growTime: 0.75,
    hue: 190, hueLife: 14, sat: 0.45, bright: 1, coreWhite: 0.9,
    glow: 0.4, glowRadius: 7, duration: 1.3, fps: 24, frameSize: 5,
  },
  "Cracks": {
    shape: 0, count: 1, opacity: 0,
    growth: 1, growSeeds: 2, growBranch: 0.55, growAngle: 22, growLen: 0.5, growWidth: 2.6,
    growTaper: 0.5, growTime: 0.45, growDir: 180, growSpread: 60,
    hue: 26, sat: 0.18, bright: 0.92, coreWhite: 0.2, blend: 1,
    duration: 1.0, fps: 24, frameSize: 5,
  },
  "Laser": {
    shape: 0, count: 1, opacity: 0,
    beam: 1, beamLen: 0.95, beamWidth: 14, beamAngle: 90, beamTaper: 0.25, beamCore: 0.8,
    beamScroll: 3, beamGrow: 0.18, beamFlicker: 0.4,
    hue: 0, hueLife: 16, sat: 1, bright: 1, coreWhite: 0.9,
    flash: 0.5, flashSize: 0.22, flashLife: 0.1,
    glow: 0.6, glowRadius: 9, duration: 0.8, fps: 30, frameSize: 5,
  },
  "Magic Bolt": {
    shape: 0, count: 1, opacity: 0,
    beam: 1, beamLen: 0.7, beamWidth: 22, beamAngle: 45, beamTaper: 0.7, beamCore: 0.6,
    beamScroll: 6, beamGrow: 0.35, beamFlicker: 0.8,
    hue: 280, hueLife: 30, sat: 0.9, bright: 1, coreWhite: 0.8,
    glow: 0.55, duration: 0.9, fps: 30, frameSize: 5,
  },
  "Sword Slash": {
    shape: 0, count: 1, opacity: 0,
    ribbon: 1, ribbonArc: 0.42, ribbonRadius: 0.32, ribbonWidth: 20, ribbonTaper: 1.2,
    ribbonSpin: 200, ribbonSweep: 0.35, ribbonTrail: 0.5,
    hue: 200, hueLife: 20, sat: 0.22, bright: 1, coreWhite: 0.9,
    glow: 0.55, duration: 0.6, fps: 30, frameSize: 5,
  },
  "Comet Arc": {
    shape: 0, count: 1, opacity: 0,
    ribbon: 1, ribbonArc: 0.8, ribbonRadius: 0.34, ribbonWidth: 10, ribbonTaper: 2.2,
    ribbonSweep: 0.85, ribbonTrail: 0.35,
    hue: 35, hueLife: -20, sat: 1, bright: 1, coreWhite: 0.6,
    glow: 0.5, duration: 1.2, fps: 24, frameSize: 5,
  },

  "Portal": {
    shape: 0, count: 1, opacity: 0,
    vortex: 1, vortexRings: 5, vortexRadius: 0.34, vortexWidth: 7, vortexSpin: 150,
    vortexSquash: 0.65, vortexScroll: 0.35, vortexGap: 0.5,
    hue: 280, hueLife: 40, sat: 0.85, bright: 1, coreWhite: 0.6,
    glow: 0.5, glowRadius: 9, duration: 1.6, fps: 24, frameSize: 5, loopBlend: 0.7,
  },
  "Summon Circle": {
    shape: 0, count: 1, opacity: 0,
    vortex: 1, vortexRings: 3, vortexRadius: 0.4, vortexWidth: 4, vortexSpin: -90,
    vortexSquash: 0.85, vortexScroll: 0, vortexGap: 0.7,
    hue: 45, hueLife: 10, sat: 0.9, bright: 1, coreWhite: 0.5,
    glow: 0.45, duration: 1.6, fps: 24, frameSize: 5, loopBlend: 0.8,
  },
  "Chain Lightning": {
    shape: 0, count: 1, opacity: 0,
    arc: 1, arcToX: 0.9, arcToY: 0.2, arcWidth: 2.5, arcJitter: 0.6, arcSegs: 16,
    arcBranch: 0.5, arcRate: 14, arcLife: 0.7,
    hue: 205, hueLife: 45, sat: 0.65, bright: 1, coreWhite: 0.95,
    flash: 0.4, flashSize: 0.2, flashLife: 0.08,
    glow: 0.6, glowRadius: 9, duration: 0.8, fps: 30, frameSize: 5,
  },
  "Teleport Out": {
    shape: 3, emitter: 3, count: 60, emitRadius: 0.2, emitTime: 0.3,
    speed: 40, drag: 0.5, gravity: -140, life: 0.7, lifeVar: 0.4,
    size: 10, sizeVar: 0.5, grow: -0.4, fadeIn: 0.1, fadeOut: 0.5,
    starPoints: 4, starInner: 0.3, hue: 265, hueLife: 40, sat: 0.85, coreWhite: 0.8,
    dissolve: 1, dissolveScale: 5, dissolveEdge: 0.5, dissolveTime: 0.9,
    glow: 0.5, duration: 1.0, fps: 24, frameSize: 5,
  },

  "Glass Shatter": {
    shape: 0, count: 1, opacity: 0,
    shatter: 1, shatterPieces: 18, shatterRadius: 0.22, shatterSpeed: 200, shatterSpin: 260,
    shatterGravity: 500, shatterHold: 0.12, shatterFade: 0.45,
    hue: 195, hueLife: 10, sat: 0.35, bright: 1, coreWhite: 0.8,
    glow: 0.35, duration: 1.0, fps: 24, frameSize: 5,
  },
  "Ice Shatter": {
    shape: 0, count: 1, opacity: 0,
    shatter: 1, shatterPieces: 9, shatterRadius: 0.26, shatterSpeed: 110, shatterSpin: 120,
    shatterGravity: 250, shatterHold: 0.3, shatterFade: 0.4,
    hue: 188, hueLife: 12, sat: 0.5, bright: 1, coreWhite: 0.9,
    glow: 0.45, duration: 1.2, fps: 24, frameSize: 5,
  },
  "Impact Lines": {
    shape: 0, count: 1, opacity: 0,
    lines: 1, lineCount: 20, lineInner: 0.16, lineOuter: 0.5, lineWidth: 4, lineTaper: 0.85,
    lineJitter: 0.5, lineLife: 0.4,
    hue: 45, hueLife: -18, sat: 0.5, bright: 1, coreWhite: 0.9,
    flash: 0.5, flashSize: 0.2, flashLife: 0.08,
    glow: 0.4, duration: 0.5, fps: 30, frameSize: 5,
  },
  "Slime Blob": {
    shape: 0, emitter: 3, count: 26, emitRadius: 0.1, size: 34, sizeVar: 0.4,
    speed: 120, speedVar: 0.6, drag: 0.5, gravity: -40,
    life: 1.0, lifeVar: 0.3, grow: -0.2, fadeIn: 0.1, fadeOut: 0.4,
    hue: 100, hueLife: -18, sat: 0.9, bright: 0.95, coreWhite: 0.1, blend: 1, opacity: 0.9,
    merge: 1, mergeThreshold: 0.4, mergeSmooth: 6,
    duration: 1.2, fps: 24, frameSize: 5,
  },

  "Firework": {
    shape: 0, emitter: 0, count: 26, size: 7, sizeVar: 0.4, speed: 300, speedVar: 0.5,
    drag: 0.45, gravity: 220, life: 1.0, lifeVar: 0.3, grow: -0.4, fadeOut: 0.5,
    hue: 45, hueLife: -40, hueVar: 0.15, coreWhite: 0.8,
    pathTrail: 1, pathLen: 18, pathWidth: 2.5, pathTaper: 0.85, pathFade: 0.6,
    flash: 0.6, flashSize: 0.2, flashLife: 0.08,
    glow: 0.5, glowRadius: 9, duration: 1.3, fps: 24, frameSize: 5,
  },
  "Water Ripple": {
    shape: 0, count: 1, opacity: 0,
    ripple: 1, rippleCount: 4, rippleSpeed: 0.9, rippleWidth: 3, rippleSquash: 0.7, rippleLife: 1.0,
    hue: 200, hueLife: -10, sat: 0.6, bright: 0.95, coreWhite: 0.5,
    glow: 0.35, duration: 1.4, fps: 24, frameSize: 5, loopBlend: 0.9,
  },
  "Sonar Ping": {
    shape: 0, count: 1, opacity: 0,
    ripple: 1, rippleCount: 2, rippleSpeed: 1.2, rippleWidth: 2, rippleLife: 0.7,
    hue: 130, hueLife: 15, sat: 0.9, bright: 1, coreWhite: 0.6,
    glow: 0.5, duration: 1.4, fps: 24, frameSize: 5, loopBlend: 0.9,
  },
  "Glitch Out": {
    shape: 4, emitter: 0, count: 70, size: 10, speed: 200, speedVar: 0.6, drag: 0.5,
    life: 0.5, lifeVar: 0.4, grow: -0.4, fadeOut: 0.5,
    hue: 300, hueLife: 70, hueVar: 0.3, sat: 1, coreWhite: 0.4,
    glitch: 1, glitchSlices: 8, glitchShift: 0.1, glitchRGB: 0.9, glitchRate: 12,
    pixelate: 3, duration: 0.8, fps: 20, frameSize: 5,
  },

  // ---------- More impacts ----------
  "Slash": {
    shape: 13, emitter: 0, count: 2, speed: 110, drag: 0.85,
    life: 0.22, lifeVar: 0.2, size: 78, sizeVar: 0.15, grow: 0.5, fadeOut: 0.6,
    spin: 190, angle: 200, angleVar: 0, crescentArc: 0.34, crescentThick: 0.13,
    hue: 200, hueLife: 20, sat: 0.22, coreWhite: 0.92,
    glow: 0.55, glowRadius: 8, duration: 0.3, fps: 30,
  },
  "Critical Hit": {
    shape: 11, emitter: 0, count: 10, speed: 330, speedVar: 0.5, drag: 0.75,
    spin: 220, spinVar: 0.6,
    life: 0.3, lifeVar: 0.35, size: 24, sizeVar: 0.5, grow: -0.65, fadeOut: 0.6,
    crossArms: 4, crossThin: 0.11, hue: 46, hueLife: -14, sat: 1, coreWhite: 0.8,
    flash: 0.8, flashSize: 0.34, flashLife: 0.08, flashRays: 4,
    glow: 0.55, duration: 0.45, fps: 30, frameSize: 3,
  },
  "Ground Slam": {
    shape: 5, emitter: 4, count: 60, emitRadius: 0.3, emitAngle: 0, emitSpread: 120,
    speed: 150, speedVar: 0.7, drag: 0.68, gravity: -40,
    life: 0.8, lifeVar: 0.4, size: 30, sizeVar: 0.5, grow: 0.8, fadeIn: 0.1, fadeOut: 0.7,
    hue: 34, sat: 0.28, bright: 0.72, coreWhite: 0, blend: 1, opacity: 0.75, smokeSoft: 0.85,
    wave: 0.7, waveSpeed: 1, waveWidth: 0.16, waveLife: 0.4, waveSquash: 0.8,
    originY: 0.74, duration: 1, fps: 24, frameSize: 5,
  },

  // ---------- More magic ----------
  "Poison Cloud": {
    shape: 15, emitter: 3, count: 22, emitRadius: 0.12, emitTime: 0.5,
    speed: 42, speedVar: 0.8, drag: 0.62, gravity: -55, turb: 0.3, turbScale: 2, turbSpeed: 0.5,
    spin: 40, spinVar: 1,
    life: 1.6, lifeVar: 0.4, size: 24, sizeVar: 0.5, grow: 0.5, fadeIn: 0.25, fadeOut: 0.65,
    blobLobes: 5, blobRough: 0.6, hue: 96, hueLife: -22, sat: 0.75, bright: 0.8,
    coreWhite: 0.1, blend: 1, opacity: 0.42,
    duration: 2, fps: 20, loopBlend: 0.6,
  },
  "Summon Swirl": {
    shape: 17, emitter: 2, count: 26, emitRadius: 0.34, emitTime: 0.6,
    speed: 30, drag: 0.45, radial: -180, swirl: 260, spin: 220, spinVar: 0.5,
    life: 0.9, lifeVar: 0.3, size: 26, sizeVar: 0.4, grow: -0.5, fadeIn: 0.2, fadeOut: 0.55,
    spiralTurns: 1.8, spiralThick: 0.1, hue: 278, hueLife: 44, hueVar: 0.15, coreWhite: 0.7,
    glow: 0.6, glowRadius: 9, duration: 1.3, fps: 24,
  },
  "Teleport": {
    shape: 0, emitter: 2, count: 130, emitRadius: 0.4, speed: 20,
    drag: 0.25, radial: -700, swirl: 200,
    life: 0.5, lifeVar: 0.3, size: 12, sizeVar: 0.5, grow: -0.5, fadeIn: 0.1, fadeOut: 0.45,
    hue: 265, hueLife: 55, sat: 0.85, coreWhite: 0.75,
    flash: 0.6, flashSize: 0.24, flashLife: 0.1,
    glow: 0.6, glowRadius: 10, duration: 0.6, fps: 30,
  },

  // ---------- Charm & celebration ----------
  "Charm Hearts": {
    shape: 10, emitter: 3, count: 16, emitRadius: 0.14, emitTime: 0.75,
    speed: 55, speedVar: 0.6, drag: 0.35, gravity: -180, swirl: 60,
    life: 1.1, lifeVar: 0.3, size: 18, sizeVar: 0.35, grow: -0.25, fadeIn: 0.15, fadeOut: 0.45,
    hue: 336, hueLife: 24, hueVar: 0.06, sat: 0.68, bright: 0.95, coreWhite: 0.45,
    blend: 1, outline: 1, outlineTone: 0.08,
    originY: 0.7, duration: 1.5, fps: 24,
  },
  "Level Up": {
    shape: 11, emitter: 4, count: 26, emitRadius: 0.26, emitTime: 0.5,
    speed: 90, speedVar: 0.6, drag: 0.3, gravity: -320,
    life: 0.9, lifeVar: 0.35, size: 20, sizeVar: 0.5, grow: -0.45, fadeIn: 0.12, fadeOut: 0.5,
    crossArms: 4, crossThin: 0.13, hue: 48, hueLife: 10, sat: 0.55, coreWhite: 0.85,
    flash: 0.6, flashSize: 0.4, flashLife: 0.14,
    originY: 0.8, glow: 0.55, duration: 1.3, fps: 24, frameSize: 5,
  },
  "Confetti": {
    shape: 12, emitter: 1, count: 70, emitAngle: 0, emitSpread: 90,
    speed: 340, speedVar: 0.6, drag: 0.42, gravity: 480, spin: 400, spinVar: 1,
    life: 1.2, lifeVar: 0.45, size: 11, sizeVar: 0.4, grow: 0, fadeOut: 0.25,
    hue: 0, hueLife: 120, hueVar: 0.95, sat: 0.9, bright: 0.95, coreWhite: 0,
    blend: 1, alphaCut: 0.5, originY: 0.72, duration: 1.5, fps: 24, frameSize: 5,
  },
  "Twinkle": {
    shape: 11, emitter: 3, count: 9, emitRadius: 0.3, emitTime: 0.8,
    speed: 10, drag: 0.7, spin: 40,
    life: 0.75, lifeVar: 0.4, size: 22, sizeVar: 0.45, grow: -0.2, fadeIn: 0.35, fadeOut: 0.55,
    alphaCurve: 0.4, crossArms: 4, crossThin: 0.08,
    hue: 52, hueLife: 8, sat: 0.35, coreWhite: 0.9,
    glow: 0.5, duration: 1.2, fps: 24,
  },

  // ---------- Emotes ----------
  // The glyph shape means an emote is just a one-particle effect with a character in it.
  "Emote Pop": {
    // angleVar 0 keeps the glyph UPRIGHT. At the default of 1 the single particle takes a random
    // start rotation, which for most seeds renders the "!" tilted or upside down.
    shape: 18, glyph: "!", emitter: 0, count: 1, emitSpread: 0, angleVar: 0, speed: 95, drag: 0.88,
    life: 0.9, size: 46, sizeVar: 0, grow: 0.06, fadeIn: 0.07, fadeOut: 0.2, alphaCurve: 0.5,
    hue: 48, sat: 0.95, bright: 1, coreWhite: 0.35, blend: 1,
    outline: 2, outlineTone: 0.04, originY: 0.62, duration: 0.9, fps: 24, frameSize: 3,
  },
  "Emoji Burst": {
    // angleVar must come down with it: it defaults to 1 (fully random start rotation), which
    // swamps `angle` entirely — setting the angle alone changes nothing you can see.
    shape: 18, glyph: "✨", glyphTint: 0, emitter: 0, count: 12, angleVar: 0,
    speed: 210, speedVar: 0.6, drag: 0.45, gravity: 340, spin: 130, spinVar: 1,
    life: 0.8, lifeVar: 0.35, size: 26, sizeVar: 0.4, grow: -0.2, fadeOut: 0.35,
    blend: 1, duration: 1, fps: 24, frameSize: 4,
  },

  // ---------- Weather ----------
  "Rain": {
    shape: 16, emitter: 4, count: 90, emitRadius: 0.55, emitAngle: 190, emitSpread: 6, emitTime: 1,
    speed: 520, speedVar: 0.25, drag: 0, gravity: 420,
    life: 1.1, lifeVar: 0.2, size: 11, sizeVar: 0.4, grow: 0, fadeIn: 0.06, fadeOut: 0.12,
    dropTail: 0.92, hue: 206, hueLife: -8, sat: 0.6, bright: 0.85, coreWhite: 0.25,
    blend: 1, opacity: 0.62, originY: 0.02, duration: 1.1, fps: 24, loopBlend: 0.9,
  },
  "Snow": {
    shape: 14, emitter: 4, count: 55, emitRadius: 0.55, emitAngle: 190, emitSpread: 40, emitTime: 1,
    speed: 55, speedVar: 0.6, drag: 0.35, gravity: 55,
    turb: 0.4, turbScale: 2, turbSpeed: 0.5, spin: 55, spinVar: 1,
    life: 2.2, lifeVar: 0.25, size: 11, sizeVar: 0.5, grow: 0, fadeIn: 0.1, fadeOut: 0.2,
    flakeArms: 6, flakeBranch: 0.55, hue: 195, sat: 0.2, coreWhite: 0.85,
    blend: 1, opacity: 0.85, originY: 0.02, duration: 2.2, fps: 20, loopBlend: 0.9,
  },
  "Fireflies": {
    shape: 0, emitter: 6, count: 22, emitRadius: 0.4, emitTime: 1,
    speed: 22, speedVar: 0.9, drag: 0.55, turb: 0.5, turbScale: 1.6, turbSpeed: 0.35,
    life: 2, lifeVar: 0.4, size: 9, sizeVar: 0.5, grow: -0.1, fadeIn: 0.3, fadeOut: 0.4,
    alphaCurve: 0.3, hue: 72, hueLife: -12, hueVar: 0.1, sat: 0.85, coreWhite: 0.55,
    glow: 0.65, glowRadius: 10, duration: 2.4, fps: 20, loopBlend: 0.9,
  },

  // ---------- Ambient ----------
  "Water Splash": {
    shape: 16, emitter: 1, count: 44, emitAngle: 0, emitSpread: 100,
    speed: 300, speedVar: 0.65, drag: 0.2, gravity: 780, spin: 120, spinVar: 1,
    life: 0.75, lifeVar: 0.4, size: 12, sizeVar: 0.55, grow: -0.2, fadeOut: 0.3,
    dropTail: 0.7, hue: 202, hueLife: -10, sat: 0.62, bright: 0.9, coreWhite: 0.45,
    blend: 1, opacity: 0.8, originY: 0.72, duration: 0.9, fps: 24,
  },
  "Steam": {
    shape: 5, emitter: 1, count: 34, emitAngle: 0, emitSpread: 24, emitRadius: 0.06, emitTime: 1,
    speed: 70, speedVar: 0.5, drag: 0.45, gravity: -95, turb: 0.28, turbScale: 2.2, turbSpeed: 0.6,
    life: 1.5, lifeVar: 0.35, size: 26, sizeVar: 0.45, grow: 0.85, fadeIn: 0.25, fadeOut: 0.65,
    hue: 200, sat: 0.07, bright: 0.85, coreWhite: 0, blend: 1, opacity: 0.4, smokeSoft: 0.9,
    originY: 0.82, duration: 1.8, fps: 20, loopBlend: 0.7,
  },
  "Smoke Puff": {
    shape: 5, emitter: 3, count: 30, emitRadius: 0.1,
    speed: 55, speedVar: 0.7, drag: 0.6, gravity: -70, turb: 0.2, turbScale: 2.5,
    life: 1.2, lifeVar: 0.4, size: 40, sizeVar: 0.5, grow: 0.9, fadeIn: 0.2, fadeOut: 0.7,
    hue: 220, sat: 0.1, bright: 0.7, coreWhite: 0, blend: 1, opacity: 0.55,
    smokeSoft: 0.9, duration: 1.5, fps: 20,
  },
  // ---- Sigil ----
  "Rune Circle": {
    shape: 0, count: 1, opacity: 0,
    sigil: 1, sigilRings: 3, sigilRadius: 0.36, sigilSpin: 55, sigilGap: 0.55,
    sigilTicks: 16, sigilSpokes: 6, sigilWidth: 2, sigilGrow: 0.3, sigilLife: 2,
    hue: 265, hueLife: 20, sat: 0.85, bright: 1, coreWhite: 0.35,
    glow: 0.5, glowRadius: 8, duration: 2, fps: 24, frameSize: 5, loopBlend: 0.6,
  },
  "Summon Seal": {
    shape: 0, count: 40, opacity: 0.7, emitter: 2, emitRadius: 0.3, emitTime: 0.8,
    speed: 30, gravity: -90, drag: 0.4, size: 5, sizeVar: 0.6, life: 0.9, lifeVar: 0.4,
    fadeIn: 0.15, fadeOut: 0.6,
    sigil: 1, sigilRings: 4, sigilRadius: 0.42, sigilSpin: -40, sigilGap: 0.65,
    sigilTicks: 24, sigilSpokes: 0, sigilWidth: 2.5, sigilSquash: 0.8, sigilGrow: 0.35,
    sigilLife: 2.2,
    hue: 40, hueLife: 15, sat: 0.95, bright: 1, coreWhite: 0.5,
    glow: 0.55, glowRadius: 10, duration: 2.2, fps: 24, frameSize: 5,
  },

  // ---- Orbit ----
  "Shield Orbit": {
    shape: 0, count: 1, opacity: 0,
    orbit: 1, orbitCount: 6, orbitRadius: 0.32, orbitSpeed: 0.9, orbitTilt: 0.65,
    orbitAngle: 0, orbitSize: 10, orbitDepth: 0.7, orbitTrail: 0.35,
    hue: 195, hueLife: 15, sat: 0.85, bright: 1, coreWhite: 0.45,
    glow: 0.5, glowRadius: 8, duration: 1.6, fps: 24, frameSize: 5, loopBlend: 0.7,
  },
  "Power Rings": {
    shape: 0, count: 1, opacity: 0,
    orbit: 1, orbitCount: 14, orbitRadius: 0.38, orbitSpeed: -1.4, orbitTilt: 0.85,
    orbitAngle: 25, orbitSize: 6, orbitDepth: 0.85, orbitTrail: 0.6, orbitScatter: 0.15,
    sigil: 0.55, sigilRings: 1, sigilRadius: 0.4, sigilSpin: 30, sigilGap: 0.7,
    sigilTicks: 0, sigilWidth: 1.5, sigilSquash: 0.85, sigilGrow: 0.2, sigilLife: 1.8,
    hue: 285, hueLife: 40, sat: 0.9, bright: 1, coreWhite: 0.4,
    glow: 0.6, glowRadius: 10, duration: 1.8, fps: 24, frameSize: 5, loopBlend: 0.7,
  },

  // ---- Tumble ----
  "Confetti Toss": {
    shape: 0, count: 1, opacity: 0,
    tumble: 1, tumbleCount: 60, tumbleSize: 7, tumbleAspect: 1.8, tumbleSpread: 0.45,
    tumbleFall: 0.9, tumbleDrift: 0.5, tumbleFlip: 1.8, tumbleRoll: 200, tumbleStagger: 0.6,
    ramp: "0,0,0.95,0.6,1,1|0.3,50,0.95,0.6,1,1|0.6,140,0.9,0.55,1,1|1,215,0.9,0.6,1,1",
    hueVar: 1, sat: 0.95, bright: 1, coreWhite: 0, blend: 1,
    duration: 1.8, fps: 24, frameSize: 5,
  },
  "Leaf Fall": {
    shape: 0, count: 1, opacity: 0,
    tumble: 1, tumbleCount: 22, tumbleSize: 11, tumbleAspect: 0.7, tumbleSpread: 0.55,
    tumbleFall: 0.35, tumbleDrift: 0.9, tumbleFlip: 0.7, tumbleRoll: 70, tumbleStagger: 0.85,
    ramp: "0,28,0.85,0.45,1,1|0.5,38,0.8,0.5,1,1|1,18,0.75,0.38,1,1",
    sat: 0.8, bright: 0.9, coreWhite: 0, blend: 1,
    duration: 2.4, fps: 20, frameSize: 5,
  },
  // ---- Web ----
  "Constellation": {
    shape: 3, count: 26, opacity: 0.9, emitter: 3, emitRadius: 0.34, emitTime: 0,
    speed: 14, speedVar: 0.8, drag: 0.55, gravity: 0, size: 5, sizeVar: 0.7,
    life: 2.4, lifeVar: 0.2, fadeIn: 0.15, fadeOut: 0.3, starPoints: 4, starInner: 0.35,
    web: 1, webReach: 0.26, webWidth: 1,
    hue: 205, hueLife: 25, sat: 0.6, bright: 1, coreWhite: 0.5,
    glow: 0.4, glowRadius: 6, duration: 2.4, fps: 24, frameSize: 5, loopBlend: 0.6,
  },
  "Nano Swarm": {
    shape: 4, count: 60, opacity: 0.85, emitter: 3, emitRadius: 0.3, emitTime: 0.3,
    speed: 55, speedVar: 0.9, drag: 0.3, turb: 0.4, turbSpeed: 1.4,
    size: 3, sizeVar: 0.5, life: 1.2, lifeVar: 0.4, fadeIn: 0.1, fadeOut: 0.4,
    web: 0.8, webReach: 0.14, webWidth: 0.8,
    hue: 150, hueLife: 30, sat: 0.9, bright: 1, coreWhite: 0.3,
    glow: 0.45, duration: 1.6, fps: 24, frameSize: 5,
  },

  // ---- Rift ----
  "Dimension Tear": {
    shape: 0, count: 30, opacity: 0.7, emitter: 0, emitRadius: 0.06, emitTime: 0.5,
    speed: 90, speedVar: 0.8, drag: 0.4, size: 5, sizeVar: 0.6, life: 0.7, fadeOut: 0.6,
    rift: 1, riftWidth: 0.2, riftHeight: 0.82, riftJagged: 0.5, riftCore: 0.7,
    riftOpen: 0.18, riftClose: 0.28, riftFlicker: 14, riftLife: 1.4,
    hue: 285, hueLife: 35, sat: 0.9, bright: 1, coreWhite: 0.5,
    glow: 0.6, glowRadius: 9, duration: 1.4, fps: 24, frameSize: 5,
  },
  "Slash Gash": {
    shape: 0, count: 1, opacity: 0,
    rift: 1, riftWidth: 0.1, riftHeight: 1.0, riftAngle: 62, riftJagged: 0.7, riftCore: 0.85,
    riftOpen: 0.1, riftClose: 0.5, riftFlicker: 20, riftLife: 0.6,
    hue: 8, hueLife: 20, sat: 0.95, bright: 1, coreWhite: 0.7,
    glow: 0.55, glowRadius: 7, duration: 0.6, fps: 24, frameSize: 5,
  },

  // ---- Haze ----
  "Heat Shimmer": {
    shape: 5, count: 55, opacity: 0.5, emitter: 4, emitRadius: 0.22, emitTime: 1,
    emitAngle: 270, emitSpread: 44, speed: 78, speedVar: 0.5, drag: 0.35, gravity: -60,
    size: 22, sizeVar: 0.6, grow: 0.5, life: 1.3, lifeVar: 0.4, fadeIn: 0.25, fadeOut: 0.6,
    smokeSoft: 0.9, blend: 1,
    haze: 1, hazeAmount: 0.7, hazeScale: 2.4, hazeSpeed: 1.4,
    hue: 24, hueLife: -12, sat: 0.55, bright: 0.9, coreWhite: 0.2,
    duration: 1.8, fps: 24, frameSize: 5, loopBlend: 0.7, originY: 0.75,
  },
  // ---- Trails (motion streak + frame echo) ----
  "Comet Trail": {
    shape: 0, count: 9, opacity: 1, emitter: 1, emitAngle: 205, emitSpread: 16,
    speed: 165, speedVar: 0.25, drag: 0.3, gravity: 60, size: 9, sizeVar: 0.4,
    life: 0.85, lifeVar: 0.2, fadeIn: 0.04, fadeOut: 0.55, grow: -0.3,
    trail: 0.9, echo: 0.4, echoDecay: 0.74,
    hue: 195, hueLife: 45, sat: 0.8, bright: 1, coreWhite: 0.6,
    glow: 0.5, glowRadius: 7, duration: 1, fps: 24, frameSize: 5, originX: 0.7, originY: 0.3,
  },
  "Neon Streaks": {
    shape: 1, count: 22, opacity: 1, emitter: 4, emitAngle: 90, emitSpread: 10,
    speed: 130, speedVar: 0.4, drag: 0.3, size: 13, sizeVar: 0.5, emitRadius: 0.26,
    life: 0.7, lifeVar: 0.35, fadeIn: 0.05, fadeOut: 0.5, sparkLen: 0.9, sparkTaper: 0.85,
    trail: 0.8, echo: 0.65, echoDecay: 0.82,
    hue: 310, hueLife: 60, sat: 1, bright: 1, coreWhite: 0.5,
    glow: 0.65, glowRadius: 9, duration: 0.9, fps: 24, frameSize: 5,
  },

  // ---- Bubble (speech balloon) ----
  "Speech Pop": {
    shape: 0, count: 1, opacity: 0,
    bubble: 1, bubbleText: "?!", bubbleSize: 0.72, bubbleLife: 1.1, bubblePop: 0.75,
    bubbleTail: 0.6, bubbleRound: 0.6, bubbleOutline: 2.5, bubbleY: 0.34,
    hue: 45, sat: 0.9, bright: 1, blend: 1,
    duration: 1.2, fps: 24, frameSize: 5,
  },
  "Damage Number": {
    shape: 0, count: 1, opacity: 0,
    bubble: 1, bubbleText: "-24", bubbleSize: 0.55, bubbleLife: 0.9, bubblePop: 0.5,
    bubbleTail: 0, bubbleRound: 0.25, bubbleOutline: 2, bubbleY: 0.55,
    hue: 0, sat: 0.9, bright: 1, blend: 1,
    duration: 1, fps: 24, frameSize: 5,
  },

  // ---- Sub-emitter (particles that spawn children) ----
  "Split Shot": {
    shape: 0, count: 14, opacity: 1, emitter: 0, emitSpread: 360,
    speed: 125, speedVar: 0.3, drag: 0.45, gravity: 190, size: 9, sizeVar: 0.3,
    life: 0.45, lifeVar: 0.15, fadeOut: 0.4,
    subCount: 8, subSpeed: 110, subLife: 0.45, subSize: 0.5, subSpread: 360, subInherit: 0.3,
    hue: 38, hueLife: -30, sat: 0.95, bright: 1, coreWhite: 0.6,
    glow: 0.5, duration: 1, fps: 24, frameSize: 5,
  },
  "Spark Shower": {
    shape: 1, count: 12, opacity: 1, emitter: 1, emitAngle: 272, emitSpread: 40,
    speed: 115, speedVar: 0.2, drag: 0.3, gravity: 340, size: 12, sizeVar: 0.3,
    life: 0.6, lifeVar: 0.2, fadeOut: 0.5, sparkLen: 0.55, sparkTaper: 0.7,
    subCount: 8, subSpeed: 70, subLife: 0.45, subSize: 0.5, subSpread: 200, subInherit: 0.4,
    hue: 48, hueLife: -34, sat: 1, bright: 1, coreWhite: 0.7,
    glow: 0.55, duration: 1.1, fps: 24, frameSize: 5, originY: 0.62,
  },

  // ---- Ground (bounce off a floor line) ----
  "Bouncing Debris": {
    shape: 6, count: 24, opacity: 1, emitter: 1, emitAngle: 288, emitSpread: 76,
    speed: 150, speedVar: 0.45, drag: 0.22, gravity: 620, spin: 260, spinVar: 1,
    size: 8, sizeVar: 0.55, life: 1.3, lifeVar: 0.25, fadeOut: 0.25,
    shardSides: 4, shardRatio: 0.9,
    bounce: 0.6, groundY: 0.84, friction: 0.3,
    hue: 28, hueLife: -10, sat: 0.55, bright: 0.85, coreWhite: 0.1, blend: 1,
    duration: 1.4, fps: 24, frameSize: 5, originY: 0.55,
  },
  "Rubble Drop": {
    shape: 4, count: 30, opacity: 1, emitter: 3, emitRadius: 0.22,
    emitAngle: 270, emitSpread: 60, speed: 35, speedVar: 0.7,
    gravity: 420, drag: 0.1, spin: 140, spinVar: 1,
    size: 9, sizeVar: 0.6, life: 1.2, lifeVar: 0.25, fadeOut: 0.2,
    bounce: 0.45, groundY: 0.86, friction: 0.5,
    hue: 32, sat: 0.4, bright: 0.8, coreWhite: 0, blend: 1,
    duration: 1.4, fps: 24, frameSize: 5, originY: 0.25,
  },

  // ---- Attractor (pull toward a point) ----
  "Vacuum Pull": {
    shape: 0, count: 120, opacity: 0.9, emitter: 2, emitRadius: 0.45, emitTime: 0.5,
    speed: 20, speedVar: 0.6, drag: 0.25, size: 6, sizeVar: 0.5,
    life: 1.2, lifeVar: 0.3, fadeIn: 0.1, fadeOut: 0.35, grow: -0.5,
    attract: 620, attractX: 0.5, attractY: 0.5, attractFalloff: 0.35,
    hue: 268, hueLife: 40, sat: 0.85, bright: 1, coreWhite: 0.45,
    glow: 0.5, duration: 1.4, fps: 24, frameSize: 5,
  },
  "Soul Drain": {
    shape: 5, count: 60, opacity: 0.85, emitter: 2, emitRadius: 0.38, emitTime: 0.7,
    speed: 22, speedVar: 0.7, drag: 0.4, turb: 0.3, turbSpeed: 0.8,
    size: 17, sizeVar: 0.6, life: 1.3, lifeVar: 0.35, fadeIn: 0.18, fadeOut: 0.45,
    smokeSoft: 0.85, grow: -0.35,
    attract: 420, attractX: 0.5, attractY: 0.3, attractFalloff: 0.6,
    hue: 160, hueLife: 30, sat: 0.75, bright: 1, coreWhite: 0.3,
    glow: 0.5, duration: 1.6, fps: 24, frameSize: 5, loopBlend: 0.4,
  },
  // ---- New shapes ----
  "Flower Bloom": {
    shape: 19, count: 16, opacity: 1, emitter: 2, emitRadius: 0.1, emitTime: 0.35,
    speed: 95, speedVar: 0.35, drag: 0.55, gravity: -30, spin: 90, spinVar: 0.8,
    size: 20, sizeVar: 0.45, grow: 0.25, life: 1.1, lifeVar: 0.3,
    fadeIn: 0.15, fadeOut: 0.45, alphaCurve: 0.3,
    flowerPetals: 5, flowerWidth: 0.34, flowerCore: 0.26,
    hue: 330, hueLife: 35, sat: 0.8, bright: 1, coreWhite: 0.3, blend: 1,
    glow: 0.35, duration: 1.4, fps: 24, frameSize: 5,
  },
  "Petal Fall": {
    shape: 19, count: 22, opacity: 0.95, emitter: 4, emitAngle: 270, emitSpread: 30,
    emitRadius: 0.34, emitTime: 1, speed: 34, speedVar: 0.6, gravity: 95, drag: 0.35,
    wind: 40, spin: 140, spinVar: 1, turb: 0.25, turbSpeed: 0.7,
    size: 13, sizeVar: 0.5, life: 1.8, lifeVar: 0.35, fadeIn: 0.12, fadeOut: 0.3,
    flowerPetals: 5, flowerWidth: 0.4, flowerCore: 0.2,
    hue: 340, hueLife: 15, sat: 0.6, bright: 1, coreWhite: 0.2, blend: 1,
    duration: 2.2, fps: 20, frameSize: 5, originY: 0.12, loopBlend: 0.5,
  },
  "Leaf Swirl": {
    shape: 20, count: 14, opacity: 1, emitter: 2, emitRadius: 0.2, emitTime: 0.7,
    speed: 26, speedVar: 0.5, drag: 0.5, swirl: 150, gravity: 45,
    spin: 200, spinVar: 1, turb: 0.25, turbSpeed: 0.9,
    size: 26, sizeVar: 0.4, life: 1.5, lifeVar: 0.3, fadeIn: 0.1, fadeOut: 0.35,
    hue: 34, hueLife: -14, sat: 0.75, bright: 0.9, coreWhite: 0, blend: 1,
    duration: 1.8, fps: 20, frameSize: 5, loopBlend: 0.55,
  },
  "Cog Burst": {
    shape: 23, count: 12, opacity: 1, emitter: 0, emitSpread: 360,
    speed: 130, speedVar: 0.4, drag: 0.45, gravity: 260, spin: 300, spinVar: 1,
    size: 17, sizeVar: 0.4, life: 1, lifeVar: 0.25, fadeOut: 0.35,
    hue: 40, hueLife: -18, sat: 0.6, bright: 0.9, coreWhite: 0.15, blend: 1,
    duration: 1.2, fps: 24, frameSize: 5,
  },
  "Shield Hex": {
    shape: 21, count: 14, opacity: 0.8, emitter: 2, emitRadius: 0.32, emitTime: 0.4,
    speed: 12, speedVar: 0.4, drag: 0.6, size: 22, sizeVar: 0.25, grow: 0.15,
    life: 1.3, lifeVar: 0.3, fadeIn: 0.2, fadeOut: 0.5,
    hue: 195, hueLife: 25, sat: 0.75, bright: 1, coreWhite: 0.5,
    glow: 0.5, glowRadius: 7, duration: 1.6, fps: 24, frameSize: 5, loopBlend: 0.6,
  },
  "Music Notes": {
    shape: 24, count: 12, opacity: 1, emitter: 4, emitAngle: 270, emitSpread: 34,
    emitRadius: 0.14, emitTime: 0.85, speed: 52, speedVar: 0.5, drag: 0.35, gravity: -22,
    wind: 22, spin: 40, spinVar: 0.7, turb: 0.2, turbSpeed: 0.8,
    size: 24, sizeVar: 0.35, life: 1.5, lifeVar: 0.3, fadeIn: 0.12, fadeOut: 0.4,
    hue: 265, hueLife: 55, sat: 0.75, bright: 1, coreWhite: 0.25, blend: 1,
    glow: 0.35, duration: 1.8, fps: 24, frameSize: 5, originY: 0.72, loopBlend: 0.5,
  },
};

// [category, [preset names…]] — the collapsible layout of the browser.
window.PRESET_CATEGORIES = [
  ["Explosions", ["Explosion", "Big Boom", "Shockwave", "Fire Jet", "Ember Rise", "Split Shot", "Spark Shower"]],
  ["Ice & Frost",["Ice Blast", "Frost Nova", "Frost Growth"]],
  ["Structures", ["Cracks", "Laser", "Magic Bolt", "Sword Slash", "Comet Arc",
                  "Portal", "Summon Circle", "Chain Lightning", "Teleport Out",
                  "Comet Trail", "Neon Streaks",
                  "Glass Shatter", "Ice Shatter", "Impact Lines", "Slime Blob",
                  "Firework", "Water Ripple", "Sonar Ping", "Glitch Out"]],
  ["Impacts",    ["Hit Spark", "Muzzle Flash", "Slash", "Critical Hit", "Ground Slam", "Dust Kick", "Blood Splat", "Slash Gash", "Bouncing Debris", "Rubble Drop", "Cog Burst"]],
  ["Magic",      ["Magic Sparkle", "Aura Loop", "Lightning Zap", "Heal Rise", "Summon Swirl", "Teleport", "Poison Cloud",
                  "Rune Circle", "Summon Seal", "Shield Orbit", "Power Rings",
                  "Dimension Tear", "Constellation", "Nano Swarm",
                  "Vacuum Pull", "Soul Drain", "Shield Hex"]],
  ["Pickups & Charm", ["Coin Pickup", "Pixel Burst", "Charm Hearts", "Level Up", "Confetti", "Twinkle", "Confetti Toss", "Flower Bloom"]],
  ["Emotes",     ["Emote Pop", "Emoji Burst", "Speech Pop", "Damage Number", "Music Notes"]],
  ["Weather",    ["Rain", "Snow", "Fireflies", "Leaf Fall", "Petal Fall", "Leaf Swirl"]],
  ["Ambient",    ["Smoke Puff", "Steam", "Water Splash", "Heat Shimmer"]],
];
