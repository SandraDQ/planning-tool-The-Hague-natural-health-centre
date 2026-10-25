/** "system" is kept for compatibility; it now means light (dark is opt-in only, D19). */
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "thnhc-theme";

/** Inline script: applies the stored theme choice before first paint. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
