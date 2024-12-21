/**
 * Path-based task management schemas for LLM agents
 */
import { TaskStatus, CONSTRAINTS } from '../types/task.js';

// Schema validation messages
const VALIDATION_MESSAGES = {
    PATH_FORMAT: 'Path can only contain alphanumeric characters, underscores, dots, and hyphens',
    PATH_DEPTH: `Path depth cannot exceed ${CONSTRAINTS.MAX_PATH_DEPTH} levels`,
    NAME_LENGTH: `Name cannot exceed ${CONSTRAINTS.NAME_MAX_LENGTH} characters`,
    DESC_LENGTH: `Description cannot exceed ${CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`,
    NOTE_LENGTH: `Notes cannot exceed ${CONSTRAINTS.NOTE_MAX_LENGTH} characters each`,
    REASONING_LENGTH: `Reasoning cannot exceed ${CONSTRAINTS.REASONING_MAX_LENGTH} characters`,
    DEPENDENCIES_SIZE: `Cannot have more than ${CONSTRAINTS.MAX_DEPENDENCIES} dependencies`,
    SUBTASKS_SIZE: `Cannot have more than ${CONSTRAINTS.MAX_SUBTASKS} subtasks`,
    NOTES_SIZE: `Cannot have more than ${CONSTRAINTS.MAX_NOTES} notes`,
    METADATA_LENGTH: `Metadata string fields cannot exceed ${CONSTRAINTS.METADATA_STRING_MAX_LENGTH} characters`,
    METADATA_ARRAY: `Metadata arrays cannot exceed ${CONSTRAINTS.MAX_ARRAY_ITEMS} items`
};

/** Creates a new task with path-based hierarchy and validation */
export const createTaskSchema = {
    type: 'object',
    properties: {
        path: {
            type: 'string',
            description: 'Hierarchical task path (e.g., "server/api/authentication"). Use paths to organize related tasks.\n' +
                        `Constraints:\n` +
                        `- ${VALIDATION_MESSAGES.PATH_FORMAT}\n` +
                        `- ${VALIDATION_MESSAGES.PATH_DEPTH}`,
            pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
            maxLength: CONSTRAINTS.MAX_PATH_DEPTH * 50 // Reasonable max length per segment
        },
        name: {
            type: 'string',
            description: 'Clear, action-oriented task name (e.g., "Implement JWT authentication", "Refactor database queries").\n' +
                        `Maximum length: ${CONSTRAINTS.NAME_MAX_LENGTH} characters`,
            maxLength: CONSTRAINTS.NAME_MAX_LENGTH
        },
        parentPath: {
            type: 'string',
            description: 'Path of the parent task. Use to build hierarchical workflows and break down complex tasks.',
        },
        description: {
            type: 'string',
            description: 'Detailed task description including:\n' +
                        '- Objective: What needs to be accomplished\n' +
                        '- Context: Why this task is needed\n' +
                        '- Technical details: Implementation considerations\n' +
                        '- Success criteria: How to verify completion\n' +
                        `Maximum length: ${CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`,
            maxLength: CONSTRAINTS.DESCRIPTION_MAX_LENGTH
        },
        type: {
            type: 'string',
            enum: ['TASK', 'MILESTONE', 'GROUP'],
            description: 'Task categorization (MUST BE UPPERCASE):\n' +
                        '- MILESTONE: Major completion point requiring all subtasks to be done\n' +
                        '- GROUP: Collection of related tasks that can be partially completed\n' +
                        '- TASK: Individual actionable item',
        },
        dependencies: {
            type: 'array',
            items: { 
                type: 'string',
                pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$'
            },
            maxItems: CONSTRAINTS.MAX_DEPENDENCIES,
            description: 'Paths of tasks that must be completed first. Tasks will be automatically blocked if dependencies are not met.\n' +
                        `Maximum dependencies: ${CONSTRAINTS.MAX_DEPENDENCIES}\n` +
                        'Dependencies can be specified here (recommended) or in metadata.dependencies (legacy).',
            uniqueItems: true
        },
        metadata: {
            type: 'object',
            properties: {
                priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Task urgency and impact level. Affects task ordering and scheduling.'
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    maxItems: CONSTRAINTS.MAX_ARRAY_ITEMS,
                    description: 'Keywords for categorization and filtering (e.g., ["api", "security", "optimization"]). Used in path pattern matching.\n' +
                                `Maximum tags: ${CONSTRAINTS.MAX_ARRAY_ITEMS}`,
                    uniqueItems: true
                },
                assignee: {
                    type: 'string',
                    description: 'System or component responsible for the task. Used for task distribution and filtering.'
                },
                reasoning: {
                    type: 'string',
                    description: 'LLM reasoning about task decisions, importance, and approach. Provides context for status changes and dependencies.\n' +
                                `Maximum length: ${CONSTRAINTS.REASONING_MAX_LENGTH} characters`,
                    maxLength: CONSTRAINTS.REASONING_MAX_LENGTH
                },
                notes: {
                    type: 'array',
                    items: { 
                        type: 'string',
                        maxLength: CONSTRAINTS.NOTE_MAX_LENGTH
                    },
                    maxItems: CONSTRAINTS.MAX_NOTES,
                    description: 'Additional context, observations, and planning notes. Used to track progress and document decisions.\n' +
                                `Maximum notes: ${CONSTRAINTS.MAX_NOTES}\n` +
                                `Maximum length per note: ${CONSTRAINTS.NOTE_MAX_LENGTH} characters`
                }
            },
            description: 'Additional task context and tracking information. Fields affect:\n' +
                        '- Task organization (priority, tags, assignee)\n' +
                        '- Progress tracking (notes)\n' +
                        '- Decision history (reasoning)\n\n' +
                        'Note: dependencies in metadata.dependencies will be migrated to the main dependencies array.',
        }
    },
    required: ['name'],
};

