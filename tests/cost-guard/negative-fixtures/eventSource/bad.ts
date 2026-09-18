export function stream(): EventSource {
  return new EventSource('/events');
}
