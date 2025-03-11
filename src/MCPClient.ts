import {
  Client,
  ClientOptions
} from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  Implementation,
  ListToolsResultSchema,
  LoggingLevel,
  Progress,
  Tool,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import EventEmitter from "events";
import { z } from "zod";
import { StrictEventEmitter } from "strict-event-emitter-types";

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

type ProgressNotification = {
  progressToken: string | number;
  progress: number;
  total?: number | undefined;
  type: "progress";
};

type MCPClientEvents = {
  notification: (event: ProgressNotification) => void;
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
  private transports: SSEClientTransport[] = [];

  constructor(clientInfo: Implementation, options?: ClientOptions) {
    super();

    this.client = new Client(clientInfo, options);
  }

  async connect({ sseUrl }: { sseUrl: string }): Promise<SSEClientTransport> {
    const transport = new SSEClientTransport(new URL(sseUrl));

    this.transports.push(transport);

    await this.client.connect(transport);

    return transport;
  }

  async ping(options?: { requestOptions?: RequestOptions }): Promise<null> {
    await this.client.ping(options?.requestOptions);

    return null;
  }

  async getTools(options?: {
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
      options?.requestOptions ? transformRequestOptions(options.requestOptions) : undefined
    )) as TResult;
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
