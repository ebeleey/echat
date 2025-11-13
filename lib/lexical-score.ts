/**
 * Lexical Score (문자 기반 점수) 계산
 * Jaccard 유사도 기반으로 텍스트 간 문자 수준 유사도 측정
 */

/**
 * 텍스트를 토큰 배열로 변환
 * 규칙:
 * - 소문자 변환
 * - 특수문자 제거: [^\w가-힣] → 공백
 * - 공백 기준 split → 토큰 배열
 * - 빈 문자열 토큰 제거
 * 
 * 주의: 점(.) 같은 특수문자는 제거되지만, "perso.ai" → "perso" "ai"로 분리됨
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  
  // 특수문자를 공백으로 변환하되, 원본도 보존
  const normalized = lower.replace(/[^\w가-힣]/g, ' ');
  
  const tokens = normalized
    .split(/\s+/) // 공백 기준 split
    .filter(token => token.length > 0); // 빈 문자열 토큰 제거
  
  // 원본 텍스트도 토큰으로 추가 (특수문자 포함된 경우 대비)
  // 예: "perso.ai" → ["perso", "ai", "perso.ai"]
  const originalToken = lower.replace(/\s+/g, '');
  if (originalToken.length > 0 && originalToken !== tokens.join('')) {
    tokens.push(originalToken);
  }
  
  return tokens;
}

/**
 * Jaccard 유사도 계산
 * J(A, B) = |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) {
    return 1.0; // 둘 다 빈 집합이면 완전히 유사
  }
  
  if (setA.size === 0 || setB.size === 0) {
    return 0.0; // 하나만 빈 집합이면 유사도 0
  }

  // 교집합 크기
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const intersectionSize = intersection.size;

  // 합집합 크기
  const union = new Set([...setA, ...setB]);
  const unionSize = union.size;

  return intersectionSize / unionSize;
}

/**
 * Lexical Score 계산
 * 두 텍스트 간의 문자 기반 유사도 (0.0 ~ 1.0)
 */
export function calculateLexicalScore(text1: string, text2: string): number {
  const tokens1 = new Set(tokenize(text1));
  const tokens2 = new Set(tokenize(text2));

  return jaccardSimilarity(tokens1, tokens2);
}

/**
 * 문자 단위 유사도 (Character-level Jaccard)
 * 토큰 단위가 아닌 문자 단위로도 유사도 계산
 */
export function calculateCharacterLevelScore(text1: string, text2: string): number {
  const chars1 = new Set(
    tokenize(text1).join('').split('')
  );
  const chars2 = new Set(
    tokenize(text2).join('').split('')
  );

  return jaccardSimilarity(chars1, chars2);
}

/**
 * 통합 Lexical Score
 * 토큰 단위 + 문자 단위 유사도를 결합
 */
export function calculateCombinedLexicalScore(text1: string, text2: string): number {
  const tokenScore = calculateLexicalScore(text1, text2);
  const charScore = calculateCharacterLevelScore(text1, text2);

  // 토큰 단위를 더 중요하게 (가중치 0.7)
  return tokenScore * 0.7 + charScore * 0.3;
}

