const net = require("node:net");

const port = Number(process.argv[2] || 5173);
const timeoutMs = Number(process.argv[3] || 90_000);
const startedAt = Date.now();
const hosts = ["127.0.0.1", "localhost", "::1"];

function connectToHost(host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };

    socket.setTimeout(1200);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));

    try {
      socket.connect(port, host);
    } catch {
      done(false);
    }
  });
}

async function check() {
  for (const host of hosts) {
    const ok = await connectToHost(host);
    if (ok) {
      process.exit(0);
    }
  }

  if (Date.now() - startedAt > timeoutMs) {
    console.error(`Timed out waiting for port ${port} on hosts: ${hosts.join(", ")}`);
    process.exit(1);
  }

  setTimeout(check, 250);
}

check();
