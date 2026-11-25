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
  private weatherGain: GainNode | null = null;
  private weatherFilter: BiquadFilterNode | null = null;
  private snowWeather = 0;
  private rainWeather = 0;
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

    // Canal 3: Ambiente meteorológico (ventisca / lluvia)
    const weatherSource = this.ctx.createBufferSource();
    weatherSource.buffer = noiseBuffer;
    weatherSource.loop = true;

    this.weatherFilter = this.ctx.createBiquadFilter();
    this.weatherFilter.type = 'bandpass';
    this.weatherFilter.frequency.value = 540;
    this.weatherFilter.Q.value = 0.85;

    this.weatherGain = this.ctx.createGain();
    this.weatherGain.gain.value = 0;

    weatherSource.connect(this.weatherFilter);
    this.weatherFilter.connect(this.weatherGain);
    this.weatherGain.connect(this.ctx.destination);
    weatherSource.start();

    this.active = true;
  }

  public setWeatherAmbience(snowIntensity: number, rainIntensity: number) {
    this.snowWeather = Math.max(0, Math.min(1, snowIntensity));
    this.rainWeather = Math.max(0, Math.min(1, rainIntensity));
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

    // Ambiente de ventisca o lluvia sincronizado con el clima
    if (this.weatherGain && this.weatherFilter) {
      if (this.rainWeather > 0.02) {
        this.weatherGain.gain.setTargetAtTime(this.rainWeather * 0.055, now, 0.25);
        this.weatherFilter.frequency.setTargetAtTime(2500, now, 0.25);
        this.weatherFilter.Q.setTargetAtTime(0.6, now, 0.25);
      } else if (this.snowWeather > 0.02) {
        this.weatherGain.gain.setTargetAtTime(this.snowWeather * 0.04, now, 0.25);
        this.weatherFilter.frequency.setTargetAtTime(520 + speedNorm * 220, now, 0.25);
        this.weatherFilter.Q.setTargetAtTime(1.2, now, 0.25);
      } else {
        this.weatherGain.gain.setTargetAtTime(0, now, 0.25);
      }
    }
  }

  public stop() {
    if (!this.ctx || !this.windGain || !this.carveGain) return;
    const now = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0, now, 0.05);
    this.carveGain.gain.setTargetAtTime(0, now, 0.05);
    if (this.weatherGain) this.weatherGain.gain.setTargetAtTime(0, now, 0.05);
  }
}
