# 벡터 데이터베이스를 활용한 지식 기반 챗봇 시스템

> 이스트소프트 Perso.ai 바이브코딩 인턴십 과제 프로젝트

## 📋 프로젝트 개요

Excel 파일(xlsx)에 저장된 Q&A 데이터셋을 벡터 데이터베이스에 저장하고,<br>하이브리드 검색을 통해 **데이터셋에 존재하는 답변만을 정확히 반환**하는 챗봇 시스템

### 핵심 목표

- **정확성**: 데이터셋 내 답변만을 정확히 반환
- **할루시네이션 방지**: 데이터셋에 없는 질문에 대해서는 거부
- **소규모 데이터셋 최적화**: 하이브리드 검색으로 정확도 향상



## 🛠️ 기술 스택

### 프론트엔드
- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS**

### 백엔드
- **Qdrant** (Vector Database)
  - Cosine Similarity 기반 벡터 유사도 검색
  - Payload에 원본 question/answer 저장
- **Google Gemini text-embedding-004**
  - 768차원 임베딩
  - 한국어 의미 표현력이 우수하여 한국어 Q&A 검색에 적합

### 배포
- **Vercel**


## 🗄️ Vector DB 및 임베딩 구조

### 임베딩 모델 선택: Google Gemini text-embedding-004

**선택 이유:**
- 한국어 의미 유사도를 정확히 캡처
- 768차원으로 성능과 비용의 균형이 적절
- 대안 대비 한국어 품질이 우수

### Qdrant 컬렉션 구조

```typescript
Collection: qa_pairs
├── Vector Size: 768
├── Distance Metric: Cosine
└── Payload:
    ├── question: string
    └── answer: string
```

### 핵심 설계 결정

1. **질문만 임베딩**: 검색 시 사용자 질문과 데이터셋 질문을 비교하므로 질문만 벡터화. 답변은 payload에 저장하여 검색 후 즉시 반환 가능.

2. **ID는 질문 해시값**: 동일한 질문의 중복 저장 방지 (MD5 해시 사용).

3. **Cosine Similarity**: 벡터의 방향(의미)을 비교하는 데 적합.

### 임베딩 파이프라인

```
QnA.xlsx → 질문 임베딩 (Gemini) → Qdrant 저장
```


## 🔍 유사도 검색 로직: 하이브리드 검색

소규모 데이터셋의 한계를 극복하기 위해 **벡터 검색 + 키워드 검색 + Lexical Score**를 통합한 하이브리드 검색을 구현했습니다.

### 검색 프로세스

1. **병렬 검색**
   - **벡터 검색 (Semantic)**: 질문 임베딩 생성 → Qdrant에서 Cosine 기반 유사도 검색
    - 의미적 유사도 캡처 (동의어, 변형 표현 처리)
    - 예: "이스트소프트"와 "ESTsoft" 같은 동의어 처리
   - **키워드 검색 (Lexical)**: 특수문자 포함 키워드 추출, 조사 제거, 복합 명사 추출
    - 정확한 키워드 매칭으로 정확도 향상
    - 예: "perso.ai", "지원언어", "영상편집" 등

2. **Score Fusion & Reranking**
   - 기본 가중치: Vector 50%, Keyword 30%, Lexical 20%
   - 상황에 따라 동적 가중치 조정
   - Lexical Score (Jaccard 유사도)로 정확한 질문 매칭

3. **할루시네이션 방지 검증**
   - 키워드 매칭 확인, Lexical Score 검증, 최종 점수 임계값, 신뢰도 체크, Margin 체크
   - 모든 검증을 통과한 경우에만 답변 반환


## 🛡️ 정확도 향상 전략

### 다층 방어 시스템

데이터셋에 없는 질문에 대한 답변을 완전히 차단하기 위해 **5단계 방어 시스템**을 구현했습니다.

1. **키워드 매칭 확인**: 핵심 키워드가 데이터셋에 존재하는지 확인
2. **Lexical Score 검증**: 질문과 데이터셋 질문의 문자 수준 유사도 확인
3. **최종 점수 임계값**: 최종 점수가 충분히 높은지 확인
4. **신뢰도 판단**: 벡터/키워드 점수로 신뢰도 판단
5. **Margin 체크**: 1위와 2위 간 점수 차이가 충분한지 확인

### 케이스별 처리

| 질문 유형 | Vector | Keyword | Lexical | 결과 |
|---------|--------|---------|---------|------|
| 정확한 질문 | 높음 | 높음 | 높음 | ✅ 답변 반환 |
| 유사한 질문 | 높음 | 중간 | 중간 | ✅ 답변 반환 |
| 키워드만 매칭 | 낮음 | 높음 | 낮음 | ✅ 키워드 보너스로 답변 반환 |
| 완전히 다른 질문 | 높음 | 0 | 매우 낮음 | ❌ "데이터에 없습니다" |
| 애매한 유사도 | 중간 | 중간 | 중간 | ❌ Margin 부족 → 거부 |


## 🔄 시스템 흐름

### 질문 처리 흐름

1. **클라이언트**: 질문 정규화 후 `QUESTION_ANSWER_MAP`에서 정확히 일치하는 질문 확인
   - 일치 시: API 호출 없이 즉시 답변 반환
   - 불일치 시: `/api/ask`로 서버 요청

2. **서버 API**: 하이브리드 검색 수행
   - 벡터 검색 + 키워드 검색 병렬 실행
   - Score Fusion + Lexical Reranking
   - 다층 방어 로직 통과 시 답변 반환, 아니면 "데이터에 없습니다" 반환


## 📁 프로젝트 구조

```
vchat/
├── app/
│   ├── api/ask/route.ts    # 질문 처리 API
│   └── page.tsx             # 메인 챗 UI
├── lib/
│   ├── embedding.ts         # 임베딩 함수 (Gemini)
│   ├── vector.ts            # Qdrant 연동
│   ├── keyword-search.ts    # 키워드 검색
│   ├── hybrid-search.ts     # 하이브리드 검색
│   └── lexical-score.ts    # Lexical Score 계산
├── scripts/
│   └── embed-dataset.ts     # 데이터셋 임베딩 스크립트
└── dataset/
    └── QnA.xlsx             # Q&A 데이터 파일
```

## 🎯 기술 선택 이유

### Vector DB: Qdrant
- 오픈소스로 무료 사용 가능
- 클라우드 서비스 제공

### Embedding: Google Gemini text-embedding-004
- 한국어 임베딩 품질 우수

### 하이브리드 검색 전략
- **벡터 검색**: 의미적 유사도 (동의어, 변형 표현)
- **키워드 검색**: 정확한 키워드 매칭
- **Lexical Score**: 정확한 질문 매칭



