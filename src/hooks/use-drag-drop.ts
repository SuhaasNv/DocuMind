import { useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '@/stores/useAppStore';
import { getApiBaseUrl } from '@/lib/api';

const VALID_FILE_TYPES = ['application/pdf'];
const POLL_INTERVAL_MS = 2000;

interface ApiDocument {
    id: string;
    name: string;
    uploadedAt: string;
    status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
    progress: number;
    size?: number;
}

export const useDragDrop = () => {
    const { pathname } = useLocation();
    const { addDocument, setUploading, accessToken, updateDocument } = useAppStore();
    const dragCounter = useRef(0);
    const overlayRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

    const pollDocumentStatus = useCallback((docId: string) => {
        if (pollRef.current[docId]) return;
        const token = useAppStore.getState().accessToken;
        if (!token) return;

        const poll = async () => {
            try {
                const res = await fetch(`${getApiBaseUrl()}/documents/${docId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = (await res.json()) as ApiDocument;
                useAppStore.getState().updateDocument(docId, {
                    status: data.status,
                    progress: data.progress,
                });
                if (data.status === 'DONE' || data.status === 'FAILED') {
                    if (pollRef.current[docId]) {
                        clearInterval(pollRef.current[docId]);
                        delete pollRef.current[docId];
                    }
                }
            } catch {
                // ignore network errors; will retry next interval
            }
        };

        poll();
        pollRef.current[docId] = setInterval(poll, POLL_INTERVAL_MS);
    }, []);

    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            if (overlayRef.current) {
                overlayRef.current.style.display = 'flex';
                // Force reflow
                void overlayRef.current.offsetWidth;
                overlayRef.current.style.opacity = '1';
            }
        }
    };

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            if (overlayRef.current) {
                overlayRef.current.style.opacity = '0';
                setTimeout(() => {
                    if (overlayRef.current && dragCounter.current === 0) {
                        overlayRef.current.style.display = 'none';
                    }
                }, 200); // fade out
            }
        }
    };

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        if (overlayRef.current) {
            overlayRef.current.style.opacity = '0';
            setTimeout(() => {
                if (overlayRef.current) overlayRef.current.style.display = 'none';
            }, 200);
        }

        if (!accessToken) return;

        const files = Array.from(e.dataTransfer?.files || []);
        const pdfFiles = files.filter(f => VALID_FILE_TYPES.includes(f.type));

        if (pdfFiles.length === 0) return;

        setUploading(true);

        const apiBaseUrl = getApiBaseUrl();

        for (const file of pdfFiles) {
            try {
                const formData = new FormData();
                formData.append('file', file);

                const res = await fetch(`${apiBaseUrl}/documents/upload`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${accessToken}` },
                    body: formData,
                });

                if (res.ok) {
                    const data = await res.json();
                    addDocument({
                        id: data.id,
                        name: data.name,
                        uploadedAt: new Date(data.uploadedAt),
                        status: data.status,
                        progress: data.progress,
                        size: data.size,
                    });

                    // Start polling!
                    pollDocumentStatus(data.id);
                }

            } catch (error) {
                console.error("Upload failed", error);
            }
        }
        setUploading(false);
    };

    useEffect(() => {
        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('drop', handleDrop);

        return () => {
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('drop', handleDrop);

            // Clean up intervals
            Object.values(pollRef.current).forEach(clearInterval);
            pollRef.current = {};
        };
    }, [pollDocumentStatus]);

    return { overlayRef };
};
