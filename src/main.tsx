import ReactDOM from "react-dom/client";

import { AppRouterProvider } from "./router";
import "@fontsource/geist-sans";
import "@fontsource/geist-mono";
import "./styles/globals.css";
import "streamdown/styles.css";

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Missing #app root element");
}

ReactDOM.createRoot(rootElement).render(<AppRouterProvider />);
