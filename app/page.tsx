'use client';
import { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  recommendedQuestions?: string[];
}

// 질문-답변 매핑
const QUESTION_ANSWER_MAP: Record<string, string> = {
  'Perso.ai는 어떤 서비스인가요?': 'Perso.ai는 이스트소프트가 개발한 다국어 AI 영상 더빙 플랫폼으로, 누구나 언어의 장벽 없이 영상을 제작하고 공유할 수 있도록 돕는 AI SaaS 서비스입니다.',
  'Perso.ai의 주요 기능은 무엇인가요?': 'Perso.ai는 AI 음성 합성, 립싱크, 영상 더빙 기능을 제공합니다. 사용자는 원본 영상에 다른 언어로 음성을 입히거나, 입 모양까지 자동으로 동기화할 수 있습니다.',
  'Perso.ai는 어떤 기술을 사용하나요?': 'Perso.ai는 ElevenLabs, Microsoft, Google Cloud Speech API 등 글로벌 기술 파트너의 음성합성 및 번역 기술을 활용하며, 자체 개발한 립싱크 엔진을 결합합니다.',
  'Perso.ai의 사용자는 어느 정도인가요?': '2025년 기준, 전 세계 누적 20만 명 이상의 사용자가 Perso.ai를 통해 AI 기반 영상 제작을 경험했습니다.',
  'Perso.ai를 사용하는 주요 고객층은 누구인가요?': '유튜버, 강의 제작자, 기업 마케팅 담당자 등 영상 콘텐츠를 다국어로 확장하려는 개인 및 기업 고객이 주요 타깃입니다.',
  'Perso.ai에서 지원하는 언어는 몇 개인가요?': '현재 30개 이상의 언어를 지원하며, 한국어, 영어, 일본어, 스페인어, 포르투갈어 등 주요 언어가 포함됩니다.',
  'Perso.ai의 요금제는 어떻게 구성되어 있나요?': 'Perso.ai는 사용량 기반 구독 모델을 운영합니다. Free, Creator, Pro, Enterprise 플랜이 있으며 Stripe를 통해 결제할 수 있습니다.',
  'Perso.ai는 어떤 기업이 개발했나요?': 'Perso.ai는 소프트웨어 기업 이스트소프트(ESTsoft)가 개발했습니다.',
  '이스트소프트는 어떤 회사인가요?': '이스트소프트는 1993년에 설립된 IT 기업으로, 알집, 알약, 알씨 등 생활형 소프트웨어로 잘 알려져 있으며, 최근에는 인공지능 기반 서비스 개발에 집중하고 있습니다.',
  'Perso.ai의 기술적 강점은 무엇인가요?': 'AI 음성 합성과 립싱크 정확도가 높고, 다국어 영상 제작이 간편하며, 실제 사용자 인터페이스가 직관적이라는 점이 강점입니다.',
  'Perso.ai를 사용하려면 회원가입이 필요한가요?': '네, 이메일 또는 구글 계정으로 간단히 회원가입 후 서비스를 이용할 수 있습니다.',
  'Perso.ai를 이용하려면 영상 편집 지식이 필요한가요?': '아니요. Perso.ai는 누구나 쉽게 사용할 수 있도록 설계되어 있어, 영상 편집 경험이 없어도 바로 더빙을 시작할 수 있습니다.',
  'Perso.ai 고객센터는 어떻게 문의하나요?': 'Perso.ai 웹사이트 하단의 \'문의하기\' 버튼을 통해 이메일 또는 채팅으로 고객센터에 문의할 수 있습니다.',
};

// 추천 질문 목록
const RECOMMENDED_QUESTIONS = [
  'Perso.ai는 어떤 서비스인가요?',
  'Perso.ai의 주요 기능은 무엇인가요?',
  'Perso.ai는 어떤 기술을 사용하나요?',
  'Perso.ai의 사용자는 어느 정도인가요?',
  'Perso.ai를 사용하는 주요 고객층은 누구인가요?',
  'Perso.ai에서 지원하는 언어는 몇 개인가요?',
  'Perso.ai의 요금제는 어떻게 구성되어 있나요?',
  'Perso.ai는 어떤 기업이 개발했나요?',
  '이스트소프트는 어떤 회사인가요?',
  'Perso.ai의 기술적 강점은 무엇인가요?',
  'Perso.ai를 사용하려면 회원가입이 필요한가요?',
  'Perso.ai를 이용하려면 영상 편집 지식이 필요한가요?',
  'Perso.ai 고객센터는 어떻게 문의하나요?',
];

