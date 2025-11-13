# 데이터셋이 적은 Q&A 챗봇 전략 분석

## 📊 현재 방식의 한계 (데이터셋이 적을 때)

### 문제점

1. **벡터 유사도만으로는 부족**
   - 데이터셋이 적으면 (예: 50-200개) 벡터 공간이 sparse
   - 유사한 질문이 없을 때 false negative 발생
   - 동의어, 변형 표현을 놓칠 수 있음

2. **고정 임계값의 한계**
   - `SIMILARITY_THRESHOLD=0.75`는 데이터셋 크기에 따라 최적값이 다름
   - 적은 데이터셋에서는 더 낮은 임계값이 필요할 수 있음

3. **키워드 매칭 부재**
   - "이스트소프트"와 "ESTsoft"는 벡터로는 다르지만 의미는 동일
   - 정확한 키워드 매칭이 더 효과적일 수 있음

## 🎯 추천 전략: 하이브리드 검색 (Hybrid Search)

### 1. Semantic Search + Keyword Search 결합

```
사용자 질문
    ↓
┌─────────────────┐
│  Query 분석     │
│  - 키워드 추출  │
│  - 의미 분석    │
└─────────────────┘
    ↓
┌─────────────────────────────────┐
│  병렬 검색                       │
│  ┌─────────────┐ ┌───────────┐ │
│  │ Vector Search│ │ Keyword   │ │
│  │ (Semantic)   │ │ Search    │ │
│  └─────────────┘ └───────────┘ │
└─────────────────────────────────┘
    ↓
┌─────────────────┐
│  결과 통합      │
│  - Score Fusion │
│  - Reranking    │
└─────────────────┘
    ↓
최종 답변
```

### 2. 구현 전략

#### A. 하이브리드 검색 (Hybrid Search)

**장점:**
- 벡터 검색: 의미적 유사도 (동의어, 변형 표현)
- 키워드 검색: 정확한 매칭 (회사명, 제품명 등)
- 두 결과를 결합하여 정확도 향상

**구현 방법:**
1. **Qdrant의 Sparse Vector 지원** (v1.7+)
   - Dense vector (현재) + Sparse vector (키워드)
   - 단일 쿼리로 하이브리드 검색 가능

2. **별도 키워드 인덱스**
   - Elasticsearch, Meilisearch 등
   - 또는 Qdrant의 payload 필터링 활용

3. **애플리케이션 레벨 결합**
   - 벡터 검색 + 키워드 검색 각각 수행
   - Score fusion으로 결과 통합

#### B. Query Expansion (질문 확장)

**목적:** 사용자 질문을 확장하여 더 많은 후보 찾기

**방법:**
1. **동의어 확장**
   - "이스트소프트" → ["이스트소프트", "ESTsoft", "EST", "이스트 소프트"]
   - "Perso" → ["Perso", "Perso.ai", "퍼소"]

2. **의미 확장**
   - "요금" → ["요금", "가격", "비용", "요금제"]
   - "기능" → ["기능", "서비스", "특징"]

3. **질문 변형**
   - "이스트소프트란?" → ["이스트소프트는 무엇인가", "이스트소프트 소개", "이스트소프트 설명"]

#### C. Reranking (재순위화)

**목적:** 초기 검색 결과를 더 정교하게 정렬

**방법:**
1. **Cross-Encoder 모델**
   - 질문-답변 쌍을 직접 비교
   - BERT 기반 reranker 사용

2. **규칙 기반 Reranking**
   - 키워드 매칭 점수
   - 질문 길이 유사도
   - 단어 겹침 비율

3. **Ensemble Reranking**
   - 여러 점수를 결합
   - 가중 평균 또는 학습된 모델

#### D. Few-Shot Learning / In-Context Learning

**목적:** 적은 데이터셋에서도 LLM의 일반화 능력 활용

