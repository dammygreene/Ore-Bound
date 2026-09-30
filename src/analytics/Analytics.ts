export type AnalyticsEventName =
  | 'session_start'
  | 'mine_enter'
  | 'tile_mined'
  | 'scanner_used'
  | 'resource_discovered'
  | 'diamond_discovered'
  | 'hazard_triggered'
  | 'surface_return'
  | 'resource_sold'
  | 'upgrade_purchased'
  | 'quality_changed';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  time: number;
  data?: Record<string, string | number | boolean>;
}

export class Analytics {
  private readonly events: AnalyticsEvent[] = [];

  track(name: AnalyticsEventName, data?: Record<string, string | number | boolean>): void {
    this.events.push({ name, time: Date.now(), data });
    if (this.events.length > 150) this.events.shift();
  }

  recent(): AnalyticsEvent[] {
    return [...this.events];
  }
}
