# 벡터 데이터베이스를 활용한 지식 기반 챗봇 시스템

> 이스트소프트 Perso.ai 바이브코딩 인턴십 과제 프로젝트

## 📋 프로젝트 개요

Q&A 데이터셋을 벡터 데이터베이스에 저장하고, 유사도 검색을 통해 정확한 답변을 제공하는 챗봇 시스템입니다.

### 주요 기능

- Excel 파일(QnA.xlsx)에서 Q&A 데이터 읽기
- Google Gemini 임베딩을 사용한 벡터 변환
- Qdrant 벡터 DB에 데이터 저장 및 검색
- **하이브리드 검색**: 벡터 검색(Semantic) + 키워드 검색 결합
- 유사도 기반 답변 검색 (할루시네이션 방지)
- ChatGPT 스타일 웹 UI

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
  vector.ts         # Qdrant 연동 및 벡터 검색
  keyword-search.ts # 키워드 기반 검색
  hybrid-search.ts  # 하이브리드 검색 (벡터 + 키워드)
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
