// Runs once when the server starts. Refuses an unsafe demo configuration (D28):
// DEMO_MODE=1 next to real service keys, or a production demo without a session secret.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertSafeMode } = await import("./lib/server/mode-core");
    assertSafeMode();
  }
}
