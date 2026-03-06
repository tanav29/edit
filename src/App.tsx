import { Navigate, Route, Routes } from "react-router-dom"
import HomePage from "@/app/page"
import ChatPage from "@/app/chat/page"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
