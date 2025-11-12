import { NextRequest, NextResponse } from 'next/server';
import { getEmbedding } from '@/lib/embedding';
import { searchSimilar } from '@/lib/vector';
import type { AskRequest, AskResponse } from '@/lib/types';

const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD || '0.75');
const TOP_K = parseInt(process.env.TOP_K || '3', 10);

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

    // 1. 질문을 임베딩
    const queryVector = await getEmbedding(question.trim());

    // 2. Qdrant에서 유사도 검색
    const results = await searchSimilar(queryVector, TOP_K, SIMILARITY_THRESHOLD);

    // 3. 결과 처리
    if (results.length === 0 || results[0].score < SIMILARITY_THRESHOLD) {
      return NextResponse.json<AskResponse>({
        answer: '데이터에 없습니다.',
        found: false,
      });
    }

    // 가장 유사한 답변 반환
    const bestMatch = results[0];
    return NextResponse.json<AskResponse>({
      answer: bestMatch.payload.answer,
      found: true,
      similarity: bestMatch.score,
    });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

