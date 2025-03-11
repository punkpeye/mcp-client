import {
  Client,
  ClientOptions,
} from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CompleteRequest,
  CompleteResult,
  GetPromptRequest,
  GetPromptResult,
  Implementation,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListToolsResultSchema,
  LoggingLevel,
  LoggingMessageNotificationSchema,
  Progress,
  Prompt,
  ReadResourceRequest,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  Tool,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import EventEmitter from "events";
import { z } from "zod";
import { StrictEventEmitter } from "strict-event-emitter-types";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * Callback for progress notifications.
 */
type ProgressCallback = (progress: Progress) => void;

type RequestOptions = {
  /**
   * If set, requests progress notifications from the remote end (if supported). When progress notifications are received, this callback will be invoked.
   */
  onProgress?: ProgressCallback;
  /**
   * Can be used to cancel an in-flight request. This will cause an AbortError to be raised from request().
   */
  signal?: AbortSignal;
  /**
   * A timeout (in milliseconds) for this request. If exceeded, an McpError with code `RequestTimeout` will be raised from request().
   *
   * If not specified, `DEFAULT_REQUEST_TIMEOUT_MSEC` will be used as the timeout.
   */
  timeout?: number;
};

const transformRequestOptions = (requestOptions: RequestOptions) => {
  return {
    onprogress: requestOptions.onProgress,
    signal: requestOptions.signal,
    timeout: requestOptions.timeout,
  };
};

type LoggingMessageNotification = {
  [key: string]: unknown;
  level: LoggingLevel;
};

type MCPClientEvents = {
  loggingMessage: (event: LoggingMessageNotification) => void;
};

const MCPClientEventEmitterBase: {
  new (): StrictEventEmitter<EventEmitter, MCPClientEvents>;
} = EventEmitter;

class MCPClientEventEmitter extends MCPClientEventEmitterBase {}

async function fetchAllPages<T>(
  client: any,
  requestParams: { method: string; params?: Record<string, any> },
  schema: any,
  getItems: (response: any) => T[],
  requestOptions?: RequestOptions,
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;

  do {
    // Clone the params to avoid modifying the original object
    const params = { ...(requestParams.params || {}) };

    // Add cursor to params if it exists
    if (cursor) {
      params.cursor = cursor;
    }

    // Make the request
    const response = await client.request(
      { method: requestParams.method, params },
      schema,
      requestOptions ? transformRequestOptions(requestOptions) : undefined,
    );

    // Use the getter function to extract items
    allItems.push(...getItems(response));

    // Update cursor for next iteration
    cursor = response.nextCursor;
  } while (cursor);

  return allItems;
}

export class MCPClient extends MCPClientEventEmitter {
  private client: Client;
  private transports: Transport[] = [];

  constructor(clientInfo: Implementation, options?: ClientOptions) {
    super();

    this.client = new Client(clientInfo, options);

    this.client.setNotificationHandler(
      LoggingMessageNotificationSchema,
      (message) => {
        if (message.method === "notifications/message") {
          this.emit("loggingMessage", {
            level: message.params.level,
            ...(message.params.data ?? {}),
          });
        }
      },
    );
  }

  async connect(
    options:
      | { type: "sse"; url: string }
      | {
          type: "stdio";
          args: string[];
          command: string;
          env: Record<string, string>;
        },
  ): Promise<void> {
    if (options.type === "sse") {
      const transport = new SSEClientTransport(new URL(options.url));

      this.transports.push(transport);

      await this.client.connect(transport);
    } else if (options.type === "stdio") {
      const transport = new StdioClientTransport({
        command: options.command,
        env: options.env,
        args: options.args,
      });

      this.transports.push(transport);
    } else {
      throw new Error(`Unknown transport type`);
    }
  }

  async ping(options?: { requestOptions?: RequestOptions }): Promise<null> {
    await this.client.ping(options?.requestOptions);

    return null;
  }

  async getAllTools(options?: {
    requestOptions?: RequestOptions;
  }): Promise<Tool[]> {
    return fetchAllPages(
      this.client,
      { method: "tools/list" },
      ListToolsResultSchema,
      (result) => result.tools,
      options?.requestOptions,
    );
  }

  async getAllResources(options?: {
    requestOptions?: RequestOptions;
  }): Promise<Resource[]> {
    return fetchAllPages(
      this.client,
      { method: "resources/list" },
      ListResourcesResultSchema,
      (result) => result.resources,
      options?.requestOptions,
    );
  }

  async getAllPrompts(options?: {
    requestOptions?: RequestOptions;
  }): Promise<Prompt[]> {
    return fetchAllPages(
      this.client,
      { method: "prompts/list" },
      ListPromptsResultSchema,
      (result) => result.prompts,
      options?.requestOptions,
    );
  }

  async callTool<
    TResultSchema extends z.ZodType = z.ZodType<CallToolResult>,
    TResult = z.infer<TResultSchema>,
  >(
    invocation: {
      name: string;
      arguments?: Record<string, unknown>;
    },
    options?: {
      resultSchema?: TResultSchema;
      requestOptions?: RequestOptions;
    },
  ): Promise<TResult> {
    return (await this.client.callTool(
      invocation,
      options?.resultSchema as any,
      options?.requestOptions
        ? transformRequestOptions(options.requestOptions)
        : undefined,
    )) as TResult;
  }

  async complete(
    params: CompleteRequest["params"],
    options?: {
      requestOptions?: RequestOptions;
    },
  ): Promise<CompleteResult> {
    return await this.client.complete(params, options?.requestOptions);
  }

  async getResource(
    params: ReadResourceRequest["params"],
    options?: {
      requestOptions?: RequestOptions;
    },
  ): Promise<ReadResourceResult> {
    return await this.client.readResource(params, options?.requestOptions);
  }

  async getPrompt(
    params: GetPromptRequest["params"],
    options?: {
      requestOptions?: RequestOptions;
    },
  ): Promise<GetPromptResult> {
    return await this.client.getPrompt(params, options?.requestOptions);
  }

  async getAllResourceTemplates(options?: {
    requestOptions?: RequestOptions;
  }): Promise<ResourceTemplate[]> {
    let cursor: string | undefined;

    const allItems: ResourceTemplate[] = [];

    do {
      const response = await this.client.listResourceTemplates(
        { cursor },
        options?.requestOptions,
      );

      allItems.push(...response.resourceTemplates);

      cursor = response.nextCursor;
    } while (cursor);

    return allItems;
  }

  async setLoggingLevel(level: LoggingLevel) {
    await this.client.setLoggingLevel(level);
  }

  async close() {
    for (const transport of this.transports) {
      await transport.close();
    }
  }
}
