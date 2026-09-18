export function registerBadHandler(): void {
  window.addEventListener('error', (event) => {
    console.error(event);
  });
}
