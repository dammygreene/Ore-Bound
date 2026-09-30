import { AudioManager } from '../audio/AudioManager';
import type { Direction } from '../game/types';
import { GameSimulation } from '../game/GameSimulation';
import { Renderer3D } from '../renderer/Renderer3D';
import { GameUI } from '../ui/GameUI';

function directionFromDelta(dx: number, dy: number): Direction | undefined {
  if (Math.abs(dx) + Math.abs(dy) !== 1) return undefined;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  if (dy === -1) return 'up';
  return undefined;
}

export class InputController {
  private readonly simulation: GameSimulation;
  private readonly renderer: Renderer3D;
  private readonly audio: AudioManager;
  private readonly ui: GameUI;
  private lastKeyMove = 0;

  constructor(simulation: GameSimulation, renderer: Renderer3D, audio: AudioManager, ui: GameUI) {
    this.simulation = simulation;
    this.renderer = renderer;
    this.audio = audio;
    this.ui = ui;
    window.addEventListener('keydown', this.onKeyDown);
    renderer.canvas.addEventListener('pointerdown', this.onCanvasPointer);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.renderer.canvas.removeEventListener('pointerdown', this.onCanvasPointer);
  }

  private readonly onKeyDown = async (event: KeyboardEvent): Promise<void> => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, button')) return;

    const key = event.key.toLowerCase();
    const direction = this.keyToDirection(key);
    if (direction) {
      event.preventDefault();
      const now = performance.now();
      if (event.repeat && now - this.lastKeyMove < 90) return;
      this.lastKeyMove = now;
      await this.audio.resume();
      const beforeMining = Boolean(this.simulation.snapshot().miningJob);
      const result = this.simulation.moveOrMine(direction);
      const afterMining = Boolean(this.simulation.snapshot().miningJob);
      if (result.ok) afterMining && !beforeMining ? this.audio.playDrillStart() : this.audio.playMove();
      return;
    }

    if (key === ' ' || key === 'e') {
      event.preventDefault();
      await this.audio.resume();
      const snapshot = this.simulation.snapshot();
      const result = key === 'e' && snapshot.player.position.y === 0 ? this.simulation.interactAtCurrentStation() : this.simulation.beginMining();
      if (result.ok && key !== 'e') this.audio.playDrillStart();
      if (result.ok && key === 'e') this.audio.playNotification('success');
    }
    if (key === 'shift' || key === 'c') {
      event.preventDefault();
      await this.audio.resume();
      this.audio.playScan(this.simulation.scan());
    }
    if (key === 'b') {
      event.preventDefault();
      await this.audio.resume();
      const result = this.simulation.move(this.simulation.snapshot().player.facing);
      if (result.ok) this.audio.playMove();
    }
    if (key === 'r') {
      event.preventDefault();
      await this.audio.resume();
      this.simulation.returnToSurface();
      this.ui.showSurfacePanel(true);
    }
    if (key === 'g' || key === 'tab') {
      event.preventDefault();
      this.ui.showSurfacePanel();
    }
    if (key === 'h' || key === '?') {
      event.preventDefault();
      this.ui.toggleHelp();
    }
    if (key === 'escape') {
      event.preventDefault();
      this.ui.closePanels();
    }
  };

  private readonly onCanvasPointer = async (event: PointerEvent): Promise<void> => {
    await this.audio.resume();
    const tile = this.renderer.screenToTile(event.clientX, event.clientY);
    const snapshot = this.simulation.snapshot();
    const dx = tile.x - snapshot.player.position.x;
    const dy = tile.y - snapshot.player.position.y;
    const direction = directionFromDelta(dx, dy);
    if (!direction) return;
    const beforeMining = Boolean(snapshot.miningJob);
    const result = this.simulation.moveOrMine(direction);
    const afterMining = Boolean(this.simulation.snapshot().miningJob);
    if (result.ok) afterMining && !beforeMining ? this.audio.playDrillStart() : this.audio.playMove();
  };

  private keyToDirection(key: string): Direction | undefined {
    if (key === 'arrowup' || key === 'w') return 'up';
    if (key === 'arrowdown' || key === 's') return 'down';
    if (key === 'arrowleft' || key === 'a') return 'left';
    if (key === 'arrowright' || key === 'd') return 'right';
    return undefined;
  }
}
