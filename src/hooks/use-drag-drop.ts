import { useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/useAppStore';
import { getApiBaseUrl, getApiErrorMessage } from '@/lib/api';
import {
    checkSessionExpired,
    ERROR_MESSAGES,
    UPLOAD_STATUS,
} from '@/lib/errorMessages';
import {
    toStoreDocument,
    useInvalidateDocuments,
    type ApiDocument,
} from '@/hooks/useDocumentsQuery';

const VALID_FILE_TYPES = ['application/pdf'];

export const useDragDrop = () => {
    const { pathname } = useLocation();
    const { addDocument, setUploading, accessToken } = useAppStore();
    const invalidateDocuments = useInvalidateDocuments();
    const dragCounter = useRef(0);
    const overlayRef = useRef<HTMLDivElement>(null);

    const handleDragEnter = (e: DragEvent) => {
        if (pathname.startsWith('/app/admin')) return;
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
        if (pathname.startsWith('/app/admin')) return;
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
        const statusToast = toast.loading(UPLOAD_STATUS.keepTabOpen);
        let anyUploaded = false;

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
                    // 201: row created + processing job queued server-side.
                    const data = (await res.json()) as ApiDocument;
                    addDocument(toStoreDocument(data));
                    anyUploaded = true;
                } else {
                    checkSessionExpired(res);
                    const body = (await res.json().catch(() => ({}))) as { message?: string };
                    toast.error(
                        typeof body.message === 'string'
                            ? body.message
                            : ERROR_MESSAGES.uploadFailed,
                    );
                }
            } catch (error) {
                toast.error(getApiErrorMessage(error, ERROR_MESSAGES.uploadFailed));
            }
        }
        if (anyUploaded) {
            toast.success(UPLOAD_STATUS.safeToLeave, { id: statusToast });
        } else {
            toast.dismiss(statusToast);
        }
        setUploading(false);
        // The documents query is the one poller; it picks up processing status.
        invalidateDocuments();
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
        };
    });

    return { overlayRef };
};
