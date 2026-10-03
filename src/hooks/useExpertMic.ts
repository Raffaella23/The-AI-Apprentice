import { useCallback, useRef, useState } from "react";
import { CommitStrategy, useScribe } from "@elevenlabs/react";
import { useServerFn } from "@tanstack/react-start";
import { getScribeToken } from "@/lib/elevenlabs.functions";

/** Trascrizione dal vivo con Scribe v2 realtime. */
export function useExpertMic(h: { onSpeech: () => void; onCommitted: (text: string) => void }, language: "it" | "en" = "it") {
  const cb = useRef(h);
  cb.current = h;
  const getToken = useServerFn(getScribeToken);
  const [error, setError] = useState<string | null>(null);
  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 1.2,
    languageCode: language,
    onPartialTranscript: (d) => {
      if (d.text?.trim()) cb.current.onSpeech();
    },
    onCommittedTranscript: (d) => {
      if (d.text?.trim()) {
        cb.current.onSpeech();
        cb.current.onCommitted(d.text.trim());
      }
    },
    onError: (e) => {
      console.error("scribe", e);
      setError("Trascrizione interrotta");
    },
  });

  const start = useCallback(async () => {
    setError(null);
    try {
      const { token } = await getToken();
      await scribe.connect({
        token,
        microphone: { echoCancellation: true, noiseSuppression: true },
      });
      return true;
    } catch (e) {
      console.error("scribe start", e);
      setError(e instanceof Error ? e.message : "Microfono non disponibile");
      return false;
    }
  }, [getToken, scribe]);

  const stop = useCallback(() => {
    try {
      scribe.disconnect();
    } catch {
      /* già chiuso */
    }
  }, [scribe]);

  return { start, stop, connected: scribe.isConnected, partial: scribe.partialTranscript, error };
}
