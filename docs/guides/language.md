# Language (i18n)

proto supports both UI localization (terminal menus, system messages) and LLM output language control.

## UI language

Controls the language of CLI menus, prompts, and system messages.

```
/language ui zh-CN    # Chinese (Simplified)
/language ui en-US    # English
/language ui de-DE    # German
/language ui ja-JP    # Japanese
/language ui ru-RU    # Russian
```

Short aliases also work: `zh`, `en`, `de`, `ja`, `ru`.

**Auto-detection priority:**

1. `PROTO_LANG` environment variable
2. `LANG` environment variable
3. System locale via JavaScript `Intl` API
4. Default: English

## LLM output language

Controls what language proto's assistant responds in, regardless of what language you write in.

```
/language output Chinese
/language output English
/language output Japanese
```

Any language name works. The preference is stored in `~/.proto/output-language.md` and injected into the system prompt at session start.

> [!note]
> Restart proto after changing the output language for the change to take effect.

## View current settings

```
/language
```

## Set via settings

```json
// ~/.proto/settings.json
{
  "general": {
    "language": "zh-CN"
  }
}
```

Or set the environment variable before starting:

```bash
export PROTO_LANG=zh proto
```

## Custom language packs

Override or extend built-in UI translations by placing `.js` files in `~/.proto/locales/`:

```javascript
// ~/.proto/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
};
```

User locale files take precedence over built-in translations.
