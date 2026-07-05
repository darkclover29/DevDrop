import React, { useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import { X, FileCode, Eye, EyeOff, AlignLeft, Keyboard, Plus } from 'lucide-react';
import type { FileItem } from './Sidebar';
import { motion } from 'framer-motion';

interface EditorAreaProps {
  files: FileItem[];
  activeFileId: string | null;
  openTabs: string[];
  onSelectFile: (id: string) => void;
  onCloseTab: (id: string) => void;
  onUpdateContent: (id: string, content: string) => void;
  onCreateFilePrompt: () => void;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  files,
  activeFileId,
  openTabs,
  onSelectFile,
  onCloseTab,
  onUpdateContent,
  onCreateFilePrompt
}) => {
  const [wordWrap, setWordWrap] = useState<boolean>(true);
  const [minimap, setMinimap] = useState<boolean>(false);

  const activeFile = files.find(f => f.id === activeFileId);

  // Language detection helper
  const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'html': return 'html';
      case 'css': return 'css';
      case 'js':
      case 'jsx': return 'javascript';
      case 'ts':
      case 'tsx': return 'typescript';
      case 'json': return 'json';
      case 'md': return 'markdown';
      case 'py': return 'python';
      case 'java': return 'java';
      case 'xml': return 'xml';
      case 'sh': return 'shell';
      case 'yml':
      case 'yaml': return 'yaml';
      default: return 'plaintext';
    }
  };

  // Custom editor settings
  const editorOptions = {
    minimap: { enabled: minimap },
    wordWrap: wordWrap ? ('on' as const) : ('off' as const),
    fontSize: 13,
    fontFamily: 'JetBrains Mono, monospace',
    fontLigatures: true,
    lineNumbers: 'on' as const,
    roundedSelection: true,
    scrollBeyondLastLine: false,
    readOnly: false,
    theme: 'vs-dark',
    cursorBlinking: 'smooth' as const,
    cursorSmoothCaretAnimation: 'on' as const,
    smoothScrolling: true,
    padding: { top: 12, bottom: 12 },
    automaticLayout: true,
  };

  // Monaco Editor theme configuration
  const handleEditorDidMount = (_editor: any, monaco: Monaco) => {
    // We can define custom themes here if we want, but vs-dark works great out of the box.
    monaco.editor.defineTheme('devdrop-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1E1E1E',
        'editor.lineHighlightBackground': '#252526',
        'editorGutter.background': '#1E1E1E',
      }
    });
    monaco.editor.setTheme('devdrop-theme');
  };

  return (
    <div className="flex-1 bg-editorBg flex flex-col h-full overflow-hidden">
      {openTabs.length > 0 ? (
        <>
          {/* Tabs Bar */}
          <div className="h-10 bg-panels border-b border-border flex items-center justify-between select-none px-2">
            <div className="flex items-center overflow-x-auto h-full scrollbar-none gap-0.5">
              {openTabs.map(tabId => {
                const file = files.find(f => f.id === tabId);
                if (!file) return null;
                const isActive = activeFileId === tabId;

                return (
                  <div
                    key={tabId}
                    onClick={() => onSelectFile(tabId)}
                    className={`group flex items-center gap-2 px-4 h-full border-r border-border text-xs cursor-pointer transition-all ${
                      isActive 
                        ? 'bg-[#1E1E1E] text-textActive font-medium border-t-2 border-t-accent' 
                        : 'text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#1C2128]/50'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span className="font-mono">{file.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tabId);
                      }}
                      className="p-0.5 rounded-full text-transparent group-hover:text-[#8B949E] hover:bg-[#30363D] hover:text-[#C9D1D9] transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Editor Config Toggles */}
            <div className="flex items-center gap-1 text-[#8B949E] px-2">
              <button
                onClick={() => setWordWrap(!wordWrap)}
                title="Toggle Word Wrap"
                className={`p-1.5 rounded hover:bg-[#30363D] hover:text-[#C9D1D9] transition-all cursor-pointer ${
                  wordWrap ? 'text-accent hover:text-accent' : ''
                }`}
              >
                <AlignLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMinimap(!minimap)}
                title="Toggle Minimap"
                className={`p-1.5 rounded hover:bg-[#30363D] hover:text-[#C9D1D9] transition-all cursor-pointer ${
                  minimap ? 'text-accent hover:text-accent' : ''
                }`}
              >
                {minimap ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Monaco Editor Container */}
          {activeFile ? (
            <div className="flex-1 w-full relative">
              <MonacoEditor
                height="100%"
                language={getLanguageFromFilename(activeFile.name)}
                value={activeFile.content}
                onChange={(value) => onUpdateContent(activeFile.id, value || '')}
                options={editorOptions}
                onMount={handleEditorDidMount}
                loading={
                  <div className="absolute inset-0 flex items-center justify-center bg-[#1E1E1E] text-textMuted text-xs font-mono">
                    Loading Monaco Editor...
                  </div>
                }
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-textMuted text-xs select-none italic bg-[#1E1E1E]">
              Select a tab to edit
            </div>
          )}
        </>
      ) : (
        /* Empty State / Welcome Screen */
        <div className="flex-1 flex flex-col items-center justify-center bg-[#1E1E1E] p-8 select-none text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg w-full"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#161B22] border border-border flex items-center justify-center text-accent mx-auto mb-6 shadow-lg shadow-accent/5">
              <Keyboard className="w-8 h-8 animate-pulse" />
            </div>
            
            <h2 className="text-xl font-bold text-textActive font-ui mb-2">DevDrop Workspace</h2>
            <p className="text-xs text-textMuted mb-6 leading-relaxed max-w-sm mx-auto">
              A private, lightweight developer workspace. Select a file from the sidebar explorer or use the shortcuts below to get started.
            </p>

            {/* Premium Shortcuts Grid */}
            <div className="bg-panels border border-border rounded-xl p-5 text-left space-y-4 mb-6 shadow-xl">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-border pb-2 flex justify-between items-center">
                <span>Keyboard Shortcuts & Actions</span>
                <span className="text-[10px] text-accent/80 font-normal">Press Shift+? or Cmd+/ to toggle</span>
              </h3>

              <button 
                onClick={onCreateFilePrompt}
                className="w-full flex items-center justify-between p-2.5 bg-[#1E1E1E] hover:bg-[#252526] border border-border/60 rounded-lg text-xs text-textActive transition-colors cursor-pointer hover:border-accent/40"
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-accent" />
                  <span>Create New File</span>
                </div>
                <kbd className="px-1.5 py-0.5 bg-[#30363D] rounded text-[10px] text-textMuted font-mono">Double-Click Sidebar</kbd>
              </button>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Search */}
                <div className="flex items-center justify-between p-2.5 bg-[#1E1E1E] border border-border/60 rounded-lg hover:border-accent/40 transition-colors">
                  <span className="text-[#C9D1D9]">Search / Filter Files</span>
                  <div className="flex gap-1">
                    <kbd className="px-1.5 py-0.5 bg-[#30363D] border border-border rounded text-[10px] text-textActive font-mono">⌘</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#30363D] border border-border rounded text-[10px] text-textActive font-mono">K</kbd>
                  </div>
                </div>

                {/* Shortcuts */}
                <div className="flex items-center justify-between p-2.5 bg-[#1E1E1E] border border-border/60 rounded-lg hover:border-accent/40 transition-colors">
                  <span className="text-[#C9D1D9]">Show Shortcuts Help</span>
                  <div className="flex gap-1">
                    <kbd className="px-1.5 py-0.5 bg-[#30363D] border border-border rounded text-[10px] text-textActive font-mono">Shift</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#30363D] border border-border rounded text-[10px] text-textActive font-mono">?</kbd>
                  </div>
                </div>

                {/* Rename */}
                <div className="flex items-center justify-between p-2.5 bg-[#1E1E1E] border border-border/60 rounded-lg hover:border-accent/40 transition-colors">
                  <span className="text-[#C9D1D9]">Rename File Inline</span>
                  <span className="text-[10px] text-textMuted italic font-sans">Double-Click filename</span>
                </div>

                {/* Drag Reorder */}
                <div className="flex items-center justify-between p-2.5 bg-[#1E1E1E] border border-border/60 rounded-lg hover:border-accent/40 transition-colors">
                  <span className="text-[#C9D1D9]">Reorder File List</span>
                  <span className="text-[10px] text-textMuted italic font-sans">Drag & Drop item</span>
                </div>

                {/* Duplicate/Delete */}
                <div className="flex items-center justify-between p-2.5 bg-[#1E1E1E] border border-border/60 rounded-lg hover:border-accent/40 transition-colors md:col-span-2">
                  <span className="text-[#C9D1D9]">Duplicate / Delete Files</span>
                  <span className="text-[10px] text-textMuted italic font-sans">Hover file in explorer for actions</span>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="text-[11px] text-textMuted font-mono space-y-1">
              <div>⚡ Auto Save is active — every character edit is saved instantly.</div>
              <div>🔄 Syncing is real-time — edits appear on all connected devices.</div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
