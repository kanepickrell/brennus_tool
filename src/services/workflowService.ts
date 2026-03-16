import { Node, Edge } from '@xyflow/react';
import { WorkflowFile, WorkflowMetadata, OpforGlobalSettings } from '@/types/opfor';

const WORKFLOW_STORAGE_KEY = 'operator_workflows';
const AUTOSAVE_KEY = 'operator_autosave';

export class WorkflowService {
  /**
   * Save workflow to browser localStorage
   */
  static saveToLocalStorage(
    name: string,
    nodes: Node[],
    edges: Edge[],
    globalSettings: OpforGlobalSettings,
    viewport: { x: number; y: number; zoom: number },
    metadata?: Partial<WorkflowMetadata>
  ): void {
    const workflow: WorkflowFile = {
      version: '1.0',
      metadata: {
        name,
        description: metadata?.description || '',
        author: globalSettings.operator || 'Unknown',
        created: metadata?.created || new Date().toISOString(),
        lastModified: new Date().toISOString(),
        tags: metadata?.tags || [],
      },
      globalSettings,
      nodes,
      edges,
      viewport,
    };

    // Get existing workflows
    const existing = this.getAllWorkflows();
    
    // Add or update workflow
    const index = existing.findIndex(w => w.metadata.name === name);
    if (index >= 0) {
      existing[index] = workflow;
    } else {
      existing.push(workflow);
    }

    localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(existing));
  }

  /**
   * Autosave current workflow
   */
  static autosave(
    nodes: Node[],
    edges: Edge[],
    globalSettings: OpforGlobalSettings,
    viewport: { x: number; y: number; zoom: number }
  ): void {
    const autosave: WorkflowFile = {
      version: '1.0',
      metadata: {
        name: '_autosave',
        description: 'Auto-saved workflow',
        author: globalSettings.operator || 'Unknown',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        tags: ['autosave'],
      },
      globalSettings,
      nodes,
      edges,
      viewport,
    };

    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(autosave));
  }

  /**
   * Load autosave if it exists
   */
  static loadAutosave(): WorkflowFile | null {
    const data = localStorage.getItem(AUTOSAVE_KEY);
    if (!data) return null;
    
    try {
      return JSON.parse(data) as WorkflowFile;
    } catch (e) {
      console.error('Failed to load autosave:', e);
      return null;
    }
  }

  /**
   * Get all saved workflows
   */
  static getAllWorkflows(): WorkflowFile[] {
    const data = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!data) return [];
    
    try {
      return JSON.parse(data) as WorkflowFile[];
    } catch (e) {
      console.error('Failed to load workflows:', e);
      return [];
    }
  }

  /**
   * Load specific workflow by name
   */
  static loadWorkflow(name: string): WorkflowFile | null {
    const workflows = this.getAllWorkflows();
    return workflows.find(w => w.metadata.name === name) || null;
  }

  /**
   * Delete workflow
   */
  static deleteWorkflow(name: string): void {
    const workflows = this.getAllWorkflows();
    const filtered = workflows.filter(w => w.metadata.name !== name);
    localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(filtered));
  }

  /**
   * Export workflow as downloadable .op file
   */
  static exportToFile(workflow: WorkflowFile): void {
    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${workflow.metadata.name.replace(/\s+/g, '_')}.op`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Import workflow from .op file
   */
  static async importFromFile(file: File): Promise<WorkflowFile> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const workflow = JSON.parse(content) as WorkflowFile;
          
          // Validate workflow structure
          if (!workflow.version || !workflow.nodes || !workflow.edges) {
            throw new Error('Invalid workflow file format');
          }
          
          resolve(workflow);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Clear autosave
   */
  static clearAutosave(): void {
    localStorage.removeItem(AUTOSAVE_KEY);
  }
}