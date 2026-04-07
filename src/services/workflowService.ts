import { Node, Edge } from '@xyflow/react';
import { WorkflowFile, WorkflowMetadata, OpforGlobalSettings } from '@/types/opfor';

const API_BASE = 'http://localhost:8001';
const AUTOSAVE_NAME = '_autosave';

export class WorkflowService {
  /**
   * Save workflow to server (POST /api/campaigns)
   */
  static async saveToServer(
    name: string,
    nodes: Node[],
    edges: Edge[],
    globalSettings: OpforGlobalSettings,
    viewport: { x: number; y: number; zoom: number },
    metadata?: Partial<WorkflowMetadata>
  ): Promise<void> {
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

    try {
      const res = await fetch(`${API_BASE}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, workflow }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch (e) {
      console.error('Failed to save campaign to server:', e);
      // Fall back to localStorage so no work is lost
      this._saveToLocalStorage(name, workflow);
    }
  }

  /**
   * Autosave current workflow to server
   */
  static autosave(
    nodes: Node[],
    edges: Edge[],
    globalSettings: OpforGlobalSettings,
    viewport: { x: number; y: number; zoom: number }
  ): void {
    // Fire-and-forget — don't await, autosave should never block
    this.saveToServer(AUTOSAVE_NAME, nodes, edges, globalSettings, viewport, {
      description: 'Auto-saved workflow',
      tags: ['autosave'],
    }).catch(e => console.warn('Autosave failed:', e));
  }

  /**
   * Load autosave from server
   */
  static async loadAutosave(): Promise<WorkflowFile | null> {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${encodeURIComponent(AUTOSAVE_NAME)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      return await res.json() as WorkflowFile;
    } catch (e) {
      console.warn('Could not load autosave from server, trying localStorage:', e);
      // Fallback: try localStorage for migration
      const data = localStorage.getItem('operator_autosave');
      return data ? JSON.parse(data) as WorkflowFile : null;
    }
  }

  /**
   * Get all saved campaigns from server
   */
  static async getAllWorkflows(): Promise<WorkflowFile[]> {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      // Server returns metadata only — return as-is for dashboard listing
      return data.campaigns ?? [];
    } catch (e) {
      console.error('Failed to load campaigns from server:', e);
      return [];
    }
  }

  /**
   * Load specific campaign by name from server
   */
  static async loadWorkflow(name: string): Promise<WorkflowFile | null> {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${encodeURIComponent(name)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      return await res.json() as WorkflowFile;
    } catch (e) {
      console.error('Failed to load campaign:', e);
      return null;
    }
  }

  /**
   * Delete campaign from server
   */
  static async deleteWorkflow(name: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    } catch (e) {
      console.error('Failed to delete campaign:', e);
    }
  }

  /**
   * Export workflow as downloadable .lumen file
   */
  static exportToFile(workflow: WorkflowFile): void {
    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${workflow.metadata.name.replace(/\s+/g, '_')}.lumen`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Import workflow from .lumen file
   */
  static async importFromFile(file: File): Promise<WorkflowFile> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const workflow = JSON.parse(content) as WorkflowFile;

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
   * Clear autosave (both server and localStorage)
   */
  static async clearAutosave(): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/campaigns/${encodeURIComponent(AUTOSAVE_NAME)}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn('Could not clear server autosave:', e);
    }
    localStorage.removeItem('operator_autosave');
  }

  // ── Private localStorage fallback ──────────────────────────────────────────
  private static _saveToLocalStorage(name: string, workflow: WorkflowFile): void {
    try {
      const key = name === AUTOSAVE_NAME ? 'operator_autosave' : 'operator_workflows';
      if (name === AUTOSAVE_NAME) {
        localStorage.setItem(key, JSON.stringify(workflow));
      } else {
        const existing: WorkflowFile[] = JSON.parse(localStorage.getItem(key) || '[]');
        const idx = existing.findIndex(w => w.metadata.name === name);
        if (idx >= 0) existing[idx] = workflow; else existing.push(workflow);
        localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch (e) {
      console.error('localStorage fallback also failed:', e);
    }
  }
}