/** Updates an existing task */
export const updateTaskSchema = {
    type: 'object',
    properties: {
        path: {
            type: 'string',
            description: 'Path of the task to update.',
        },
        updates: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Updated task name with current action focus.\n' +
                                `Maximum length: ${CONSTRAINTS.NAME_MAX_LENGTH} characters`,
                    maxLength: CONSTRAINTS.NAME_MAX_LENGTH
                },
                description: {
                    type: 'string',
                    description: 'Updated description with latest context, findings, and next steps.\n' +
                                `Maximum length: ${CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`,
                    maxLength: CONSTRAINTS.DESCRIPTION_MAX_LENGTH
                },
                type: {
                    type: 'string',
                    enum: ['TASK', 'MILESTONE', 'GROUP'],
                    description: 'Updated task categorization (MUST BE UPPERCASE) based on current understanding.',
                },
                status: {
                    type: 'string',
                    enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'],
                    description: 'Current execution state:\n' +
                               '- pending: Not yet started\n' +
                               '- in_progress: Currently being processed\n' +
                               '- completed: Successfully finished\n' +
                               '- failed: Encountered unresolvable issues\n' +
                               '- blocked: Waiting on dependencies or external factors',
                },
                dependencies: {
                    type: 'array',
                    items: { 
                        type: 'string',
                        pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$'
                    },
                    maxItems: CONSTRAINTS.MAX_DEPENDENCIES,
                    description: 'Updated task dependencies. Tasks will be automatically blocked if new dependencies are not met.\n' +
                                `Maximum dependencies: ${CONSTRAINTS.MAX_DEPENDENCIES}\n` +
                                'Status changes propagate through dependency chain.',
                    uniqueItems: true
                },
                metadata: {
                    type: 'object',
                    properties: {
                        priority: {
                            type: 'string',
                            enum: ['low', 'medium', 'high'],
                            description: 'Task urgency and impact level. Affects task ordering and scheduling.'
                        },
                        tags: {
                            type: 'array',
                            items: { type: 'string' },
                            maxItems: CONSTRAINTS.MAX_ARRAY_ITEMS,
                            description: 'Keywords for categorization and filtering (e.g., ["api", "security", "optimization"]). Used in path pattern matching.\n' +
                                      `Maximum tags: ${CONSTRAINTS.MAX_ARRAY_ITEMS}`,
                            uniqueItems: true
                        },
                        assignee: {
                            type: 'string',
                            description: 'Updated system/component assignment'
                        },
                        reasoning: {
                            type: 'string',
                            description: 'LLM reasoning about task decisions, importance, and approach. Provides context for status changes and dependencies.\n' +
                                      `Maximum length: ${CONSTRAINTS.REASONING_MAX_LENGTH} characters`,
                            maxLength: CONSTRAINTS.REASONING_MAX_LENGTH
                        },
                        notes: {
                            type: 'array',
                            items: { 
                                type: 'string',
                                maxLength: CONSTRAINTS.NOTE_MAX_LENGTH
                            },
                            maxItems: CONSTRAINTS.MAX_NOTES,
                            description: 'Additional context, observations, and planning notes. Used to track progress and document decisions.\n' +
                                      `Maximum notes: ${CONSTRAINTS.MAX_NOTES}\n` +
                                      `Maximum length per note: ${CONSTRAINTS.NOTE_MAX_LENGTH} characters`
                        }
                    },
                    description: 'Task metadata fields affect:\n' +
                                '- Task organization (priority, tags, assignee)\n' +
                                '- Progress tracking (notes)\n' +
                                '- Decision history (reasoning)',
                },
            },
            description: 'Fields to update. Available fields:\n' +
                        '- name: Update task name\n' +
                        '- description: Update task details\n' +
                        '- type: Change task type (task/milestone/group)\n' +
                        '- status: Update execution state with automatic dependency checks\n' +
                        '- dependencies: Add/remove dependencies with validation\n' +
                        '- metadata: Update task metadata (priority, tags, notes, etc.)\n\n' +
                        'Status changes trigger:\n' +
                        '- Automatic dependency validation\n' +
                        '- Status propagation to parent tasks\n' +
                        '- Dependent task blocking\n' +
                        '- Child task status updates',
        },
    },
    required: ['path', 'updates'],
};

