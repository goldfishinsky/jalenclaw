// Simple child process for testing
process.on("message", (msg) => {
  if (msg === "ping") process.send?.("pong");
  if (msg === "exit") process.exit(0);
  if (msg === "crash") process.exit(1);
});
process.send?.("ready");
// Stay alive
setInterval(() => {}, 1000);
