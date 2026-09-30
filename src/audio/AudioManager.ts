import type { ScannerResult, GameNotification } from '../game/types';

export class AudioManager {
  private context: AudioContext | undefined;
  private enabled = true;
  private lastScanTime = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async resume(): Promise<void> {
    if (!this.enabled) return;
    if (!this.context) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  playMove(): void {
    this.tone(90, 0.035, 'square', 0.025);
  }

  playDrillStart(): void {
    this.noise(0.08, 0.05);
    this.tone(140, 0.07, 'sawtooth', 0.025);
  }

  playMineComplete(): void {
    this.noise(0.1, 0.07);
    this.tone(210, 0.06, 'triangle', 0.03);
  }

  playScan(result: ScannerResult): void {
    const now = performance.now();
    if (now - this.lastScanTime < 180) return;
    this.lastScanTime = now;
    const frequencyByLevel: Record<ScannerResult['level'], number> = {
      none: 150,
      'very weak': 220,
      weak: 280,
      medium: 360,
      strong: 470,
      'very strong': 620,
    };
    const repeats = result.level === 'none' ? 1 : result.level === 'very strong' ? 4 : result.level === 'strong' ? 3 : 2;
    for (let i = 0; i < repeats; i += 1) {
      this.tone(frequencyByLevel[result.level], 0.06, 'sine', 0.025, i * 0.09);
    }
  }

  playNotification(tone: GameNotification['tone']): void {
    if (tone === 'danger') {
      this.tone(110, 0.08, 'square', 0.04);
      this.tone(95, 0.1, 'square', 0.035, 0.09);
    } else if (tone === 'rare') {
      this.tone(520, 0.11, 'triangle', 0.035);
      this.tone(780, 0.13, 'triangle', 0.03, 0.12);
      this.tone(1040, 0.2, 'sine', 0.025, 0.25);
    } else if (tone === 'success') {
      this.tone(340, 0.08, 'triangle', 0.03);
      this.tone(510, 0.09, 'triangle', 0.03, 0.08);
    } else if (tone === 'warning') {
      this.tone(260, 0.09, 'sawtooth', 0.03);
    }
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (!this.enabled || !this.context) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume: number): void {
    if (!this.enabled || !this.context) return;
    const sampleRate = this.context.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = this.context.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain).connect(this.context.destination);
    source.start();
  }
}
