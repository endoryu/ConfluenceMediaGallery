export function report(): void {
  navigator.sendBeacon('/collect', 'data');
}
