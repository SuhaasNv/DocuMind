import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  Search,
  Sprout,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import Header from '@/components/app/Header';
import {
  chatMarkdownComponents,
  citationIndex,
  linkifyCitations,
  makeCiteAnchor,
  pageLabel,
} from '@/components/chat/markdownComponents';
import { PdfViewerSheet } from '@/components/chat/PdfViewerSheet';
import { type ChatSource } from '@/stores/useAppStore';
import { getApiErrorMessage } from '@/lib/api';
import {
  deleteInsight,
  exportInsights,
  listInsights,
  updateInsight,
  Insight,
} from '@/lib/insights';

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

interface CardEditorProps {
  insight: Insight;
  onSaved: (updated: Insight) => void;
  onCancel: () => void;
}

/** Inline editor for the two editable fields: note + tags. */
const CardEditor = ({ insight, onSaved, onCancel }: CardEditorProps) => {
  const [note, setNote] = useState(insight.userNote ?? '');
  const [tagsText, setTagsText] = useState(insight.tags.join(', '));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((t) => t.slice(0, 40));
    setSaving(true);
    try {
      const updated = await updateInsight(insight.id, {
        userNote: note.slice(0, 2000),
        tags,
      });
      onSaved(updated);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save changes'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50 flex flex-col gap-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note…"
        maxLength={2000}
        rows={3}
        className="text-sm"
        aria-label="Insight note"
      />
      <Input
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
        placeholder="Tags, comma-separated (max 10)"
        className="text-sm"
        aria-label="Insight tags"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />}
          Save
        </Button>
      </div>
    </div>
  );
};

