# Voice Input (Push-to-Talk)

proto includes a push-to-talk voice input feature that lets you speak a prompt instead of typing it. Audio is recorded locally, sent to a Speech-to-Text (STT) server you control, and the transcript is inserted into the input field — ready to edit or send.

## Prerequisites

Voice input requires two things:

1. **An audio capture backend** on the host machine:

   | Backend       | Package      | Notes                       |
   | ------------- | ------------ | --------------------------- |
   | `sox` (`rec`) | `sox`        | Recommended; cross-platform |
   | `arecord`     | `alsa-utils` | Linux ALSA fallback         |

   Install on Debian/Ubuntu:

   ```bash
   sudo apt install sox          # recommended
   # or
   sudo apt install alsa-utils   # fallback
   ```

   Install on macOS:

   ```bash
   brew install sox
   ```

2. **A compatible STT server** that exposes an OpenAI-compatible `/v1/audio/transcriptions` endpoint. Common options:
   - [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — run `./server` with `--port 8000`
   - Any OpenAI-compatible proxy that forwards to a Whisper API

   The server must accept multipart `POST` requests at `/v1/audio/transcriptions` and return JSON `{ "text": "..." }`.

## Configuration

Add a `voice` section to your settings file (`~/.proto/settings.json` for global, or `.proto/settings.json` for per-project):

```json
{
  "voice": {
    "enabled": true,
    "sttEndpoint": "http://localhost:8000/v1/audio/transcriptions",
    "sttEnvKey": "OPENAI_API_KEY"
  }
}
```

| Setting             | Type    | Default                                         | Description                                                                                                         |
| ------------------- | ------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `voice.enabled`     | boolean | `false`                                         | Enable or disable voice input                                                                                       |
| `voice.sttEndpoint` | string  | `http://localhost:8000/v1/audio/transcriptions` | URL of the STT endpoint                                                                                             |
| `voice.sttEnvKey`   | string  | —                                               | Name of an environment variable whose value is sent as `Authorization: Bearer <value>`. Optional for local servers. |

The `sttEndpoint` value supports `$VAR` environment variable interpolation. For a local whisper.cpp instance, `sttEnvKey` can be omitted.

## Slash commands

| Command         | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `/voice`        | Toggle voice input on or off (persisted to user settings)          |
| `/voice status` | Show current status: enabled/disabled, endpoint URL, audio backend |

### Examples

```
/voice status
```

```
Voice input: enabled
STT endpoint: http://localhost:8000/v1/audio/transcriptions
Audio backend: sox
```

```
/voice
```

```
Voice input disabled.
```

## Using voice input

Once enabled, use **Ctrl+Space** in the input prompt to start and stop recording:

1. Press **Ctrl+Space** — recording starts. The indicator `[● REC]` appears beside the input.
2. Speak your prompt.
3. Press **Ctrl+Space** again — recording stops and the audio is sent to the STT endpoint. The indicator changes to `[◌ STT...]` while the transcript is being fetched.
4. The transcript is inserted into the input field. Review or edit it, then press **Enter** to submit.

> [!note]
> The Ctrl+Space binding is only active when voice input is enabled (`voice.enabled: true`). If the audio backend is not found the key combination has no effect.

## Troubleshooting

### `/voice status` reports `Audio backend: none`

No supported audio capture program was found on `PATH`. Install `sox` (recommended) or `alsa-utils` and restart proto.

### The transcript is empty after releasing Ctrl+Space

The audio file contained only a WAV header (44 bytes), meaning no audio data was captured. Check:

- Microphone permissions for the terminal application.
- That the correct input device is selected as the system default.
- That the `rec` or `arecord` binary works independently: `rec /tmp/test.wav`.

### The STT endpoint returns an error

Run `/voice status` to confirm the endpoint URL is correct, then test it manually:

```bash
curl -s http://localhost:8000/v1/audio/transcriptions \
  -F file=@/tmp/test.wav \
  -F model=whisper-1 | jq .
```

If a key is required, add `-H "Authorization: Bearer $YOUR_KEY"`.

### Transcript shows the wrong language

Whisper auto-detects language by default. Pass a `language` parameter to your STT server if it supports it, or configure the server to force a specific language.
