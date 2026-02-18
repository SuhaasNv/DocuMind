import { motion } from 'framer-motion';
import { FileText, Search, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    icon?: React.ElementType;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}

export const EmptyState = ({
    icon: Icon = FileText,
    title,
    description,
    action,
    className,
}: EmptyStateProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn('text-center py-16 px-4', className)}
        >
            <div className="relative w-32 h-32 mx-auto mb-6">
                <div className="absolute inset-0 bg-primary/5 rounded-full blur-2xl transform scale-150" />
                <div className="relative w-full h-full rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center shadow-sm">
                    <Icon className="w-12 h-12 text-primary/60" strokeWidth={1.5} />

                    {/* Decorative elements */}
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-lg bg-background border border-border shadow-sm flex items-center justify-center animate-bounce delay-100">
                        <div className="w-2 h-2 rounded-full bg-primary/40" />
                    </div>
                    <div className="absolute -bottom-1 -left-2 w-8 h-8 rounded-xl bg-background border border-border shadow-sm flex items-center justify-center animate-bounce delay-300">
                        <div className="w-3 h-3 rounded-full bg-primary/20" />
                    </div>
                </div>
            </div>

            <h3 className="text-xl font-semibold mb-2 text-foreground">{title}</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-8 leading-relaxed">
                {description}
            </p>

            {action && (
                <Button onClick={action.onClick} size="lg" className="group">
                    {action.label}
                </Button>
            )}
        </motion.div>
    );
};

export const EmptyDocuments = () => (
    <EmptyState
        icon={FileText}
        title="No documents yet"
        description="Upload your first PDF to get started. We'll utilize RAG to help you chat with it in seconds."
    />
);

export const EmptySearch = () => (
    <EmptyState
        icon={Search}
        title="No documents found"
        description="We couldn't find any documents matching your search. Try a different keyword."
    />
);

export const EmptyChatState = ({ onPromptClick }: { onPromptClick?: (q: string) => void }) => {
    const SUGGESTIONS = [
        'What is the main topic?',
        'Summarize the key points',
        'What are the risks?',
        'Explain the methodology',
    ];

    return (
        <div className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
            <div className="text-center max-w-md w-full">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="relative w-24 h-24 mx-auto mb-8"
                >
                    <div className="absolute inset-0 bg-primary/20 rounded-3xl rotate-6 transform transition-transform" />
                    <div className="absolute inset-0 bg-background border border-border rounded-3xl -rotate-3 flex items-center justify-center shadow-lg">
                        <MessageSquare className="w-10 h-10 text-primary" strokeWidth={1.5} />
                    </div>
                </motion.div>

                <h2 className="text-2xl font-bold mb-3 tracking-tight">Ask anything</h2>
                <p className="text-muted-foreground mb-8 text-base">
                    This document is ready. I can answer specific questions, summarize sections, or explain complex terms.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SUGGESTIONS.map((question, i) => (
                        <motion.button
                            key={question}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 * i }}
                            onClick={() => onPromptClick?.(question)}
                            className="px-4 py-3 rounded-xl bg-secondary/50 hover:bg-secondary border border-transparent hover:border-border text-sm text-left transition-all duration-200 text-foreground/80 hover:text-foreground"
                        >
                            "{question}"
                        </motion.button>
                    ))}
                </div>
            </div>
        </div>
    );
};
