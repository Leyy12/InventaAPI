// Light/dark choice, kept in this browser. Dark is the default.
export const THEME_STORAGE_KEY = "inventa-theme";
// Runs in <head> before the first paint so a saved light choice never flashes dark.
export const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;
