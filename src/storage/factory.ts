/**
 * Storage factory for creating task storage instances
 */
import { StorageConfig, TaskStorage } from '../types/storage.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { SqliteStorage } from './sqlite-storage.js';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

/**
 * Creates a storage instance based on configuration
 */
export async function createStorage(config: StorageConfig): Promise<TaskStorage> {
    try {
        // Ensure base directory exists with platform-appropriate permissions
        await fs.mkdir(config.baseDir, { 
            recursive: true, 
            mode: process.platform === 'win32' ? undefined : 0o755 
        });

        // Create SQLite storage
        const storage = new SqliteStorage(config);
        await storage.initialize();

        return storage;
    } catch (error) {
        throw createError(
            ErrorCodes.STORAGE_INIT,
            'Failed to create storage',
            error instanceof Error ? error.message : String(error)
        );
    }
}

/**
 * Creates a storage instance with default configuration
 */
export async function createDefaultStorage(): Promise<TaskStorage> {
    // Use platform-appropriate default storage location
    const baseDir = process.env.ATLAS_STORAGE_DIR || (
        process.platform === 'win32'
            ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'AtlasMCP', 'storage')
            : join(homedir(), '.atlas-mcp', 'storage')
    );

    // Ensure absolute path with platform-appropriate separators
    const resolvedBaseDir = resolve(baseDir);

    const config: StorageConfig = {
        baseDir: resolvedBaseDir,
        name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
        connection: {
            maxRetries: Number(process.env.ATLAS_MAX_RETRIES) || 3,
            retryDelay: Number(process.env.ATLAS_RETRY_DELAY) || 1000,
            busyTimeout: Number(process.env.ATLAS_BUSY_TIMEOUT) || 5000
        },
        performance: {
            checkpointInterval: Number(process.env.ATLAS_CHECKPOINT_INTERVAL) || 300000, // 5 minutes
            cacheSize: Number(process.env.ATLAS_CACHE_SIZE) || 2000,
            mmapSize: Number(process.env.ATLAS_MMAP_SIZE) || 30000000000, // 30GB
            pageSize: Number(process.env.ATLAS_PAGE_SIZE) || 4096
        }
    };

    return createStorage(config);
}
