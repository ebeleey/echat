import { GoogleGenerativeAI } from '@google/generative-ai';

// 클라이언트를 지연 초기화 (환경 변수가 로드된 후에 초기화)
let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.');
    }

    // API 키의 일부만 로그로 출력 (보안)
    const keyPreview = GEMINI_API_KEY.substring(0, 10) + '...' + GEMINI_API_KEY.substring(GEMINI_API_KEY.length - 5);
    console.log(`🔑 Gemini API 키 확인: ${keyPreview} (길이: ${GEMINI_API_KEY.length})`);
    
    // 공백이나 줄바꿈 제거
    const cleanKey = GEMINI_API_KEY.trim().replace(/\s+/g, '');
    if (cleanKey !== GEMINI_API_KEY) {
      console.log(`⚠️ API 키에서 공백을 제거했습니다.`);
    }

    genAI = new GoogleGenerativeAI(cleanKey);
  }
  return genAI;
}

/**
 * 텍스트를 벡터 임베딩으로 변환
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const genAI = getGenAI();
    // text-embedding-004 모델 사용
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    const result = await model.embedContent(text);
    
    // 결과 구조 확인
    if (!result || !result.embedding) {
      throw new Error('임베딩 결과가 올바르지 않습니다.');
    }
    
    const embedding = result.embedding;

    // embedding이 배열인 경우와 객체인 경우 처리
    if (Array.isArray(embedding)) {
      return embedding;
    } else if (embedding && 'values' in embedding) {
      return Array.from(embedding.values as number[]);
    } else {
      throw new Error('임베딩 형식이 올바르지 않습니다.');
    }
  } catch (error: any) {
    console.error('임베딩 생성 오류:', error);
    if (error.message) {
      console.error('오류 메시지:', error.message);
    }
    if (error.status) {
      console.error('HTTP 상태:', error.status);
    }
    throw new Error(`임베딩 생성에 실패했습니다: ${error.message || error}`);
  }
}

/**
 * 여러 텍스트를 배치로 임베딩
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    // Gemini는 배치 임베딩을 지원하므로 Promise.all로 병렬 처리
    const embeddings = await Promise.all(
      texts.map(async (text) => {
        const result = await model.embedContent(text);
        const embedding = result.embedding;
        
        // embedding이 배열인 경우와 객체인 경우 처리
        if (Array.isArray(embedding)) {
          return embedding;
        } else if (embedding && 'values' in embedding) {
          return Array.from(embedding.values as number[]);
        } else {
          throw new Error('임베딩 형식이 올바르지 않습니다.');
        }
      })
    );

    return embeddings;
  } catch (error: any) {
    console.error('배치 임베딩 생성 오류:', error);
    if (error.message) {
      console.error('오류 메시지:', error.message);
    }
    if (error.status) {
      console.error('HTTP 상태:', error.status);
    }
    if (error.errorDetails) {
      console.error('오류 상세:', JSON.stringify(error.errorDetails, null, 2));
    }
    throw new Error(`배치 임베딩 생성에 실패했습니다: ${error.message || error}`);
  }
}
