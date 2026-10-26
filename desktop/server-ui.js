async function refresh() {
  const status = await window.desktop.serverStatus();
  document.getElementById('address').textContent =
    `Clients connect to ws://SERVER-IP:${status.port}/socket. Allow TCP port ${status.port} through the firewall.`;
  document.getElementById('status').textContent =
    `${status.players} players connected · ${status.time.toFixed(1)} seconds running`;
  document.getElementById('logs').textContent =
    status.logs.map((entry) => `[${entry.level}] ${entry.message}`).join('\n') ||
    'Server ready. Waiting for players.';
}
document.getElementById('stop').onclick = () => window.desktop.stopServer();
refresh();
setInterval(refresh, 1000);
