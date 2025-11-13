/**
 * 하이브리드 검색
 * 벡터 검색(Semantic) + 키워드 검색을 결합하여 정확도 향상
 */

import { searchSimilar } from './vector';
import { keywordSearch, fuzzyKeywordSearch } from './keyword-search';
import { getEmbedding } from './embedding';
import { calculateCombinedLexicalScore } from './lexical-score';
import type { SearchResult } from './types';

interface HybridSearchOptions {
  topK?: number;
  vectorWeight?: number; // 벡터 검색 가중치 (기본값: 0.5)
  keywordWeight?: number; // 키워드 검색 가중치 (기본값: 0.3)
  lexicalWeight?: number; // Lexical Score 가중치 (기본값: 0.2)
  useFuzzy?: boolean; // 퍼지 키워드 검색 사용 여부
  similarityThreshold?: number; // 벡터 검색 임계값
}

export interface SearchResultWithScores extends SearchResult {
  scores?: {
    vector: number;
    keyword: number;
    lexical: number;
    final: number;
  };
}

/**
 * 하이브리드 검색: 벡터 검색 + 키워드 검색 + Lexical Score 통합
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<SearchResultWithScores[]> {
  const {
    topK = 5,
    vectorWeight = 0.5,
    keywordWeight = 0.3,
    lexicalWeight = 0.2,
    useFuzzy = true,
    similarityThreshold = 0.6, // 하이브리드에서는 낮은 임계값 사용
  } = options;

  try {
    // 1. 병렬로 벡터 검색과 키워드 검색 수행
    const [vectorResults, keywordResults] = await Promise.all([
      // 벡터 검색 (Semantic Search)
      (async () => {
        const queryVector = await getEmbedding(query);
        return await searchSimilar(
          queryVector,
          topK * 3, // 더 많이 가져와서 reranking
          similarityThreshold
        );
      })(),
      // 키워드 검색
      useFuzzy
        ? fuzzyKeywordSearch(query, topK * 3)
        : keywordSearch(query, topK * 3),
    ]);

    console.log(
      `[하이브리드 검색] 벡터 결과: ${vectorResults.length}개, 키워드 결과: ${keywordResults.length}개`
    );

    // 2. 결과 통합 (Score Fusion)
    const combined = combineResults(
      vectorResults,
      keywordResults,
      vectorWeight,
      keywordWeight
    );

    // 3. Lexical Score 추가 및 Reranking
    const reranked = rerankWithLexical(
      query,
      combined,
      topK,
      lexicalWeight
    );

    return reranked;
  } catch (error) {
    console.error('하이브리드 검색 오류:', error);
    // 오류 발생 시 벡터 검색만 사용
    const queryVector = await getEmbedding(query);
    const results = await searchSimilar(queryVector, topK, similarityThreshold);
    return results.map(r => ({ ...r, scores: { vector: r.score, keyword: 0, lexical: 0, final: r.score } }));
  }
}

/**
 * 벡터 검색과 키워드 검색 결과 통합
 */
