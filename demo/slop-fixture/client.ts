export function connect(client: Client) {
  client.start().catch(() => {});
}