/** Gets tasks by status */
export const getTasksByStatusSchema = {
    type: 'object',
    properties: {
        status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'] as TaskStatus[],
            description: 'Filter tasks by their execution state. Use to find tasks needing attention or verify completion.',
        },
        pathPattern: {
            type: 'string',
            description: 'Optional glob pattern to filter by path (e.g., "server/api/*"). Use to focus on specific subsystems.',
        }
    },
    required: ['status'],
};

/** Gets tasks by path pattern */
export const getTasksByPathSchema = {
    type: 'object',
    properties: {
        pathPattern: {
            type: 'string',
            description: 'Glob pattern to match task paths. Use to analyze specific areas of work (e.g., "server/*/security/*").',
        }
    },
    required: ['pathPattern'],
};

/** Gets subtasks of a task */
export const getSubtasksSchema = {
    type: 'object',
    properties: {
        path: {
            type: 'string',
            description: 'Parent task path. Returns immediate subtasks to analyze task breakdown and progress.',
        }
    },
    required: ['path'],
};

/** Deletes a task */
export const deleteTaskSchema = {
    type: 'object',
    properties: {
        path: {
            type: 'string',
            description: 'Task path to delete. Will recursively remove all subtasks. Use with caution.',
        }
    },
    required: ['path'],
};

/** Bulk task operations */
/** Clears all tasks from the database */
export const clearAllTasksSchema = {
    type: 'object',
    properties: {
        confirm: {
            type: 'boolean',
            description: 'Must be set to true to confirm deletion of all tasks. This operation cannot be undone.',
        }
    },
    required: ['confirm'],
};

/** Optimizes database storage and performance */
export const vacuumDatabaseSchema = {
    type: 'object',
    properties: {
        analyze: {
            type: 'boolean',
            description: 'Whether to analyze tables for query optimization after vacuum.',
            default: true
        }
    },
    required: [],
};

/** Repairs parent-child relationships and fixes inconsistencies */
export const repairRelationshipsSchema = {
    type: 'object',
    properties: {
        dryRun: {
            type: 'boolean',
            description: 'If true, only reports issues without fixing them.',
            default: false
        },
        pathPattern: {
            type: 'string',
            description: 'Optional glob pattern to limit repair scope (e.g., "project/*").'
        }
    },
    required: [],
};

/** Exports tasks to a backup file */
export const exportTasksSchema = {
    type: 'object',
    properties: {
        pathPattern: {
            type: 'string',
            description: 'Optional glob pattern to export specific tasks (e.g., "project/*").'
        },
        format: {
            type: 'string',
            enum: ['json', 'csv'],
            description: 'Export format',
            default: 'json'
        }
    },
    required: [],
};

/** Imports tasks from a backup file */
export const importTasksSchema = {
    type: 'object',
    properties: {
        filePath: {
            type: 'string',
            description: 'Path to the backup file to import.'
        },
        strategy: {
            type: 'string',
            enum: ['replace', 'merge', 'skip'],
            description: 'How to handle existing tasks:\n' +
                        '- replace: Overwrite existing tasks\n' +
                        '- merge: Update existing tasks, preserving some fields\n' +
                        '- skip: Keep existing tasks unchanged',
            default: 'skip'
        }
    },
    required: ['filePath'],
};

/** Bulk task operations with validation */
export const bulkTaskSchema = {
    type: 'object',
    properties: {
        operations: {
            type: 'array',
            description: 'Sequence of atomic task operations. Use for coordinated updates and maintaining task relationships.',
            items: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['create', 'update', 'delete'],
                        description: 'Operation type:\n' +
                                   '- create: Add new task with full context\n' +
                                   '- update: Modify task with latest findings\n' +
                                   '- delete: Remove completed or obsolete task'
                    },
                    path: {
                        type: 'string',
                        description: 'Task path for the operation. For create, this sets the desired hierarchy.\n' +
                                   `Constraints:\n` +
                                   `- ${VALIDATION_MESSAGES.PATH_FORMAT}\n` +
                                   `- ${VALIDATION_MESSAGES.PATH_DEPTH}`,
                        pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
                        maxLength: CONSTRAINTS.MAX_PATH_DEPTH * 50
                    },
                    data: {
                        type: 'object',
                        description: 'Operation-specific data:\n' +
                                   '- create: Full task definition including dependencies and context\n' +
                                   '- update: Fields to modify including status and dependencies\n' +
                                   '- delete: Optional deletion context\n\n' +
                                   'Dependency handling:\n' +
                                   '- Dependencies are validated across all operations\n' +
                                   '- Status changes respect dependency constraints\n' +
                                   '- Circular dependencies are prevented\n' +
                                   '- Failed operations trigger rollback'
                    },
                },
                required: ['type', 'path'],
            },
        },
    },
    required: ['operations'],
};
