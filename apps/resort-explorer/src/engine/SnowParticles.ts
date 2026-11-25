import * as THREE from 'three';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
}

/**
 * Sistema de partículas de nieve en polvo proyectada por los cantos al carvear o frenar.
 */
export class SnowParticles {
  public points: THREE.Points;
  private maxParticles = 260;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private geometry: THREE.BufferGeometry;
  private cursor = 0;

  constructor() {
    this.positions = new Float32Array(this.maxParticles * 3);
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, age: 1, maxAge: 1 });
      this.positions[i * 3 + 1] = -999;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.45,
      map: this.createSoftSnowTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  private createSoftSnowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.5, 'rgba(248, 250, 252, 0.75)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
  }

  public emit(origin: THREE.Vector3, lateralDir: THREE.Vector3, intensity: number, count: number) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.maxParticles;

      p.x = origin.x + (Math.random() - 0.5) * 0.5;
      p.y = origin.y + 0.1 + Math.random() * 0.15;
      p.z = origin.z + (Math.random() - 0.5) * 0.5;

      const spread = 1.5 + intensity * 3.5;
      p.vx = lateralDir.x * spread + (Math.random() - 0.5) * 1.8;
      p.vy = 1.2 + Math.random() * (1.8 + intensity * 2.2);
      p.vz = lateralDir.z * spread + (Math.random() - 0.5) * 1.8;

      p.age = 0;
      p.maxAge = 0.45 + Math.random() * 0.45;
    }
  }

  public update(dt: number) {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.age >= p.maxAge) {
        this.positions[i * 3 + 1] = -999;
        continue;
      }

      p.age += dt;
      p.vy -= 9.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
    }

    this.geometry.attributes.position.needsUpdate = true;
  }
}
