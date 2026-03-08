import { Navigate, Route, Routes } from "react-router-dom"
import ChatPage from "@/pages/ChatPage"

export default function App() {
  return (
    <Routes>
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/" element={<ChatPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
