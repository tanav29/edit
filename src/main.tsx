import { createRoot } from "react-dom/client"
import { HashRouter } from "react-router-dom"
import { ChatStoreProvider } from "@/lib/chat-store"
import App from "@/src/App"
import "@/app/globals.css"

createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <ChatStoreProvider>
      <App />
    </ChatStoreProvider>
  </HashRouter>
)