**방법:**
1. **RAG (Retrieval-Augmented Generation)**
   ```
   사용자 질문
       ↓
   벡터 검색 (Top-K)
       ↓
   관련 Q&A 쌍들을 Context로 제공
       ↓
   LLM (Gemini/GPT)에게 질문 + Context 전달
       ↓
   LLM이 Context 기반으로 답변 생성
   ```

2. **Few-Shot Prompting**
   - 검색된 Top-K Q&A를 예시로 제공
   - LLM이 유사한 패턴으로 답변 생성

## 🛠️ 구체적인 구현 방안

### 방안 1: 하이브리드 검색 (추천 ⭐⭐⭐⭐⭐)

**구현 복잡도:** 중간
**효과:** 높음
**비용:** 중간

```typescript
// lib/hybrid-search.ts
export async function hybridSearch(
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  // 1. 벡터 검색 (Semantic)
  const vectorResults = await searchSimilar(
    await getEmbedding(query),
    topK * 2, // 더 많이 가져와서 reranking
    0.6 // 낮은 임계값
  );

  // 2. 키워드 검색 (Exact/Partial Match)
  const keywordResults = await keywordSearch(query, topK * 2);

  // 3. 결과 통합 (Score Fusion)
  const combined = combineResults(vectorResults, keywordResults);

  // 4. Reranking
  const reranked = await rerank(query, combined, topK);

  return reranked;
}

function combineResults(
  vector: SearchResult[],
  keyword: SearchResult[]
): SearchResult[] {
  const scoreMap = new Map<string, { vector: number; keyword: number }>();

  // 벡터 검색 결과
  vector.forEach((r, idx) => {
    const existing = scoreMap.get(r.id) || { vector: 0, keyword: 0 };
    existing.vector = r.score * 0.7; // 가중치
    scoreMap.set(r.id, existing);
  });

  // 키워드 검색 결과
  keyword.forEach((r, idx) => {
    const existing = scoreMap.get(r.id) || { vector: 0, keyword: 0 };
    existing.keyword = r.score * 0.3; // 가중치
    scoreMap.set(r.id, existing);
  });

  // 통합 점수 계산
  return Array.from(scoreMap.entries()).map(([id, scores]) => ({
    id,
    score: scores.vector + scores.keyword, // 가중 합
    payload: vector.find(r => r.id === id)?.payload || 
             keyword.find(r => r.id === id)?.payload!,
  })).sort((a, b) => b.score - a.score);
}
```

### 방안 2: Query Expansion (추천 ⭐⭐⭐⭐)

**구현 복잡도:** 낮음
**효과:** 중간-높음
**비용:** 낮음

```typescript
// lib/query-expansion.ts
const SYNONYMS: Record<string, string[]> = {
  '이스트소프트': ['이스트소프트', 'ESTsoft', 'EST', '이스트 소프트'],
  'perso': ['perso', 'Perso.ai', '퍼소', '퍼소ai'],
  '요금': ['요금', '가격', '비용', '요금제'],
  '기능': ['기능', '서비스', '특징', '역할'],
};

export function expandQuery(query: string): string[] {
  const queries = [query]; // 원본 질문
  const words = query.toLowerCase().split(/\s+/);

  // 동의어 확장
  words.forEach(word => {
    if (SYNONYMS[word]) {
      SYNONYMS[word].forEach(synonym => {
        const expanded = query.replace(new RegExp(word, 'gi'), synonym);
        if (expanded !== query) {
          queries.push(expanded);
        }
      });
    }
  });

  // 질문 변형
  if (query.endsWith('?')) {
    queries.push(query.replace('?', '는 무엇인가'));
    queries.push(query.replace('?', '에 대해 알려줘'));
  }

  return [...new Set(queries)]; // 중복 제거
}
```

### 방안 3: RAG with LLM (추천 ⭐⭐⭐⭐⭐)

**구현 복잡도:** 높음
**효과:** 매우 높음
**비용:** 높음 (LLM API 비용)

