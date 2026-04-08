# SDK Tool Examples

Examples of creating in-process MCP tools that proto can call directly from your SDK program — no separate server process needed.

## In-process tool with Zod schema

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@proto/sdk';

const lookupUser = tool(
  'lookup_user',
  'Look up a user by email address',
  {
    email: z.string().email().describe('The user email to look up'),
  },
  async (args) => {
    const user = await db.users.findByEmail(args.email);
    if (!user) {
      return {
        content: [{ type: 'text', text: `No user found for ${args.email}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(user, null, 2) }],
    };
  },
);

const server = createSdkMcpServer({
  name: 'user-service',
  tools: [lookupUser],
});

const session = query({
  prompt: 'Find the account for alice@example.com and summarize it',
  options: {
    permissionMode: 'auto-edit',
    mcpServers: { 'user-service': server },
  },
});

for await (const message of session) {
  if (message.type === 'assistant') {
    console.log(message.message.content);
  }
}
```

## Multiple tools on one server

```typescript
const listOrders = tool(
  'list_orders',
  'List recent orders for a user',
  {
    userId: z.string(),
    limit: z.number().optional().default(10),
  },
  async (args) => {
    const orders = await db.orders.findByUser(args.userId, args.limit);
    return {
      content: [{ type: 'text', text: JSON.stringify(orders, null, 2) }],
    };
  },
);

const cancelOrder = tool(
  'cancel_order',
  'Cancel an order by ID',
  { orderId: z.string() },
  async (args) => {
    await db.orders.cancel(args.orderId);
    return {
      content: [{ type: 'text', text: `Order ${args.orderId} cancelled` }],
    };
  },
);

const server = createSdkMcpServer({
  name: 'order-service',
  tools: [listOrders, cancelOrder],
});
```

## External stdio MCP server

Connect to an existing MCP server process:

```typescript
const session = query({
  prompt: 'Query the database for error logs from the last hour',
  options: {
    mcpServers: {
      db: {
        command: 'python',
        args: ['-m', 'db_mcp_server'],
        env: { DB_URL: process.env.DB_URL },
      },
    },
  },
});
```

## External HTTP MCP server

```typescript
const session = query({
  prompt: 'List all open tickets assigned to me',
  options: {
    mcpServers: {
      jira: {
        httpUrl: 'http://localhost:3000/mcp',
        headers: { Authorization: `Bearer ${process.env.JIRA_TOKEN}` },
      },
    },
  },
});
```

See [Guides → Connect via MCP](../../guides/use-mcp) for the full server configuration reference.
