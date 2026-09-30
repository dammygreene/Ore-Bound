import './styles.css';
import { AudioManager } from './audio/AudioManager';
import { FpsMeter } from './debug/FpsMeter';
import { GameSimulation } from './game/GameSimulation';
import { InputController } from './input/InputController';
import { Renderer3D } from './renderer/Renderer3D';
import { GameUI } from './ui/GameUI';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('App root missing');

const simulation = new GameSimulation();
const audio = new AudioManager();
audio.setEnabled(simulation.getSettings().soundEnabled);

const ui = new GameUI(app, simulation, audio);
const renderer = new Renderer3D(ui.getCanvasHost(), simulation);
new InputController(simulation, renderer, audio, ui);

const fps = new FpsMeter();
let lastTime = performance.now();
let uiAccumulator = 0;

window.addEventListener('ore-bound-settings', () => {
  renderer.applySettings(simulation.getSettings());
  audio.setEnabled(simulation.getSettings().soundEnabled);
});

renderer.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

function frame(time: number): void {
  const deltaSeconds = Math.min(0.12, (time - lastTime) / 1000 || 0.016);
  lastTime = time;
  simulation.update(deltaSeconds);
  fps.update(deltaSeconds);
  renderer.render(deltaSeconds);
  uiAccumulator += deltaSeconds;
  if (uiAccumulator >= 0.08) {
    ui.update(fps.snapshot());
    uiAccumulator = 0;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