const GardenPage = () => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [viewer, setViewer] = useState<{
    documentId: string;
    documentName: string;
    source: ChatSource;
  } | null>(null);

  /**
   * Opens the PDF viewer for a source. Each source may carry its own
   * documentId (collection chats); fall back to the insight's document.
   */
  const openSource = useCallback((insight: Insight, src: ChatSource) => {
    const docId = src.documentId ?? insight.documentId;
    if (!docId) {
      toast.info('Document no longer available - citation preserved');
      return;
    }
    setViewer({
      documentId: docId,
      documentName: src.documentName ?? insight.documentName ?? 'Document',
      source: src,
    });
  }, []);

  // Debounce the search input into the server-side query (back to page 1).
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Server-side fetch: query + tag + pagination.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listInsights({
      query: query || undefined,
      tag: activeTag ?? undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled) return;
        setInsights((prev) => (page === 1 ? data.insights : [...prev, ...data.insights]));
        setTotal(data.total);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(getApiErrorMessage(err, 'Failed to load insights'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, activeTag, page]);

  // Tag filter chips derived from the loaded cards (plus the active tag).
  const allTags = useMemo(() => {
    const tags = new Set<string>(insights.flatMap((i) => i.tags));
    if (activeTag) tags.add(activeTag);
    return [...tags].sort();
  }, [insights, activeTag]);

  const handleSaved = useCallback((updated: Insight) => {
    setInsights((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setEditingId(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      await deleteInsight(id);
      setInsights((prev) => prev.filter((i) => i.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      toast.success('Insight deleted');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete insight'));
    }
  }, [deleteId]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportInsights({ query: query || undefined, tag: activeTag ?? undefined });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to export garden'));
    } finally {
      setExporting(false);
    }
  }, [query, activeTag]);

  return (
    <>
      <Header title="Knowledge Garden" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          {/* Toolbar: search + export */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-4">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search your pinned insights…"
                className="pl-9"
                aria-label="Search insights"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting || insights.length === 0}
              className="shrink-0 gap-2"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-4 h-4" aria-hidden="true" />
              )}
              Export
            </Button>
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-6" aria-label="Filter by tag">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setActiveTag(activeTag === tag ? null : tag);
                    setPage(1);
                  }}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs border transition-colors inline-flex items-center gap-1',
                    activeTag === tag
                      ? 'bg-primary/20 border-primary/40 text-primary'
                      : 'bg-secondary/50 border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                  aria-pressed={activeTag === tag}
                >
                  {tag}
                  {activeTag === tag && <X className="w-3 h-3" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}

          {/* Empty / loading states */}
          {loading && insights.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" aria-label="Loading insights" />
            </div>
          ) : insights.length === 0 ? (
            <div className="text-center py-20">
              <Sprout className="w-16 h-16 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
              <h2 className="text-xl font-semibold mb-2">
                {query || activeTag ? 'No insights match' : 'Your garden is empty'}
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                {query || activeTag
                  ? 'Try a different search or clear the tag filter.'
                  : 'Pin answers from any chat to grow your knowledge garden.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {insights.map((insight) => {
                // Marker order + [n] chips, matching MessageBubble exactly.
                const { sorted, byMarker } = citationIndex(insight.sources);
                return (
                <article
                  key={insight.id}
                  className="rounded-2xl border border-border/60 bg-card/50 p-4 flex flex-col min-w-0"
                  aria-label={`Insight: ${insight.question}`}
                >
                  <h3 className="font-medium text-sm mb-2 break-words">{insight.question}</h3>

                  <div className="prose prose-invert prose-sm max-w-none flex-1 break-words">
                    <ReactMarkdown
                      components={{
                        ...chatMarkdownComponents,
                        a: makeCiteAnchor({
                          sourceByMarker: byMarker,
                          onChipClick: (marker) => {
                            const src = byMarker.get(marker);
                            if (src) openSource(insight, src);
                          },
                        }),
                      }}
                    >
                      {linkifyCitations(insight.content, byMarker, true)}
                    </ReactMarkdown>
                  </div>

                  {/* Document provenance */}
                  <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {insight.documentId ? (
                      <Link
                        to={`/chat/${insight.documentId}`}
                        className="truncate hover:text-foreground transition-colors"
                      >
                        {insight.documentName ?? 'Document'}
                      </Link>
                    ) : (
                      <span className="truncate italic">
                        {insight.documentName
                          ? `${insight.documentName} (document deleted)`
                          : 'Document deleted'}
                      </span>
                    )}
                  </div>

                  {/* Sources snapshot — outlives the conversation */}
                  {insight.sources.length > 0 && (
                    <div
                      className="mt-3 pt-3 border-t border-border/50"
                      role="complementary"
                      aria-label="Source passages"
                    >
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Sources
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {sorted.map((src, i) => {
                          const marker = src.marker ?? i + 1;
                          const cleaned = (src.snippet ?? '').replace(/\s+/g, ' ').trim();
                          return (
                            <button
                              key={`${src.documentId ?? 'doc'}-${marker}`}
                              type="button"
                              onClick={() => openSource(insight, src)}
                              className="flex items-start gap-2 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors px-2.5 py-2 text-xs text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Open source ${marker} in the PDF viewer`}
                            >
                              <span className="shrink-0 mt-0.5 font-mono text-[10px] font-semibold text-primary bg-primary/15 rounded px-1.5 py-0.5 leading-none">
                                {marker}
                              </span>
                              <span className="flex-1 min-w-0">
                                {src.documentName && (
                                  <span className="block truncate text-[10px] font-medium text-foreground/80">
                                    {src.documentName}
                                  </span>
                                )}
                                <span className="block text-[10px] font-medium text-foreground/70 mb-0.5">
                                  {pageLabel(src)}
                                </span>
                                <span className="block text-muted-foreground leading-relaxed line-clamp-2">
                                  {cleaned || `Passage ${src.chunkIndex + 1}`}
                                </span>
                              </span>
                              <span
                                className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60 self-start mt-0.5"
                                title={`Relevance: ${Math.round(src.score * 100)}%`}
                              >
                                {Math.round(src.score * 100)}%
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Note + tags (view mode) */}
                  {editingId !== insight.id && (
                    <>
                      {insight.userNote && (
                        <p className="mt-3 text-xs text-muted-foreground border-l-2 border-primary/40 pl-2 break-words">
                          {insight.userNote}
                        </p>
                      )}
                      {insight.tags.length > 0 && (
                        <div className="mt-2 flex gap-1.5 flex-wrap">
                          {insight.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-full bg-secondary/60 text-[11px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Inline editor */}
                  {editingId === insight.id ? (
                    <CardEditor
                      insight={insight}
                      onSaved={handleSaved}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div className="mt-3 pt-2 flex items-center justify-between border-t border-border/30">
                      <time
                        className="text-[11px] text-muted-foreground/70"
                        dateTime={insight.createdAt}
                      >
                        {new Date(insight.createdAt).toLocaleDateString()}
                      </time>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingId(insight.id)}
                          aria-label="Edit note and tags"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(insight.id)}
                          aria-label="Delete insight"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
                );
              })}
            </div>
          )}

          {/* Load more */}
          {insights.length < total && (
            <div className="flex justify-center mt-6">
              <Button variant="outline" onClick={() => setPage((p) => p + 1)} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}
                Load more ({insights.length} of {total})
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Citation PDF viewer — per-source document (collection pins carry their own) */}
      {viewer && (
        <PdfViewerSheet
          documentId={viewer.documentId}
          documentName={viewer.documentName}
          source={viewer.source}
          onClose={() => setViewer(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete insight?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the pinned insight from your garden. This action cannot be undone.
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
    </>
  );
};

export default GardenPage;
