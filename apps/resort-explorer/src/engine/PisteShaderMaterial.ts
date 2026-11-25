import * as THREE from 'three';

/**
 * Shader procedural fotorrealista de "Nieve Pisada Alpina" (Zero-Assets):
 * - Fresado real de pisanieves (corduroy con perfil en V y perturbación de normal a la luz).
 * - Pasadas de máquina con ligero bamboleo orgánico (sin líneas rígidas artificiales).
 * - Huellas sutiles de esquís carveando a lo largo de la bajada.
 * - Grano microcristalino y destellos especulares (snow glints) bajo el sol directo.
 * - Transición natural con talud lateral hacia la nieve polvo virgen.
 */
export function createPisteCorduroyMaterial(_difficultyHex: number = 0x0284c7): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    lights: false,
    polygonOffset: true,
    polygonOffsetFactor: -8.0,
    polygonOffsetUnits: -8.0,
    uniforms: {
      snowCrest: { value: new THREE.Color(0xffffff) },       // Cresta de nieve iluminada
      grooveShadow: { value: new THREE.Color(0xdce1e8) },    // Sombra neutra del surco
      bermShadow: { value: new THREE.Color(0xc2c9d4) },      // Talud lateral de la pisanieves
      sunDirection: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      skyAmbient: { value: new THREE.Color(0xe8ecf2) },
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

      // Hash rápido 2D -> 1D para grano de nieve y destellos
      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // Value noise suave 2D
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
        // 1. Variación macro orgánica (ventisqueros suaves y placas compactadas)
        float macroNoise = noise2D(vWorldPosition.xz * 0.045) * 0.65
                         + noise2D(vWorldPosition.xz * 0.14) * 0.35;

        // 2. Bamboleo orgánico en el trazado de las pasadas de pisanieves
        float machineWobble = (noise2D(vec2(vUv.y * 0.35, vUv.x * 2.0)) - 0.5) * 0.025;
        float uWobbled = vUv.x + machineWobble;

        // 3. Fresado de pisanieves (corduroy en perfil de diente de sierra / V)
        // Atenuación anti-aliased con fwidth para que no parpadee desde lejos
        float fw = fwidth(vUv.x);
        float detailFade = 1.0 - smoothstep(0.008, 0.06, fw);

        float grooveCoord = uWobbled * 95.0;
        float saw = abs(fract(grooveCoord) * 2.0 - 1.0); // 0 en fondo del surco, 1 en cresta
        float corduroy = mix(0.55, saw, detailFade);

        // 4. Uniones entre las 4 pasadas paralelas de la máquina pisanieves
        float lanePhase = fract(uWobbled * 4.0);
        float laneSeam = smoothstep(0.055, 0.0, min(lanePhase, 1.0 - lanePhase));
        float laneVariation = noise2D(vec2(floor(uWobbled * 4.0) * 3.7, vUv.y * 0.15));

        // 5. Huellas sutiles de esquís carveando a lo largo de la pista
        float skiTrack1 = sin(vUv.x * 26.0 + sin(vUv.y * 0.55) * 2.2);
        float skiTrack2 = sin(vUv.x * 38.0 - cos(vUv.y * 0.42) * 1.9);
        float skiEtch = smoothstep(0.92, 0.99, max(skiTrack1, skiTrack2)) * detailFade;

        // 6. Grano microcristalino de nieve compacta (visible de cerca al esquiar)
        float microGrain = noise2D(vWorldPosition.xz * 4.5);
        float closeFade = 1.0 - smoothstep(0.02, 0.15, fwidth(vWorldPosition.x));
        float grainMod = mix(0.5, microGrain, closeFade);

        // Composición del albedo base de la nieve pisada
        vec3 baseSnow = mix(grooveShadow, snowCrest, corduroy * 0.58 + 0.42);
        baseSnow = mix(baseSnow, grooveShadow * 0.97, laneVariation * 0.12);
        baseSnow = mix(baseSnow, grooveShadow * 0.92, laneSeam * 0.42);
        baseSnow = mix(baseSnow, grooveShadow * 0.94, skiEtch * 0.35);
        baseSnow *= (0.96 + macroNoise * 0.06 + (grainMod - 0.5) * 0.05);

        // 7. Borde natural de nieve pisada (talud lateral suave hacia nieve polvo)
        float distFromEdge = min(vUv.x, 1.0 - vUv.x);
        float bermBand = smoothstep(0.075, 0.02, distFromEdge) * smoothstep(0.0, 0.015, distFromEdge);
        baseSnow = mix(baseSnow, bermShadow, bermBand * 0.45);

        // 8. Perturbación sutil de normal por el fresado y el grano para reflejar el sol
        vec3 perturbedNormal = normalize(
          vNormal + vec3((saw - 0.5) * 0.18 * detailFade, 0.0, (grainMod - 0.5) * 0.08)
        );

        float NdotL = dot(perturbedNormal, sunDirection);
        float halfLambert = clamp(NdotL * 0.48 + 0.52, 0.0, 1.0);
        float directSun = smoothstep(0.18, 0.78, halfLambert);

        vec3 litPiste = mix(
          baseSnow * skyAmbient * 0.92,
          baseSnow * (skyAmbient * 0.20 + vec3(1.02, 1.01, 0.99) * 0.85),
          directSun
        );

        // 9. Brillo especular + destellos cristalinos (snow glints) al sol
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfVec = normalize(sunDirection + viewDir);
        float spec = pow(max(dot(perturbedNormal, halfVec), 0.0), 28.0) * directSun * 0.22;

        // Micro-destellos en celdas de ~12cm dependientes del ángulo de visión
        vec2 sparkleCell = floor(vWorldPosition.xz * 8.0);
        float sparkleRand = hash21(sparkleCell + floor(viewDir.xz * 6.0));
        float glint = smoothstep(0.975, 1.0, sparkleRand) * directSun * closeFade * 0.45;

        litPiste += vec3(spec + glint);

        gl_FragColor = vec4(litPiste, 1.0);
      }
    `,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}