function combineResults(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  vectorWeight: number,
  keywordWeight: number
): Array<SearchResult & { vectorScore: number; keywordScore: number }> {
  const scoreMap = new Map<
    string,
    {
      vectorScore: number;
      keywordScore: number;
      payload: SearchResult['payload'];
    }
  >();

  // 벡터 검색 결과 추가
  vectorResults.forEach((result) => {
    const existing = scoreMap.get(result.id);
    if (existing) {
      existing.vectorScore = Math.max(existing.vectorScore, result.score);
    } else {
      scoreMap.set(result.id, {
        vectorScore: result.score,
        keywordScore: 0,
        payload: result.payload,
      });
    }
  });

  // 키워드 검색 결과 추가
  keywordResults.forEach((result) => {
    const existing = scoreMap.get(result.id);
    if (existing) {
      existing.keywordScore = Math.max(existing.keywordScore, result.score);
    } else {
      scoreMap.set(result.id, {
        vectorScore: 0,
        keywordScore: result.score,
        payload: result.payload,
      });
    }
  });

  // 통합 점수 계산 (가중 평균)
  // 키워드 점수가 높으면 더 높은 가중치 적용
  return Array.from(scoreMap.entries())
    .map(([id, scores]) => {
      // 키워드 점수가 높으면 (>= 0.7) 키워드 가중치를 높임
      let adjustedKeywordWeight = keywordWeight;
      let adjustedVectorWeight = vectorWeight;
      
      if (scores.keywordScore >= 0.7) {
        adjustedKeywordWeight = Math.min(keywordWeight * 1.5, 0.5); // 최대 0.5까지
        adjustedVectorWeight = 1 - adjustedKeywordWeight;
      } else if (scores.keywordScore >= 0.5 && scores.vectorScore < 0.3) {
        // 키워드 점수가 0.5 이상이고 벡터 점수가 낮으면 키워드 가중치 증가
        adjustedKeywordWeight = Math.min(keywordWeight * 1.3, 0.45);
        adjustedVectorWeight = 1 - adjustedKeywordWeight;
      }
      
      const finalScore =
        scores.vectorScore * adjustedVectorWeight + scores.keywordScore * adjustedKeywordWeight;

      return {
        id,
        score: finalScore,
        payload: scores.payload,
        vectorScore: scores.vectorScore,
        keywordScore: scores.keywordScore,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Reranking with Lexical Score: Lexical Score를 포함한 재순위화
 */
function rerankWithLexical(
  query: string,
  results: Array<SearchResult & { vectorScore: number; keywordScore: number }>,
  topK: number,
  lexicalWeight: number
): SearchResultWithScores[] {
  return results
    .map((result) => {
      const question = result.payload.question;

      // 1. 벡터 점수와 키워드 점수
      const vectorScore = result.vectorScore;
      const keywordScore = result.keywordScore;

      // 2. 기존 통합 점수 (벡터 + 키워드)
      const baseScore = result.score;

      // 3. Lexical Score 계산 (Jaccard 유사도 기반)
      const lexicalScore = calculateCombinedLexicalScore(query, question);

      // 4. 질문 전체 매칭 보너스 (정확한 질문 매칭)
      // 질문이 거의 동일하면 (lexical > 0.8) 큰 보너스
      let questionMatchBonus = 0;
      if (lexicalScore > 0.8) {
        questionMatchBonus = 0.15; // 정확한 질문 매칭 보너스
      } else if (lexicalScore > 0.6) {
        questionMatchBonus = 0.08; // 유사한 질문 매칭 보너스
      } else if (lexicalScore < 0.3) {
        // lexical 점수가 매우 낮으면 (0.3 이하) 정확한 질문이 아닐 가능성이 높음
        // baseScore를 낮춰서 정확한 질문을 찾도록 함
        questionMatchBonus = -0.1; // 페널티
        
        // 키워드 점수도 0이고 lexical 점수도 매우 낮으면 (0.1 이하) 더 큰 페널티
        if (keywordScore === 0 && lexicalScore < 0.1) {
          questionMatchBonus = -0.3; // 큰 페널티
        }
        // 벡터 점수가 높으면 (0.8 이상) lexical 페널티를 완화
        else if (vectorScore >= 0.8 && lexicalScore >= 0.02) {
          questionMatchBonus = -0.05; // 페널티 완화
        }
        // 키워드 점수가 높으면 (0.5 이상) lexical 페널티를 완화 또는 제거
        else if (keywordScore >= 0.5) {
          questionMatchBonus = 0; // 키워드 매칭이 성공했으면 lexical 페널티 제거
        }
      }

      // 5. 최종 점수 계산
      // baseScore는 이미 vectorWeight + keywordWeight로 구성되어 있음
      // lexicalScore를 추가로 반영하되, 벡터나 키워드 점수가 높으면 lexical 가중치를 줄임
      // 단, lexical 점수가 매우 낮으면 (0.3 이하) 정확한 질문이 아닐 가능성이 높으므로 가중치를 높임
      let adjustedLexicalWeight = lexicalWeight;
      
      // 키워드 점수가 높으면 (0.7 이상) 키워드 매칭이 성공한 것이므로 보너스
      let keywordBonus = 0;
      if (keywordScore >= 0.7) {
        // 키워드 점수가 높으면 키워드 매칭 보너스
        keywordBonus = keywordScore * 0.3; // 키워드 점수의 30%를 보너스로 추가
      } else if (keywordScore >= 0.5) {
        // 키워드 점수가 중간 정도면 보너스 증가
        keywordBonus = keywordScore * 0.25; // 15% → 25%로 증가
      }
      
      // 키워드 점수가 0이면 키워드 매칭이 실패한 것이므로 lexical 점수를 더 중요하게 반영
      if (keywordScore === 0 && vectorScore >= 0.8) {
        // 벡터 점수는 높지만 키워드 매칭이 안 된 경우
        // lexical 점수를 더 중요하게 반영하여 정확한 질문을 찾도록 함
        adjustedLexicalWeight = Math.min(lexicalWeight * 3, 0.6);
      } else if (vectorScore >= 0.8 || keywordScore >= 0.8) {
        // 높은 신뢰도가 있지만, lexical 점수가 낮으면 (0.3 이하) 정확한 질문이 아닐 수 있음
        if (lexicalScore < 0.3) {
          // lexical 점수가 낮으면 가중치를 높여서 정확한 질문을 찾도록 함
          adjustedLexicalWeight = Math.min(lexicalWeight * 2.5, 0.5); // 가중치 더 높임
        } else {
          // lexical 점수가 높으면 가중치를 줄임
          adjustedLexicalWeight = Math.min(lexicalWeight, 0.1);
        }
      } else if (keywordScore >= 0.7 && vectorScore < 0.5) {
        // 키워드 점수는 높지만 벡터 점수가 낮은 경우
        // 키워드 매칭이 성공했으므로 lexical 가중치를 줄여서 키워드 점수를 더 중요하게 반영
        adjustedLexicalWeight = Math.min(lexicalWeight * 0.5, 0.1);
      } else if (keywordScore >= 0.5 && vectorScore < 0.3) {
        // 키워드 점수가 0.5 이상이고 벡터 점수가 낮은 경우
        // 키워드 매칭이 성공했으므로 lexical 가중치를 줄여서 키워드 점수를 더 중요하게 반영
        adjustedLexicalWeight = Math.min(lexicalWeight * 0.5, 0.1); // 0.7 → 0.5로 더 줄임
      }
      
      // 키워드 점수가 높고 벡터 점수가 낮으면 baseScore에 키워드 점수를 더 많이 반영
      let adjustedBaseScore = baseScore;
      if (keywordScore >= 0.5 && vectorScore < 0.3) {
        // baseScore가 낮을 때 키워드 점수로 보완
        // 키워드 점수가 높으면 baseScore를 키워드 점수 기반으로 재계산
        adjustedBaseScore = Math.max(baseScore, keywordScore * 0.5); // 0.4 → 0.5로 증가
      }
      
      // lexical 점수가 매우 낮고 키워드 점수가 높으면 lexical 영향력 최소화
      if (lexicalScore < 0.1 && keywordScore >= 0.5) {
        adjustedLexicalWeight = Math.min(adjustedLexicalWeight, 0.05); // lexical 영향력 최소화
      }
      
      const finalScore = Math.min(
        adjustedBaseScore * (1 - adjustedLexicalWeight) + lexicalScore * adjustedLexicalWeight + questionMatchBonus + keywordBonus,
        1.0
      );

      return {
        id: result.id,
        score: Math.min(finalScore, 1.0), // 1.0을 넘지 않도록
        payload: result.payload,
        scores: {
          vector: vectorScore,
          keyword: keywordScore,
          lexical: lexicalScore,
          final: finalScore,
        },
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

