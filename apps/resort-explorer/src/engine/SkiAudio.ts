/**
 * Sintetizador de audio procedural (Web Audio API) sin archivos externos:
 * - Sonido de viento alpino modulado por la velocidad de descenso.
 * - Sonido de roce de cantos y derrape sobre la nieve al girar o frenar.
 */
export class SkiAudio {
  private ctx: AudioContext | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private carveGain: GainNode | null = null;
  private carveFilter: BiquadFilterNode | null = null;
  private active = false;

  public start() {
    if (this.active) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    // Canal 1: Viento grave/medio según velocidad
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 260;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;

    windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    windSource.start();

    // Canal 2: Roce de cantos sobre nieve (frecuencia media-alta)
    const carveSource = this.ctx.createBufferSource();
    carveSource.buffer = noiseBuffer;
    carveSource.loop = true;

    this.carveFilter = this.ctx.createBiquadFilter();
    this.carveFilter.type = 'bandpass';
    this.carveFilter.frequency.value = 1800;
    this.carveFilter.Q.value = 1.4;

    this.carveGain = this.ctx.createGain();
    this.carveGain.gain.value = 0;

    carveSource.connect(this.carveFilter);
    this.carveFilter.connect(this.carveGain);
    this.carveGain.connect(this.ctx.destination);
    carveSource.start();

    this.active = true;
  }

  public update(speedMs: number, carveIntensity: number, isGrounded: boolean) {
    if (!this.ctx || !this.windGain || !this.windFilter || !this.carveGain || !this.carveFilter) return;

    const now = this.ctx.currentTime;
    const speedNorm = Math.min(1, speedMs / 25); // ~90 km/h máx

    // Viento proporcional al cuadrado de la velocidad
    const targetWindGain = speedNorm * speedNorm * 0.16;
    const targetWindFreq = 220 + speedNorm * 780;
    this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.08);

    // Roce de nieve al deslizar/cantear en contacto con el suelo
    const groundFactor = isGrounded ? 1 : 0;
    const targetCarveGain = groundFactor * speedNorm * (0.03 + carveIntensity * 0.14);
    const targetCarveFreq = 1400 + carveIntensity * 1400;
    this.carveGain.gain.setTargetAtTime(targetCarveGain, now, 0.06);
    this.carveFilter.frequency.setTargetAtTime(targetCarveFreq, now, 0.06);
  }

  public stop() {
    if (!this.ctx || !this.windGain || !this.carveGain) return;
    const now = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0, now, 0.05);
    this.carveGain.gain.setTargetAtTime(0, now, 0.05);
  }
}
