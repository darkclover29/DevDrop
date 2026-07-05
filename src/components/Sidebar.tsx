import React, { useState, useRef, useEffect } from 'react';
import { 
  FileCode, Search, Copy, Download, Upload, 
  Trash2, CopyPlus, AlertTriangle, Folder, FolderOpen, 
  ChevronRight, ChevronDown, FolderPlus, FilePlus
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import JSZip from 'jszip';

export interface FileItem {
  id: string;
  name: string;
  type?: 'file' | 'folder';
  parentId?: string | null;
  language: string;
  content: string;
  updatedAt: string;
  order: number;
}

interface SidebarProps {
  files: FileItem[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onCreateFile: (name: string, type: 'file' | 'folder', parentId: string | null) => Promise<void>;
  onRenameFile: (id: string, newName: string) => Promise<void>;
  onDeleteFile: (id: string) => Promise<void>;
  onDuplicateFile: (id: string) => Promise<void>;
  onMoveFile: (id: string, parentId: string | null) => Promise<void>;
  onReorderFiles: (reorderedFiles: FileItem[]) => void;
  onCopyAll: () => void;
  onDownloadWorkspace: () => void;
  onImportFiles: (files: { name: string; content: string; isDir: boolean; relativePath: string }[]) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onDuplicateFile,
  onMoveFile,
  onCopyAll,
  onDownloadWorkspace,
  onImportFiles,
  onLogout
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  
  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Delete confirmation modal state
  const [deletingFile, setDeletingFile] = useState<FileItem | null>(null);

  // Inline creation state: tracks when creating a file or folder under a parentId
  const [createState, setCreateState] = useState<{
    type: 'file' | 'folder';
    parentId: string | null;
  } | null>(null);
  const [newItemName, setNewItemName] = useState('');

  // Drag and drop states
  const draggedItemId = useRef<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('focus-devdrop-search', focusSearch);
    return () => window.removeEventListener('focus-devdrop-search', focusSearch);
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !createState) {
      setCreateState(null);
      return;
    }
    const name = newItemName.trim();
    const type = createState.type;
    const parentId = createState.parentId;

    setCreateState(null);
    setNewItemName('');
    await onCreateFile(name, type, parentId);
    
    // Automatically expand parent folder on creation
    if (parentId && type === 'file') {
      setExpandedFolders(prev => ({ ...prev, [parentId]: true }));
    }
  };

  const handleRenameSubmit = async (id: string) => {
    if (!editName.trim() || editName.trim() === files.find(f => f.id === id)?.name) {
      setEditingId(null);
      return;
    }
    await onRenameFile(id, editName.trim());
    setEditingId(null);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    draggedItemId.current = id;
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverItem = (e: React.DragEvent, itemId: string, itemType: 'file' | 'folder') => {
    e.preventDefault();
    if (itemType === 'folder' && draggedItemId.current !== itemId) {
      // Check if we are trying to drag a folder inside itself
      if (!isDescendant(itemId, draggedItemId.current)) {
        setDragOverFolderId(itemId);
      }
    }
  };

  const handleDragLeaveFolder = () => {
    setDragOverFolderId(null);
  };

  const handleDropItem = async (e: React.DragEvent, targetParentId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const draggedId = e.dataTransfer.getData('text/plain') || draggedItemId.current;
    if (!draggedId) return;

    if (draggedId === targetParentId) return;
    
    // Check for self-nesting if dragged item is a folder
    if (targetParentId && isDescendant(targetParentId, draggedId)) {
      return;
    }

    await onMoveFile(draggedId, targetParentId);
    draggedItemId.current = null;
  };

  // Helper to check if a folder is a descendant of another folder
  const isDescendant = (childId: string, parentId: string | null): boolean => {
    if (!parentId) return false;
    let currentId: string | null | undefined = childId;
    while (currentId) {
      const parent = files.find(f => f.id === currentId);
      if (!parent) return false;
      if (parent.parentId === parentId) return true;
      currentId = parent.parentId;
    }
    return false;
  };

  const toggleFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Handle local file import (supports files and ZIP extraction)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    const loadedFiles: { name: string; content: string; isDir: boolean; relativePath: string }[] = [];
    const filesArray = Array.from(fileList);

    for (const file of filesArray) {
      if (file.name.endsWith('.zip')) {
        try {
          const zip = new JSZip();
          const loadedZip = await zip.loadAsync(file);
          const promises: Promise<void>[] = [];

          loadedZip.forEach((relativePath, zipEntry) => {
            if (relativePath.startsWith('__MACOSX/')) return;
            
            if (zipEntry.dir) {
              loadedFiles.push({
                name: zipEntry.name.split('/').filter(Boolean).pop() || zipEntry.name,
                content: '',
                isDir: true,
                relativePath: relativePath.replace(/\/$/, '')
              });
            } else {
              const promise = zipEntry.async('text').then((content) => {
                loadedFiles.push({
                  name: zipEntry.name.split('/').pop() || zipEntry.name,
                  content: content,
                  isDir: false,
                  relativePath: relativePath
                });
              });
              promises.push(promise);
            }
          });

          await Promise.all(promises);
        } catch (err) {
          console.error('Error extracting ZIP file:', err);
        }
      } else {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result !== undefined) {
              loadedFiles.push({
                name: file.name,
                content: event.target.result as string,
                isDir: false,
                relativePath: file.name
              });
            }
            resolve();
          };
          reader.readAsText(file);
        });
      }
    }

    if (loadedFiles.length > 0) {
      onImportFiles(loadedFiles);
    }
    if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  // Helper for file icons based on extension
  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return <FileCode className="w-4 h-4 text-[#F7DF1E] flex-shrink-0" />;
      case 'ts':
      case 'tsx':
        return <FileCode className="w-4 h-4 text-[#3178C6] flex-shrink-0" />;
      case 'html':
        return <FileCode className="w-4 h-4 text-[#E34F26] flex-shrink-0" />;
      case 'css':
        return <FileCode className="w-4 h-4 text-[#1572B6] flex-shrink-0" />;
      case 'json':
        return <FileCode className="w-4 h-4 text-[#CBCB41] flex-shrink-0" />;
      case 'py':
        return <FileCode className="w-4 h-4 text-[#3776AB] flex-shrink-0" />;
      case 'md':
        return <FileCode className="w-4 h-4 text-[#0078D7] flex-shrink-0" />;
      default:
        return <FileCode className="w-4 h-4 text-[#8B949E] flex-shrink-0" />;
    }
  };

  // Recursive Tree Rendering
  const renderTree = (parentId: string | null, depth: number) => {
    // Filter peers at this depth
    const peers = files.filter(f => {
      const pId = f.parentId || null;
      const targetId = parentId || null;
      return pId === targetId;
    });

    // Match search query filtering if any query exists
    let displayPeers = peers;
    if (searchQuery.trim() !== '') {
      displayPeers = peers.filter(item => {
        if (item.type === 'folder') {
          const hasMatch = (fId: string): boolean => {
            const children = files.filter(f => f.parentId === fId);
            return children.some(c => 
              c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
              (c.type === 'folder' && hasMatch(c.id))
            );
          };
          return item.name.toLowerCase().includes(searchQuery.toLowerCase()) || hasMatch(item.id);
        }
        return item.name.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    // Sort folders first, then files, then by order
    displayPeers.sort((a, b) => {
      const aType = a.type || 'file';
      const bType = b.type || 'file';
      if (aType !== bType) {
        return aType === 'folder' ? -1 : 1;
      }
      return (a.order || 0) - (b.order || 0);
    });

    return (
      <div className="flex flex-col">
        {displayPeers.map((item) => {
          const isFolder = item.type === 'folder';
          const isActive = activeFileId === item.id;
          const isEditing = editingId === item.id;
          const isExpanded = expandedFolders[item.id];
          const isDragOver = dragOverFolderId === item.id;

          return (
            <div key={item.id} className="flex flex-col">
              {/* Explorer Row */}
              <div
                draggable={!isEditing}
                onDragStart={(e) => handleDragStart(e, item.id)}
                onDragOver={(e) => handleDragOverItem(e, item.id, isFolder ? 'folder' : 'file')}
                onDragLeave={handleDragLeaveFolder}
                onDrop={(e) => handleDropItem(e, isFolder ? item.id : (item.parentId || null))}
                onDoubleClick={() => {
                  setEditingId(item.id);
                  setEditName(item.name);
                }}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                className={`group flex items-center justify-between py-1.5 pr-2.5 rounded-md cursor-pointer transition-all border border-transparent select-none ${
                  isActive && !isFolder
                    ? 'bg-[#1E1E1E] text-textActive border-[#30363D]' 
                    : 'hover:bg-[#1C2128] hover:text-[#C9D1D9]'
                } ${isDragOver ? 'bg-accent/15 border-dashed border-accent' : ''}`}
                onClick={() => {
                  if (isEditing) return;
                  if (isFolder) {
                    setExpandedFolders(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                  } else {
                    onSelectFile(item.id);
                  }
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {/* Expansion Arrow for Folders */}
                  <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    {isFolder && (
                      <span onClick={(e) => toggleFolder(item.id, e)} className="p-0.5 hover:bg-[#30363D] rounded text-gray-500 hover:text-textActive transition-all">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </span>
                    )}
                  </div>

                  {/* Icon */}
                  <div className="flex-shrink-0">
                    {isFolder ? (
                      isExpanded ? (
                        <FolderOpen className="w-4 h-4 text-accent/80 flex-shrink-0" />
                      ) : (
                        <Folder className="w-4 h-4 text-accent/80 flex-shrink-0" />
                      )
                    ) : (
                      getFileIcon(item.name)
                    )}
                  </div>

                  {/* Name Input or Label */}
                  {isEditing ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => handleRenameSubmit(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(item.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="bg-[#0D1117] text-textActive border border-accent rounded px-1 py-0 text-xs font-mono w-full"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className={`truncate text-xs ${isFolder ? 'font-medium' : 'font-mono'}`}>
                      {item.name}
                    </span>
                  )}
                </div>

                {/* Actions Panel */}
                {!isEditing && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 transition-opacity pl-2">
                    {/* Add nested file/folder inside folder */}
                    {isFolder && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreateState({ type: 'file', parentId: item.id });
                          }}
                          title="New File Inside"
                          className="p-1 hover:bg-[#30363D] rounded text-[#8B949E] hover:text-textActive cursor-pointer"
                        >
                          <FilePlus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreateState({ type: 'folder', parentId: item.id });
                          }}
                          title="New Folder Inside"
                          className="p-1 hover:bg-[#30363D] rounded text-[#8B949E] hover:text-textActive cursor-pointer"
                        >
                          <FolderPlus className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateFile(item.id);
                      }}
                      title="Duplicate"
                      className="p-1 hover:bg-[#30363D] rounded text-[#8B949E] hover:text-textActive cursor-pointer"
                    >
                      <CopyPlus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingFile(item);
                      }}
                      title="Delete"
                      className="p-1 hover:bg-error/20 rounded text-[#8B949E] hover:text-error cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Recursive Children Tree */}
              {isFolder && isExpanded && (
                <div className="flex flex-col">
                  {renderTree(item.id, depth + 1)}
                </div>
              )}
            </div>
          );
        })}

        {/* Inline Create Input for this specific parent folder level */}
        {createState && createState.parentId === parentId && (
          <div 
            style={{ paddingLeft: `${depth * 12 + 28}px` }} 
            className="flex items-center gap-1.5 py-1 pr-2.5"
          >
            {createState.type === 'folder' ? (
              <Folder className="w-4 h-4 text-accent/80 flex-shrink-0" />
            ) : (
              <FileCode className="w-4 h-4 text-accent flex-shrink-0" />
            )}
            <form onSubmit={handleCreateSubmit} className="flex-1">
              <input
                type="text"
                placeholder={createState.type === 'folder' ? 'folder-name' : 'filename.ext'}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onBlur={() => {
                  if (!newItemName.trim()) setCreateState(null);
                }}
                className="w-full bg-[#0D1117] text-textActive border border-accent rounded px-1.5 py-0.5 text-xs font-mono"
                autoFocus
              />
            </form>
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className="w-64 bg-[#161B22] border-r border-border flex flex-col h-full select-none"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDropItem(e, null)} // Drop onto sidebar background moves item to root
    >
      {/* Sidebar Header */}
      <div className="p-3 border-b border-border flex justify-between items-center bg-[#0D1117]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm shadow shadow-accent/25">
            D
          </div>
          <span className="font-semibold text-textActive text-sm tracking-wide font-ui">DevDrop</span>
        </div>
        
        {/* Workspace Actions */}
        <div className="flex items-center gap-1 text-[#8B949E]">
          <button 
            onClick={onCopyAll} 
            title="Copy All Files"
            className="p-1.5 hover:bg-[#30363D] hover:text-textActive rounded transition-all cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={onDownloadWorkspace} 
            title="Download Workspace (ZIP)"
            className="p-1.5 hover:bg-[#30363D] hover:text-textActive rounded transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={triggerImport} 
            title="Import Files"
            className="p-1.5 hover:bg-[#30363D] hover:text-textActive rounded transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            multiple 
            className="hidden" 
          />
        </div>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-[#8B949E]">
            <Search className="w-3.5 h-3.5" />
          </span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search files... (Cmd+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[#0D1117] text-textActive border border-[#30363D] rounded-md text-xs placeholder-gray-600 focus:border-accent focus:ring-1 focus:ring-accent transition-all"
          />
        </div>
      </div>

      {/* Files List Explorer Header */}
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 flex justify-between items-center">
        <span>Workspace Explorer</span>
        <div className="flex gap-1.5 text-gray-500">
          <button 
            onClick={() => setCreateState({ type: 'file', parentId: null })} 
            className="hover:text-textActive p-0.5 rounded transition-all cursor-pointer"
            title="New File at Root"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setCreateState({ type: 'folder', parentId: null })} 
            className="hover:text-textActive p-0.5 rounded transition-all cursor-pointer"
            title="New Folder at Root"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* File Explorer Tree View */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {files.length === 0 && !createState ? (
          <div className="text-center py-8 text-xs text-gray-600 italic">
            No files or folders found
          </div>
        ) : (
          renderTree(null, 0)
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-border flex items-center justify-between text-xs">
        <span className="text-gray-600 font-mono">Workspace: default</span>
        <button
          onClick={onLogout}
          className="hover:text-textActive transition-colors cursor-pointer text-gray-500 hover:bg-[#30363D] px-2 py-1 rounded"
        >
          Logout
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingFile && (
          <div className="fixed inset-0 backdrop-blur-md bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1E1E1E] border border-border w-full max-w-sm rounded-xl p-5 shadow-2xl"
            >
              <div className="flex gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-error/10 border border-error/20 flex items-center justify-center text-error flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-textActive font-semibold text-base">Delete {deletingFile.type === 'folder' ? 'Folder' : 'File'}?</h3>
                  <p className="text-xs text-textMuted mt-1">
                    Are you sure you want to delete <span className="font-mono text-textActive font-medium">"{deletingFile.name}"</span>? 
                    {deletingFile.type === 'folder' ? ' This will recursively delete all files and subfolders inside it. This action cannot be undone.' : ' This action cannot be undone.'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 text-xs font-semibold">
                <button
                  onClick={() => setDeletingFile(null)}
                  className="px-4 py-2 bg-panels hover:bg-[#202730] border border-border text-textActive rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const id = deletingFile.id;
                    setDeletingFile(null);
                    await onDeleteFile(id);
                  }}
                  className="px-4 py-2 bg-error hover:bg-error/85 text-white rounded-lg transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
