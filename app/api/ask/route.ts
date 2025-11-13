import { NextRequest, NextResponse } from 'next/server';
import { hybridSearch, type SearchResultWithScores } from '@/lib/hybrid-search';
import type { AskRequest, AskResponse } from '@/lib/types';

// 추천 질문 목록 (엑셀 파일의 질문들)
const RECOMMENDED_QUESTIONS = [
  "Perso.ai는 어떤 서비스인가요?",
  "Perso.ai의 주요 기능은 무엇인가요?",
  "Perso.ai는 어떤 기술을 사용하나요?",
  "Perso.ai의 사용자는 어느 정도인가요?",
  "Perso.ai를 사용하는 주요 고객층은 누구인가요?",
  "Perso.ai에서 지원하는 언어는 몇 개인가요?",
  "Perso.ai의 요금제는 어떻게 구성되어 있나요?",
  "Perso.ai는 어떤 기업이 개발했나요?",
  "이스트소프트는 어떤 회사인가요?",
  "Perso.ai의 기술적 강점은 무엇인가요?",
  "Perso.ai를 사용하려면 회원가입이 필요한가요?",
  "Perso.ai를 이용하려면 영상 편집 지식이 필요한가요?",
  "Perso.ai 고객센터는 어떻게 문의하나요?"
];


// 랜덤으로 1-2개의 추천 질문 선택
function getRandomRecommendedQuestions(): string[] {
  const shuffled = [...RECOMMENDED_QUESTIONS].sort(() => Math.random() - 0.5);
  const count = Math.random() < 0.5 ? 1 : 2; // 50% 확률로 1개 또는 2개
  return shuffled.slice(0, count);
}

const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD || '0.65'); // 하이브리드에서는 낮은 임계값
const TOP_K = parseInt(process.env.TOP_K || '3', 10);
const VECTOR_WEIGHT = parseFloat(process.env.VECTOR_WEIGHT || '0.5');
const KEYWORD_WEIGHT = parseFloat(process.env.KEYWORD_WEIGHT || '0.3');
const LEXICAL_WEIGHT = parseFloat(process.env.LEXICAL_WEIGHT || '0.2');
const FINAL_SCORE_THRESHOLD = parseFloat(process.env.FINAL_SCORE_THRESHOLD || '0.3'); // 최종 점수 임계값 (낮춤: 0.5 → 0.3)
const SCORE_MARGIN = parseFloat(process.env.SCORE_MARGIN || '0.1'); // 1위와 2위 간 최소 차이 (낮춤: 0.15 → 0.1)

export async function POST(request: NextRequest) {
  try {
    const body: AskRequest = await request.json();
    const { question } = body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json(
        { error: '질문을 입력해주세요.' },
        { status: 400 }
      );
    }

    const trimmedQuestion = question.trim();

    // 하이브리드 검색: 벡터 검색 + 키워드 검색 + Lexical Score
    const results = await hybridSearch(trimmedQuestion, {
      topK: TOP_K,
      vectorWeight: VECTOR_WEIGHT,
      keywordWeight: KEYWORD_WEIGHT,
      lexicalWeight: LEXICAL_WEIGHT,
      useFuzzy: true,
      similarityThreshold: SIMILARITY_THRESHOLD,
    });

    // 결과 처리
    if (results.length === 0) {
      console.log(
        `[하이브리드 검색] 질문: "${trimmedQuestion}" - 검색 결과 없음`
      );
      const recommendedQuestions = getRandomRecommendedQuestions();
      return NextResponse.json<AskResponse>({
        answer: '말씀을 잘 이해하지 못했어요.\n다시 질문해주세요.',
        found: false,
        recommendedQuestions,
      });
    }

    const bestMatch = results[0];
    const scores = bestMatch.scores || {
      vector: 0,
      keyword: 0,
      lexical: 0,
      final: bestMatch.score,
    };

    // 최종 점수 계산 및 검증
    const finalScore = scores.final;
    
    // 신뢰도 판단: 벡터나 키워드 점수가 높으면 높은 신뢰도
    // 키워드 점수가 0.5 이상이면 키워드 매칭이 성공한 것으로 간주
    const hasHighConfidence = scores.vector >= 0.8 || scores.keyword >= 0.8 || scores.keyword >= 0.5;
    
    // Margin 체크: 높은 신뢰도가 있으면 margin 체크 건너뛰기
    const scoreMargin = results.length > 1 ? (finalScore - results[1].score) : Infinity;
    // 키워드 점수가 0.5 이상이면 margin 체크 완화
    const relaxedMargin = scores.keyword >= 0.5 ? SCORE_MARGIN * 0.7 : SCORE_MARGIN;
    const hasMargin = results.length === 1 || 
                     hasHighConfidence || 
                     scoreMargin >= relaxedMargin;

    // 로그 출력 (기존 포맷 유지하면서 여러 지수 표시)
    console.log(
      `[하이브리드 검색] 질문: "${trimmedQuestion}" - ` +
      `최종점수: ${finalScore.toFixed(3)} ` +
      `(벡터: ${scores.vector.toFixed(3)}, ` +
      `키워드: ${scores.keyword.toFixed(3)}, ` +
      `lexical: ${scores.lexical.toFixed(3)}) ` +
      `신뢰도: ${hasHighConfidence ? '높음' : '보통'} ` +
      `margin: ${hasMargin ? '✓' : '✗'}${results.length > 1 ? ` (차이: ${scoreMargin.toFixed(3)})` : ''}`
    );

    // 답변 반환 조건:
    // 1. 최종 점수가 임계값 이상
    // 2. 높은 신뢰도가 있거나 margin이 충분
    const shouldReturnAnswer = finalScore >= FINAL_SCORE_THRESHOLD && 
                              (hasHighConfidence || hasMargin);

    if (!shouldReturnAnswer) {
      console.log(
        `[하이브리드 검색] 질문: "${trimmedQuestion}" - ` +
        `답변 거부 (점수: ${finalScore.toFixed(3)}, ` +
        `임계값: ${FINAL_SCORE_THRESHOLD}, ` +
        `신뢰도: ${hasHighConfidence ? '높음' : '낮음'}, ` +
        `margin: ${hasMargin ? '충분' : '부족'}${results.length > 1 ? `, 차이: ${scoreMargin.toFixed(3)}` : ''})`
      );
      const recommendedQuestions = getRandomRecommendedQuestions();
      return NextResponse.json<AskResponse>({
        answer: '말씀을 잘 이해하지 못했어요.\n다시 질문해주세요.',
        found: false,
        similarity: finalScore,
        recommendedQuestions,
      });
    }

    return NextResponse.json<AskResponse>({
      answer: bestMatch.payload.answer,
      found: true,
      similarity: finalScore,
    });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

