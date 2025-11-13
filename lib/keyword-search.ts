/**
 * 키워드 기반 검색
 * Qdrant의 payload 필터링을 활용한 정확한 키워드 매칭
 */

import { getClient } from './vector';
import type { SearchResult } from './types';

const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'qa_pairs';

/**
 * 한국어 조사/의문사 목록
 */
const KOREAN_PARTICLES = [
  '가', '이', '을', '를', '의', '에', '에서', '로', '으로', '와', '과', '도', '만', '부터', '까지',
  '뭐', '뭐야', '무엇', '무엇인가', '무엇이야', '어떻게', '어떤', '언제', '어디', '왜', '누구',
  '는', '은', '이다', '입니다', '이에요', '예요', '야', '어', '아', '지', '네', '게', '데',
  '알려주세요', '알려줘', '알려', '주세요', '주세요', '알려주', '알려줄', '알려줄래',
  '는요', '는가', '는지', '는지요', '는가요', '은가', '은지', '은지요', '은가요',
  '요', '가요', '지요', '죠', '까', '까요',
];

/**
 * 텍스트에서 키워드 추출 (개선 버전)
 * - 특수문자 포함 키워드 추출 (예: "perso.ai")
 * - 한국어 조사/의문사 제거
 * - 부분 문자열 매칭
 */
function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase().trim();
  const keywords = new Set<string>();

  // 1. 특수문자 포함 키워드 추출 (정규식: 단어 경계 포함, 점/하이픈 포함)
  // 예: "perso.ai가 뭐야?" → "perso.ai" 추출
  const specialCharPattern = /\b[\w.-]+\b/g;
  const specialMatches = lower.match(specialCharPattern);
  if (specialMatches) {
    specialMatches.forEach(match => {
      if (match.length > 1 && !/^[0-9]+$/.test(match)) {
        keywords.add(match);
        // 점이나 하이픈이 포함된 경우, 분리된 버전도 추가
        if (match.includes('.') || match.includes('-')) {
          const parts = match.split(/[.-]/);
          parts.forEach(part => {
            if (part.length > 1) {
              keywords.add(part);
            }
          });
        }
      }
    });
  }

  // 2. 일반 단어 추출 (특수문자 제거 후)
  const normalized = lower.replace(/[^\w\s가-힣]/g, ' ');
  const words = normalized
    .split(/\s+/)
    .filter(word => word.length > 1)
    .filter(word => !/^[0-9]+$/.test(word))
    .filter(word => !KOREAN_PARTICLES.includes(word)); // 조사/의문사 제거

  words.forEach(word => keywords.add(word));
  
  // 2-1. 조사가 붙은 형태도 키워드로 추가
  words.forEach(word => {
    // 한글 단어에 조사가 붙은 형태 추출
    if (/[가-힣]/.test(word)) {
      // 조사 제거 전 원본도 추가
      keywords.add(word);
      // 조사 제거 후 형태도 추가
      let withoutParticle = word.replace(/[가이을를의에에서로으로와과도만부터까지는은]$/, '');
      // 복합 조사 제거
      withoutParticle = withoutParticle.replace(/(는요|는가|는지|는지요|는가요|은가|은지|은지요|은가요|가요|지요|까요)$/, '');
      // 단순 조사 제거 (복합 조사 제거 후 남은 것)
      withoutParticle = withoutParticle.replace(/[요가지까]$/, '');
      if (withoutParticle.length > 1 && withoutParticle !== word) {
        keywords.add(withoutParticle);
      }
    }
  });

  // 3. 한글 단어 추출 (조사 제거)
  const koreanWords = lower
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(word => /[가-힣]/.test(word)) // 한글이 포함된 단어만
    .filter(word => word.length > 1)
    .filter(word => !KOREAN_PARTICLES.includes(word));

  koreanWords.forEach(word => keywords.add(word));

  // 4. 복합 키워드 추출 (띄어쓰기 포함)
  const keywordArray = Array.from(keywords);
  for (let i = 0; i < keywordArray.length - 1; i++) {
    const combined = keywordArray[i] + keywordArray[i + 1];
    if (combined.length > 2 && combined.length < 20) {
      keywords.add(combined);
    }
    // 역순도 추가 (예: "언어 지원")
    const reversed = keywordArray[i + 1] + keywordArray[i];
    if (reversed.length > 2 && reversed.length < 20) {
      keywords.add(reversed);
    }
  }
  
  // 5. 연속된 단어 조합 (2-3개 단어)
  // 예: "지원 언어는 몇 개" → "지원언어", "언어는", "몇개" 등
  const allWords = normalized.split(/\s+/).filter(w => w.length > 1 && !KOREAN_PARTICLES.includes(w));
  for (let i = 0; i < allWords.length - 1; i++) {
    const twoWord = allWords[i] + allWords[i + 1];
    if (twoWord.length > 2 && twoWord.length < 20) {
      keywords.add(twoWord);
    }
    if (i < allWords.length - 2) {
      const threeWord = allWords[i] + allWords[i + 1] + allWords[i + 2];
      if (threeWord.length > 3 && threeWord.length < 25) {
        keywords.add(threeWord);
      }
    }
  }

  return Array.from(keywords);
}

