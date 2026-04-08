# Proxy Script Example

A Node.js proxy script for use with `PROTO_SANDBOX_PROXY_COMMAND`. This example allows HTTPS connections only to `example.com` and `googleapis.com` on port 443, and blocks everything else.

Set `PROTO_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js` to run this proxy alongside the sandbox. The proxy must listen on `:::8877`.

Use with the `*-proxied` Seatbelt profiles (e.g. `SEATBELT_PROFILE=permissive-proxied`) to restrict outbound network access to an allowlist.

```javascript
#!/usr/bin/env node

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  console.log(`[PROXY] Denying non-CONNECT request: ${req.method} ${req.url}`);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.on('connect', (req, clientSocket, head) => {
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] CONNECT ${hostname}:${port}`);

  const allowed =
    ALLOWED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`)) &&
    port === ALLOWED_PORT;

  if (!allowed) {
    console.log(`[PROXY] Blocked: ${hostname}:${port}`);
    clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    clientSocket.destroy();
    return;
  }

  console.log(`[PROXY] Allowing: ${hostname}:${port}`);
  const serverSocket = net.connect(Number(port), hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    console.error(`[PROXY] Error: ${err.message}`);
    clientSocket.destroy();
  });

  clientSocket.on('error', (err) => {
    console.error(`[PROXY] Client error: ${err.message}`);
    serverSocket.destroy();
  });
});

server.listen(PROXY_PORT, '::', () => {
  console.log(`[PROXY] Listening on :::${PROXY_PORT}`);
});
```

## Customise the allowlist

Edit `ALLOWED_DOMAINS` to include the domains your workflow needs. Only HTTPS (port 443) is tunnelled — HTTP requests are blocked.

## Test it

With sandboxing and the proxy enabled:

```bash
PROTO_SANDBOX=sandbox-exec SEATBELT_PROFILE=permissive-proxied \
  PROTO_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js \
  proto -s -p "fetch https://example.com and summarize it"
```

Attempting to access a non-allowed domain will result in a 403 Forbidden response.
