export type ThemeChoice = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "thnhc-theme";

/** Inline script: applies the stored theme choice before first paint. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
