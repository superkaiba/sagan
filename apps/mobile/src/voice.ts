/**
 * Voice dispatch helper. Wraps expo-speech-recognition so screens can
 * call `transcribeOnce()` and get back a Promise<string> with the final
 * transcript. The agent screen pipes that into the prompt textarea
 * before POSTing to /api/agent-runs.
 */
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from 'expo-speech-recognition';

export type TranscriptionEvent =
  | { type: 'partial'; transcript: string }
  | { type: 'final'; transcript: string }
  | { type: 'error'; message: string };

export type TranscribeHandle = {
  stop: () => void;
};

export async function startTranscription(
  onEvent: (event: TranscriptionEvent) => void,
  options: { lang?: string } = {},
): Promise<TranscribeHandle> {
  const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!permission.granted) {
    onEvent({ type: 'error', message: 'microphone or speech permission denied' });
    return { stop: () => {} };
  }

  const subResult = ExpoSpeechRecognitionModule.addListener(
    'result',
    (event: ExpoSpeechRecognitionResultEvent) => {
      const transcript = event.results?.[0]?.transcript ?? '';
      if (!transcript) return;
      onEvent({ type: event.isFinal ? 'final' : 'partial', transcript });
    },
  );

  const subError = ExpoSpeechRecognitionModule.addListener(
    'error',
    (event: ExpoSpeechRecognitionErrorEvent) => {
      onEvent({ type: 'error', message: event.error ?? 'speech recognition error' });
    },
  );

  ExpoSpeechRecognitionModule.start({
    lang: options.lang ?? 'en-US',
    interimResults: true,
    continuous: false,
  });

  return {
    stop: () => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // No-op — module may already be stopped.
      }
      subResult.remove();
      subError.remove();
    },
  };
}
