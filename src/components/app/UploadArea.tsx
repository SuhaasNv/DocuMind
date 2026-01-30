import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/useAppStore';

const UploadArea = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { addDocument, setUploading, isUploading } = useAppStore();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  }, []);

  const handleFiles = async (files: File[]) => {
    const pdfFiles = files.filter((file) => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      setUploadError('Please upload PDF files only');
      return;
    }

    setUploadError(null);
    setUploading(true);

    for (const file of pdfFiles) {
      const docId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add document with PENDING status
      addDocument({
        id: docId,
        name: file.name,
        uploadedAt: new Date(),
        status: 'PENDING',
        progress: 0,
        size: file.size,
      });

      // Simulate upload and processing
      simulateProcessing(docId);
    }

    setUploading(false);
  };

  const simulateProcessing = (docId: string) => {
    const { updateDocument } = useAppStore.getState();
    let progress = 0;

    // Start processing
    updateDocument(docId, { status: 'PROCESSING', progress: 0 });

    const interval = setInterval(() => {
      progress += Math.random() * 15;
      
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        updateDocument(docId, { status: 'DONE', progress: 100 });
      } else {
        updateDocument(docId, { progress: Math.min(progress, 99) });
      }
    }, 500);
  };

  return (
    <div className="mb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300',
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border/50 hover:border-primary/50 hover:bg-card/50',
            isUploading && 'pointer-events-none opacity-60'
          )}
        >
          {/* Upload icon */}
          <motion.div
            animate={{
              y: isDragOver ? -10 : 0,
              scale: isDragOver ? 1.1 : 1,
            }}
            transition={{ duration: 0.2 }}
            className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6"
          >
            <Upload className="w-8 h-8 text-primary" />
          </motion.div>

          <h3 className="text-xl font-semibold mb-2">
            {isDragOver ? 'Drop your PDF here' : 'Upload a document'}
          </h3>
          <p className="text-muted-foreground mb-6">
            Drag and drop your PDF file, or click to browse
          </p>

          <input
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />

          <Button variant="secondary" className="pointer-events-none">
            <FileText className="w-4 h-4 mr-2" />
            Choose PDF
          </Button>

          <p className="mt-4 text-xs text-muted-foreground">
            Supports PDF files up to 50MB
          </p>
        </div>
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-destructive" />
            <p className="text-sm text-destructive flex-1">{uploadError}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setUploadError(null)}
              className="text-destructive hover:bg-destructive/20"
            >
              <X className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UploadArea;