```typescript
// lib/rag.ts
export async function ragSearch(
  query: string,
  topK: number = 3
): Promise<string> {
  // 1. 벡터 검색으로 관련 Q&A 찾기
  const queryVector = await getEmbedding(query);
  const results = await searchSimilar(queryVector, topK, 0.6);

  if (results.length === 0) {
    return '데이터에 없습니다.';
  }

  // 2. Context 구성
  const context = results.map((r, idx) => 
    `질문 ${idx + 1}: ${r.payload.question}\n답변 ${idx + 1}: ${r.payload.answer}`
  ).join('\n\n');

  // 3. LLM에게 질문 + Context 전달
  const prompt = `다음은 데이터베이스에서 찾은 관련 질문과 답변입니다:

${context}

사용자 질문: ${query}

위의 정보를 바탕으로 사용자 질문에 답변해주세요. 
데이터베이스에 있는 정보만 사용하고, 없는 내용은 추가하지 마세요.
만약 관련 정보가 없다면 "데이터에 없습니다"라고 답변하세요.`;

  // 4. LLM 호출 (Gemini)
  const answer = await generateAnswer(prompt);
  return answer;
}
```

### 방안 4: Reranking (추천 ⭐⭐⭐⭐)

**구현 복잡도:** 중간
**효과:** 높음
**비용:** 낮음-중간

```typescript
// lib/reranking.ts
export function rerank(
  query: string,
  results: SearchResult[],
  topK: number
): SearchResult[] {
  return results
    .map(result => {
      // 1. 벡터 유사도 점수 (기존)
      const vectorScore = result.score;

      // 2. 키워드 매칭 점수
      const keywordScore = calculateKeywordMatch(query, result.payload.question);

      // 3. 질문 길이 유사도
      const lengthScore = calculateLengthSimilarity(query, result.payload.question);

      // 4. 단어 겹침 점수
      const overlapScore = calculateWordOverlap(query, result.payload.question);

      // 통합 점수 (가중 평균)
      const finalScore = 
        vectorScore * 0.5 +
        keywordScore * 0.3 +
        lengthScore * 0.1 +
        overlapScore * 0.1;

      return {
        ...result,
        score: finalScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

## 📈 우선순위별 구현 로드맵

### Phase 1: 즉시 구현 가능 (1-2일)
1. ✅ **Query Expansion** - 동의어 확장
2. ✅ **키워드 검색 추가** - Qdrant payload 필터링 활용
3. ✅ **Reranking** - 규칙 기반 점수 결합

### Phase 2: 중기 개선 (3-5일)
4. ✅ **하이브리드 검색** - 벡터 + 키워드 통합
5. ✅ **동적 임계값** - 데이터셋 크기 기반 조정

### Phase 3: 고급 기능 (1-2주)
6. ✅ **RAG with LLM** - Gemini를 활용한 답변 생성
7. ✅ **Cross-Encoder Reranking** - 더 정교한 재순위화

## 💡 데이터셋 크기별 추천 전략

### 소규모 (50-100개)
- **하이브리드 검색** 필수
- **Query Expansion** 필수
- **낮은 임계값** (0.6-0.65)
- **Reranking** 권장

### 중규모 (100-500개)
- **하이브리드 검색** 권장
- **Query Expansion** 권장
- **중간 임계값** (0.7-0.75)
- **RAG** 고려

### 대규모 (500개 이상)
- **벡터 검색**만으로도 충분
- **RAG** 활용 가능
- **높은 임계값** (0.75-0.8)

## 🎯 결론

데이터셋이 적은 Q&A 챗봇의 경우:

1. **하이브리드 검색**이 가장 효과적
   - 벡터 검색 + 키워드 검색 결합
   - 의미적 유사도 + 정확한 매칭

2. **Query Expansion**으로 검색 범위 확대
   - 동의어, 변형 표현 처리

3. **Reranking**으로 정확도 향상
   - 여러 신호를 결합한 최종 점수

4. **RAG**는 선택사항이지만 효과적
   - LLM의 일반화 능력 활용
   - 비용 대비 효과 고려

