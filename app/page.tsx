'use client';
import { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  recommendedQuestions?: string[];
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
        recommendedQuestions: data.recommendedQuestions,
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
    <div className="flex h-screen flex-col bg-gradient-to-br from-white via-slate-50 to-white">
      {/* 헤더 */}
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex items-center justify-between px-12 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/icon.png"
              alt="e-chat icon"
              className="h-6 w-6"
            />
            <div>
              <h1 className="cursor-default select-none text-xl font-semibold text-slate-900">e-chat</h1>
            </div>
          </div>
        </div>
      </div>

      {hasMessages ? (
        <>
          {/* 메시지 영역 - 애니메이션 */}
          <div className="flex-1 overflow-y-scroll transition-opacity duration-500 ease-in-out scrollbar-gutter-stable">
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
                    className={`max-w-xl rounded-xl px-4 py-3 transition-all ${
                      message.role === 'user'
                        ? 'bg-gradient-to-br from-blue-600 to-purple-700 text-white shadow-blue-purple-soft-lg'
                        : 'bg-white text-slate-900 border border-slate-200 shadow-soft'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </p>
                    {message.role === 'assistant' && message.recommendedQuestions && message.recommendedQuestions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <p className="mb-2 text-xs font-medium text-slate-500">이런 질문은 어떠세요?</p>
                        <div className="flex flex-col gap-2">
                          {message.recommendedQuestions.map((question, qIndex) => (
                            <button
                              key={qIndex}
                              onClick={() => handleSubmit(question)}
                              className="cursor-pointer text-left rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 shadow-soft transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-soft-md"
                            >
                              {question}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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
            <div className="flex gap-3 rounded-full border border-slate-300 bg-white px-3 py-2 shadow-soft-lg transition-all duration-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20 focus-within:shadow-blue-purple-soft-xl">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="질문을 입력하세요..."
                  disabled={isLoading}
                  className="flex-1 pl-3 text-base text-slate-900 placeholder-slate-400 outline-none disabled:bg-transparent disabled:text-slate-400"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={isLoading || !input.trim()}
                  className="flex items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-700 p-3 font-medium text-white shadow-blue-purple-soft transition-all hover:shadow-blue-purple-soft-xl hover:from-blue-700 hover:to-purple-800 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="h-5 w-5" />
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
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-soft transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-soft-md"
              >
                Perso.ai는 어떤 서비스인가요?
              </button>
            </div>

            {/* 중앙 입력창 - 애니메이션 */}
            <div
              className="w-full max-w-3xl transition-all duration-700 ease-out"
              style={{ animation: 'fadeInUp 0.7s ease-out 0.3s both' }}
            >
              <div className="flex gap-3 rounded-full border border-slate-300 bg-white px-3 py-3 shadow-soft-lg transition-all duration-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20 focus-within:shadow-blue-purple-soft-xl">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="질문을 입력하세요..."
                  disabled={isLoading}
                  className="flex-1 pl-3 text-base text-slate-900 placeholder-slate-400 outline-none disabled:bg-transparent disabled:text-slate-400"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={isLoading || !input.trim()}
                  className="flex items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-700 p-3 font-medium text-white shadow-blue-purple-soft transition-all hover:shadow-blue-purple-soft-xl hover:from-blue-700 hover:to-purple-800 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 푸터 */}
      <footer className="py-1">
        <div className="mx-auto max-w-4xl px-6">
          <p className="text-center text-[10px] text-slate-400 opacity-50">
            <a
              href="https://www.flaticon.com/kr/free-icons/"
              title=" 아이콘"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-500 transition-colors"
            >
               아이콘 제작자: heisenberg_jr - Flaticon
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}