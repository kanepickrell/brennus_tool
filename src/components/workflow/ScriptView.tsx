// src/components/workflow/ScriptView.tsx
// Live Robot Framework script preview panel

import { useMemo, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { 
  Copy, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Code2,
  FileText,
  Settings,
  Variable,
  TestTube,
  Wrench,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { OpforGlobalSettings } from '@/types/opfor';
import { generateRobotScript, downloadRobotScript, RobotScript } from '@/services/robotScriptGenerator';

interface ScriptViewProps {
  nodes: Node[];
  edges: Edge[];
  globalSettings: OpforGlobalSettings;
}

type SectionKey = 'settings' | 'variables' | 'testCases' | 'keywords';

const sectionConfig: Record<SectionKey, { label: string; icon: React.ReactNode; color: string }> = {
  settings: { label: 'Settings', icon: <Settings className="h-4 w-4" />, color: 'text-blue-400' },
  variables: { label: 'Variables', icon: <Variable className="h-4 w-4" />, color: 'text-green-400' },
  testCases: { label: 'Test Cases', icon: <TestTube className="h-4 w-4" />, color: 'text-amber-400' },
  keywords: { label: 'Keywords', icon: <Wrench className="h-4 w-4" />, color: 'text-purple-400' },
};

function CodeBlock({ content, language = 'robot' }: { content: string; language?: string }) {
  return (
    <pre className="bg-zinc-950 p-4 rounded-md overflow-x-auto text-xs font-mono leading-relaxed">
      <code className="text-zinc-300 whitespace-pre">
        {content.split('\n').map((line, i) => (
          <div key={i} className="flex">
            <span className="text-zinc-600 w-8 text-right pr-3 select-none flex-shrink-0">
              {i + 1}
            </span>
            <span className={getLineStyle(line)}>{line}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}

function getLineStyle(line: string): string {
  // Comments
  if (line.trim().startsWith('#')) {
    return 'text-zinc-500 italic';
  }
  // Section headers
  if (line.startsWith('***')) {
    return 'text-amber-400 font-bold';
  }
  // Variables
  if (line.includes('${') || line.startsWith('${')) {
    return 'text-green-400';
  }
  // Keywords (lines starting with 4 spaces and capital letter)
  if (line.match(/^    [A-Z]/)) {
    return 'text-cyan-400';
  }
  // Continuation lines
  if (line.trim().startsWith('...')) {
    return 'text-zinc-400';
  }
  // Documentation
  if (line.includes('[Documentation]') || line.includes('[Tags]')) {
    return 'text-purple-400';
  }
  return 'text-zinc-300';
}

export function ScriptView({ nodes, edges, globalSettings }: ScriptViewProps) {
  const { toast } = useToast();
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(['settings', 'variables', 'testCases', 'keywords'])
  );
  const [viewMode, setViewMode] = useState<'sections' | 'full'>('sections');

  // Generate script whenever nodes/edges/settings change
  const script: RobotScript = useMemo(() => {
    return generateRobotScript(nodes, edges, globalSettings);
  }, [nodes, edges, globalSettings]);

  const toggleSection = (section: SectionKey) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script.full);
      toast({
        title: 'Copied to clipboard',
        description: 'Robot script copied successfully',
      });
    } catch (err) {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = () => {
    const filename = `${globalSettings.executionPlanName.replace(/\s+/g, '_').toLowerCase()}.robot`;
    downloadRobotScript(script, filename);
    toast({
      title: 'Script downloaded',
      description: filename,
    });
  };

  const hasWarnings = script.warnings.length > 0;
  const hasMissingDeps = script.missingDeps.length > 0;

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-amber-500" />
            <h2 className="font-mono text-sm font-semibold text-white uppercase tracking-wider">
              Robot Script
            </h2>
            {nodes.length > 0 && (
              <Badge variant="outline" className="ml-2 text-xs">
                {nodes.length} steps
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode(viewMode === 'sections' ? 'full' : 'sections')}
              className="h-8 text-xs"
            >
              <FileText className="h-4 w-4 mr-1" />
              {viewMode === 'sections' ? 'Full View' : 'Sections'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-8"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="h-8 gap-1"
            >
              <Download className="h-4 w-4" />
              <span className="text-xs">.robot</span>
            </Button>
          </div>
        </div>

        {/* Warnings */}
        {(hasWarnings || hasMissingDeps) && (
          <div className="space-y-2">
            {hasWarnings && (
              <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-amber-400 font-medium">Warnings:</span>
                  <ul className="text-amber-300/80 mt-1">
                    {script.warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {hasMissingDeps && (
              <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs">
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-red-400 font-medium">Missing Configuration:</span>
                  <ul className="text-red-300/80 mt-1">
                    {script.missingDeps.map((d, i) => (
                      <li key={i}>• {d}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {!hasWarnings && !hasMissingDeps && nodes.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-emerald-400">Script ready for export</span>
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Code2 className="h-12 w-12 text-zinc-700 mb-4" />
              <p className="text-zinc-500 text-sm">
                Add nodes to the canvas to generate a Robot Framework script
              </p>
            </div>
          ) : viewMode === 'full' ? (
            <CodeBlock content={script.full} />
          ) : (
            <div className="space-y-3">
              {(Object.keys(sectionConfig) as SectionKey[]).map((key) => {
                const config = sectionConfig[key];
                const content = script[key];
                const isExpanded = expandedSections.has(key);

                return (
                  <Collapsible
                    key={key}
                    open={isExpanded}
                    onOpenChange={() => toggleSection(key)}
                  >
                    <CollapsibleTrigger asChild>
                      <button className="w-full flex items-center justify-between p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={config.color}>{config.icon}</span>
                          <span className="text-sm font-medium text-zinc-300">
                            {config.label}
                          </span>
                          <span className="text-xs text-zinc-600">
                            ({content.split('\n').length} lines)
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-zinc-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-zinc-500" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2">
                        <CodeBlock content={content} />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}