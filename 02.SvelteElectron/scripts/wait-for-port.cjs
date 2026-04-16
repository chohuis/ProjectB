const net = require("node:net");

const port = Number(process.argv[2] || 5173);
const timeoutMs = 30_000;
const startedAt = Date.now();

function check() {
  const socket = new net.Socket();
  socket.setTimeout(1000);

  socket.once("connect", () => {
    socket.destroy();
    process.exit(0);
  });

  const retry = () => {
    socket.destroy();
    if (Date.now() - startedAt > timeoutMs) {
      console.error(`Timed out waiting for localhost:${port}`);
      process.exit(1);
    }
    setTimeout(check, 250);
  };

  socket.once("timeout", retry);
  socket.once("error", retry);
  socket.connect(port, "127.0.0.1");
}

check();

