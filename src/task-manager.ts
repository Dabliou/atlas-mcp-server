/**
 * Path-based task manager implementation
 */
import { Task, TaskStatus, TaskType, CreateTaskInput, UpdateTaskInput, TaskResponse } from './types/task.js';
import { TaskStorage } from './types/storage.js';
import { Logger } from './logging/index.js';
import { ErrorCodes, createError } from './errors/index.js';
import { validateTaskPath, isValidTaskHierarchy } from './types/task.js';

export class TaskManager {
    private logger: Logger;
    readonly storage: TaskStorage;
    private memoryMonitor?: NodeJS.Timeout;
    private readonly MAX_CACHE_MEMORY = 512 * 1024 * 1024; // 512MB cache limit
    private readonly MEMORY_CHECK_INTERVAL = 60000; // 1 minute

    constructor(storage: TaskStorage) {
        this.logger = Logger.getInstance().child({ component: 'TaskManager' });
        this.storage = storage;
        this.setupMemoryMonitoring();
    }

    /**
     * Creates a new task with path-based hierarchy
     */
    async createTask(input: CreateTaskInput): Promise<TaskResponse<Task>> {
        try {
            // Generate path if not provided
            const path = input.path || this.generateTaskPath(input);
            
            // Validate path
            const pathValidation = validateTaskPath(path);
            if (!pathValidation.valid) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    pathValidation.error || 'Invalid task path format'
                );
            }

            // Check parent path if provided
            if (input.parentPath) {
                const parent = await this.getTaskByPath(input.parentPath);
                if (!parent) {
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        'Parent task not found'
                    );
                }

