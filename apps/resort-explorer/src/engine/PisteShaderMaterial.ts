import * as THREE from 'three';

/**
 * Shader procedural de "Nieve Pisada" (Corduroy / Fresado de pisanieves).
 * Blanco nival realista sin tintes azules artificiales: pasadas paralelas de
 * máquina pisanieves, estrías longitudinales y un sutil talud lateral sombreado
 * en gris neutro que la distingue de la nieve polvo virgen.
 */
export function createPisteCorduroyMaterial(_difficultyHex: number = 0x0284c7): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    lights: false,
    polygonOffset: true,
    polygonOffsetFactor: -8.0,
    polygonOffsetUnits: -8.0,
    uniforms: {
      snowCrest: { value: new THREE.Color(0xffffff) },       // Blanco puro nieve pisada
      grooveShadow: { value: new THREE.Color(0xe2e6ec) },    // Sombra neutra del surco fresado
      bermShadow: { value: new THREE.Color(0xcbd2dc) },      // Sombra neutra del borde de pisanieves
      sunDirection: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      skyAmbient: { value: new THREE.Color(0xe6eaef) },      // Luz ambiental neutra invernal
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
      uniform vec3 snowCrest;
      uniform vec3 grooveShadow;
      uniform vec3 bermShadow;
      uniform vec3 sunDirection;
      uniform vec3 skyAmbient;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        // 1. Estrías finas de fresado (corduroy) longitudinales a la pista
        float fw = fwidth(vUv.x);
        float detailFade = 1.0 - smoothstep(0.015, 0.08, fw);
        float corduroy = (sin(vUv.x * 160.0) * 0.5 + 0.5) * detailFade + 0.5 * (1.0 - detailFade);

        // 2. Pasadas paralelas de máquina pisanieves (4 carriles a lo ancho de la pista)
        float lanePhase = fract(vUv.x * 4.0);
        float laneSeam = smoothstep(0.07, 0.0, min(lanePhase, 1.0 - lanePhase));
        float laneParity = mod(floor(vUv.x * 4.0), 2.0);

        vec3 basePiste = mix(grooveShadow, snowCrest, corduroy * 0.65 + 0.35);
        basePiste = mix(basePiste, grooveShadow * 0.96, laneParity * 0.14);
        basePiste = mix(basePiste, grooveShadow * 0.90, laneSeam * 0.45);

        // 3. Borde natural de nieve pisada (pequeño talud lateral en gris neutro)
        float distFromEdge = min(vUv.x, 1.0 - vUv.x);
        float bermBand = smoothstep(0.08, 0.025, distFromEdge) * smoothstep(0.0, 0.02, distFromEdge);
        basePiste = mix(basePiste, bermShadow, bermBand * 0.50);

        // 4. Iluminación blanca natural de invierno
        float NdotL = dot(vNormal, sunDirection);
        float halfLambert = clamp(NdotL * 0.48 + 0.52, 0.0, 1.0);
        float directSun = smoothstep(0.18, 0.78, halfLambert);

        vec3 litPiste = mix(
          basePiste * skyAmbient * 0.92,
          basePiste * (skyAmbient * 0.22 + vec3(1.02, 1.01, 0.99) * 0.84),
          directSun
        );

        // Brillo especular limpio de nieve compactada
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfVec = normalize(sunDirection + viewDir);
        float spec = pow(max(dot(vNormal, halfVec), 0.0), 24.0) * directSun * 0.24;
        litPiste += vec3(spec);

        gl_FragColor = vec4(litPiste, 1.0);
      }
    `,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}
