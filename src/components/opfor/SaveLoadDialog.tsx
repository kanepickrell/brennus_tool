// components/opfor/SaveLoadDialog.tsx
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WorkflowService } from '@/services/workflowService';
import { WorkflowFile } from '@/types/opfor';
import { Save, FolderOpen, Download, Upload, Trash2 } from 'lucide-react';

// The /api/campaigns list endpoint returns FLAT metadata entries — they look like
// { name, description, author, created, lastModified, tags, nodeCount, edgeCount }.
// These are NOT full WorkflowFile objects (no nodes/edges/globalSettings).
// When the operator clicks "Load Workflow" we fetch the full workflow by name.
interface CampaignListEntry {
  name: string;
  description?: string;
  author?: string;
  created?: string;
  lastModified?: string;
  tags?: string[];
  nodeCount?: number;
  edgeCount?: number;
}

interface SaveLoadDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'save' | 'load';
  onLoad?: (workflow: WorkflowFile) => void;
  currentWorkflow?: {
    nodes: any[];
    edges: any[];
    globalSettings: any;
    viewport: { x: number; y: number; zoom: number };
  };
}

export function SaveLoadDialog({
  open,
  onClose,
  mode,
  onLoad,
  currentWorkflow,
}: SaveLoadDialogProps) {
  const [workflowName, setWorkflowName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [savedEntries, setSavedEntries] = useState<CampaignListEntry[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Normalize whatever the API gives us into CampaignListEntry[].
  // Accepts either flat metadata entries (current backend shape) or full
  // WorkflowFile objects (legacy / defensive).
  const normalizeEntries = (raw: unknown): CampaignListEntry[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any) => {
        if (item && item.metadata && typeof item.metadata === 'object') {
          // Full WorkflowFile shape — unwrap metadata.
          return {
            name: item.metadata.name,
            description: item.metadata.description,
            author: item.metadata.author,
            created: item.metadata.created,
            lastModified: item.metadata.lastModified,
            tags: item.metadata.tags,
            nodeCount: Array.isArray(item.nodes) ? item.nodes.length : undefined,
            edgeCount: Array.isArray(item.edges) ? item.edges.length : undefined,
          };
        }
        // Flat entry — return as-is with defensive defaults.
        return {
          name: item?.name ?? '(unnamed)',
          description: item?.description ?? '',
          author: item?.author ?? '',
          created: item?.created,
          lastModified: item?.lastModified,
          tags: Array.isArray(item?.tags) ? item.tags : [],
          nodeCount: typeof item?.nodeCount === 'number' ? item.nodeCount : undefined,
          edgeCount: typeof item?.edgeCount === 'number' ? item.edgeCount : undefined,
        };
      })
      // Hide autosave from the user-facing list.
      .filter((e) => e.name && e.name !== '_autosave');
  };

  const refreshList = async () => {
    try {
      const list = await WorkflowService.getAllWorkflows();
      setSavedEntries(normalizeEntries(list as unknown));
    } catch (e) {
      console.error('Failed to refresh saved workflows:', e);
      setSavedEntries([]);
    }
  };

  useEffect(() => {
    if (open && mode === 'load') {
      setSelectedName(null);
      refreshList();
    }
  }, [open, mode]);

  const handleSave = async () => {
    if (!currentWorkflow || !workflowName.trim()) return;

    setIsBusy(true);
    try {
      await WorkflowService.saveToServer(
        workflowName,
        currentWorkflow.nodes,
        currentWorkflow.edges,
        currentWorkflow.globalSettings,
        currentWorkflow.viewport,
        {
          description,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        },
      );
      onClose();
    } catch (e) {
      console.error('Save failed:', e);
      alert('Failed to save workflow');
    } finally {
      setIsBusy(false);
    }
  };

  // IMPORTANT: the list only contains metadata. Fetch the full workflow by name.
  const handleLoad = async () => {
    if (!selectedName || !onLoad) return;

    setIsBusy(true);
    try {
      const full = await WorkflowService.loadWorkflow(selectedName);
      if (!full) {
        alert(`Workflow "${selectedName}" not found on server`);
        return;
      }
      if (!Array.isArray(full.nodes) || !Array.isArray(full.edges)) {
        console.error('Loaded workflow has invalid shape:', full);
        alert('Workflow file is corrupted or has unexpected format');
        return;
      }
      onLoad(full);
      onClose();
    } catch (e) {
      console.error('Load failed:', e);
      alert('Failed to load workflow');
    } finally {
      setIsBusy(false);
    }
  };

  const handleExport = async (name: string) => {
    // Need full workflow for export; fetch it.
    try {
      const full = await WorkflowService.loadWorkflow(name);
      if (!full) {
        alert(`Cannot export "${name}" — not found on server`);
        return;
      }
      WorkflowService.exportToFile(full);
    } catch (e) {
      console.error('Export failed:', e);
      alert('Failed to export workflow');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsBusy(true);
    try {
      const workflow = await WorkflowService.importFromFile(file);

      await WorkflowService.saveToServer(
        workflow.metadata.name,
        workflow.nodes,
        workflow.edges,
        workflow.globalSettings,
        workflow.viewport,
        workflow.metadata,
      );

      await refreshList();

      if (onLoad) {
        onLoad(workflow);
        onClose();
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import workflow file');
    } finally {
      setIsBusy(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete workflow "${name}"?`)) return;

    setIsBusy(true);
    try {
      await WorkflowService.deleteWorkflow(name);
      await refreshList();
      if (selectedName === name) setSelectedName(null);
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setIsBusy(false);
    }
  };

  if (mode === 'save') {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5" />
              Save Workflow
            </DialogTitle>
            <DialogDescription>
              Save your current workflow chain for later use
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workflow Name *</Label>
              <Input
                id="name"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Operation Desert Viper"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Basic attack chain targeting Exchange server..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="initial-access, persistence, exfiltration"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isBusy}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!workflowName.trim() || isBusy}>
              <Save className="h-4 w-4 mr-2" />
              {isBusy ? 'Saving...' : 'Save Workflow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Load Workflow
          </DialogTitle>
          <DialogDescription>
            Load a previously saved workflow or import a .lumen file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" asChild disabled={isBusy}>
              <label>
                <Upload className="h-4 w-4 mr-2" />
                Import File
                <input
                  type="file"
                  accept=".op,.lumen,application/json"
                  className="hidden"
                  onChange={handleImport}
                />
              </label>
            </Button>
          </div>

          <div className="border rounded-lg max-h-[400px] overflow-y-auto">
            {savedEntries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No saved workflows</p>
              </div>
            ) : (
              <div className="divide-y">
                {savedEntries.map((entry) => (
                  <div
                    key={entry.name}
                    className={`p-4 cursor-pointer hover:bg-accent transition-colors ${
                      selectedName === entry.name ? 'bg-accent' : ''
                    }`}
                    onClick={() => setSelectedName(entry.name)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm">{entry.name}</h4>
                        {entry.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {entry.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>{entry.nodeCount ?? 0} nodes</span>
                          <span>{entry.edgeCount ?? 0} connections</span>
                          {entry.lastModified && (
                            <span>
                              {new Date(entry.lastModified).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {entry.tags && entry.tags.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {entry.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-1 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExport(entry.name);
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entry.name);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button onClick={handleLoad} disabled={!selectedName || isBusy}>
            <FolderOpen className="h-4 w-4 mr-2" />
            {isBusy ? 'Loading...' : 'Load Workflow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}