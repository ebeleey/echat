import { NextRequest, NextResponse } from 'next/server';
import { hybridSearch, type SearchResultWithScores } from '@/lib/hybrid-search';
import type { AskRequest, AskResponse } from '@/lib/types';

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
      return NextResponse.json<AskResponse>({
        answer: '데이터에 없습니다.',
        found: false,
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
      return NextResponse.json<AskResponse>({
        answer: '데이터에 없습니다.',
        found: false,
        similarity: finalScore,
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

