import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/app/Header';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import EmptyChat from '@/components/chat/EmptyChat';
import TypingIndicator from '@/components/chat/TypingIndicator';
import { useAppStore, Message } from '@/stores/useAppStore';

// Sample responses for demo
const sampleResponses = [
  "Based on the document, the main topics covered include project management methodologies, stakeholder communication, and risk assessment strategies. The document emphasizes the importance of clear documentation and regular status updates.",
  "The key findings suggest that implementing agile practices led to a 40% improvement in delivery times. The document also highlights the importance of cross-functional team collaboration.",
  "According to the document, there are three main recommendations:\n\n1. **Improve communication channels** between teams\n2. **Implement automated testing** to reduce bugs\n3. **Establish regular retrospectives** for continuous improvement",
  "The document outlines a comprehensive approach to data analysis, including:\n\n```python\ndef analyze_data(dataset):\n    # Process and clean data\n    cleaned = preprocess(dataset)\n    return generate_insights(cleaned)\n```\n\nThis methodology has proven effective in various scenarios.",
];

const ChatPage = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { documents, conversations, addMessage, updateMessage, setStreaming } = useAppStore();
  const document = documents.find((doc) => doc.id === documentId);
  const conversation = documentId ? conversations[documentId] : null;
  const messages = conversation?.messages || [];

  const [isTyping, setIsTyping] = useState(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const simulateStreaming = async (messageId: string, fullText: string) => {
    if (!documentId) return;
    
    let currentText = '';
    setStreaming(documentId, messageId, true);

    for (let i = 0; i < fullText.length; i++) {
      currentText += fullText[i];
      updateMessage(documentId, messageId, currentText);
      
      // Variable delay for natural feel
      const delay = fullText[i] === ' ' ? 20 : fullText[i] === '\n' ? 50 : 10;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    setStreaming(documentId, messageId, false);
  };

  const handleSendMessage = async (content: string) => {
    if (!documentId) return;

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    addMessage(documentId, userMessage);

    // Show typing indicator
    setIsTyping(true);
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
    setIsTyping(false);

    // Add AI response
    const responseText = sampleResponses[Math.floor(Math.random() * sampleResponses.length)];
    const aiMessage: Message = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    addMessage(documentId, aiMessage);

    // Simulate streaming
    await simulateStreaming(aiMessage.id, responseText);
  };

  if (!document) {
    return (
      <>
        <Header title="Chat" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Document not found</h2>
            <p className="text-muted-foreground mb-4">The document you're looking for doesn't exist.</p>
            <Button onClick={() => navigate('/app')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Documents
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="h-16 border-b border-border bg-background/80 backdrop-blur-lg flex items-center px-6 sticky top-0 z-40">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/app')}
          className="mr-4"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-medium truncate max-w-[300px]">{document.name}</h1>
            <p className="text-xs text-muted-foreground">Chat with your document</p>
          </div>
        </div>
      </header>

      {/* Chat container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyChat />
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
              <AnimatePresence mode="popLayout">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </AnimatePresence>
              
              {/* Typing indicator */}
              <AnimatePresence>
                {isTyping && <TypingIndicator />}
              </AnimatePresence>

              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isTyping}
          disabled={document.status !== 'DONE'}
        />
      </div>
    </>
  );
};

export default ChatPage;
