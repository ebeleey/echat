import { QdrantClient } from '@qdrant/qdrant-js';
import type { SearchResult, VectorPoint } from './types';

// 클라이언트를 지연 초기화
let client: QdrantClient | null = null;

/**
 * Qdrant 클라이언트 가져오기 (지연 초기화)
 */
function getClient(): QdrantClient {
  if (!client) {
    const QDRANT_URL = process.env.QDRANT_URL;
    if (!QDRANT_URL) {
      throw new Error(
        'QDRANT_URL 환경 변수가 설정되지 않았습니다. .env.local 파일에 QDRANT_URL을 설정해주세요.'
      );
    }

    client = new QdrantClient({
      url: QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      checkCompatibility: false, // 버전 호환성 체크 비활성화
    });
  }
  return client;
}

const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'qa_pairs';

/**
 * Qdrant 컬렉션 초기화
 */
export async function initializeCollection() {
  try {
    const client = getClient();
    const collections = await client.getCollections();
    const collectionExists = collections.collections.some(
      (col) => col.name === COLLECTION_NAME
    );

    if (!collectionExists) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 768, // text-embedding-004의 차원
          distance: 'Cosine',
        },
      });
      console.log(`컬렉션 "${COLLECTION_NAME}" 생성 완료`);
    } else {
      console.log(`컬렉션 "${COLLECTION_NAME}" 이미 존재함`);
    }
  } catch (error) {
    console.error('컬렉션 초기화 오류:', error);
    throw error;
  }
}

/**
 * 벡터 포인트들을 Qdrant에 업서트
 */
export async function upsertVectors(points: VectorPoint[]) {
  try {
    const client = getClient();
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: points,
    });
    console.log(`${points.length}개의 벡터 업서트 완료`);
  } catch (error) {
    console.error('벡터 업서트 오류:', error);
    throw error;
  }
}

/**
 * 쿼리 벡터로 유사도 검색
 */
export async function searchSimilar(
  queryVector: number[],
  topK: number = 3,
  scoreThreshold: number = 0.75
): Promise<SearchResult[]> {
  try {
    const client = getClient();
    const results = await client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: topK,
      score_threshold: scoreThreshold,
    });

    return results.map((result) => ({
      id: result.id as string,
      score: result.score,
      payload: result.payload as {
        question: string;
        answer: string;
      },
    }));
  } catch (error) {
    console.error('벡터 검색 오류:', error);
    throw error;
  }
}

