/**
 * Atlas MCP Server Entry Point
 * 
 * Initializes and exports the Atlas MCP server functionality:
 * - Task management
 * - MCP server integration
 * - Tool handling
 * - Health monitoring
 * - Request tracing
 * - Rate limiting
 * - Metrics collection
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    McpError,
    ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { StorageManager, BaseStorageManager, SqliteStorageManager } from './storage/index.js';
import { TaskManager } from './task-manager.js';
import { ToolHandler } from './tools/handler.js';
import { SessionSystem } from './session/index.js';
import { Logger } from './logging/index.js';
import { ConfigManager, defaultConfig } from './config/index.js';
import { RateLimiter } from './server/rate-limiter.js';
import { HealthMonitor } from './server/health-monitor.js';
import { MetricsCollector } from './server/metrics-collector.js';
import { RequestTracer } from './server/request-tracer.js';

/**
 * Atlas MCP Server class
 * Provides task management capabilities through the Model Context Protocol
 */
export class AtlasMcpServer {
    private server: Server;
    private storage: StorageManager;
    private taskManager: TaskManager;
    private toolHandler: ToolHandler;
    private sessionSystem: SessionSystem;
    private logger: Logger;
    private rateLimiter: RateLimiter;
    private healthMonitor: HealthMonitor;
    private metricsCollector: MetricsCollector;
    private requestTracer: RequestTracer;
    private isShuttingDown: boolean = false;
    private activeRequests: Set<string> = new Set();
    private healthCheckInterval?: NodeJS.Timeout;

