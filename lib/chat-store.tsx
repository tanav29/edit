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
}

interface ChatStoreContextType {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  isLoaded: boolean;
  createSession: (path: string, name?: string) => ChatSession;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  deleteSessionsForPath: (path: string) => void;
  saveSessionPayload: (session: ChatSession) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  clearCurrentSession: () => void;
  isGenUIEnabled: boolean;
  setIsGenUIEnabled: (enabled: boolean) => void;
  setMessagesForSession: (sessionId: string, messages: ChatMessage[]) => void;
}

const ChatStoreContext = createContext<ChatStoreContextType | null>(null);

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenUIEnabled, setIsGenUIEnabled] = useState(false);

  const saveSession = async (session: ChatSession) => {
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      });
    } catch (error) {
      console.error("Failed to save session:", error);
    }
  };

  async function saveSessionPayload(session: ChatSession) {
    await saveSession(session);
  }

  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch("/api/history");
        if (!res.ok) return;

        const data: ChatSession[] = await res.json();
        setSessions(data);

        setCurrentSessionId((prev) => {
          if (prev && data.some((session) => session.id === prev)) {
            return prev;
          }
          return data.length > 0 ? data[0].id : null;
        });
      } catch (error) {
        console.error("Failed to load sessions:", error);
      } finally {
        setIsLoaded(true);
      }
    }

    loadSessions();
  }, []);

  const currentSession =
    sessions.find((session) => session.id === currentSessionId) || null;

  function setMessagesForSession(sessionId: string, messages: ChatMessage[]) {
    let updatedSession: ChatSession | null = null;

    setSessions((prev) => {
      const next = prev.map((session) => {
        if (session.id !== sessionId) return session;

        updatedSession = {
          ...session,
          messages,
          updatedAt: Date.now(),
        };

        return updatedSession;
      });

      return next;
    });

    if (updatedSession) {
      void saveSession(updatedSession);
    }
  }

  function createSession(workspacePath: string, name?: string): ChatSession {
    const existingForPath = sessions.filter(
      (session) => session.path === workspacePath,
    );
    const sessionName = name || `Chat ${existingForPath.length + 1}`;

    const newSession: ChatSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: sessionName,
      path: workspacePath,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    void saveSession(newSession);

    return newSession;
  }

  function selectSession(id: string) {
    setCurrentSessionId(id);
  }

  function deleteSession(id: string) {
    setSessions((prev) => {
      const next = prev.filter((session) => session.id !== id);

      if (currentSessionId === id) {
        setCurrentSessionId(next.length > 0 ? next[0].id : null);
      }

      return next;
    });

    const session = sessions.find((item) => item.id === id);
    if (session) {
      fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionPath: session.path,
          sessionId: session.id,
        }),
      }).catch((error) => console.error("Failed to delete session:", error));
    }
  }

  function deleteSessionsForPath(sessionPath: string) {
    setSessions((prev) => {
      const next = prev.filter((session) => session.path !== sessionPath);

      if (
        currentSessionId &&
        prev.some(
          (session) =>
            session.id === currentSessionId && session.path === sessionPath,
        )
      ) {
        setCurrentSessionId(next.length > 0 ? next[0].id : null);
      }

      return next;
    });

    fetch("/api/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionPath }),
    }).catch((error) =>
      console.error("Failed to delete sessions for path:", error),
    );
  }

  function addMessage(message: ChatMessage) {
    if (!currentSessionId) return;

    let updatedSession: ChatSession | null = null;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== currentSessionId) return session;

        updatedSession = {
          ...session,
          messages: [...session.messages, message],
          updatedAt: Date.now(),
        };

        return updatedSession;
      }),
    );

    if (updatedSession) {
      void saveSession(updatedSession);
    }
  }

  function clearCurrentSession() {
    if (!currentSessionId) return;

    let updatedSession: ChatSession | null = null;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== currentSessionId) return session;

        updatedSession = {
          ...session,
          messages: [],
          updatedAt: Date.now(),
        };

        return updatedSession;
      }),
    );

    if (updatedSession) {
      void saveSession(updatedSession);
    }
  }

  return (
    <ChatStoreContext.Provider
      value={{
        sessions,
        currentSession,
        isLoaded,
        createSession,
        selectSession,
        deleteSession,
        deleteSessionsForPath,
        saveSessionPayload,
        addMessage,
        clearCurrentSession,
        isGenUIEnabled,
        setIsGenUIEnabled,
        setMessagesForSession,
      }}
    >
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