// 랜덤으로 1-2개의 추천 질문 선택
function getRandomRecommendedQuestions(): string[] {
  const shuffled = [...RECOMMENDED_QUESTIONS].sort(() => Math.random() - 0.5);
  const count = Math.random() < 0.5 ? 1 : 2; // 50% 확률로 1개 또는 2개
  return shuffled.slice(0, count);
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
      console.log('[useEffect] pendingQuestion 설정됨, API 호출 예정:', pendingQuestion);
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
    console.log('[fetchAnswer] API 요청 시작:', questionText);
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

    // 매핑된 질문인지 확인 (공백 정규화)
    const normalizedQuestion = questionText.trim();
    const mappedAnswer = QUESTION_ANSWER_MAP[normalizedQuestion];
    
    if (mappedAnswer) {
      // 매핑된 질문이면 질문 메시지가 먼저 보이고 스크롤 이동 후 답변 표시
      console.log('[매핑된 질문] API 호출 없이 즉시 답변:', normalizedQuestion);
      // 질문 메시지가 렌더링되고 스크롤이 이동할 시간을 주기 위해 약간의 딜레이
      setTimeout(() => {
        scrollToBottom();
        setIsLoading(true); // 로딩 애니메이션 표시
        setTimeout(() => {
          const assistantMessage: Message = {
            role: 'assistant',
            content: mappedAnswer,
            timestamp: new Date(),
            recommendedQuestions: getRandomRecommendedQuestions(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setIsLoading(false); // 로딩 애니메이션 종료
        }, 100);
      }, 50);
      return;
    }
    
    // 매핑되지 않은 질문이면 기존처럼 API 호출
    console.log('[API 호출] 매핑되지 않은 질문:', normalizedQuestion);
    setPendingQuestion(normalizedQuestion);
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
          <div className="flex-1 overflow-y-scroll transition-opacity duration-300 ease-in-out scrollbar-gutter-stable">
            <div className="mx-auto flex max-w-4xl flex-col px-6 py-8">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`mb-4 flex transition-all duration-300 ease-out ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                  style={{
                    animation: `fadeInUp 0.3s ease-out ${index * 0.06}s both`,
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
            <div className={`flex gap-3 rounded-full border bg-white px-3 py-2 shadow-soft-lg transition-all duration-300 ${
              input.length >= 500 
                ? 'border-red-300 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20' 
                : 'border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20 focus-within:shadow-blue-purple-soft-xl'
            }`}>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="질문을 입력하세요..."
                  disabled={isLoading}
                  maxLength={500}
                  className="flex-1 pl-3 text-base text-slate-900 placeholder-slate-400 outline-none disabled:bg-transparent disabled:text-slate-400"
                />
                {input.length >= 500 && (
                  <span className="flex items-center text-xs font-medium px-2 text-red-500">
                    {input.length}/500
                  </span>
                )}
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
              <div className={`flex gap-3 rounded-full border bg-white px-3 py-3 shadow-soft-lg transition-all duration-300 ${
                input.length >= 500 
                  ? 'border-red-300 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20' 
                  : input.length >= 450 
                  ? 'border-orange-300 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20'
                  : 'border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20 focus-within:shadow-blue-purple-soft-xl'
              }`}>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="질문을 입력하세요..."
                  disabled={isLoading}
                  maxLength={500}
                  className="flex-1 pl-3 text-base text-slate-900 placeholder-slate-400 outline-none disabled:bg-transparent disabled:text-slate-400"
                />
                {input.length >= 450 && (
                  <span className={`flex items-center text-xs font-medium px-2 ${
                    input.length >= 500 ? 'text-red-500' : 'text-orange-500'
                  }`}>
                    {input.length}/500
                  </span>
                )}
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