import { defineConfig } from "vite-plugin-windicss";
import colors from "windicss/colors";

export default defineConfig({
  theme: {
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    colors: {
      divider: "#a2a9b1",
      "primary-light": "#22bbff",
      disabled: "#9d9d9d",
      paper: "#f8f8f8",
      "primary-main": "#6a6aff",
      table: "#eaebee",
      wikitable: "#f8f9fa",
      "ooui-primary": "#2a4b8d",
      white: colors.white,
      black: colors.black,
      gray: colors.gray,
      blue: colors.blue,
    },
  },
  shortcuts: {
    img: "border-solid block align-middle max-w-full h-auto",
  },
  preflight: false,
});
