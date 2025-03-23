import { ProjectResponse } from "../../../types/mcp.js";
import { ResponseFormatter, createFormattedResponse, objectToMarkdownTable } from "../../../utils/responseFormatter.js";

/**
 * Extends the ProjectResponse to include Neo4j properties structure 
 */
interface SingleProjectResponse extends ProjectResponse {
  properties?: any;
  identity?: number;
  labels?: string[];
  elementId?: string;
}

/**
 * Interface for bulk project creation response
 */
interface BulkProjectResponse {
  success: boolean;
  message: string;
  created: (ProjectResponse & { properties?: any; identity?: number; labels?: string[]; elementId?: string; })[];
  errors: {
    index: number;
    project: any;
    error: {
      code: string;
      message: string;
      details?: any;
    };
  }[];
}

/**
 * Formatter for single project creation responses
 */
export class SingleProjectFormatter implements ResponseFormatter<SingleProjectResponse> {
  format(data: SingleProjectResponse): string {
    // Extract project properties from Neo4j structure
    const projectData = data.properties || data;
    const { name, id, status, taskType, createdAt } = projectData;
    
    // Create a summary section
    const summary = `## Project Created Successfully\n\n` +
      `**Project:** ${name || 'Unnamed Project'}\n` +
      `**ID:** ${id || 'Unknown ID'}\n` +
      `**Status:** ${status || 'Unknown Status'}\n` +
      `**Type:** ${taskType || 'Unknown Type'}\n` +
      `**Created:** ${createdAt ? new Date(createdAt).toLocaleString() : 'Unknown Date'}\n`;
    
    // Create a details section with all project properties
    const details = `## Project Details\n\n` +
      objectToMarkdownTable(projectData, {
        id: "ID",
        name: "Name",
        description: "Description",
        status: "Status",
        urls: "URLs",
        completionRequirements: "Completion Requirements",
        outputFormat: "Output Format",
        taskType: "Task Type",
        createdAt: "Created At",
        updatedAt: "Updated At"
      });
    
    return `${summary}\n\n${details}`;
  }
}

/**
 * Formatter for bulk project creation responses
 */
export class BulkProjectFormatter implements ResponseFormatter<BulkProjectResponse> {
  format(data: BulkProjectResponse): string {
    const { success, message, created, errors } = data;
    
    // Create a summary section
    const summary = `## ${success ? "Projects Created Successfully" : "Project Creation Completed with Errors"}\n\n` +
      `**Status:** ${success ? "✅ Success" : "⚠️ Partial Success"}\n` +
      `**Summary:** ${message}\n` +
      `**Created:** ${created.length} project(s)\n` +
      `**Errors:** ${errors.length} error(s)\n`;
    
    // List the successfully created projects
    let createdSection = "";
    if (created.length > 0) {
      createdSection = `## Created Projects\n\n`;
      
      createdSection += created.map((project, index) => {
        // Extract project properties from Neo4j structure
        const projectData = project.properties || project;
        return `### ${index + 1}. ${projectData.name || 'Unnamed Project'}\n\n` +
          `**ID:** ${projectData.id || 'Unknown ID'}\n` +
          `**Type:** ${projectData.taskType || 'Unknown Type'}\n` +
          `**Status:** ${projectData.status || 'Unknown Status'}\n` +
          `**Created:** ${projectData.createdAt ? new Date(projectData.createdAt).toLocaleString() : 'Unknown Date'}\n`;
      }).join("\n\n");
    }
    
    // List any errors that occurred
    let errorsSection = "";
    if (errors.length > 0) {
      errorsSection = `## Errors\n\n`;
      
      errorsSection += errors.map((error, index) => {
        const projectName = error.project?.name || `Project at index ${error.index}`;
        return `### ${index + 1}. Error in "${projectName}"\n\n` +
          `**Error Code:** ${error.error.code}\n` +
          `**Message:** ${error.error.message}\n` +
          (error.error.details ? `**Details:** ${JSON.stringify(error.error.details)}\n` : "");
      }).join("\n\n");
    }
    
    return `${summary}\n\n${createdSection}\n\n${errorsSection}`.trim();
  }
}

/**
 * Create a formatted response for the atlas_project_create tool
 * 
 * @param data The raw project creation response
 * @param isError Whether this response represents an error
 * @returns Formatted MCP tool response
 */
export function formatProjectCreateResponse(data: any, isError = false): any {
  // Determine if this is a single or bulk project response
  const isBulkResponse = data.hasOwnProperty("success") && data.hasOwnProperty("created");
  
  if (isBulkResponse) {
    return createFormattedResponse(data, new BulkProjectFormatter(), isError);
  } else {
    return createFormattedResponse(data, new SingleProjectFormatter(), isError);
  }
}
