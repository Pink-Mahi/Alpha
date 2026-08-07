import { useEffect, useState, useCallback, useRef } from "react";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  ext?: string;
  size?: number;
  children?: TreeNode[];
}

interface FileExplorerProps {
  taskId: string;
  onFileSelect?: (path: string, content: string, ext: string) => void;
}

/** File explorer with tree view, drag-and-drop upload, and file viewing. */
export function FileExplorer({ taskId, onFileSelect }: FileExplorerProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileExt, setFileExt] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<{ stdout: string; stderr: string; exitCode: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTree = useCallback(async () => {
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch(`/v1/tasks/${taskId}/tree`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        setTree(data.tree ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  async function loadFile(path: string) {
    setSelectedPath(path);
    setRunOutput(null);
    setShowPreview(false);
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch(`/v1/tasks/${taskId}/file?path=${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        setFileContent(data.content ?? "");
        setFileExt(data.ext ?? "");
        if (data.ext === "html") setShowPreview(true);
        onFileSelect?.(path, data.content ?? "", data.ext ?? "");
      }
    } catch { /* ignore */ }
  }

  function toggleDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function uploadFile(path: string, content: string) {
    setUploading(true);
    setUploadMsg("");
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch(`/v1/tasks/${taskId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path, content }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setUploadMsg(`Uploaded ${path} (${data.bytes} bytes)`);
        await fetchTree();
        // Auto-select the uploaded file
        loadFile(path);
      } else {
        const data = await resp.json().catch(() => ({}));
        setUploadMsg(`Upload failed: ${data.error ?? "unknown"}`);
      }
    } catch (e) {
      setUploadMsg(`Upload error: ${e}`);
    }
    finally { setUploading(false); }
  }

  async function deleteFile(path: string) {
    if (!confirm(`Delete ${path}?`)) return;
    const token = localStorage.getItem("alpha_token");
    try {
      await fetch(`/v1/tasks/${taskId}/file?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedPath(null);
      setFileContent("");
      await fetchTree();
    } catch { /* ignore */ }
  }

  async function runFile() {
    if (!selectedPath) return;
    setRunning(true);
    setRunOutput(null);
    setShowPreview(false);
    const token = localStorage.getItem("alpha_token");
    try {
      const resp = await fetch(`/v1/tasks/${taskId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path: selectedPath }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setRunOutput({ stdout: data.stdout ?? "", stderr: data.stderr ?? "", exitCode: data.exitCode ?? 0 });
      } else {
        const data = await resp.json().catch(() => ({}));
        setRunOutput({ stdout: "", stderr: data.error ?? "Failed to run", exitCode: -1 });
      }
    } catch (e) {
      setRunOutput({ stdout: "", stderr: `Network error: ${e}`, exitCode: -1 });
    }
    finally { setRunning(false); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1] ?? "";
        uploadFile(file.name, base64);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1] ?? "";
        uploadFile(file.name, base64);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  }

  const canRun = ["py", "js", "ts"].includes(fileExt);
  const canPreview = fileExt === "html";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>📁 Files</span>
        <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }} onClick={() => fileInputRef.current?.click()}>
          + Upload
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileInput} />
      </div>

      {/* Upload message */}
      {uploadMsg && (
        <div style={{ padding: "0.4rem 0.75rem", fontSize: "0.7rem", color: uploadMsg.startsWith("Upload failed") || uploadMsg.startsWith("Upload error") ? "#f85149" : "#238636", flexShrink: 0 }}>
          {uploadMsg}
        </div>
      )}

      {/* Main area: tree sidebar + content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Tree sidebar */}
        <div
          style={{
            width: "220px",
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            padding: "0.4rem",
            background: dragOver ? "rgba(31, 111, 235, 0.1)" : "transparent",
            transition: "background 0.15s",
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {dragOver && (
            <div style={{
              padding: "1rem", textAlign: "center", fontSize: "0.75rem",
              border: "2px dashed #1f6feb", borderRadius: "var(--radius)", color: "#1f6feb",
              marginBottom: "0.5rem",
            }}>
              Drop files to upload
            </div>
          )}
          {loading ? (
            <div className="muted" style={{ fontSize: "0.75rem", padding: "0.5rem" }}>Loading...</div>
          ) : tree.length === 0 ? (
            <div className="muted" style={{ fontSize: "0.75rem", padding: "0.5rem" }}>No files yet. Drag & drop or click + Upload.</div>
          ) : (
            <TreeView
              nodes={tree}
              depth={0}
              expandedDirs={expandedDirs}
              selectedPath={selectedPath}
              onToggle={toggleDir}
              onSelect={loadFile}
              onDelete={deleteFile}
            />
          )}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
          {/* Action buttons */}
          {selectedPath && (
            <div style={{ padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--border)", display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.7rem", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedPath}
              </span>
              {canRun && (
                <button className="btn" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }} onClick={runFile} disabled={running}>
                  {running ? "Running..." : "▶ Run"}
                </button>
              )}
              {canPreview && (
                <button className="btn" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }} onClick={() => setShowPreview(!showPreview)}>
                  {showPreview ? "📄 Code" : "👁 Preview"}
                </button>
              )}
              <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", color: "#f85149" }} onClick={() => deleteFile(selectedPath)}>
                🗑
              </button>
            </div>
          )}

          {showPreview && canPreview ? (
            <iframe srcDoc={fileContent} title="Preview" style={{ width: "100%", height: "100%", border: "none", background: "white" }} sandbox="allow-scripts allow-same-origin" />
          ) : runOutput ? (
            <div style={{ padding: "0.6rem", fontFamily: "monospace", fontSize: "0.75rem" }}>
              {runOutput.stdout && <pre style={{ whiteSpace: "pre-wrap", margin: 0, marginBottom: "0.5rem" }}>{runOutput.stdout}</pre>}
              {runOutput.stderr && <pre style={{ whiteSpace: "pre-wrap", margin: 0, color: "#f85149" }}>{runOutput.stderr}</pre>}
              <div className="muted" style={{ fontSize: "0.7rem", marginTop: "0.5rem" }}>Exit: {runOutput.exitCode}</div>
            </div>
          ) : selectedPath ? (
            <pre style={{ padding: "0.6rem", margin: 0, fontSize: "0.75rem", whiteSpace: "pre-wrap", fontFamily: "monospace", overflowX: "auto" }}>
              {fileContent || "(empty file)"}
            </pre>
          ) : (
            <div style={{ padding: "1.5rem", textAlign: "center" }}>
              <div className="muted" style={{ fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
                Select a file to view its contents
              </div>
              <div className="muted" style={{ fontSize: "0.75rem" }}>
                or drag & drop files here to upload them to the project
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Recursive tree view. */
function TreeView({
  nodes, depth, expandedDirs, selectedPath, onToggle, onSelect, onDelete,
}: {
  nodes: TreeNode[];
  depth: number;
  expandedDirs: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expandedDirs.has(node.path);
        const isSelected = selectedPath === node.path;
        return (
          <div key={node.path}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.25rem 0.4rem",
                cursor: "pointer",
                borderRadius: "var(--radius)",
                fontSize: "0.75rem",
                fontFamily: "monospace",
                background: isSelected ? "var(--border)" : "transparent",
                paddingLeft: `${0.4 + depth * 0.8}rem`,
                gap: "0.3rem",
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg)"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              onClick={() => {
                if (node.type === "dir") onToggle(node.path);
                else onSelect(node.path);
              }}
            >
              <span style={{ width: "0.8rem", textAlign: "center", opacity: 0.6 }}>
                {node.type === "dir" ? (isExpanded ? "▼" : "▶") : ""}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.type === "dir" ? "📁" : fileIcon(node.ext)} {node.name}
              </span>
              {node.type === "file" && (
                <button
                  style={{
                    background: "none", border: "none", color: "#f85149", cursor: "pointer",
                    fontSize: "0.65rem", padding: "0 0.2rem", opacity: 0.5,
                  }}
                  onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = "0.5"}
                  title="Delete"
                >×</button>
              )}
            </div>
            {node.type === "dir" && isExpanded && node.children && (
              <TreeView
                nodes={node.children}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function fileIcon(ext?: string): string {
  switch (ext) {
    case "py": return "🐍";
    case "js": case "ts": case "jsx": case "tsx": return "📜";
    case "html": return "🌐";
    case "css": return "🎨";
    case "json": return "📋";
    case "md": return "📝";
    case "txt": return "📄";
    default: return "📄";
  }
}