/**
 * 키워드 기반 검색
 * 질문이나 답변에 키워드가 포함된 Q&A 쌍을 찾음
 */
export async function keywordSearch(
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  try {
    const client = getClient();
    const keywords = extractKeywords(query);

    if (keywords.length === 0) {
      return [];
    }

    // Qdrant의 scroll을 사용하여 모든 포인트 가져오기
    const allResults: SearchResult[] = [];
    let offset: string | undefined = undefined;
    const limit = 100;

    do {
      const result = await client.scroll(COLLECTION_NAME, {
        limit,
        offset,
        with_payload: true,
        with_vector: false,
      });

      result.points.forEach((point: any) => {
        if (point.payload?.question && point.payload?.answer) {
          const question = String(point.payload.question).toLowerCase();
          const answer = String(point.payload.answer).toLowerCase();
          const questionNormalized = question.replace(/\s+/g, '');
          const answerNormalized = answer.replace(/\s+/g, '');

          // 키워드 매칭 점수 계산
          let matchScore = 0;
          let matchedKeywords = 0;

          // 긴 키워드(복합 키워드)를 먼저 매칭하여 우선순위 부여
          const sortedKeywords = Array.from(keywords).sort((a, b) => b.length - a.length);

          sortedKeywords.forEach(keyword => {
            // 특수문자가 포함된 키워드 (예: "perso.ai")
            if (/[.-]/.test(keyword)) {
              // 질문에 정확히 포함되면 매우 높은 점수
              if (question.includes(keyword)) {
                matchScore += 5; // 특수문자 포함 키워드가 질문에 정확히 있으면 최고 점수
                matchedKeywords++;
              } else if (questionNormalized.includes(keyword.replace(/[.-]/g, ''))) {
                matchScore += 3;
                matchedKeywords++;
              } else if (answer.includes(keyword)) {
                matchScore += 1.5;
                matchedKeywords++;
              } else if (answerNormalized.includes(keyword.replace(/[.-]/g, ''))) {
                matchScore += 0.8;
                matchedKeywords++;
              }
            } else {
              // 일반 키워드 매칭
              // 긴 키워드(복합 키워드)는 더 높은 점수
              const keywordLength = keyword.length;
              const baseScore = keywordLength >= 4 ? 3.5 : 2.5; // 4글자 이상은 더 높은 점수
              
              // 정확한 매칭
              if (question.includes(keyword) || questionNormalized.includes(keyword)) {
                matchScore += baseScore; // 질문에 포함되면 높은 점수
                matchedKeywords++;
              } 
              // 조사가 붙은 형태 매칭 (예: "요금제" → "요금제가", "요금제는")
              // 역방향 매칭: "이스트소프트" → "이스트소프트는요" 질문 매칭
              else if (/[가-힣]/.test(keyword)) {
                // 조사가 붙은 형태로 매칭 시도
                const withParticles = ['가', '이', '을', '를', '의', '에', '에서', '로', '으로', '와', '과', '는', '은'];
                const withComplexParticles = ['는요', '는가', '는지', '는지요', '는가요', '은가', '은지', '은지요', '은가요', '가요', '지요', '까요', '요', '죠', '까'];
                let matched = false;
                
                // 복합 조사가 붙은 형태로 매칭 시도
                for (const particle of withComplexParticles) {
                  const keywordWithParticle = keyword + particle;
                  if (question.includes(keywordWithParticle) || questionNormalized.includes(keywordWithParticle)) {
                    matchScore += baseScore * 0.9; // 조사가 붙은 형태는 약간 낮은 점수
                    matchedKeywords++;
                    matched = true;
                    break;
                  }
                }
                
                // 단순 조사가 붙은 형태로 매칭 시도
                if (!matched) {
                  for (const particle of withParticles) {
                    const keywordWithParticle = keyword + particle;
                    if (question.includes(keywordWithParticle) || questionNormalized.includes(keywordWithParticle)) {
                      matchScore += baseScore * 0.9; // 조사가 붙은 형태는 약간 낮은 점수
                      matchedKeywords++;
                      matched = true;
                      break;
                    }
                  }
                }
                
                // 질문에서 키워드로 시작하는 경우도 매칭 
                if (!matched) {
                  // 질문이 키워드로 시작하는지 확인
                  if (question.startsWith(keyword) || questionNormalized.startsWith(keyword)) {
                    matchScore += baseScore * 0.85; // 조사가 붙은 형태는 약간 낮은 점수
                    matchedKeywords++;
                    matched = true;
                  }
                }
                
                // 조사가 붙지 않은 형태도 확인
                if (!matched && (answer.includes(keyword) || answerNormalized.includes(keyword))) {
                  matchScore += baseScore * 0.4; // 답변에 포함되면 낮은 점수
                  matchedKeywords++;
                }
              } else if (answer.includes(keyword) || answerNormalized.includes(keyword)) {
                matchScore += baseScore * 0.4; // 답변에 포함되면 낮은 점수
                matchedKeywords++;
              }
            }
          });

          // 모든 키워드가 매칭되면 보너스 점수
          if (matchedKeywords === keywords.length && keywords.length > 0) {
            matchScore *= 1.8; // 보너스 증가
          }
          
          // 질문에 모든 키워드가 포함되면 추가 보너스
          const keywordsInQuestion = keywords.filter(keyword => {
            const keywordNormalized = keyword.replace(/[.-]/g, '');
            return question.includes(keyword) || questionNormalized.includes(keywordNormalized);
          });
          if (keywordsInQuestion.length === keywords.length && keywords.length > 0) {
            matchScore *= 1.5; // 질문에 모든 키워드가 있으면 추가 보너스
          }

          // 정규화된 점수 (0-1 범위)
          // 특수문자 포함 키워드가 있으면 더 높은 최대 점수 허용
          const hasSpecialKeyword = keywords.some(k => /[.-]/.test(k));
          const maxPossibleScore = hasSpecialKeyword 
            ? keywords.length * 4 // 특수문자 포함 키워드는 더 높은 점수 가능
            : keywords.length * 3;
          
          const normalizedScore = Math.min(
            matchScore / maxPossibleScore,
            1.0
          );

          if (normalizedScore > 0) {
            allResults.push({
              id: point.id as string,
              score: normalizedScore,
              payload: {
                question: point.payload.question,
                answer: point.payload.answer,
              },
            });
          }
        }
      });

      offset = result.next_page_offset as string | undefined;
    } while (offset);

    // 점수 순으로 정렬하고 상위 K개 반환
    return allResults
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (error) {
    console.error('키워드 검색 오류:', error);
    throw error;
  }
}

/**
 * 부분 문자열 매칭 검색 (띄어쓰기 무시, 특수문자 포함 키워드 지원)
 * 예: "이스트 소프트" → "이스트소프트" 매칭
 * 예: "perso.ai가 뭐야?" → "perso.ai" 매칭
 */
export async function fuzzyKeywordSearch(
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  try {
    const client = getClient();
    
    // 키워드 추출 (개선된 버전 사용)
    const keywords = extractKeywords(query);
    
    if (keywords.length === 0) {
      return [];
    }

    // 띄어쓰기 제거한 정규화된 쿼리 (전체)
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, '');

    const allResults: SearchResult[] = [];
    let offset: string | undefined = undefined;
    const limit = 100;

    do {
      const result = await client.scroll(COLLECTION_NAME, {
        limit,
        offset,
        with_payload: true,
        with_vector: false,
      });

      result.points.forEach((point: any) => {
        if (point.payload?.question && point.payload?.answer) {
          const question = String(point.payload.question).toLowerCase();
          const answer = String(point.payload.answer).toLowerCase();
          const questionNormalized = question.replace(/\s+/g, '');
          const answerNormalized = answer.replace(/\s+/g, '');

          let matchScore = 0;

          // 1. 전체 쿼리 매칭 (띄어쓰기 무시)
          if (questionNormalized.includes(normalizedQuery)) {
            matchScore += 0.8;
          } else if (answerNormalized.includes(normalizedQuery)) {
            matchScore += 0.2;
          }

          // 2. 개별 키워드 매칭 (특수문자 포함 키워드 우선)
          // 긴 키워드(복합 키워드)를 먼저 매칭하여 우선순위 부여
          const sortedKeywords = Array.from(keywords).sort((a, b) => b.length - a.length);
          
          sortedKeywords.forEach(keyword => {
            // 특수문자가 포함된 키워드 (예: "perso.ai")
            if (/[.-]/.test(keyword)) {
              // 질문에 정확히 포함되면 매우 높은 점수
              if (question.includes(keyword)) {
                matchScore += 1.0; // 특수문자 포함 키워드가 질문에 정확히 있으면 최고 점수
              } else if (questionNormalized.includes(keyword.replace(/[.-]/g, ''))) {
                matchScore += 0.7;
              } else if (answer.includes(keyword)) {
                matchScore += 0.4;
              } else if (answerNormalized.includes(keyword.replace(/[.-]/g, ''))) {
                matchScore += 0.2;
              }
            } else {
              // 일반 키워드
              // 긴 키워드(복합 키워드)는 더 높은 점수
              const keywordLength = keyword.length;
              const baseScore = keywordLength >= 4 ? 0.7 : 0.5; // 4글자 이상은 더 높은 점수
              
              // 정확한 매칭
              if (question.includes(keyword) || questionNormalized.includes(keyword)) {
                matchScore += baseScore; // 질문에 포함되면 높은 점수
              } 
              // 조사가 붙은 형태 매칭 (예: "요금제" → "요금제가", "요금제는")
              // 역방향 매칭: "이스트소프트" → "이스트소프트는요" 질문 매칭
              else if (/[가-힣]/.test(keyword)) {
                // 조사가 붙은 형태로 매칭 시도
                const withParticles = ['가', '이', '을', '를', '의', '에', '에서', '로', '으로', '와', '과', '는', '은'];
                const withComplexParticles = ['는요', '는가', '는지', '는지요', '는가요', '은가', '은지', '은지요', '은가요', '가요', '지요', '까요', '요', '죠', '까'];
                let matched = false;
                
                // 복합 조사가 붙은 형태로 매칭 시도
                for (const particle of withComplexParticles) {
                  const keywordWithParticle = keyword + particle;
                  if (question.includes(keywordWithParticle) || questionNormalized.includes(keywordWithParticle)) {
                    matchScore += baseScore * 0.9; // 조사가 붙은 형태는 약간 낮은 점수
                    matched = true;
                    break;
                  }
                }
                
                // 단순 조사가 붙은 형태로 매칭 시도
                if (!matched) {
                  for (const particle of withParticles) {
                    const keywordWithParticle = keyword + particle;
                    if (question.includes(keywordWithParticle) || questionNormalized.includes(keywordWithParticle)) {
                      matchScore += baseScore * 0.9; // 조사가 붙은 형태는 약간 낮은 점수
                      matched = true;
                      break;
                    }
                  }
                }
                
                // 질문에서 키워드로 시작하는 경우도 매칭 (역방향: "이스트소프트는요" → "이스트소프트" 매칭)
                if (!matched) {
                  // 질문이 키워드로 시작하는지 확인
                  if (question.startsWith(keyword) || questionNormalized.startsWith(keyword)) {
                    matchScore += baseScore * 0.85; // 조사가 붙은 형태는 약간 낮은 점수
                    matched = true;
                  }
                }
                
                // 조사가 붙지 않은 형태도 확인
                if (!matched && (answer.includes(keyword) || answerNormalized.includes(keyword))) {
                  matchScore += baseScore * 0.4; // 답변에 포함되면 낮은 점수
                }
              } else if (answer.includes(keyword) || answerNormalized.includes(keyword)) {
                matchScore += baseScore * 0.4; // 답변에 포함되면 낮은 점수
              }
            }
          });

          // 3. 모든 키워드가 매칭되면 보너스
          const matchedKeywords = keywords.filter(keyword => {
            const keywordNormalized = keyword.replace(/[.-]/g, '');
            return questionNormalized.includes(keywordNormalized) || 
                   answerNormalized.includes(keywordNormalized);
          });
          if (matchedKeywords.length === keywords.length && keywords.length > 0) {
            matchScore *= 1.5; // 보너스 증가
          }
          
          // 4. 질문에 모든 키워드가 포함되면 추가 보너스
          const keywordsInQuestion = keywords.filter(keyword => {
            const keywordNormalized = keyword.replace(/[.-]/g, '');
            return question.includes(keyword) || questionNormalized.includes(keywordNormalized);
          });
          if (keywordsInQuestion.length === keywords.length && keywords.length > 0) {
            matchScore *= 1.3; // 질문에 모든 키워드가 있으면 추가 보너스
          }

          // 정규화 (0-1 범위)
          matchScore = Math.min(matchScore, 1.0);

          if (matchScore > 0) {
            allResults.push({
              id: point.id as string,
              score: matchScore,
              payload: {
                question: point.payload.question,
                answer: point.payload.answer,
              },
            });
          }
        }
      });

      offset = result.next_page_offset as string | undefined;
    } while (offset);

    return allResults
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (error) {
    console.error('퍼지 키워드 검색 오류:', error);
    throw error;
  }
}

