"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  name: string;
  path: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  sessionKey?: string;
  isRemoteEnabled?: boolean;
}

interface ChatStoreContextType {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  createSession: (path: string, name?: string) => ChatSession;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  addMessage: (message: ChatMessage) => void;
  clearCurrentSession: () => void;
  isGenUIEnabled: boolean;
  setIsGenUIEnabled: (enabled: boolean) => void;
  toggleRemoteMode: (enabled: boolean) => void;
  setMessagesForSession: (sessionId: string, messages: ChatMessage[]) => void;
}

const ChatStoreContext = createContext<ChatStoreContextType | null>(null);

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isGenUIEnabled, setIsGenUIEnabled] = useState(true);

  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch("/api/history");
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
          if (data.length > 0 && !currentSessionId) {
            setCurrentSessionId(data[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to load sessions:", error);
      } finally {
        setLoaded(true);
      }
    }
    loadSessions();

    const handleRemoteUpdate = () => loadSessions();
    window.addEventListener('remote-update', handleRemoteUpdate);
    return () => window.removeEventListener('remote-update', handleRemoteUpdate);
  }, [currentSessionId]);

  useEffect(() => {
    if (!loaded) return;

    const currentSession = sessions.find((s) => s.id === currentSessionId);
    if (currentSession && currentSession.messages.length > 0) {
      const timeoutId = setTimeout(() => {
        fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentSession),
        }).catch(console.error);
      }, 5000);
      return () => clearTimeout(timeoutId);
    }
  }, [sessions, currentSessionId, loaded]);

  const currentSession =
    sessions.find((s) => s.id === currentSessionId) || null;

  function setMessagesForSession(sessionId: string, messages: ChatMessage[]) {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === sessionId) {
          return {
            ...session,
            messages,
            updatedAt: Date.now(),
          };
        }
        return session;
      }),
    );
  }

  function generateSessionKey() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  function toggleRemoteMode(enabled: boolean) {
    if (!currentSessionId) return;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            isRemoteEnabled: enabled,
            sessionKey: enabled ? (session.sessionKey || generateSessionKey()) : session.sessionKey,
            updatedAt: Date.now(),
          };
        }
        return session;
      }),
    );
  }

  function createSession(workspacePath: string, name?: string): ChatSession {
    const sessionName = name || `Chat ${sessions.length + 1}`;
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      name: sessionName,
      path: workspacePath,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    return newSession;
  }

  function selectSession(id: string) {
    setCurrentSessionId(id);
  }

  function deleteSession(id: string) {
    const session = sessions.find((s) => s.id === id);
    if (session) {
      fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionPath: session.path }),
      }).catch(console.error);
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  function addMessage(message: ChatMessage) {
    if (!currentSessionId) return;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            messages: [...session.messages, message],
            updatedAt: Date.now(),
          };
        }
        return session;
      }),
    );
  }

  function clearCurrentSession() {
    if (!currentSessionId) return;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            messages: [],
            updatedAt: Date.now(),
          };
        }
        return session;
      }),
    );
  }

  return (
    <ChatStoreContext.Provider
      value={{
        sessions,
        currentSession,
        createSession,
        selectSession,
        deleteSession,
        addMessage,
        clearCurrentSession,
        isGenUIEnabled,
        setIsGenUIEnabled,
        toggleRemoteMode,
        setMessagesForSession,
      }}>
      {children}
    </ChatStoreContext.Provider>
  );
}

export function useChatStore() {
  const context = useContext(ChatStoreContext);
  if (!context) {
    throw new Error("useChatStore must be used within a ChatStoreProvider");
  }
  return context;
}
