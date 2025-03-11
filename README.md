# MCP Client

An [MCP](https://glama.ai/blog/2024-11-25-model-context-protocol-quickstart) client for Node.js.

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

### Ping the server

```ts
await client.ping();
```

