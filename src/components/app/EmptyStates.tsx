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

const HOW_IT_WORKS_STEPS = [
    { step: '1', label: 'Extract', hint: 'We read your PDF' },
    { step: '2', label: 'Understand', hint: 'Pages become searchable' },
    { step: '3', label: 'Chat', hint: 'Ask anything about it' },
] as const;

export const EmptyDocuments = () => (
    <div>
        <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Upload your first PDF to get started. We'll utilize RAG to help you chat with it in seconds."
        />
        {/* Plain 3-step hint: extract → understand → chat */}
        <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-3 pb-8 -mt-8">
            {HOW_IT_WORKS_STEPS.map(({ step, label, hint }, i) => (
                <div key={step} className="flex items-center gap-3">
                    <div className="text-center">
                        <div className="w-7 h-7 mx-auto mb-1 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                            {step}
                        </div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{hint}</p>
                    </div>
                    {i < HOW_IT_WORKS_STEPS.length - 1 && (
                        <span className="text-muted-foreground/50 hidden sm:inline" aria-hidden="true">
                            →
                        </span>
                    )}
                </div>
            ))}
        </div>
    </div>
);

export const EmptySearch = () => (
    <EmptyState
        icon={Search}
        title="No documents found"
        description="We couldn't find any documents matching your search. Try a different keyword."
    />
);

const FALLBACK_SUGGESTIONS = [
    'What is the main topic?',
    'Summarize the key points',
    'What are the risks?',
    'Explain the methodology',
];

export const EmptyChatState = ({
    onPromptClick,
    isLoading = false,
    summary,
    suggestedQuestions,
}: {
    onPromptClick?: (q: string) => void;
    isLoading?: boolean;
    /** Document summary shown as a card; falls back to generic copy when null. */
    summary?: string | null;
    /** Document-specific question chips; falls back to generic chips when null. */
    suggestedQuestions?: string[] | null;
}) => {
    const suggestions = suggestedQuestions?.length
        ? suggestedQuestions.slice(0, 4)
        : FALLBACK_SUGGESTIONS;

    return (
        <div className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
            <div className="text-center max-w-md w-full">
                {/* Reduced icon — heading is the focal point */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="relative w-14 h-14 mx-auto mb-6"
                    aria-hidden="true"
                >
                    <div className="absolute inset-0 bg-primary/20 rounded-2xl rotate-6 transform transition-transform" />
                    <div className="absolute inset-0 bg-background border border-border rounded-2xl -rotate-3 flex items-center justify-center shadow-md">
                        <MessageSquare className="w-6 h-6 text-primary" strokeWidth={1.5} />
                    </div>
                </motion.div>

                <h2 className="text-2xl font-bold mb-3 tracking-tight">Ask anything</h2>
                {summary ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="mb-8 p-4 rounded-xl bg-secondary/30 border border-border/50 text-left"
                    >
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                            Summary
                        </p>
                        <p className="text-sm text-foreground/80 leading-relaxed break-words">
                            {summary}
                        </p>
                    </motion.div>
                ) : (
                    <p className="text-muted-foreground mb-8 text-base">
                        This document is ready. I can answer specific questions, summarize sections, or explain complex terms.
                    </p>
                )}

                {/* Suggestion chips — dimmed while a response is in flight */}
                <div
                    className={cn(
                        'grid grid-cols-1 sm:grid-cols-2 gap-3 transition-opacity duration-200',
                        isLoading && 'opacity-40 pointer-events-none',
                    )}
                    aria-hidden={isLoading}
                >
                    {suggestions.map((question, i) => (
                        <motion.button
                            key={question}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 * i }}
                            onClick={() => !isLoading && onPromptClick?.(question)}
                            disabled={isLoading}
                            className="px-4 py-3 rounded-xl bg-secondary/50 hover:bg-secondary border border-transparent hover:border-border text-sm text-left transition-all duration-200 text-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
                        >
                            {question}
                        </motion.button>
                    ))}
                </div>
            </div>
        </div>
    );
};
