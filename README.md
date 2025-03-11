# MCP Client

An [MCP](https://glama.ai/blog/2024-11-25-model-context-protocol-quickstart) client for Node.js.

## Why?

[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) provides a client for the MCP protocol, but it's a little verbose for my taste. This client abstracts away some of the lower-level details and provides a more convenient API.

## Usage

### Connecting to an SSE endpoint

```ts
import { MCPClient } from "mcp-client";

const client = new MCPClient({
  name: "Test",
  version: "1.0.0",
});

await client.connect({
  sseUrl: "http://localhost:8080/sse",
});
```

### Pinging the server

```ts
await client.ping();
```

### Calling a tool

```ts
const result = await client.callTool({
  name: "add",
  arguments: { a: 1, b: 2 },
});
```

### Calling a tool with a custom result schema

```ts
const result = await client.callTool(
  {
    name: "add",
    arguments: { a: 1, b: 2 },
  },
  {
    resultSchema: z.object({
      content: z.array(
        z.object({
          type: z.literal("text"),
          text: z.string(),
        }),
      ),
    }),
  },
);
```

### Listing tools

```ts
const tools = await client.getTools();
```

### Receiving notification

```ts
client.on("notification", (notification) => {
  console.log(notification);
});
```
