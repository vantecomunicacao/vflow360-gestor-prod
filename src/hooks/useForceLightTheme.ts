import { useEffect } from "react";

/**
 * Força modo claro enquanto o componente estiver montado (telas de auth)
 * e restaura a preferência de tema do usuário ao desmontar.
 * Também marca `data-auth-light` no <html>, usado para ocultar o ThemeToggle.
 */
export function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    root.setAttribute("data-auth-light", "1");
    return () => {
      root.removeAttribute("data-auth-light");
      if (wasDark) root.classList.add("dark");
    };
  }, []);
}
