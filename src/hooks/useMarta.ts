import { useCallback, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { useServerFn } from "@tanstack/react-start";
import { getConversationToken } from "@/lib/elevenlabs.functions";

export interface MartaStart {
  prompt: string;
  firstMessage: string;
  language: "it" | "en";
}

/** Voce di Marta (ElevenAgents Expressive). Se il microfono o l'agente non sono disponibili si passa al testo. */
export function useMarta(handlers: { onMarta?: (text: string) => void; onHeard?: (text: string) => void }) {
  const h = useRef(handlers);
  h.current = handlers;
  const getToken = useServerFn(getConversationToken);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const conv = useConversation({
    onMessage: (m: { message: string; source?: string; role?: string }) => {
      const who = m.source ?? (m.role === "agent" ? "ai" : "user");
      if (!m.message || m.message.startsWith("[SYSTEM]")) return;
      if (who === "ai") h.current.onMarta?.(m.message);
      else h.current.onHeard?.(m.message);
    },
    onError: (e: unknown) => {
      console.error("marta", e);
      setError(typeof e === "string" ? e : "Marta’s connection was interrupted");
    },
  });

  const connected = conv.status === "connected";

  const start = useCallback(
    async (cfg: MartaStart) => {
      setError(null);
      setStarting(true);
      try {
        const { token } = await getToken();
        await conv.startSession({
          conversationToken: token,
          connectionType: "webrtc",
          overrides: { agent: { prompt: { prompt: cfg.prompt }, firstMessage: cfg.firstMessage, language: cfg.language } },
        });
        return true;
      } catch (e) {
        console.error("marta start", e);
        setError(e instanceof Error ? e.message : "Marta could not connect");
        return false;
      } finally {
        setStarting(false);
      }
    },
    [conv, getToken],
  );

  const end = useCallback(async () => {
    try {
      await conv.endSession();
    } catch {
      /* già chiusa */
    }
  }, [conv]);

  /** Dice a Marta di parlare (messaggio [SISTEMA] con istruzione). */
  const cue = useCallback(
    (text: string) => {
      if (conv.status === "connected") conv.sendUserMessage(`[SYSTEM] ${text}`);
    },
    [conv],
  );
  /** Aggiorna il contesto di Marta senza farla parlare. */
  const context = useCallback(
    (text: string) => {
      if (conv.status === "connected") conv.sendContextualUpdate(`[SYSTEM] ${text}`);
    },
    [conv],
  );

  return {
    connected,
    starting,
    error,
    speaking: conv.isSpeaking,
    start,
    end,
    cue,
    context,
    setMuted: (m: boolean) => conv.setMuted(m),
  };
}
