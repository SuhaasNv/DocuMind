import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Folder, FolderPlus, Plus, Trash2, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppStore, type CollectionSummary } from '@/stores/useAppStore';
import { stopChatStream } from '@/lib/chatStream';
import {
  listCollections,
  createCollection,
  deleteCollection,
  addDocumentToCollection,
  removeDocumentFromCollection,
} from '@/lib/collections';

interface CollectionsSectionProps {
  /** When false (collapsed desktop sidebar), the section is hidden. */
  isExpanded: boolean;
  /** Mobile sheet rendering: touch-friendly sizes, always-visible actions. */
  isMobileSheet?: boolean;
  /** Called when a link/action is used (e.g. close mobile sheet). */
  onLinkClick?: () => void;
}

/**
 * Sidebar "Collections" section: lists collections with a create dialog, a
 * manage-documents dialog (add/remove the user's own documents) and delete.
 * Shared by the desktop Sidebar and the mobile SidebarContent sheet.
 */
const CollectionsSection = ({
  isExpanded,
  isMobileSheet = false,
  onLinkClick,
}: CollectionsSectionProps) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    collections,
    setCollections,
    upsertCollection,
    removeCollection,
    documents,
    accessToken,
  } = useAppStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listCollections(accessToken)
      .then((cols) => {
        if (!cancelled) setCollections(cols);
      })
      .catch(() => {
        // Backend unreachable — keep whatever we have
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, setCollections]);

  if (!isExpanded && !isMobileSheet) return null;

  const manageCollection = manageId
    ? collections.find((c) => c.id === manageId) ?? null
    : null;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createCollection(accessToken, name);
      upsertCollection(created);
      setNewName('');
      setCreateOpen(false);
      setManageId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create collection');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleDocument = async (collection: CollectionSummary, documentId: string) => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    const inCollection = collection.documents.some((d) => d.id === documentId);
    try {
      const updated = inCollection
        ? await removeDocumentFromCollection(accessToken, collection.id, documentId)
        : await addDocumentToCollection(accessToken, collection.id, documentId);
      upsertCollection(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update collection');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    onLinkClick?.();
    if (accessToken) {
      try {
        await deleteCollection(accessToken, id);
      } catch {
        // Remove from UI anyway
      }
    }
    stopChatStream(`col:${id}`);
    removeCollection(id);
    if (pathname === `/collection/${id}/chat`) navigate('/app');
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-3 mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Collections
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
          aria-label="Create collection"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {collections.length === 0 ? (
        <p className="px-3 text-xs text-muted-foreground/70">
          Group documents to chat across them.
        </p>
      ) : (
        <ul className="space-y-1">
          {collections.map((collection) => {
            const isActive = pathname === `/collection/${collection.id}/chat`;
            return (
              <li key={collection.id}>
                <div
                  className={cn(
                    'flex items-center gap-1 px-1 py-1 rounded-lg group',
                    isActive
                      ? 'bg-primary/20 border border-primary/30'
                      : 'hover:bg-sidebar-accent/50',
                    isMobileSheet && 'py-2'
                  )}
                >
                  <Link
                    to={`/collection/${collection.id}/chat`}
                    onClick={onLinkClick}
                    className={cn(
                      'flex items-center gap-3 px-2 py-1.5 rounded-md flex-1 min-w-0 transition-colors min-h-touch md:min-h-0',
                      isActive
                        ? 'text-primary'
                        : 'text-sidebar-foreground hover:text-sidebar-accent-foreground',
                      isMobileSheet && 'py-3'
                    )}
                  >
                    <Folder className="w-4 h-4 flex-shrink-0" />
                    <span className={cn('truncate flex-1', isMobileSheet ? 'text-base' : 'text-sm')}>
                      {collection.name}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                      {collection.documentCount}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity',
                      isMobileSheet && 'opacity-100'
                    )}
                    onClick={() => {
                      setError(null);
                      setManageId(collection.id);
                    }}
                    aria-label={`Add documents to ${collection.name}`}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity',
                      isMobileSheet && 'opacity-100'
                    )}
                    onClick={() => setDeleteId(collection.id)}
                    aria-label={`Delete ${collection.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => !busy && setCreateOpen(open)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              Group documents together and chat across all of them at once.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Collection name"
              maxLength={120}
              autoFocus
            />
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={busy || !newName.trim()}>
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage documents dialog */}
      <Dialog open={manageCollection !== null} onOpenChange={(open) => !open && setManageId(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">{manageCollection?.name}</DialogTitle>
            <DialogDescription>Add or remove your documents.</DialogDescription>
          </DialogHeader>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Upload a document first, then add it here.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto space-y-1 -mx-1 px-1">
              {documents.map((doc) => {
                const inCollection =
                  manageCollection?.documents.some((d) => d.id === doc.id) ?? false;
                return (
                  <li
                    key={doc.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50"
                  >
                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 min-w-0 truncate text-sm">{doc.name}</span>
                    {doc.status !== 'DONE' && (
                      <span className="shrink-0 text-[10px] text-muted-foreground uppercase">
                        {doc.status.toLowerCase()}
                      </span>
                    )}
                    <Button
                      variant={inCollection ? 'outline' : 'secondary'}
                      size="sm"
                      className="h-7 px-2 text-xs shrink-0"
                      disabled={busy || !manageCollection}
                      onClick={() =>
                        manageCollection && void handleToggleDocument(manageCollection, doc.id)
                      }
                    >
                      {inCollection ? 'Remove' : 'Add'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the collection only — its documents are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CollectionsSection;
