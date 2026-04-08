---
name: browser-automation
description: Use browser automation to interact with web pages - navigate, click, fill forms, take screenshots, and extract content from websites. Perfect for testing, data collection, and web interactions.
---

# Browser Automation

Use the native `browser` tool to automate web browser interactions. This skill enables AI agents to navigate websites, interact with elements, fill forms, and extract information.

## Prerequisites

**Before using this skill, verify:**

1. **agent-browser is installed:**

   ```bash
   agent-browser --version
   ```

   If not installed:

   ```bash
   npm install -g agent-browser
   agent-browser install  # Downloads Chrome
   ```

2. **Chrome is installed:**
   The browser tool will auto-download Chrome if needed via `agent-browser install`.

## Core Workflow

### Step 1: Open a Website

```javascript
browser({
  action: 'open',
  url: 'https://example.com',
  headed: false, // true to see browser window
});
```

### Step 2: Get Interactive Elements

Use `snapshot` to get an accessibility tree with numbered element references:

```javascript
browser({
  action: 'snapshot',
  flags: JSON.stringify({ interactive: true }),
});
```

**Output shows elements with refs like:**

```text
[e1] Button: "Submit"
[e2] Textbox: "Email"
[e3] Textbox: "Password"
```

### Step 3: Interact with Elements

**Click an element:**

```javascript
browser({
  action: 'click',
  selector: '@e2', // or CSS selector like "#submit-btn"
});
```

**Fill a form field:**

```javascript
browser({
  action: 'fill',
  selector: '@e2',
  text: 'user@example.com',
});
```

**Type with keystroke simulation:**

```javascript
browser({
  action: 'type',
  selector: '@e3',
  text: 'password123',
});
```

### Step 4: Take Screenshots

**Page screenshot:**

```javascript
browser({
  action: 'screenshot',
  outputPath: '/path/to/screenshot.png',
});
```

**Full-page screenshot:**

```javascript
browser({
  action: 'screenshot',
  outputPath: '/path/to/full.png',
  flags: JSON.stringify({ full: true }),
});
```

## Selector Types

| Type         | Example                         | Use Case             |
| ------------ | ------------------------------- | -------------------- |
| Element ref  | `@e1`, `@e2`                    | From snapshot output |
| CSS selector | `#id`, `.class`, `div > button` | Standard web dev     |
| Semantic     | `role:button`, `text:"Sign In"` | AI-friendly          |

## Common Actions Reference

### Navigation

```javascript
// Open URL
browser({ action: 'open', url: 'https://example.com' });

// Close browser
browser({ action: 'close' });

// New tab
browser({ action: 'tab', text: 'new', url: 'https://example.com' });
```

### Element Interaction

```javascript
// Click
browser({ action: 'click', selector: '@e1' });

// Double-click
browser({ action: 'dblclick', selector: '@e1' });

// Hover
browser({ action: 'hover', selector: '@e1' });

// Fill (clears and types)
browser({ action: 'fill', selector: '@e2', text: 'value' });

// Type (appends)
browser({ action: 'type', selector: '@e2', text: 'value' });

// Press key
browser({ action: 'press', key: 'Enter' });
browser({ action: 'press', key: 'Tab' });
browser({ action: 'press', key: 'Escape' });
```

### Page Information

```javascript
// Get page title
browser({ action: 'get', text: 'title' });

// Get current URL
browser({ action: 'get', text: 'url' });

// Get element text
browser({ action: 'get', selector: '@e1', text: 'text' });

// Get element attribute
browser({ action: 'get', selector: '@e1', text: 'attr', attribute: 'href' });

// Check if visible
browser({ action: 'is', text: 'visible', selector: '@e1' });
```

### Find Elements

```javascript
// Find by role and click
browser({ action: 'find', selector: 'role button', text: 'click' });

// Find by text
browser({ action: 'find', selector: 'text "Sign In"', text: 'click' });

// Find by label
browser({ action: 'find', selector: 'label "Email"', text: 'fill' });
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

// Wait with timeout (default 25s)
browser({ action: 'wait', selector: '@e1' });
```

### Batch Operations

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

## Sessions

Sessions persist authentication and state between commands:

```javascript
// Create named session
browser({
  action: 'open',
  url: 'https://app.example.com',
  session: 'myapp-auth',
});

// Continue in same session
browser({
  action: 'click',
  selector: '@e1',
  session: 'myapp-auth',
});
```

## Advanced Features

### Headed Mode (see browser window)

```javascript
browser({
  action: 'open',
  url: 'https://example.com',
  headed: true,
});
```

### Network Interception

```javascript
// Block a URL
browser({
  action: 'network',
  text: 'route',
  selector: 'https://ads.example.com',
  attribute: 'abort', // or mock response
});

// View requests
browser({ action: 'network', text: 'requests' });
```

### Cookies & Storage

```javascript
// Get cookies
browser({ action: 'cookies' });

// Get localStorage
browser({ action: 'storage', text: 'local' });

// Set localStorage
browser({
  action: 'storage',
  text: 'local',
  selector: 'set myKey myValue',
});
```

### Clipboard

```javascript
// Read clipboard
browser({ action: 'clipboard' });

// Write to clipboard
browser({ action: 'clipboard', text: 'write Hello World' });
```

## Best Practices

1. **Always start with `snapshot`**: Get the accessibility tree to understand page structure

2. **Use element refs from snapshot**: They're more reliable than CSS selectors for AI automation

3. **Wait for network idle**: After form submissions or page loads:

   ```javascript
   browser({ action: 'wait', text: 'networkidle' });
   ```

4. **Use sessions for multi-step flows**: Maintains login state and cookies:

   ```javascript
   browser({ action: 'open', url: 'https://app.com', session: 'app' });
   ```

5. **Take screenshots for debugging**: When automation fails, screenshot helps debug:

   ```javascript
   browser({ action: 'screenshot', outputPath: '/tmp/debug.png' });
   ```

6. **Close browser when done**: Free resources:
   ```javascript
   browser({ action: 'close' });
   ```

## Error Handling

If agent-browser is not installed, you'll get:

```text
agent-browser is not installed. Please install it with: npm install -g agent-browser
```

**Installation troubleshooting:**

```bash
# Install Chrome dependency
agent-browser install --with-deps

# Check installation
which agent-browser
agent-browser --version
```

## Use Cases

- **Web testing**: Automate UI testing workflows
- **Form filling**: Submit forms programmatically
- **Data extraction**: Scrape content from websites
- **Login flows**: Handle authentication
- **Screenshot capture**: Document web pages
- **Accessibility testing**: Verify page structure
