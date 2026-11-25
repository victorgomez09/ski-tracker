import * as THREE from 'three';

/**
 * Shader procedural de "Nieve Pisada" unificado con la iluminación del terreno:
 * - Usa exactamente el mismo color base nival, luz solar, cielo y niebla que la montaña,
 *   diferenciándose únicamente por las estrías de fresado (corduroy) y pasadas de pisanieves.
 * - Transición suave (alpha feathering) en los bordes para integrarse sin escalones con la nieve polvo.
 */
export function createPisteCorduroyMaterial(difficultyHex: number = 0x0284c7): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    lights: false,
    polygonOffset: true,
    polygonOffsetFactor: -12.0,
    polygonOffsetUnits: -12.0,
    uniforms: {
      snowColor: { value: new THREE.Color(0xffffff) },
      skyColor: { value: new THREE.Color(0xf1f5f9) },
      sunColor: { value: new THREE.Color(0xffffff) },
      sunDirection: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      sunIntensity: { value: 1.0 },
      fogColor: { value: new THREE.Color(0xdce8f4) },
      fogDensity: { value: 0.00016 },
      diffColor: { value: new THREE.Color(difficultyHex) },
      aerialHighlight: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 snowColor;
      uniform vec3 skyColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform float sunIntensity;
      uniform vec3 fogColor;
      uniform float fogDensity;
      uniform vec3 diffColor;
      uniform float aerialHighlight;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        // 1. Bamboleo orgánico en las pasadas de pisanieves
        float machineWobble = (noise2D(vec2(vUv.y * 0.35, vUv.x * 2.0)) - 0.5) * 0.022;
        float uWobbled = vUv.x + machineWobble;

        // 2. Fresado de pisanieves (corduroy en perfil en V)
        float fw = fwidth(vUv.x);
        float detailFade = 1.0 - smoothstep(0.008, 0.06, fw);
        float saw = abs(fract(uWobbled * 95.0) * 2.0 - 1.0);
        float corduroy = mix(0.55, saw, detailFade);

        // 3. Uniones entre 4 pasadas paralelas de la máquina y huellas sutiles de esquís
        float lanePhase = fract(uWobbled * 4.0);
        float laneSeam = smoothstep(0.05, 0.0, min(lanePhase, 1.0 - lanePhase));
        float skiTrack = smoothstep(0.92, 0.99, sin(vUv.x * 28.0 + sin(vUv.y * 0.55) * 2.2)) * detailFade;

        // Misma base de color nieve recién caída que la montaña, modulada solo por el relieve del pisado
        float groomShade = 0.95 + corduroy * 0.07 - laneSeam * 0.04 - skiTrack * 0.03;
        vec3 baseSnow = snowColor * groomShade;

        float distFromEdge = min(vUv.x, 1.0 - vUv.x);

        // En Vista Aérea, delimitar nítidamente con el color de dificultad
        if (aerialHighlight > 0.01) {
          float aerialEdge = smoothstep(0.16, 0.06, distFromEdge);
          baseSnow = mix(baseSnow, diffColor, aerialHighlight * (0.16 + aerialEdge * 0.84));
        }

        // 4. Iluminación idéntica a ProceduralTerrain para nieve blanca pura
        vec3 perturbedNormal = normalize(
          vNormal + vec3((saw - 0.5) * 0.16 * detailFade, 0.0, 0.0)
        );
        float NdotL = dot(perturbedNormal, sunDirection);
        float halfLambert = clamp(NdotL * 0.5 + 0.5, 0.0, 1.0);
        float directSun = smoothstep(0.18, 0.74, halfLambert);

        float skyFactor = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 ambientReflection = mix(skyColor * 0.96, vec3(1.0, 1.0, 1.0), skyFactor);

        vec3 litPiste = mix(
          baseSnow * ambientReflection * 0.98,
          baseSnow * (ambientReflection * 0.44 + sunColor * 0.86 * sunIntensity),
          directSun
        );

        // Brillo especular compacto
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfVec = normalize(sunDirection + viewDir);
        float spec = pow(max(dot(perturbedNormal, halfVec), 0.0), 28.0) * directSun;
        litPiste += vec3(0.18 * spec);

        // Niebla atmosférica sincronizada con la montaña
        float dist = length(cameraPosition - vWorldPosition);
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
        litPiste = mix(litPiste, fogColor, clamp(fogFactor, 0.0, 1.0));

        // 5. Fundido suave en los bordes para fusionarse al ras con la nieve polvo
        float edgeAlpha = aerialHighlight > 0.01 ? 1.0 : smoothstep(0.0, 0.09, distFromEdge);

        gl_FragColor = vec4(litPiste, edgeAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
