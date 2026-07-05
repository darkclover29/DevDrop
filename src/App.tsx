import React, { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { ToastProvider, useToast } from './components/Toast';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import type { FileItem } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { StatusBar } from './components/StatusBar';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

const API_BASE_URL = '';

const DevDropApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [syncState, setSyncState] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);

  const toast = useToast();

  // Keep track of the latest workspace updatedAt timestamp from the server
  const workspaceUpdatedAt = useRef<string>(new Date(0).toISOString());

  // Store active debounced saves timeouts
  const pendingSaves = useRef<{ [fileId: string]: any }>({});

  // 1. Check Authentication on Mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/workspace`);
        if (res.ok) {
          const data = await res.json();
          setFiles(data.files);
          workspaceUpdatedAt.current = data.updatedAt;
          setIsAuthenticated(true);
          setLastSyncTime(new Date());

          // Select first file if available
          if (data.files.length > 0) {
            const firstFile = data.files[0];
            setActiveFileId(firstFile.id);
            setOpenTabs([firstFile.id]);
          }
        } else if (res.status === 401) {
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(false);
        }
      } catch (e) {
        // Network error, show login anyway or connection error
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const isMonaco = document.activeElement?.classList.contains('inputarea');

      if (isInput || isMonaco) return;

      // Toggle shortcuts: Shift + ? or Cmd + / or Ctrl + /
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      
      // Focus search: Cmd + K or Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('focus-devdrop-search'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 2. Fetch Full Workspace (Sync Trigger)
  const fetchWorkspace = useCallback(async (isSilent = false) => {
    if (!isSilent) setSyncState('syncing');
    try {
      const res = await fetch(`${API_BASE_URL}/api/workspace`);
      if (res.ok) {
        const data = await res.json();
        
        // Merge workspace files, preserving local changes if there are pending saves
        setFiles(prevFiles => {
          return data.files.map((serverFile: FileItem) => {
            const hasPendingSave = !!pendingSaves.current[serverFile.id];
            if (hasPendingSave) {
              const localFile = prevFiles.find(f => f.id === serverFile.id);
              return localFile ? localFile : serverFile;
            }
            return serverFile;
          });
        });

        workspaceUpdatedAt.current = data.updatedAt;
        setSyncState('synced');
        setLastSyncTime(new Date());

        // Validate active file and tabs exist
        setOpenTabs(prevTabs => {
          const validTabs = prevTabs.filter(tabId => data.files.some((f: FileItem) => f.id === tabId));
          // If active file is deleted, pick another one
          if (activeFileId && !data.files.some((f: FileItem) => f.id === activeFileId)) {
            if (validTabs.length > 0) {
              setActiveFileId(validTabs[0]);
            } else if (data.files.length > 0) {
              setActiveFileId(data.files[0].id);
              validTabs.push(data.files[0].id);
            } else {
              setActiveFileId(null);
            }
          }
          return validTabs;
        });

      } else {
        setSyncState('error');
      }
    } catch (e) {
      setSyncState('error');
    }
  }, [activeFileId]);

  // 3. Real-Time Sync Polling Loop
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(async () => {
      // Skip status check if we are currently saving to avoid race conditions
      const hasPendingSaves = Object.keys(pendingSaves.current).length > 0;
      if (hasPendingSaves || syncState === 'syncing') return;

      try {
        const res = await fetch(`${API_BASE_URL}/api/workspace/status`);
        if (res.ok) {
          const data = await res.json();
          // If server updatedAt is newer, pull full workspace
          if (new Date(data.updatedAt) > new Date(workspaceUpdatedAt.current)) {
            fetchWorkspace(true);
            toast.info('Workspace updated from another device');
          }
        }
      } catch (e) {
        // Fail silently during background polling, but do not set global error state unless main fetch fails
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchWorkspace, syncState, toast]);

  // 4. File Content Updates & Autosave
  const handleUpdateContent = (fileId: string, newContent: string) => {
    // Immediate React update for fast UI
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, content: newContent, updatedAt: new Date().toISOString() } : f));

    // Clear previous save timeout for this file
    if (pendingSaves.current[fileId]) {
      clearTimeout(pendingSaves.current[fileId]);
    }

    setSyncState('syncing');

    // Debounce save to 1000ms
    pendingSaves.current[fileId] = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/file/${fileId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newContent }),
        });
        if (res.ok) {
          setSyncState('synced');
          setLastSyncTime(new Date());
          
          // Fast update our local workspaceUpdatedAt to match what server would have
          const statusRes = await fetch(`${API_BASE_URL}/api/workspace/status`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            workspaceUpdatedAt.current = statusData.updatedAt;
          }
        } else {
          setSyncState('error');
          toast.error('Failed to autosave changes');
        }
      } catch (e) {
        setSyncState('error');
        toast.error('Autosave failed. Check connection.');
      }
      delete pendingSaves.current[fileId];
    }, 1000);
  };

  // 5. Select Active File / Open Tab
  const handleSelectFile = (id: string) => {
    setActiveFileId(id);
    if (!openTabs.includes(id)) {
      setOpenTabs(prev => [...prev, id]);
    }
  };

  // 6. Close Tab
  const handleCloseTab = (id: string) => {
    const tabIndex = openTabs.indexOf(id);
    const newTabs = openTabs.filter(t => t !== id);
    setOpenTabs(newTabs);

    if (activeFileId === id) {
      if (newTabs.length > 0) {
        // Select adjacent tab
        const nextActiveIndex = Math.max(0, tabIndex - 1);
        setActiveFileId(newTabs[nextActiveIndex]);
      } else {
        setActiveFileId(null);
      }
    }
  };

  // 7. Create New File / Folder
  const handleCreateFile = async (name: string, type: 'file' | 'folder' = 'file', parentId: string | null = null) => {
    setSyncState('syncing');
    
    // Guess language by extension
    const ext = name.split('.').pop()?.toLowerCase();
    let language = 'plaintext';
    if (ext === 'js' || ext === 'jsx') language = 'javascript';
    else if (ext === 'ts' || ext === 'tsx') language = 'typescript';
    else if (ext === 'html') language = 'html';
    else if (ext === 'css') language = 'css';
    else if (ext === 'json') language = 'json';
    else if (ext === 'py') language = 'python';
    else if (ext === 'md') language = 'markdown';

    try {
      const res = await fetch(`${API_BASE_URL}/api/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          parentId: parentId || '',
          content: '',
          language: type === 'folder' ? '' : language,
          order: files.length
        }),
      });

      if (res.ok) {
        const newFile = await res.json();
        setFiles(prev => [...prev, newFile]);
        if (type === 'file') {
          handleSelectFile(newFile.id);
        }
        toast.success(`Created ${type} "${name}"`);
        setSyncState('synced');
        setLastSyncTime(new Date());
        
        // Refresh workspace status timestamp
        const statusRes = await fetch(`${API_BASE_URL}/api/workspace/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          workspaceUpdatedAt.current = statusData.updatedAt;
        }
      } else {
        setSyncState('error');
        toast.error(`Failed to create ${type}`);
      }
    } catch (e) {
      setSyncState('error');
      toast.error(`Failed to create ${type}. Connection error.`);
    }
  };

  // 8. Rename File
  const handleRenameFile = async (id: string, newName: string) => {
    setSyncState('syncing');
    try {
      const res = await fetch(`${API_BASE_URL}/api/file/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });

      if (res.ok) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
        toast.success(`Renamed file to ${newName}`);
        setSyncState('synced');
        setLastSyncTime(new Date());

        const statusRes = await fetch(`${API_BASE_URL}/api/workspace/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          workspaceUpdatedAt.current = statusData.updatedAt;
        }
      } else {
        setSyncState('error');
        toast.error('Failed to rename file');
      }
    } catch (e) {
      setSyncState('error');
      toast.error('Rename failed. Connection error.');
    }
  };

  // 9. Delete File / Folder (and recursively close tabs for descendants)
  const handleDeleteFile = async (id: string) => {
    setSyncState('syncing');
    try {
      const res = await fetch(`${API_BASE_URL}/api/file/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const toDeleteIds = [id];
        const targetItem = files.find(f => f.id === id);
        
        if (targetItem && targetItem.type === 'folder') {
          const getDescendantIds = (pId: string) => {
            const children = files.filter(f => f.parentId === pId);
            for (const child of children) {
              toDeleteIds.push(child.id);
              if (child.type === 'folder') {
                getDescendantIds(child.id);
              }
            }
          };
          getDescendantIds(id);
        }

        setFiles(prev => prev.filter(f => !toDeleteIds.includes(f.id)));
        toDeleteIds.forEach(tId => handleCloseTab(tId));
        
        toast.success(targetItem?.type === 'folder' ? 'Folder deleted recursively' : 'File deleted');
        setSyncState('synced');
        setLastSyncTime(new Date());

        const statusRes = await fetch(`${API_BASE_URL}/api/workspace/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          workspaceUpdatedAt.current = statusData.updatedAt;
        }
      } else {
        setSyncState('error');
        toast.error('Failed to delete');
      }
    } catch (e) {
      setSyncState('error');
      toast.error('Delete failed. Connection error.');
    }
  };

  // 10. Duplicate File / Folder recursively
  const handleDuplicateFile = async (id: string) => {
    setSyncState('syncing');
    try {
      const res = await fetch(`${API_BASE_URL}/api/duplicate/${id}`, {
        method: 'POST',
      });

      if (res.ok) {
        const targetItem = files.find(f => f.id === id);
        // Refresh workspace status first to load recursively cloned files/folders
        await fetchWorkspace(true);
        const newRoot = await res.json();
        
        if (newRoot.type === 'file') {
          handleSelectFile(newRoot.id);
        }
        
        toast.success(`Duplicated ${targetItem?.type === 'folder' ? 'folder' : 'file'} to ${newRoot.name}`);
        setSyncState('synced');
        setLastSyncTime(new Date());

        const statusRes = await fetch(`${API_BASE_URL}/api/workspace/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          workspaceUpdatedAt.current = statusData.updatedAt;
        }
      } else {
        setSyncState('error');
        toast.error('Failed to duplicate item');
      }
    } catch (e) {
      setSyncState('error');
      toast.error('Duplicate failed. Connection error.');
    }
  };

  // 10.5. Move File / Folder (Drag to Nest)
  const handleMoveFile = async (id: string, parentId: string | null) => {
    setSyncState('syncing');
    try {
      const res = await fetch(`${API_BASE_URL}/api/file/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: parentId || '' }),
      });

      if (res.ok) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, parentId } : f));
        toast.success('Moved item successfully');
        setSyncState('synced');
        setLastSyncTime(new Date());

        const statusRes = await fetch(`${API_BASE_URL}/api/workspace/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          workspaceUpdatedAt.current = statusData.updatedAt;
        }
      } else {
        setSyncState('error');
        toast.error('Failed to move item');
      }
    } catch (e) {
      setSyncState('error');
      toast.error('Move failed. Connection error.');
    }
  };

  // 11. Drag and Drop Reordering
  const handleReorderFiles = async (reorderedFiles: FileItem[]) => {
    // Optimistic UI update
    setFiles(reorderedFiles);
    setSyncState('syncing');

    try {
      const payload = reorderedFiles.map((f, idx) => ({ id: f.id, order: idx }));
      const res = await fetch(`${API_BASE_URL}/api/workspace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payload }),
      });

      if (res.ok) {
        setSyncState('synced');
        setLastSyncTime(new Date());

        const statusRes = await fetch(`${API_BASE_URL}/api/workspace/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          workspaceUpdatedAt.current = statusData.updatedAt;
        }
      } else {
        setSyncState('error');
        toast.error('Failed to save file order');
      }
    } catch (e) {
      setSyncState('error');
      toast.error('Reordering sync failed. Connection error.');
    }
  };

  // 12. Copy All Files Content
  const handleCopyAll = () => {
    if (files.length === 0) {
      toast.warning('No files in workspace to copy');
      return;
    }

    const formattedContent = files.map(file => {
      return `===== ${file.name} =====\n${file.content}\n`;
    }).join('\n');

    navigator.clipboard.writeText(formattedContent)
      .then(() => toast.success('Copied all files to clipboard'))
      .catch(() => toast.error('Failed to copy to clipboard'));
  };

  // Helper to trace full relative path inside workspace
  const getFullFilePath = (file: FileItem): string => {
    const pathParts = [file.name];
    let currentParentId = file.parentId;
    while (currentParentId) {
      const parent = files.find(f => f.id === currentParentId);
      if (parent) {
        pathParts.unshift(parent.name);
        currentParentId = parent.parentId;
      } else {
        break;
      }
    }
    return pathParts.join('/');
  };

  // 13. Download Workspace as ZIP
  const handleDownloadWorkspace = async () => {
    if (files.length === 0) {
      toast.error('Workspace is empty');
      return;
    }

    setSyncState('syncing');
    try {
      const zip = new JSZip();
      files.forEach(file => {
        if (file.type !== 'folder') {
          const fullPath = getFullFilePath(file);
          zip.file(fullPath, file.content);
        } else {
          // Add empty folder directory structure
          const fullPath = getFullFilePath(file);
          zip.folder(fullPath);
        }
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'devdrop_workspace.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSyncState('synced');
      toast.success('Workspace downloaded successfully');
    } catch (e) {
      setSyncState('error');
      toast.error('Failed to generate ZIP download');
    }
  };

  // 14. Import Files / Folders Bulk
  const handleImportFiles = async (importedList: { name: string; content: string; isDir: boolean; relativePath: string }[]) => {
    if (importedList.length === 0) return;

    setSyncState('syncing');

    const createdItemsMap: Record<string, string> = {}; // maps relativePath -> newId
    const newItemsPayload: any[] = [];
    let orderCounter = files.length;

    // Helper to find or create directory hierarchy
    const findOrCreateDirectory = (dirPath: string): string | null => {
      if (!dirPath) return null;
      if (createdItemsMap[dirPath]) return createdItemsMap[dirPath];

      // Check if folder already exists in existing files
      const parts = dirPath.split('/');
      const folderName = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join('/');
      const parentId: string | null = parentPath ? findOrCreateDirectory(parentPath) : null;

      const existingFolder: FileItem | undefined = files.find(f => f.type === 'folder' && f.name === folderName && f.parentId === parentId);
      if (existingFolder) {
        createdItemsMap[dirPath] = existingFolder.id;
        return existingFolder.id;
      }

      // Create new folder
      const newFolderId = Math.random().toString(36).substring(2, 15);
      createdItemsMap[dirPath] = newFolderId;

      newItemsPayload.push({
        id: newFolderId,
        name: folderName,
        type: 'folder',
        parentId: parentId || '',
        content: '',
        language: '',
        updatedAt: new Date().toISOString(),
        order: orderCounter++
      });

      return newFolderId;
    };

    // Sort items so directories are processed first
    const sortedList = [...importedList].sort((a, b) => {
      const aDepth = a.relativePath.split('/').length;
      const bDepth = b.relativePath.split('/').length;
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1; 
      }
      return aDepth - bDepth;
    });

    for (const item of sortedList) {
      if (item.isDir) {
        const dirPath = item.relativePath.replace(/\/$/, '');
        findOrCreateDirectory(dirPath);
      } else {
        const parts = item.relativePath.split('/');
        const fileName = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');
        const parentId = parentPath ? findOrCreateDirectory(parentPath) : null;

        const ext = fileName.split('.').pop()?.toLowerCase();
        let language = 'plaintext';
        if (ext === 'js' || ext === 'jsx') language = 'javascript';
        else if (ext === 'ts' || ext === 'tsx') language = 'typescript';
        else if (ext === 'html') language = 'html';
        else if (ext === 'css') language = 'css';
        else if (ext === 'json') language = 'json';
        else if (ext === 'py') language = 'python';
        else if (ext === 'md') language = 'markdown';

        newItemsPayload.push({
          id: Math.random().toString(36).substring(2, 15),
          name: fileName,
          type: 'file',
          parentId: parentId || '',
          content: item.content,
          language,
          updatedAt: new Date().toISOString(),
          order: orderCounter++
        });
      }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/workspace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: newItemsPayload }),
      });

      if (res.ok) {
        setFiles(prev => [...prev, ...newItemsPayload]);
        // Open the first imported file
        const firstFile = newItemsPayload.find(f => f.type === 'file');
        if (firstFile) {
          handleSelectFile(firstFile.id);
        }
        toast.success(`Imported ${importedList.length} item(s)`);
        setSyncState('synced');
        setLastSyncTime(new Date());

        const statusRes = await fetch(`${API_BASE_URL}/api/workspace/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          workspaceUpdatedAt.current = statusData.updatedAt;
        }
      } else {
        setSyncState('error');
        toast.error('Failed to import files');
      }
    } catch (e) {
      setSyncState('error');
      toast.error('Import failed. Connection error.');
    }
  };

  // 15. Logout Handler
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/logout`, { method: 'POST' });
    } catch (e) {
      // Logout locally anyway
    }
    setIsAuthenticated(false);
    setFiles([]);
    setOpenTabs([]);
    setActiveFileId(null);
    toast.success('Logged out from workspace');
  };

  // 16. Calculate Stats
  const totalChars = files.reduce((acc, f) => acc + (f.content?.length || 0), 0);
  const totalLines = files.reduce((acc, f) => acc + (f.content?.split('\n').length || 0), 0);
  const workspaceSize = totalChars; // Rough estimate: 1 char = 1 byte

  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-textMuted text-xs font-mono select-none">
        Initializing DevDrop Workspace...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => { setIsAuthenticated(true); fetchWorkspace(); }} apiBaseUrl={API_BASE_URL} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background font-ui">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          files={files}
          activeFileId={activeFileId}
          onSelectFile={handleSelectFile}
          onCreateFile={handleCreateFile}
          onRenameFile={handleRenameFile}
          onDeleteFile={handleDeleteFile}
          onDuplicateFile={handleDuplicateFile}
          onMoveFile={handleMoveFile}
          onReorderFiles={handleReorderFiles}
          onCopyAll={handleCopyAll}
          onDownloadWorkspace={handleDownloadWorkspace}
          onImportFiles={handleImportFiles}
          onLogout={handleLogout}
        />

        {/* Editor Area */}
        <EditorArea
          files={files}
          activeFileId={activeFileId}
          openTabs={openTabs}
          onSelectFile={handleSelectFile}
          onCloseTab={handleCloseTab}
          onUpdateContent={handleUpdateContent}
          onCreateFilePrompt={() => {
            // Focus new file field in sidebar or simulate click
            toast.info('Use the "+" button at the top of the files explorer to create a file');
          }}
        />
      </div>

      {/* Status Bar */}
      <StatusBar
        syncState={syncState}
        lastSyncTime={lastSyncTime}
        fileCount={files.length}
        totalChars={totalChars}
        totalLines={totalLines}
        workspaceSize={workspaceSize}
      />

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && (
          <div className="fixed inset-0 backdrop-blur-md bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1E1E1E] border border-[#30363D] w-full max-w-md rounded-xl p-5 shadow-2xl relative select-none"
            >
              <button
                onClick={() => setShowShortcuts(false)}
                className="absolute top-4 right-4 text-[#8B949E] hover:text-[#C9D1D9] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2.5 mb-4 border-b border-[#30363D] pb-3">
                <Keyboard className="w-5 h-5 text-accent" />
                <h3 className="text-textActive font-semibold text-base font-ui">Keyboard Shortcuts</h3>
              </div>

              <div className="space-y-3.5 text-xs text-[#C9D1D9]">
                {/* Search */}
                <div className="flex items-center justify-between py-1.5 border-b border-[#30363D]/55">
                  <span className="text-[#8B949E]">Search / Filter Files</span>
                  <div className="flex gap-1.5">
                    <kbd className="px-1.5 py-0.5 bg-[#30363D] border border-[#30363D] rounded text-[10px] text-textActive font-mono">Cmd / Ctrl</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#30363D] border border-[#30363D] rounded text-[10px] text-textActive font-mono">K</kbd>
                  </div>
                </div>

                {/* Shortcuts */}
                <div className="flex items-center justify-between py-1.5 border-b border-[#30363D]/55">
                  <span className="text-[#8B949E]">Toggle Shortcuts Dialog</span>
                  <div className="flex gap-1.5">
                    <kbd className="px-1.5 py-0.5 bg-[#30363D] border border-[#30363D] rounded text-[10px] text-textActive font-mono">Shift</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#30363D] border border-[#30363D] rounded text-[10px] text-textActive font-mono">?</kbd>
                  </div>
                </div>

                {/* Rename */}
                <div className="flex items-center justify-between py-1.5 border-b border-[#30363D]/55">
                  <span className="text-[#8B949E]">Rename File Inline</span>
                  <span className="text-[10px] text-textMuted font-mono">Double-Click filename</span>
                </div>

                {/* Drag and Drop */}
                <div className="flex items-center justify-between py-1.5 border-b border-[#30363D]/55">
                  <span className="text-[#8B949E]">Reorder Files</span>
                  <span className="text-[10px] text-textMuted font-mono">Drag & Drop in explorer</span>
                </div>

                {/* Duplicate/Delete hover */}
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-[#8B949E]">Duplicate / Delete file</span>
                  <span className="text-[10px] text-textMuted font-mono">Hover filename for action buttons</span>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-[#30363D] flex justify-end">
                <button
                  onClick={() => setShowShortcuts(false)}
                  className="px-4 py-1.5 bg-[#30363D] hover:bg-[#3E454F] text-textActive text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <DevDropApp />
    </ToastProvider>
  );
}
