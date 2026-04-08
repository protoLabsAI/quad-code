# Themes

Customise proto's color scheme via the `/theme` command or `settings.json`.

## Change theme

```
/theme
```

Use arrow keys to select from the list. The selection is saved automatically.

## Built-in themes

**Dark:** ANSI, Atom One, Ayu, Default, Dracula, GitHub

**Light:** ANSI Light, Ayu Light, Default Light, GitHub Light, Google Code, Xcode

## Set via settings

```json
{
  "ui": {
    "theme": "Dracula"
  }
}
```

> [!note]
> If `theme` is set in `settings.json`, the `/theme` command won't override it until you remove the setting from the file.

## Custom themes

Define a custom theme in `settings.json`:

```json
{
  "ui": {
    "customThemes": {
      "MyTheme": {
        "name": "MyTheme",
        "type": "custom",
        "Background": "#282A36",
        "Foreground": "#F8F8F2",
        "LightBlue": "#82AAFF",
        "AccentBlue": "#61AFEF",
        "AccentPurple": "#BD93F9",
        "AccentCyan": "#8BE9FD",
        "AccentGreen": "#50FA7B",
        "AccentYellow": "#F1FA8C",
        "AccentRed": "#FF5555",
        "Comment": "#6272A4",
        "Gray": "#ABB2BF",
        "DiffAdded": "#A6E3A1",
        "DiffRemoved": "#F38BA8",
        "DiffModified": "#89B4FA"
      }
    },
    "theme": "MyTheme"
  }
}
```

Required color keys: `Background`, `Foreground`, `LightBlue`, `AccentBlue`, `AccentPurple`, `AccentCyan`, `AccentGreen`, `AccentYellow`, `AccentRed`, `Comment`, `Gray`.

Optional: `DiffAdded`, `DiffRemoved`, `DiffModified`, `GradientColors`.

Values accept hex codes (`#FF0000`) or CSS color names (`coral`, `teal`).

## Load a theme from a file

```json
{
  "ui": {
    "theme": "/path/to/my-theme.json"
  }
}
```

The JSON file must follow the same structure as an inline custom theme. For security, proto only loads theme files within your home directory.

## Custom themes via settings scope

Custom themes can be set at user, project, or system scope and follow the same [configuration precedence](../reference/settings) as other settings.
