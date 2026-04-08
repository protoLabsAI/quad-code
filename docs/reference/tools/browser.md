# Browser Tool

The browser tool enables AI agents to automate web browser interactions using [agent-browser](https://github.com/nickinack/agent-browser).

## Requirements

```bash
npm install -g agent-browser
agent-browser install  # Downloads Chrome
```

## Core Actions

### Navigation

```javascript
// Open a URL
browser({ action: 'open', url: 'https://example.com' });

// Close browser
browser({ action: 'close' });

// Navigate to new tab
browser({ action: 'tab', text: 'new', url: 'https://example.com' });
```

### Element Interaction

```javascript
// Click an element
browser({ action: 'click', selector: '@e2' });

// Double-click
browser({ action: 'dblclick', selector: '@e2' });

// Hover
browser({ action: 'hover', selector: '@e2' });

// Fill input (clears then types)
browser({ action: 'fill', selector: '@e2', text: 'user@example.com' });

// Type (appends)
browser({ action: 'type', selector: '@e2', text: ' more text' });

// Press key
browser({ action: 'press', key: 'Enter' });
```

### Page Inspection

```javascript
// Get accessibility tree with interactive elements
browser({ action: 'snapshot', flags: JSON.stringify({ interactive: true }) });

// Take screenshot
browser({ action: 'screenshot', outputPath: '/path/to/screenshot.png' });

// Full page screenshot
browser({
  action: 'screenshot',
  outputPath: '/path/to/full.png',
  flags: JSON.stringify({ full: true }),
});

// Get page title
browser({ action: 'get', text: 'title' });

// Get current URL
browser({ action: 'get', text: 'url' });

// Get element text
browser({ action: 'get', selector: '@e1', text: 'text' });

// Check if visible
browser({ action: 'is', text: 'visible', selector: '@e1' });
```

### Waiting

```javascript
// Wait for URL pattern
browser({ action: 'wait', text: '**/dashboard' });

// Wait for text
browser({ action: 'wait', text: 'Welcome' });

// Wait for network idle
browser({ action: 'wait', text: 'networkidle' });

// Wait for selector
browser({ action: 'wait', selector: '@e1' });
```

### Batch Commands

Execute multiple commands in sequence:

```javascript
browser({
  action: 'batch',
  commands: [
    'open https://example.com',
    'wait --load networkidle',
    'fill @e1 user@example.com',
    'fill @e2 password',
    'click @e3',
    'wait --url **/dashboard',
  ],
});
```

## Selector Types

| Type         | Example                          | Description           |
| ------------ | -------------------------------- | --------------------- |
| Element ref  | `@e1`, `@e2`                     | From snapshot output  |
| CSS selector | `#id`, `.class`, `button.submit` | Standard CSS          |
| Semantic     | `role:button`, `text:"Sign In"`  | AI-friendly selectors |

## Sessions

Sessions persist authentication and cookies:

```javascript
// Create session
browser({ action: 'open', url: 'https://app.example.com', session: 'myapp' });

// Continue in same session
browser({ action: 'click', selector: '@e1', session: 'myapp' });
```

## All Actions (38 total)

| Action              | Description               |
| ------------------- | ------------------------- |
| `open`              | Navigate to URL           |
| `close`             | Close browser             |
| `tab`               | Manage tabs               |
| `click`             | Click element             |
| `dblclick`          | Double-click element      |
| `hover`             | Hover over element        |
| `fill`              | Fill form field           |
| `type`              | Type into field           |
| `press`             | Press keyboard key        |
| `select`            | Select dropdown option    |
| `check` / `uncheck` | Toggle checkbox/radio     |
| `upload`            | Upload file               |
| `snapshot`          | Get accessibility tree    |
| `screenshot`        | Capture screenshot        |
| `get`               | Get element/page property |
| `is`                | Check element state       |
| `find`              | Find element by role/text |
| `wait`              | Wait for condition        |
| `batch`             | Execute command batch     |
| `scroll`            | Scroll page/element       |
| `clipboard`         | Read/write clipboard      |
| `mouse`             | Mouse movement            |
| `keyboard`          | Keyboard control          |
| `window`            | Window management         |
| `cookies`           | Cookie management         |
| `storage`           | Local/session storage     |
| `network`           | Network interception      |
| `diff`              | Visual diff               |
| `chat`              | AI-assisted interaction   |
| `dashboard`         | Performance dashboard     |
| `console`           | Access console logs       |
| `errors`            | Get page errors           |
| `trace`             | Performance trace         |
| `profiler`          | CPU profiler              |
| `inspect`           | Inspect element           |
| `eval`              | Evaluate JavaScript       |
| `install`           | Install browser           |
| `profiles`          | Manage profiles           |

For detailed documentation on all actions, see the **browser-automation** skill via `/skills`.