                // Validate hierarchy
                const hierarchyValidation = isValidTaskHierarchy(parent.type, input.type || TaskType.TASK);
                if (!hierarchyValidation.valid) {
                    throw createError(
                        ErrorCodes.TASK_INVALID_PARENT,
                        { parentType: parent.type, childType: input.type || TaskType.TASK },
                        hierarchyValidation.reason || 'Invalid parent-child task type combination',
                        'Ensure the parent task type can contain the requested child type:\n' +
                        '- MILESTONE can contain TASK and GROUP\n' +
                        '- GROUP can only contain TASK\n' +
                        '- TASK cannot contain any subtasks'
                    );
                }
            }

            // Validate dependencies if provided
            if (input.dependencies?.length) {
                for (const depPath of input.dependencies) {
                    const depTask = await this.getTaskByPath(depPath);
                    if (!depTask) {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            `Dependency task not found: ${depPath}`
                        );
                    }
                }
            }

            // Extract dependencies from metadata if present
            const metadataDeps = input.metadata?.dependencies as string[] | undefined;
            const dependencies = input.dependencies || metadataDeps || [];
            
            // Remove dependencies from metadata to avoid duplication
            const metadata = { ...input.metadata };
            delete metadata.dependencies;

            const task: Task = {
                path,
                name: input.name,
                description: input.description,
                type: input.type || TaskType.TASK,
                status: TaskStatus.PENDING,
                parentPath: input.parentPath,
                notes: input.notes,
                reasoning: input.reasoning,
                dependencies,
                subtasks: [],
                metadata: {
                    ...metadata,
                    created: Date.now(),
                    updated: Date.now(),
                    projectPath: path.split('/')[0],
                    version: 1
                }
            };

            await this.storage.saveTask(task);

            return {
                success: true,
                data: task,
                metadata: {
                    timestamp: Date.now(),
                    requestId: Math.random().toString(36).substring(7),
                    projectPath: task.metadata.projectPath,
                    affectedPaths: [task.path]
                }
            };
        } catch (error) {
            this.logger.error('Failed to create task', { error, input });
            throw error;
        }
    }

    /**
     * Updates an existing task
     */
    async updateTask(path: string, updates: UpdateTaskInput): Promise<TaskResponse<Task>> {
        try {
            const task = await this.getTaskByPath(path);
            if (!task) {
                throw createError(
                    ErrorCodes.TASK_NOT_FOUND,
                    'Task not found'
                );
            }

            // Extract dependencies from metadata if present
            const metadataDeps = updates.metadata?.dependencies as string[] | undefined;
            const dependencies = updates.dependencies || metadataDeps || task.dependencies;

            // Validate new dependencies if changed
            if (dependencies !== task.dependencies) {
                for (const depPath of dependencies) {
                    const depTask = await this.getTaskByPath(depPath);
                    if (!depTask) {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            `Dependency task not found: ${depPath}`
                        );
                    }
                }
            }

            // Remove dependencies from metadata to avoid duplication
            const metadata = { ...updates.metadata };
            delete metadata?.dependencies;

            // Update task fields
            const updatedTask: Task = {
                ...task,
                name: updates.name || task.name,
                description: updates.description !== undefined ? updates.description : task.description,
                type: updates.type || task.type,
                status: updates.status || task.status,
                notes: updates.notes || task.notes,
                reasoning: updates.reasoning || task.reasoning,
                dependencies,
                metadata: {
                    ...task.metadata,
                    ...metadata,
                    updated: Date.now(),
                    version: task.metadata.version + 1
                }
            };

            await this.storage.saveTask(updatedTask);

            return {
                success: true,
                data: updatedTask,
                metadata: {
                    timestamp: Date.now(),
                    requestId: Math.random().toString(36).substring(7),
                    projectPath: updatedTask.metadata.projectPath,
                    affectedPaths: [updatedTask.path]
                }
            };
        } catch (error) {
            this.logger.error('Failed to update task', { error, path, updates });
            throw error;
        }
    }

    /**
     * Retrieves a task by its path
     */
    async getTaskByPath(path: string): Promise<Task | null> {
        try {
            return await this.storage.getTask(path);
        } catch (error) {
            this.logger.error('Failed to get task by path', { error, path });
            throw error;
        }
    }

    /**
     * Lists tasks matching a path pattern
     */
    async listTasks(pathPattern: string): Promise<Task[]> {
        try {
            return await this.storage.getTasksByPattern(pathPattern);
        } catch (error) {
            this.logger.error('Failed to list tasks', { error, pathPattern });
            throw error;
        }
    }

    /**
     * Gets tasks by status
     */
    async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
        try {
            return await this.storage.getTasksByStatus(status);
        } catch (error) {
            this.logger.error('Failed to get tasks by status', { error, status });
            throw error;
        }
    }

    /**
     * Gets subtasks of a task
     */
    async getSubtasks(parentPath: string): Promise<Task[]> {
        try {
            return await this.storage.getSubtasks(parentPath);
        } catch (error) {
            this.logger.error('Failed to get subtasks', { error, parentPath });
            throw error;
        }
    }

    /**
     * Deletes a task and its subtasks
     */
    async deleteTask(path: string): Promise<TaskResponse<void>> {
        try {
            await this.storage.deleteTask(path);
            return {
                success: true,
                metadata: {
                    timestamp: Date.now(),
                    requestId: Math.random().toString(36).substring(7),
                    projectPath: path.split('/')[0],
                    affectedPaths: [path]
                }
            };
        } catch (error) {
            this.logger.error('Failed to delete task', { error, path });
            throw error;
        }
    }

    /**
     * Clears all tasks from the database
     */
    async clearAllTasks(confirm: boolean): Promise<void> {
        if (!confirm) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Must explicitly confirm task deletion'
            );
        }

        try {
            await this.storage.clearAllTasks();
            this.logger.info('All tasks cleared from database');
        } catch (error) {
            this.logger.error('Failed to clear tasks', { error });
            throw error;
        }
    }

    /**
     * Optimizes database storage and performance
     */
    async vacuumDatabase(analyze: boolean = true): Promise<void> {
        try {
            await this.storage.vacuum();
            if (analyze) {
                await this.storage.analyze();
            }
            await this.storage.checkpoint();
            this.logger.info('Database optimized', { analyzed: analyze });
        } catch (error) {
            this.logger.error('Failed to optimize database', { error });
            throw error;
        }
    }

    /**
     * Repairs parent-child relationships and fixes inconsistencies
     */
    async repairRelationships(dryRun: boolean = false, pathPattern?: string): Promise<{ fixed: number, issues: string[] }> {
        try {
            const result = await this.storage.repairRelationships(dryRun);
            this.logger.info('Relationship repair completed', { 
                dryRun,
                pathPattern,
                fixed: result.fixed,
                issueCount: result.issues.length
            });
            return result;
        } catch (error) {
            this.logger.error('Failed to repair relationships', { error });
            throw error;
        }
    }

    /**
     * Generates a task path based on input
     */
    private generateTaskPath(input: CreateTaskInput): string {
        const segments: string[] = [];

        // Add parent path if provided
        if (input.parentPath) {
            segments.push(input.parentPath);
        }

        // Add task name as final segment
        segments.push(input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));

        return segments.join('/');
    }

    /**
     * Sets up memory monitoring for cache management
     */
    private setupMemoryMonitoring(): void {
        this.memoryMonitor = setInterval(async () => {
            const memUsage = process.memoryUsage();
            
            // Log memory stats
            this.logger.debug('Task manager memory usage:', {
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
            });

            // Check if cache is using too much memory
            if (memUsage.heapUsed > this.MAX_CACHE_MEMORY) {
                this.logger.warn('Cache memory threshold exceeded, clearing caches', {
                    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                    threshold: `${Math.round(this.MAX_CACHE_MEMORY / 1024 / 1024)}MB`
                });
                
                await this.clearCaches();
            }
        }, this.MEMORY_CHECK_INTERVAL);
    }

    /**
     * Clears all caches to free memory
     */
    async clearCaches(): Promise<void> {
        try {
            // Clear storage caches
            if ('clearCache' in this.storage) {
                await (this.storage as any).clearCache();
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            this.logger.info('Caches cleared successfully');
        } catch (error) {
            this.logger.error('Failed to clear caches', { error });
            throw error;
        }
    }

    /**
     * Cleans up resources and closes connections
     */
    async cleanup(): Promise<void> {
        try {
            // Stop memory monitoring
            if (this.memoryMonitor) {
                clearInterval(this.memoryMonitor);
            }

            // Clear caches
            await this.clearCaches();

            // Close storage
            await this.storage.close();

            this.logger.info('Task manager cleanup completed');
        } catch (error) {
            this.logger.error('Failed to cleanup task manager', { error });
            throw error;
        }
    }

    /**
     * Gets current memory usage statistics
     */
    getMemoryStats(): { heapUsed: number; heapTotal: number; rss: number } {
        const memUsage = process.memoryUsage();
        return {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss
        };
    }

    /**
     * Closes the task manager and releases resources
     */
    async close(): Promise<void> {
        await this.cleanup();
    }
}
