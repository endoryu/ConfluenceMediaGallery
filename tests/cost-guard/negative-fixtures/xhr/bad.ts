export function ping(): void {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/status');
  xhr.send();
}
