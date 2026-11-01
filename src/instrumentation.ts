// Runs once when the server starts. Reports an unsafe demo configuration (D28):
// DEMO_MODE=1 next to real service keys, or a production demo without a session secret.
// It logs instead of throwing, so the public website stays online; getStore() and
// getSession() run the same check and still refuse every demo, login and booking request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertSafeMode } = await import("./lib/server/mode-core");
    try {
      assertSafeMode();
    } catch (err) {
      // The message names variables only, never their values.
      console.error("[startup] unsafe demo configuration:", (err as Error).message);
    }
  }
}
