import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Play,
  FileDown,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save,
  FolderOpen,
  LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'canvas' | 'script';
export type LifecycleStage = 'draft' | 'review' | 'approved' | 'active' | 'archived';

// Custom smiley face icon component
const SmileyIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="-10 -10 520 480" 
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="50"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    {/* Octagon head */}
    <path d="M 88 8 L 408 8 L 488 88 L 488 368 L 408 448 L 88 448 L 8 368 L 8 88 Z" />
    {/* Left eye (winking) */}
    <path d="M 108 158 Q 158 118 208 158" />
    {/* Right eye (angled) */}
    <path d="M 298 158 L 378 118" />
    {/* Mouth */}
    <path d="M 178 298 L 328 298" />
  </svg>
);

export interface ToolbarProps {
  viewMode: ViewMode;
  lifecycleStage: LifecycleStage;
  onViewModeChange: (mode: ViewMode) => void;
  onLifecycleChange: (stage: LifecycleStage) => void;
  onValidate: () => void;
  onSimulate: () => void;
  onExport: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onSave: () => void;
  onLoad: () => void;
}

export function Toolbar({
  viewMode,
  lifecycleStage,
  onViewModeChange,
  onLifecycleChange,
  onValidate,
  onSimulate,
  onExport,
  onReset,
  onZoomIn,
  onZoomOut,
  onFitView,
  onSave,
  onLoad,
}: ToolbarProps) {
  return (
    <div className="h-14 border-b border-panel-border bg-panel flex items-center justify-between px-4 gap-4">
      {/* Left Section: View Mode Toggle */}
      <div className="flex items-center gap-3">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">View</span>
          <div className="relative flex items-center bg-zinc-900/80 border border-zinc-800 rounded-sm p-0.5">
            {/* Sliding indicator - position based on viewMode prop */}
            <div
              className={cn(
                "absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/50 rounded-sm transition-all duration-200 ease-out",
                viewMode === 'canvas' ? 'left-0.5' : 'left-[calc(50%+1px)]'
              )}
            />
            
            <button
              onClick={() => onViewModeChange('canvas')}
              className={cn(
                "relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors duration-200",
                viewMode === 'canvas' 
                  ? 'text-amber-500' 
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Canvas
            </button>
            
            <button
              onClick={() => onViewModeChange('script')}
              className={cn(
                "relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors duration-200",
                viewMode === 'script' 
                  ? 'text-amber-500' 
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <SmileyIcon className="h-3.5 w-3.5" />
              Code
            </button>
          </div>
        </div>

        <div className="h-6 w-px bg-zinc-800" />
      </div>

      {/* Center Section: Main Actions */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSave}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onLoad}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Load
        </Button>

        <div className="h-5 w-px bg-zinc-800 mx-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onValidate}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Validate
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onSimulate}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
        >
          <Play className="h-3.5 w-3.5" />
          Execute
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onExport}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10"
        >
          <FileDown className="h-3.5 w-3.5" />
          Export
        </Button>

        <div className="h-5 w-px bg-zinc-800 mx-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="gap-1.5 h-7 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
      </div>

      {/* Right Section: Canvas Controls */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomOut}
          className="h-7 w-7 p-0 text-zinc-500 hover:text-white hover:bg-zinc-800"
          disabled={viewMode === 'script'}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomIn}
          className="h-7 w-7 p-0 text-zinc-500 hover:text-white hover:bg-zinc-800"
          disabled={viewMode === 'script'}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onFitView}
          className="h-7 w-7 p-0 text-zinc-500 hover:text-white hover:bg-zinc-800"
          disabled={viewMode === 'script'}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}