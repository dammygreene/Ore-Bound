export class FpsMeter {
  private frames = 0;
  private elapsed = 0;
  private fps = 0;
  private frameTime = 0;

  update(deltaSeconds: number): void {
    this.frames += 1;
    this.elapsed += deltaSeconds;
    this.frameTime = deltaSeconds * 1000;
    if (this.elapsed >= 0.5) {
      this.fps = this.frames / this.elapsed;
      this.frames = 0;
      this.elapsed = 0;
    }
  }

  snapshot(): { fps: number; frameTime: number } {
    return { fps: this.fps, frameTime: this.frameTime };
  }
}
