# 벡터 데이터베이스를 활용한 지식 기반 챗봇 시스템

이스트소프트 Perso.ai 바이브코딩 인턴십 과제 프로젝트입니다.

## 📋 프로젝트 개요

Q&A 데이터셋을 벡터 데이터베이스에 저장하고, 유사도 검색을 통해 정확한 답변을 제공하는 챗봇 시스템입니다.

### 주요 기능

- ✅ Excel 파일(QnA.xlsx)에서 Q&A 데이터 읽기
- ✅ Google Gemini 임베딩을 사용한 벡터 변환
- ✅ Qdrant 벡터 DB에 데이터 저장 및 검색
- ✅ 유사도 기반 답변 검색 (할루시네이션 방지)
- ✅ ChatGPT 스타일 웹 UI

## 🚀 시작하기

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 다음 내용을 추가하세요:

```env
GEMINI_API_KEY=your-gemini-api-key-here
QDRANT_URL=https://your-qdrant-instance.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key-here
QDRANT_COLLECTION=qa_pairs
SIMILARITY_THRESHOLD=0.75
TOP_K=3
```

### 3. 데이터셋 준비

`dataset/QnA.xlsx` 파일을 준비하세요. Excel 파일은 다음 형식을 따라야 합니다:

| 질문 | 답변 |
|------|------|
| 질문1 | 답변1 |
| 질문2 | 답변2 |

또는 영어 컬럼명도 지원합니다:

| Question | Answer |
|----------|--------|
| Question1 | Answer1 |
| Question2 | Answer2 |

### 4. 데이터셋 임베딩

Excel 파일을 벡터 DB에 업로드합니다:

```bash
pnpm embed
```

### 5. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 📁 프로젝트 구조

```
app/
  api/
    ask/
      route.ts      # 질문 처리 API (벡터 검색 + 답변 반환)
  page.tsx          # 메인 챗 UI
  layout.tsx        # 레이아웃
  globals.css       # 전역 스타일

lib/
  embedding.ts      # 텍스트 임베딩 함수 (Gemini)
  vector.ts         # Qdrant 연동 및 검색
  types.ts          # 데이터 타입 정의

scripts/
  embed-dataset.ts  # QnA.xlsx → 벡터 업서트 스크립트

dataset/
  QnA.xlsx          # 제공된 Q&A 데이터 파일

.env.local          # API 키, DB URL, 환경 변수
```

## 🛠️ 기술 스택

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **Vector DB**: Qdrant
- **Embedding**: Google Gemini text-embedding-004
- **Deployment**: Vercel

## 📝 API 엔드포인트

### POST `/api/ask`

질문을 받아 답변을 반환합니다.

**Request:**
```json
{
  "question": "질문 내용"
}
```

**Response:**
```json
{
  "answer": "답변 내용",
  "found": true,
  "similarity": 0.85
}
```

또는 데이터에 없는 경우:
```json
{
  "answer": "데이터에 없습니다.",
  "found": false
}
```

## ⚙️ 설정 값

- `SIMILARITY_THRESHOLD`: 유사도 임계값 (기본값: 0.75)
- `TOP_K`: 검색할 최대 결과 수 (기본값: 3)

## 🚢 배포

Vercel에 배포하려면:

1. GitHub에 프로젝트 푸시
2. Vercel에서 프로젝트 import
3. 환경 변수 설정
4. 배포 완료!

## 📄 라이선스

이 프로젝트는 인턴십 과제용으로 제작되었습니다.
