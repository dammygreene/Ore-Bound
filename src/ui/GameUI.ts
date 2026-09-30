import { AudioManager } from '../audio/AudioManager';
import { computeExcavatorStats, maxUpgradeLevel, upgradeCost } from '../excavators/stats';
import { RESOURCE_INFO, SHORTCUTS, TERRAIN_INFO, UPGRADE_DESCRIPTIONS, UPGRADE_LABELS } from '../game/constants';
import { GameSimulation } from '../game/GameSimulation';
import type { Direction, ExcavatorUpgrades, GameNotification, QualityTier } from '../game/types';
import { inventoryValue } from '../inventory/inventory';

interface DebugMetrics {
  fps: number;
  frameTime: number;
}

function pct(value: number, max: number): string {
  return `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100)).toFixed(0)}%`;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function toneIcon(tone: GameNotification['tone']): string {
  if (tone === 'danger') return '⚠';
  if (tone === 'warning') return '△';
  if (tone === 'success') return '✓';
  if (tone === 'rare') return '✦';
  return '•';
}

export class GameUI {
  readonly root: HTMLElement;
  private readonly simulation: GameSimulation;
  private readonly audio: AudioManager;
  private readonly seenNotifications = new Set<string>();
  private panelOpen = false;
  private helpOpen = false;
  private debugOpen = false;

  constructor(root: HTMLElement, simulation: GameSimulation, audio: AudioManager) {
    this.root = root;
    this.simulation = simulation;
    this.audio = audio;
    this.root.className = 'game-shell';
    this.root.innerHTML = this.template();
    this.bindControls();
    this.renderUpgradeButtons();
    this.update({ fps: 0, frameTime: 0 });
  }

  getCanvasHost(): HTMLElement {
    const host = this.root.querySelector<HTMLElement>('[data-canvas-host]');
    if (!host) throw new Error('Canvas host missing');
    return host;
  }

  update(metrics: DebugMetrics): void {
    const snapshot = this.simulation.snapshot();
    const stats = computeExcavatorStats(snapshot.player.upgrades);
    const root = this.root;
    root.classList.toggle('high-contrast', this.simulation.getSettings().highContrast);
    root.style.setProperty('--ui-scale', String(this.simulation.getSettings().uiScale));

    this.setText('[data-money]', `${formatNumber(snapshot.player.money)} cr`);
    this.setText('[data-fuel-text]', `${Math.ceil(snapshot.player.fuel)} / ${Math.ceil(stats.fuelCapacity)}`);
    this.setText('[data-durability-text]', `${Math.ceil(snapshot.player.durability)} / ${Math.ceil(stats.durabilityMax)}`);
    this.setText('[data-cargo-text]', `${Math.ceil(snapshot.player.cargoUsed)} / ${Math.ceil(stats.storageCapacity)}`);
    this.setBar('[data-fuel-bar]', snapshot.player.fuel, stats.fuelCapacity);
    this.setBar('[data-durability-bar]', snapshot.player.durability, stats.durabilityMax);
    this.setBar('[data-cargo-bar]', snapshot.player.cargoUsed, stats.storageCapacity);

    this.setText('[data-depth]', `${Math.max(0, snapshot.player.position.y)} m`);
    this.setText('[data-coords]', `${snapshot.player.position.x}, ${snapshot.player.position.y}`);
    this.setText('[data-facing]', snapshot.player.facing);
    this.setText('[data-blocks]', formatNumber(snapshot.player.stats.blocksMined));
    this.setText('[data-deepest]', `${snapshot.player.stats.deepestPoint} m`);
    this.setText('[data-active-chunks]', String(snapshot.activeChunkCount));
    this.setText('[data-fps]', `${metrics.fps.toFixed(0)} fps`);
    this.setText('[data-frame-time]', `${metrics.frameTime.toFixed(1)} ms`);

    const mining = snapshot.miningJob;
    const miningPanel = root.querySelector<HTMLElement>('[data-mining-progress]');
    if (miningPanel) {
      miningPanel.hidden = !mining;
      if (mining) {
        const progress = Math.min(1, mining.elapsed / mining.duration);
        this.setText('[data-mining-material]', TERRAIN_INFO[mining.terrain].label);
        this.setText('[data-mining-percent]', `${Math.round(progress * 100)}%`);
        this.setBar('[data-mining-bar]', progress, 1);
      }
    }

    const scanner = snapshot.scannerResult;
    this.setText('[data-scanner-level]', scanner ? scanner.level : 'idle');
    this.setText('[data-scanner-direction]', scanner ? scanner.direction : 'press Scan');
    this.setText('[data-scanner-hint]', scanner ? `${scanner.hint} ${scanner.estimatedDistance}.` : 'Pulse the tunnel to feel hidden targets without exact coordinates.');
    const surfaceStation = snapshot.player.position.y === 0
      ? snapshot.player.position.x <= -2
        ? 'E repair bay · TAB upgrades · Space drill toward the mine'
        : snapshot.player.position.x >= 2
          ? 'E fuel station · TAB upgrades · Space drill toward the mine'
          : 'E storage/refinery · TAB tablet · Space drill into the mine'
      : 'Headlights on · Space drill · C scan · R return to garage';
    this.setText('[data-context-prompt]', surfaceStation);

    this.renderInventory();
    this.renderDiscoveries();
    this.renderNotifications(snapshot.notifications);
    this.updateSurfacePanel();
    this.updateDebugVisibility();
  }

  showSurfacePanel(open = !this.panelOpen): void {
    this.panelOpen = open;
    const panel = this.root.querySelector<HTMLElement>('[data-surface-panel]');
    if (panel) panel.hidden = !open;
    this.updateSurfacePanel();
  }

  toggleHelp(): void {
    this.helpOpen = !this.helpOpen;
    const help = this.root.querySelector<HTMLElement>('[data-help]');
    if (help) help.hidden = !this.helpOpen;
  }

  closePanels(): void {
    this.helpOpen = false;
    this.panelOpen = false;
    const help = this.root.querySelector<HTMLElement>('[data-help]');
    const panel = this.root.querySelector<HTMLElement>('[data-surface-panel]');
    if (help) help.hidden = true;
    if (panel) panel.hidden = true;
  }

  private template(): string {
    return `
      <main class="viewport" aria-label="Ore Bound 3D underground exploration game">
        <section class="intro-screen" data-intro aria-label="Ore Bound intro">
          <div class="intro-card">
            <div class="intro-logo"><span>◆</span><strong>ORE BOUND</strong></div>
            <p>Start the engine. Light the tunnel. Find what is hidden underground.</p>
            <button type="button" class="enter-mine" data-action="start-game">ENTER MINE</button>
          </div>
        </section>
        <section class="canvas-host" data-canvas-host aria-label="3D mine view"></section>

        <header class="top-hud compact-hud" aria-label="Excavator status">
          <div class="brand"><span class="brand-mark">◆</span><div><strong>ORE BOUND</strong><small>3D underground exploration game</small></div></div>
          <div class="meter fuel"><span>Fuel</span><div class="meter-track"><b data-fuel-bar></b></div><em data-fuel-text>0</em></div>
          <div class="meter durability"><span>HP</span><div class="meter-track"><b data-durability-bar></b></div><em data-durability-text>0</em></div>
          <div class="meter cargo"><span>Cargo</span><div class="meter-track"><b data-cargo-bar></b></div><em data-cargo-text>0</em></div>
          <div class="wallet" aria-label="Credits"><span data-money>0 cr</span></div>
        </header>

        <div class="scanner-strip" aria-label="Scanner status">
          <strong data-scanner-level>idle</strong>
          <span data-scanner-direction>press Scan</span>
          <small data-scanner-hint>Pulse the tunnel to feel hidden targets.</small>
        </div>

        <div class="context-prompt" data-context-prompt>WASD drive · Space drill · C scan · TAB tablet</div>

        <div class="mining-progress" data-mining-progress hidden>
          <span>DRILLING <strong data-mining-material></strong></span>
          <div class="meter-track"><b data-mining-bar></b></div>
          <em data-mining-percent></em>
        </div>

        <div class="notifications" data-notifications aria-live="polite"></div>

        <nav class="bottom-controls" aria-label="Game controls">
          <div class="dpad joystick" aria-label="Movement pad">
            <button type="button" data-dir="up" aria-label="Move toward surface">▲</button>
            <button type="button" data-dir="left" aria-label="Move left">◀</button>
            <button type="button" data-dir="right" aria-label="Move right">▶</button>
            <button type="button" data-dir="down" aria-label="Move deeper">▼</button>
          </div>
          <div class="action-cluster">
            <button type="button" class="action dig" data-action="dig">Drill</button>
            <button type="button" class="action scan" data-action="scan">Scan</button>
            <button type="button" class="action boost" data-action="boost">Boost</button>
            <button type="button" class="action return" data-action="return">Return</button>
          </div>
        </nav>

        <section class="command-panel" data-surface-panel hidden aria-label="Command tablet">
          <div class="panel-head"><div><strong>Command Tablet</strong><p>Garage services are available when the excavator is parked at the 3D surface bay.</p></div><button type="button" class="mini" data-action="close-panel">Close</button></div>
          <div class="tablet-grid">
            <section class="tablet-card garage-card">
              <div class="panel-title">Surface garage</div>
              <p class="hint">Drive back to the lit garage to sell, repair, refuel and install upgrades.</p>
              <div class="surface-actions">
                <button type="button" data-action="sell">Sell cargo</button>
                <button type="button" data-action="repair">Repair + refuel</button>
                <button type="button" data-action="reset">New mine</button>
              </div>
            </section>
            <section class="tablet-card scanner-card">
              <div class="panel-title">Scanner</div>
              <div class="scanner-readout"><strong data-scanner-level>idle</strong><span data-scanner-direction>press Scan</span></div>
              <p data-scanner-hint>Scanner pulses travel through the 3D tunnel and strengthen near hidden targets.</p>
            </section>
            <section class="tablet-card inventory">
              <div class="panel-title">Cargo <span data-cargo-value></span></div>
              <div data-inventory-list class="inventory-list"></div>
            </section>
            <section class="tablet-card stats">
              <div><span>Depth</span><strong data-depth>0 m</strong></div>
              <div><span>Rock broken</span><strong data-blocks>0</strong></div>
              <div><span>Best depth</span><strong data-deepest>0 m</strong></div>
            </section>
            <section class="tablet-card discoveries">
              <div class="panel-title">Discoveries</div>
              <div data-discovery-list class="discovery-list"></div>
            </section>
          </div>
          <div class="upgrade-grid" data-upgrades></div>
        </section>

        <section class="help-panel" data-help hidden aria-label="Help">
          <div class="panel-head"><strong>How to play</strong><button type="button" class="mini" data-action="close-panel">Close</button></div>
          <p>Ore Bound is now presented as a 3D underground exploration game. The simulation still uses deterministic grid/chunk logic, but you drive a heavy excavator through lit tunnels, caves and a surface garage.</p>
          <ul>${SHORTCUTS.map((shortcut) => `<li>${shortcut}</li>`).join('')}</ul>
          <div class="settings-row">
            <label>Quality <select data-setting="quality"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>ULTRA</option></select></label>
            <label><input type="checkbox" data-setting="sound" /> Sound</label>
            <label><input type="checkbox" data-setting="contrast" /> High contrast UI</label>
          </div>
        </section>

        <button type="button" class="help-button" data-action="help" aria-label="Open help">?</button>
        <button type="button" class="tablet-button" data-action="garage" aria-label="Open command tablet">TAB</button>
        <button type="button" class="debug-button" data-action="debug" aria-label="Toggle debug metrics">FPS</button>
        <section class="debug-panel" data-debug hidden>
          <div><span>FPS</span><strong data-fps>0</strong></div>
          <div><span>Frame</span><strong data-frame-time>0 ms</strong></div>
          <div><span>Chunks</span><strong data-active-chunks>0</strong></div>
        </section>
      </main>
    `;
  }

  private bindControls(): void {
    this.root.addEventListener('pointerdown', async (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('button');
      if (!button) return;
      await this.audio.resume();
      const dir = button.dataset.dir as Direction | undefined;
      const action = button.dataset.action;
      if (dir) {
        const beforeMining = Boolean(this.simulation.snapshot().miningJob);
        const result = this.simulation.moveOrMine(dir);
        const afterMining = Boolean(this.simulation.snapshot().miningJob);
        if (result.ok) afterMining && !beforeMining ? this.audio.playDrillStart() : this.audio.playMove();
      }
      if (action) this.handleAction(action);
    });

    this.root.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement;
      const setting = target.dataset.setting;
      const current = this.simulation.getSettings();
      if (setting === 'quality') this.simulation.updateSettings({ quality: target.value as QualityTier });
      if (setting === 'sound') {
        const checked = (target as HTMLInputElement).checked;
        this.audio.setEnabled(checked);
        this.simulation.updateSettings({ soundEnabled: checked });
      }
      if (setting === 'contrast') this.simulation.updateSettings({ highContrast: (target as HTMLInputElement).checked });
      const settings = this.simulation.getSettings();
      if (current.quality !== settings.quality) window.dispatchEvent(new CustomEvent('ore-bound-settings'));
    });
  }

  private handleAction(action: string): void {
    if (action === 'start-game') {
      const intro = this.root.querySelector<HTMLElement>('[data-intro]');
      if (intro) intro.classList.add('intro-hidden');
      this.audio.playNotification('success');
    }
    if (action === 'dig') {
      const result = this.simulation.beginMining();
      if (result.ok) this.audio.playDrillStart();
    }
    if (action === 'scan') {
      const result = this.simulation.scan();
      this.audio.playScan(result);
    }
    if (action === 'return') {
      this.simulation.returnToSurface();
      this.audio.playNotification('success');
      this.showSurfacePanel(true);
    }
    if (action === 'boost') {
      const facing = this.simulation.snapshot().player.facing;
      const result = this.simulation.move(facing);
      if (result.ok) this.audio.playMove();
    }
    if (action === 'garage') this.showSurfacePanel(!this.panelOpen);
    if (action === 'sell') this.simulation.sellCargo();
    if (action === 'repair') this.simulation.repairAndRefuel();
    if (action === 'help') this.toggleHelp();
    if (action === 'debug') {
      this.debugOpen = !this.debugOpen;
      this.updateDebugVisibility();
    }
    if (action === 'close-panel') this.closePanels();
    if (action === 'reset' && confirm('Start a fresh deterministic mine and clear local progress?')) this.simulation.resetMine();

    const upgrade = action.startsWith('upgrade:') ? (action.split(':')[1] as keyof ExcavatorUpgrades) : undefined;
    if (upgrade) this.simulation.buyUpgrade(upgrade);
  }

  private renderInventory(): void {
    const snapshot = this.simulation.snapshot();
    const list = this.root.querySelector<HTMLElement>('[data-inventory-list]');
    if (!list) return;
    if (snapshot.player.inventory.length === 0) {
      list.innerHTML = '<p class="empty">No cargo yet. Scanner says there could be something anywhere.</p>';
    } else {
      list.innerHTML = snapshot.player.inventory
        .map((item) => {
          const info = RESOURCE_INFO[item.kind];
          return `<div class="inventory-item"><span class="swatch" style="--swatch:${info.color}"></span><div><strong>${info.label}</strong><small>${info.rarity} · ${info.weight * item.quantity} wt</small></div><em>×${item.quantity}</em></div>`;
        })
        .join('');
    }
    this.setText('[data-cargo-value]', `${formatNumber(inventoryValue(snapshot.player.inventory))} cr`);
  }

  private renderDiscoveries(): void {
    const save = this.simulation.getSave();
    const list = this.root.querySelector<HTMLElement>('[data-discovery-list]');
    if (!list) return;
    if (save.discoveredLog.length === 0) {
      list.innerHTML = '<p class="empty">Discoveries will be recorded here.</p>';
      return;
    }
    list.innerHTML = save.discoveredLog
      .slice(0, 6)
      .map((entry) => `<article class="discovery ${entry.rarity}"><strong>${entry.rarity}</strong><span>${entry.message}</span><small>${entry.x}, ${entry.y}</small></article>`)
      .join('');
  }

  private renderNotifications(notifications: GameNotification[]): void {
    const host = this.root.querySelector<HTMLElement>('[data-notifications]');
    if (!host) return;
    host.innerHTML = notifications
      .map((notification) => `<div class="toast ${notification.tone}"><strong>${toneIcon(notification.tone)}</strong><span>${notification.message}</span></div>`)
      .join('');

    for (const notification of notifications) {
      if (!this.seenNotifications.has(notification.id)) {
        this.seenNotifications.add(notification.id);
        this.audio.playNotification(notification.tone);
      }
    }
  }

  private renderUpgradeButtons(): void {
    const host = this.root.querySelector<HTMLElement>('[data-upgrades]');
    if (!host) return;
    const keys = Object.keys(UPGRADE_LABELS) as (keyof ExcavatorUpgrades)[];
    host.innerHTML = keys
      .map(
        (key) => `
        <button type="button" class="upgrade-card" data-upgrade-card="${key}" data-action="upgrade:${key}">
          <strong>${UPGRADE_LABELS[key]}</strong>
          <span>${UPGRADE_DESCRIPTIONS[key]}</span>
          <em data-upgrade-cost="${key}"></em>
        </button>`,
      )
      .join('');
  }

  private updateSurfacePanel(): void {
    const panel = this.root.querySelector<HTMLElement>('[data-surface-panel]');
    if (!panel) return;
    const snapshot = this.simulation.snapshot();
    const atGarage = snapshot.player.position.x === 0 && snapshot.player.position.y === 0;
    panel.classList.toggle('not-at-garage', !atGarage);
    const upgradeKeys = Object.keys(UPGRADE_LABELS) as (keyof ExcavatorUpgrades)[];
    for (const key of upgradeKeys) {
      const card = panel.querySelector<HTMLButtonElement>(`[data-upgrade-card="${key}"]`);
      const cost = panel.querySelector<HTMLElement>(`[data-upgrade-cost="${key}"]`);
      const level = snapshot.player.upgrades[key];
      const maxed = level >= maxUpgradeLevel(key);
      const price = upgradeCost(snapshot.player.upgrades, key);
      if (card) {
        card.disabled = !atGarage || maxed || snapshot.player.money < price;
        card.classList.toggle('maxed', maxed);
      }
      if (cost) cost.textContent = maxed ? `Level ${level} · maxed` : `Level ${level} · ${price} cr`;
    }

    const settings = this.simulation.getSettings();
    const qualitySelect = this.root.querySelector<HTMLSelectElement>('[data-setting="quality"]');
    const soundToggle = this.root.querySelector<HTMLInputElement>('[data-setting="sound"]');
    const contrastToggle = this.root.querySelector<HTMLInputElement>('[data-setting="contrast"]');
    if (qualitySelect) qualitySelect.value = settings.quality;
    if (soundToggle) soundToggle.checked = settings.soundEnabled;
    if (contrastToggle) contrastToggle.checked = settings.highContrast;
  }

  private updateDebugVisibility(): void {
    const debug = this.root.querySelector<HTMLElement>('[data-debug]');
    if (debug) debug.hidden = !this.debugOpen;
  }

  private setText(selector: string, value: string): void {
    const elements = this.root.querySelectorAll<HTMLElement>(selector);
    for (const element of elements) element.textContent = value;
  }

  private setBar(selector: string, value: number, max: number): void {
    const elements = this.root.querySelectorAll<HTMLElement>(selector);
    for (const element of elements) element.style.width = pct(value, max);
  }
}
