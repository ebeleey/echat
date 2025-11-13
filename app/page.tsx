'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    // 초기 마운트 시 입력창에 포커스
    if (messages.length === 0) {
      inputRef.current?.focus();
    }
  }, []);

  // 질문 메시지가 추가된 후 로딩 시작 및 API 호출
  useEffect(() => {
    if (pendingQuestion) {
      // 질문 메시지가 렌더링된 후 로딩 시작
      const timer = setTimeout(() => {
        setIsLoading(true);
        fetchAnswer(pendingQuestion);
        setPendingQuestion(null);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [pendingQuestion]);

  const fetchAnswer = async (questionText: string) => {
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: questionText }),
      });

      const data = await response.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('오류:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: '오류가 발생했습니다. 다시 시도해주세요.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (question?: string) => {
    const questionText = question || input.trim();
    if (!questionText || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: questionText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setPendingQuestion(questionText);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen flex-col bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100">
      {/* 헤더 - 메시지가 있을 때만 표시 (애니메이션) */}
      <div
        className={`border-b border-slate-200 bg-white/80 backdrop-blur-sm transition-all duration-500 ease-in-out ${
          hasMessages
            ? 'opacity-100 max-h-20 translate-y-0'
            : 'opacity-0 max-h-0 -translate-y-full overflow-hidden'
        }`}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">e-chat</h1>
            </div>
          </div>
        </div>
      </div>

      {hasMessages ? (
        <>
          {/* 메시지 영역 - 애니메이션 */}
          <div className="flex-1 overflow-y-auto transition-opacity duration-500 ease-in-out">
            <div className="mx-auto flex max-w-4xl flex-col px-6 py-8">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`mb-4 flex transition-all duration-500 ease-out ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                  style={{
                    animation: `fadeInUp 0.5s ease-out ${index * 0.1}s both`,
                  }}
                >
                  <div
                    className={`max-w-xl rounded-xl px-4 py-3 shadow-sm transition-all ${
                      message.role === 'user'
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white'
                        : 'bg-white text-slate-900 border border-slate-200'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="mb-4 flex justify-start items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-slate-800 animate-pulse"></div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 입력 영역 - 하단 고정 (애니메이션) */}
          <div className="border-t border-slate-200 bg-white/80 backdrop-blur-sm transition-all duration-500 ease-in-out">
            <div className="mx-auto max-w-4xl px-6 py-4">
              <div className="flex gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="질문을 입력하세요..."
                  disabled={isLoading}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={isLoading || !input.trim()}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3 font-medium text-white transition-all hover:shadow-lg hover:from-blue-700 hover:to-blue-800 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                  <span className="text-sm">전송</span>
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* 초기 화면 - 중앙에 환영 메시지와 입력창 (애니메이션) */
        <div className="flex flex-1 flex-col items-center justify-center transition-opacity duration-500 ease-in-out">
          <div className="flex w-full max-w-3xl flex-col items-center px-6">
            <h2
              className="mb-4 text-4xl font-semibold text-slate-900 transition-all duration-700 ease-out"
              style={{ animation: 'fadeInUp 0.7s ease-out 0s both' }}
            >
              안녕하세요
            </h2>
            <p
              className="mb-12 text-xl text-slate-600 transition-all duration-700 ease-out"
              style={{ animation: 'fadeInUp 0.7s ease-out 0.15s both' }}
            >
              무엇이 궁금하신가요?
            </p>

            {/* 예시 질문 버튼 */}
            <div
              className="mb-8 transition-all duration-700 ease-out"
              style={{ animation: 'fadeInUp 0.7s ease-out 0.3s both' }}
            >
              <button
                onClick={() => handleSubmit('Perso.ai는 어떤 서비스인가요?')}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
              >
                Perso.ai는 어떤 서비스인가요?
              </button>
            </div>

            {/* 중앙 입력창 - 애니메이션 */}
            <div
              className="w-full max-w-3xl transition-all duration-700 ease-out"
              style={{ animation: 'fadeInUp 0.7s ease-out 0.3s both' }}
            >
              <div className="flex gap-3 rounded-2xl border border-slate-300 bg-white px-6 py-4 shadow-lg transition-all duration-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:shadow-xl">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="질문을 입력하세요..."
                  disabled={isLoading}
                  className="flex-1 text-base text-slate-900 placeholder-slate-400 outline-none disabled:bg-transparent disabled:text-slate-400"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={isLoading || !input.trim()}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-2 font-medium text-white transition-all hover:shadow-lg hover:from-blue-700 hover:to-blue-800 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}