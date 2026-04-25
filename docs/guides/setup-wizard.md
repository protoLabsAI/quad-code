# Run the Setup Wizard

`proto setup` is an interactive wizard that walks you through configuring a model provider, entering your API key, and choosing a default model — all without touching a config file manually.

Run it immediately after installing proto, or any time you want to add a new provider or change the one you are using.

## When to use it

- **First install** — the fastest way to get from `npm install` to a working session.
- **Switching providers** — add Anthropic after you have been using OpenAI, or point proto at a local model.
- **Rotating API keys** — re-run the wizard and enter the new key; the old entry is replaced.
- **Enabling voice input** — the wizard includes an optional speech-to-text configuration step.

For fine-grained control over multiple providers, generation parameters, or per-project overrides, see [Configure Models & Auth](./configure-models).

## Run the wizard

```bash
proto setup
```

The wizard runs fully in the terminal. It requires an interactive TTY — it cannot run in CI or piped mode.

## Step-by-step walkthrough

### Step 1 — Select a provider

```
Select a provider:
  ❯ OpenAI                        api.openai.com
    OpenAI-compatible             Custom endpoint (Ollama, LiteLLM, vLLM, OpenRouter, etc.)
    Anthropic                     api.anthropic.com
    Google Gemini                 generativelanguage.googleapis.com
```

Use the arrow keys to move and Enter to confirm.

| Choice            | Auth type written | Default base URL                                   |
| ----------------- | ----------------- | -------------------------------------------------- |
| OpenAI            | `openai`          | `https://api.openai.com/v1`                        |
| OpenAI-compatible | `openai`          | _(required — you supply it)_                       |
| Anthropic         | `anthropic`       | `https://api.anthropic.com/v1`                     |
| Google Gemini     | `gemini`          | `https://generativelanguage.googleapis.com/v1beta` |

### Step 2 — Base URL

For **OpenAI**, **Anthropic**, and **Gemini** the default URL is pre-filled. Press Enter to accept it, or type a replacement.

For **OpenAI-compatible** endpoints (Ollama, vLLM, LiteLLM, OpenRouter, etc.) you must supply the full URL, for example:

```
Base URL: http://localhost:11434/v1
```

### Step 3 — API key

The wizard checks whether the expected environment variable (e.g. `OPENAI_API_KEY`) is already set:

```
Found OPENAI_API_KEY in environment (sk-a...z9).
Use this key? (Y/n):
```

If the key is present and you accept it, nothing is written to disk — the environment variable stays as the source of truth.

If no environment variable is found, or you decline to reuse it, the wizard prompts you to type the key. Input is masked with `*` characters. The key is then written to the `env` field of your settings file.

> [!warning]
> Storing keys in `settings.json` is convenient but the file is plaintext. For shared machines or projects tracked in Git, prefer `export OPENAI_API_KEY=...` in your shell profile or a `.proto/.env` file instead.

### Step 4 — Model discovery

```
⏳ Discovering models...

Found 42 model(s).
```

The wizard queries the provider's models endpoint using the base URL and key you supplied. If discovery fails it prints a warning and lets you type a model ID manually.

### Step 5 — Select a default model

For lists of 15 models or fewer, all choices appear at once. For larger lists the selector paginates with **← Previous page** / **→ Next page** navigation entries.

If the provider returns exactly one model, it is selected automatically.

### Step 6 — Voice input (optional)

```
🎤 Voice Input (Speech-to-Text)

Enable voice input (push-to-talk)?
  ❯ Yes, configure STT    Set up voice input using an OpenAI-compatible transcription endpoint
    Skip for now          You can enable later via /voice or settings.json
```

If you choose **Yes, configure STT**:

- The wizard derives a default STT endpoint from the provider base URL (`{baseUrl}/audio/transcriptions`) and shows it for confirmation.
- You can accept the default or supply a different URL.
- You choose which environment variable holds the STT API key (defaults to the same key used for the provider).

Voice input requires an audio capture backend (`sox` is recommended; `alsa-utils` is the fallback on Linux). Use `/voice status` inside a session to check the detected backend.

### Step 7 — Provider label (optional)

```
Provider label (default: OpenAI):
```

Press Enter to keep the preset name, or type a custom label (e.g. `My Ollama`). This label appears in the `/model` picker.

### Completion

```
✅ Setup complete!
   Provider:  OpenAI
   Endpoint:  https://api.openai.com/v1
   Model:     gpt-4o

Run `proto` to start chatting.
```

## What gets written to settings.json

The wizard writes to whichever scope already owns a `modelProviders` block — workspace scope if the folder is trusted and has one, otherwise your global user settings at `~/.proto/settings.json`.

The following fields are updated (existing entries with matching `baseUrl` + model `id` pairs are replaced; others are preserved):

```json
{
  "modelProviders": {
    "<authType>": [
      {
        "id": "gpt-4o",
        "name": "OpenAI — gpt-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ]
  },
  "env": {
    "OPENAI_API_KEY": "<key>"
  },
  "security": {
    "auth": { "selectedType": "openai" }
  },
  "model": { "name": "gpt-4o" },
  "voice": {
    "enabled": true,
    "sttEndpoint": "https://api.openai.com/v1/audio/transcriptions",
    "sttEnvKey": "OPENAI_API_KEY"
  }
}
```

The `env` block is only written when you type a key during the wizard. Keys sourced from the environment are never written to disk. The `voice` block is only written if you configure STT during step 6.

A timestamped backup of the settings file is created before any changes are applied.

## The `/setup` slash command

Inside a running proto session, `/setup` is available as a reminder:

```
/setup
```

Because the wizard requires exclusive terminal access, running `/setup` inside a session does not launch the wizard. Instead it prints:

```
🔧 The setup wizard requires exclusive terminal access.

Run `proto setup` from your terminal to configure a provider, API key, and default model interactively.
```

Exit the session (`/quit`) and then run `proto setup`.

## Tips

- **Run it more than once** — each run merges new model entries with existing ones rather than replacing the whole config. Models with the same `id` + `baseUrl` pair are overwritten; everything else is kept.
- **Manual edits** — after the wizard runs you can open `~/.proto/settings.json` and add `generationConfig`, set a fast model, or tune any other field. The wizard only touches the fields listed above.
- **Local models** — choose **OpenAI-compatible**, set the base URL to your local server (e.g. `http://localhost:11434/v1` for Ollama), and use any placeholder string (e.g. `ollama`) as the API key if the server does not require authentication.
- **Cancelling** — press `Ctrl+C` at any prompt to cancel cleanly. No changes are written until the final persist step.
