import { createContext, useContext, useEffect } from "react";

const ThemeContext = createContext({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children }) {
  useEffect(() => {
    // Luôn cố định giao diện Sáng (Light Mode), bỏ hoàn toàn chế độ Tối
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove("dark");
    body?.classList.remove("dark");
    try {
      localStorage.setItem("agritrace_theme", "light");
    } catch {
      // Ignore storage errors
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "light", setTheme: () => {}, toggleTheme: () => {}, isDark: false }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
