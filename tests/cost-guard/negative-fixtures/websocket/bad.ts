export function connect(): WebSocket {
  return new WebSocket('wss://relay.example.com');
}
