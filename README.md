# MCP Client

An [MCP](https://glama.ai/blog/2024-11-25-model-context-protocol-quickstart) client for Node.js.

> [!TIP]
> This client has been tested with [FastMCP](https://github.com/punkpeye/fastmcp).

## Why?

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) provides a client for the MCP protocol, but it's a little verbose for my taste. This client abstracts away some of the lower-level details (like pagination, Zod schemas, etc.) and provides a more convenient API.
- The MCP protocol follows some REST-like naming conventions, like `listTools` and `readResource`, but those names look a bit awkward in TypeScript. This client uses more typical method names, like `getTools` and `getResource`.

## Usage

### Creating a client

```ts
import { MCPClient } from "mcp-client";

const client = new MCPClient({
  name: "Test",
  version: "1.0.0",
});
```

### Connecting using `stdio`

```ts
await client.connect({
  type: "stdio",
  args: ["--port", "8080"],
  command: "node",
  env: {
    PORT: "8080",
  },
});
```

### Connecting using SSE

```ts
await client.connect({
  type: "sse",
  url: "http://localhost:8080/sse",
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
const tools = await client.getAllTools();
```

### Listing resources

```ts
const resources = await client.getAllResources();
```

### Reading a resource

```ts
const resource = await client.getResource({ uri: "file:///logs/app.log" });
```

### Getting a prompt

```ts
const prompt = await client.getPrompt({ name: "git-commit" });
```

### Listing prompts

```ts
const prompts = await client.getAllPrompts();
```

### Setting the logging level

```ts
await client.setLoggingLevel("debug");
```

### Completing a prompt

```ts
const result = await client.complete({
  ref: { type: "ref/prompt", name: "git-commit" },
  argument: { name: "changes", value: "Add a new feature" },
});
```

### Listing resource templates

```ts
const resourceTemplates = await client.getAllResourceTemplates();
```

### Receiving logging messages

```ts
client.on("loggingMessage", (message) => {
  console.log(message);
});
```

> [!NOTE]
> Equivalent to `setNotificationHandler(LoggingMessageNotificationSchema, (message) => { ... })` in the MCP TypeScript SDK.
