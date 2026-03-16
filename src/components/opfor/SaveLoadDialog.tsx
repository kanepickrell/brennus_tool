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
  currentWorkflow 
}: SaveLoadDialogProps) {
  const [workflowName, setWorkflowName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowFile[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowFile | null>(null);

  useEffect(() => {
    if (open && mode === 'load') {
      setSavedWorkflows(WorkflowService.getAllWorkflows());
    }
  }, [open, mode]);

  const handleSave = () => {
    if (!currentWorkflow || !workflowName.trim()) return;

    WorkflowService.saveToLocalStorage(
      workflowName,
      currentWorkflow.nodes,
      currentWorkflow.edges,
      currentWorkflow.globalSettings,
      currentWorkflow.viewport,
      {
        description,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      }
    );

    onClose();
  };

  const handleLoad = () => {
    if (!selectedWorkflow || !onLoad) return;
    onLoad(selectedWorkflow);
    onClose();
  };

  const handleExport = (workflow: WorkflowFile) => {
    WorkflowService.exportToFile(workflow);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const workflow = await WorkflowService.importFromFile(file);
      
      // Save imported workflow
      WorkflowService.saveToLocalStorage(
        workflow.metadata.name,
        workflow.nodes,
        workflow.edges,
        workflow.globalSettings,
        workflow.viewport,
        workflow.metadata
      );

      // Refresh list
      setSavedWorkflows(WorkflowService.getAllWorkflows());
      
      // Load imported workflow
      if (onLoad) {
        onLoad(workflow);
        onClose();
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import workflow file');
    }
  };

  const handleDelete = (name: string) => {
    if (confirm(`Delete workflow "${name}"?`)) {
      WorkflowService.deleteWorkflow(name);
      setSavedWorkflows(WorkflowService.getAllWorkflows());
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
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!workflowName.trim()}>
              <Save className="h-4 w-4 mr-2" />
              Save Workflow
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
            Load a previously saved workflow or import an .op file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Import Button */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" asChild>
              <label>
                <Upload className="h-4 w-4 mr-2" />
                Import .op File
                <input
                  type="file"
                  accept=".op,application/json"
                  className="hidden"
                  onChange={handleImport}
                />
              </label>
            </Button>
          </div>

          {/* Saved Workflows List */}
          <div className="border rounded-lg max-h-[400px] overflow-y-auto">
            {savedWorkflows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No saved workflows</p>
              </div>
            ) : (
              <div className="divide-y">
                {savedWorkflows.map((workflow) => (
                  <div
                    key={workflow.metadata.name}
                    className={`p-4 cursor-pointer hover:bg-accent transition-colors ${
                      selectedWorkflow?.metadata.name === workflow.metadata.name
                        ? 'bg-accent'
                        : ''
                    }`}
                    onClick={() => setSelectedWorkflow(workflow)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm">
                          {workflow.metadata.name}
                        </h4>
                        {workflow.metadata.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {workflow.metadata.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>{workflow.nodes.length} nodes</span>
                          <span>{workflow.edges.length} connections</span>
                          <span>
                            {new Date(workflow.metadata.lastModified).toLocaleDateString()}
                          </span>
                        </div>
                        {workflow.metadata.tags.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {workflow.metadata.tags.map((tag) => (
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExport(workflow);
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(workflow.metadata.name);
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleLoad} disabled={!selectedWorkflow}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Load Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}