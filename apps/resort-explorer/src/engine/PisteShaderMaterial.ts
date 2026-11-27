import * as THREE from 'three';

/**
 * Material de pista pisada (nieve groomed) — Endless Peaks style:
 * - Totalmente opaco con depthWrite=true
 * - Color base CLARAMENTE azul-compacto brillante, muy distinto del terreno cálido
 * - Corduroy (fresado) bien visible — estrías anchas tipo Endless Peaks
 * - 4 franjas de pasadas de pisanieves alternadas en tono
 * - Borde oscuro nítido con franja del color de dificultad (verde/azul/rojo/negro)
 * - polygonOffset agresivo para garantizar que siempre queda por encima del terreno
 */
export function createPisteCorduroyMaterial(difficultyHex: number = 0x0284c7): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    lights: false,
    polygonOffset: true,
    polygonOffsetFactor: -8.0,
    polygonOffsetUnits: -8.0,
    uniforms: {
      sunDirection:    { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      sunIntensity:    { value: 1.0 },
      sunColor:        { value: new THREE.Color(0xfffcf0) },
      skyColor:        { value: new THREE.Color(0xc8dff5) },
      fogColor:        { value: new THREE.Color(0xdce8f4) },
      fogDensity:      { value: 0.00016 },
      diffColor:       { value: new THREE.Color(difficultyHex) },
      aerialHighlight: { value: 0.0 },
    },
    vertexShader: `
      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;

      void main() {
        vUv       = uv;
        vNormal   = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 wpos = modelMatrix * vec4(position, 1.0);
        vWorldPos = wpos.xyz;
        gl_Position = projectionMatrix * viewMatrix * wpos;
      }
    `,
    fragmentShader: `
      uniform vec3  sunDirection;
      uniform float sunIntensity;
      uniform vec3  sunColor;
      uniform vec3  skyColor;
      uniform vec3  fogColor;
      uniform float fogDensity;
      uniform vec3  diffColor;
      uniform float aerialHighlight;

      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;

      float hash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                   mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }

      void main() {
        float u = vUv.x;
        float v = vUv.y;

        // ── 1. Wobble orgánico de las pasadas de pisanieves ──────────────────
        float wobble = (noise(vec2(v * 0.18, u * 1.4)) - 0.5) * 0.010;
        float uw = u + wobble;

        // ── 2. Corduroy (estrías de fresado en sierra) ───────────────────────
        // Estrías más anchas y contrastadas (28 en lugar de 42) para ser visibles como Endless Peaks
        float fw = fwidth(uw);
        float detailFade = 1.0 - smoothstep(0.012, 0.22, fw);
        float saw = abs(fract(uw * 28.0) * 2.0 - 1.0);  // 28 estrías por ancho
        float corduroy = mix(0.5, saw, detailFade);       // 0=surco oscuro, 1=cresta clara

        // ── 3. Franjas de 4 carriles alternados ──────────────────────────────
        float lane = floor(uw * 4.0);
        float laneParity = mod(lane, 2.0);
        float laneT = fract(uw * 4.0);
        float seam = smoothstep(0.04, 0.0, min(laneT, 1.0 - laneT));

        // ── 4. Borde del color de dificultad (1.5m franjas verde/azul/rojo) ──
        float edge = min(u, 1.0 - u);
        float edgeBand  = 1.0 - smoothstep(0.0,  0.055, edge); // franja de dificultad
        float edgeDark  = 1.0 - smoothstep(0.055, 0.12, edge); // zona talud oscura
        float edgeSlope = 1.0 - smoothstep(0.12,  0.22, edge); // degradado de borde

        // ── 5. Color base: azul-blanco compacto brillante ────────────────────
        // CLARAMENTE diferente del terreno cálido amarillo-beige
        vec3 cresta = vec3(0.92, 0.96, 1.00);  // azul-blanco brillante en cresta
        vec3 surco  = vec3(0.52, 0.68, 0.88);  // azul-medio en el surco fresado
        vec3 baseColor = mix(surco, cresta, corduroy);

        // Oscurecer carriles pares ligeramente
        baseColor *= (1.0 - laneParity * 0.065);
        // Juntura de pasadas: línea oscura
        baseColor *= (1.0 - seam * 0.20);

        // Franja del color de dificultad en los bordes (tipo Endless Peaks)
        baseColor = mix(baseColor, diffColor * vec3(1.5, 1.5, 1.5), edgeBand * 0.72);
        baseColor = mix(baseColor, vec3(0.18, 0.22, 0.28), edgeBand * 0.28);

        // Talud oscuro después de la franja de dificultad
        baseColor *= (1.0 - edgeDark * 0.45 - edgeSlope * 0.18);

        // ── 6. Vista aérea: rellenar con color de dificultad ─────────────────
        if (aerialHighlight > 0.01) {
          float ae = smoothstep(0.14, 0.04, edge);
          baseColor = mix(baseColor, diffColor, aerialHighlight * (0.25 + ae * 0.75));
        }

        // ── 7. Iluminación tipo half-Lambert ─────────────────────────────────
        vec3 pertN = normalize(vNormal + vec3((saw - 0.5) * 0.18 * detailFade, 0.0, 0.0));
        float NdL  = dot(pertN, sunDirection);
        float hL   = clamp(NdL * 0.5 + 0.5, 0.0, 1.0);
        float sun  = smoothstep(0.22, 0.75, hL);

        float sky  = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
        vec3  amb  = mix(skyColor * 0.88, vec3(1.0), sky);

        vec3 lit = mix(
          baseColor * amb * 0.90,
          baseColor * (amb * 0.38 + sunColor * 0.88 * sunIntensity),
          sun
        );

        // Especular compacto (nieve pisada = superficie dura)
        vec3 vd   = normalize(cameraPosition - vWorldPos);
        vec3 h    = normalize(sunDirection + vd);
        float sp  = pow(max(dot(pertN, h), 0.0), 42.0) * sun * 0.28;
        lit += vec3(sp);

        // ── 8. Niebla ──────────────────────────────────────────────────────
        float d  = length(cameraPosition - vWorldPos);
        float ff = 1.0 - exp(-fogDensity * fogDensity * d * d);
        lit = mix(lit, fogColor, clamp(ff, 0.0, 1.0));

        gl_FragColor = vec4(lit, 1.0);
      }
    `,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
  });
}