    constructor() {
        // Initialize configuration
        const storageDir = process.env.TASK_STORAGE_DIR;
        if (!storageDir) {
            throw new Error('TASK_STORAGE_DIR environment variable must be set');
        }

        ConfigManager.initialize({
            storage: {
                baseDir: storageDir,
                sessionId: '00000000-0000-4000-a000-000000000001', // Use a fixed UUID for persistence
                maxSessions: 100,
                maxTaskLists: 100,
                maxBackups: 5,
                maxRetries: 3,
                retryDelay: 1000,
                backup: {
                    enabled: true,
                    interval: 300000, // 5 minutes
                    directory: path.join(storageDir, 'backups')
                }
            }
        });

        // Initialize components
        const config = ConfigManager.getInstance().getConfig();
        this.logger = Logger.getInstance().child({ component: 'AtlasMcpServer' });
        
        // Initialize storage
        this.storage = new SqliteStorageManager(config.storage);

        // Initialize session system
        this.sessionSystem = new SessionSystem(config.storage);

        this.taskManager = new TaskManager(this.storage);
        this.toolHandler = new ToolHandler(this.taskManager);
        
        // Initialize server components
        this.rateLimiter = new RateLimiter(600); // 600 requests per minute
        this.healthMonitor = new HealthMonitor();
        this.metricsCollector = new MetricsCollector();
        this.requestTracer = new RequestTracer();

        // Initialize MCP server
        this.server = new Server(
            {
                name: 'atlas-mcp-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        // Set up error handling
        this.setupErrorHandling();
    }

    /**
     * Initializes the server and all components
     */
    async initialize(): Promise<void> {
        try {
            // Initialize storage and session system
            await Promise.all([
                this.storage.initialize(),
                this.sessionSystem.initialize()
            ]);

            // Initialize task manager
            await this.taskManager.initialize();

            // Add session tools to tool handler with their handler
            const sessionToolHandler = await this.sessionSystem.getToolHandler();
            this.toolHandler.addTools(
                sessionToolHandler.getTools(),
                (name, args) => sessionToolHandler.handleToolCall(name, args)
            );

            // Set up request handlers
            this.setupRequestHandlers();

            // Start health checks
            this.startHealthChecks();

            this.logger.info('Atlas MCP Server initialized successfully', {
                metrics: this.getMetrics()
            });
        } catch (error) {
            this.logger.error('Failed to initialize server', {
                error,
                metrics: this.getMetrics()
            });
            throw error;
        }
    }

    /**
     * Starts the server
     */
    async start(): Promise<void> {
        try {
            // Initialize components
            await this.initialize();

            // Connect transport
            const transport = new StdioServerTransport();
            await this.server.connect(transport);

            this.logger.info('Atlas MCP Server started', {
                metrics: this.getMetrics()
            });
        } catch (error) {
            this.logger.error('Failed to start server', {
                error,
                metrics: this.getMetrics()
            });
            throw error;
        }
    }

    /**
     * Sets up MCP request handlers with middleware
     */
    private setupRequestHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
            const requestId = this.requestTracer.startRequest();
            
            try {
                await this.rateLimiter.checkLimit();
                this.activeRequests.add(requestId);
                
                const startTime = Date.now();
                const response = await this.toolHandler.listTools() as {
                tools: Array<{
                    name: string;
                    description: string;
                    inputSchema: Record<string, unknown>;
                }>;
            };
                
                this.metricsCollector.recordResponseTime(Date.now() - startTime);
                return response;
            } catch (error) {
                return this.handleToolError(error);
            } finally {
                this.activeRequests.delete(requestId);
                this.requestTracer.endRequest(requestId);
            }
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const requestId = this.requestTracer.startRequest();
            
            try {
                if (this.isShuttingDown) {
                    throw new McpError(
                        ErrorCode.InternalError,
                        'Server is shutting down'
                    );
                }

                await this.rateLimiter.checkLimit();
                this.activeRequests.add(requestId);
                
                const startTime = Date.now();
            const response = await Promise.race([
                this.toolHandler.handleToolCall(request) as Promise<{
                    _meta?: Record<string, unknown>;
                    content: Array<{ type: string; text: string }>;
                }>,
                this.createTimeout(30000) // 30 second timeout
            ]);
                
                this.metricsCollector.recordResponseTime(Date.now() - startTime);
                return response;
            } catch (error) {
                return this.handleToolError(error);
            } finally {
                this.activeRequests.delete(requestId);
                this.requestTracer.endRequest(requestId);
            }
        });
    }

    /**
     * Sets up error handling
     */
    private setupErrorHandling(): void {
        this.server.onerror = (error) => {
            this.metricsCollector.incrementErrorCount();
            
            const errorContext = {
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error,
                metrics: this.getMetrics()
            };

            this.logger.error('Server error', errorContext);
        };

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled Rejection:', {
                reason,
                promise,
                metrics: this.getMetrics()
            });
        });

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught Exception:', {
                error,
                metrics: this.getMetrics()
            });
            this.stop().finally(() => process.exit(1));
        });
    }

    /**
     * Starts health check monitoring
     */
    private startHealthChecks(): void {
        this.healthCheckInterval = setInterval(() => {
            const health = this.healthMonitor.check({
                activeRequests: this.activeRequests.size,
                metrics: this.getMetrics(),
                rateLimiter: this.rateLimiter.getStatus()
            });

            if (!health.healthy) {
                this.logger.warn('Health check failed:', health);
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Creates a timeout promise
     */
    private createTimeout(ms: number): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new McpError(
                    ErrorCode.InternalError,
                    `Request timed out after ${ms}ms`
                ));
            }, ms);
        });
    }

    /**
     * Handles tool errors
     */
    private handleToolError(error: unknown): never {
        this.metricsCollector.incrementErrorCount();

        if (error instanceof McpError) {
            throw error;
        }

        this.logger.error('Tool error:', {
            error,
            metrics: this.getMetrics()
        });
        
        throw new McpError(
            ErrorCode.InternalError,
            error instanceof Error ? error.message : 'An unexpected error occurred',
            error instanceof Error ? error.stack : undefined
        );
    }

    /**
     * Gets current server metrics
     */
    private getMetrics(): {
        requestCount: number;
        errorCount: number;
        avgResponseTime: number;
    } {
        return {
            requestCount: this.metricsCollector.getRequestCount(),
            errorCount: this.metricsCollector.getErrorCount(),
            avgResponseTime: this.metricsCollector.getAverageResponseTime()
        };
    }

    /**
     * Stops the server
     */
    async stop(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        this.logger.info('Starting graceful shutdown...');

        try {
            // Stop health checks
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }

            // Wait for active requests to complete
            const shutdownStart = Date.now();
            const timeout = 30000; // 30 second shutdown timeout

            while (this.activeRequests.size > 0) {
                if (Date.now() - shutdownStart > timeout) {
                    this.logger.warn('Shutdown timeout reached, forcing shutdown', {
                        activeRequests: this.activeRequests.size
                    });
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            await Promise.all([
                this.server.close(),
                this.sessionSystem.close()
            ]);
            this.logger.info('Server stopped successfully', {
                metrics: this.getMetrics()
            });
        } catch (error) {
            this.logger.error('Error during shutdown:', {
                error,
                metrics: this.getMetrics()
            });
            throw error;
        }
    }
}

// Export types
export * from './types/index.js';

// Create and start server if this is the main module
if (import.meta.url === new URL(import.meta.url).href) {
    try {
        // Create and start server
        const server = new AtlasMcpServer();
        await server.start();

        // Handle shutdown signals
        process.on('SIGINT', async () => {
            await server.stop();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            await server.stop();
            process.exit(0);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
