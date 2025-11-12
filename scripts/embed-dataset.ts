import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { getEmbeddings } from '../lib/embedding';
import { initializeCollection, upsertVectors } from '../lib/vector';
import type { QAPair, VectorPoint } from '../lib/types';

// .env.local 파일 로드
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

/**
 * 텍스트에서 Q.와 A.를 파싱하여 질문과 답변 추출
 */
function parseQAFromContent(content: string): { question: string; answer: string } | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // 다양한 형식 지원:
  // 1. Q. 질문\nA. 답변
  // 2. Q. 질문 A. 답변
  // 3. Q: 질문\nA: 답변
  // 4. Q 질문\nA 답변
  
  // Q. 또는 Q: 또는 Q 로 시작하는 패턴
  const qPatterns = [
    /Q\.\s*([\s\S]+?)(?=\s*A\.|$)/i,  // Q. ... A.
    /Q:\s*([\s\S]+?)(?=\s*A:|$)/i,    // Q: ... A:
    /Q\s+([\s\S]+?)(?=\s+A\.|$)/i,    // Q ... A.
    /Q\s+([\s\S]+?)(?=\s+A:|$)/i,     // Q ... A:
    /Q\s+([\s\S]+?)(?=\s+A\s|$)/i,    // Q ... A
  ];

  // A. 또는 A: 또는 A 로 시작하는 패턴
  const aPatterns = [
    /A\.\s*([\s\S]+?)(?=\s*Q\.|$)/i,  // A. ... Q.
    /A:\s*([\s\S]+?)(?=\s*Q:|$)/i,    // A: ... Q:
    /A\s+([\s\S]+?)(?=\s+Q\.|$)/i,    // A ... Q.
    /A\s+([\s\S]+?)(?=\s+Q:|$)/i,     // A ... Q:
    /A\s+([\s\S]+?)(?=\s+Q\s|$)/i,    // A ... Q
  ];

  let qMatch: RegExpMatchArray | null = null;
  let aMatch: RegExpMatchArray | null = null;

  // Q 패턴 찾기
  for (const pattern of qPatterns) {
    qMatch = content.match(pattern);
    if (qMatch) break;
  }

  // A 패턴 찾기
  for (const pattern of aPatterns) {
    aMatch = content.match(pattern);
    if (aMatch) break;
  }

  if (!qMatch || !aMatch) {
    return null;
  }

  const question = qMatch[1].trim();
  const answer = aMatch[1].trim();

  if (!question || !answer) {
    return null;
  }

  return { question, answer };
}

/**
 * Excel 파일에서 Q&A 데이터 읽기
 */
function readQADataset(filePath: string): QAPair[] {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    console.log(`📄 시트 이름: ${sheetName}`);
    
    // 첫 번째 행을 헤더로 사용
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1, // 배열 형태로 읽기
      defval: null, // 빈 셀은 null로 처리
    }) as any[][];

    console.log(`📊 총 ${data.length}행 읽음`);
    
    // 처음 몇 행 출력해서 구조 파악
    for (let i = 0; i < Math.min(5, data.length); i++) {
      console.log(`📋 행 ${i + 1}:`, data[i]);
    }

    const qaPairs: QAPair[] = [];

    if (data.length < 2) {
      console.warn('⚠️ Excel 파일에 데이터가 충분하지 않습니다.');
      return qaPairs;
    }

    // 실제 헤더 행 찾기 (순번, 내용 등이 있는 행)
    let headerRowIndex = -1;
    let headerRow: string[] = [];
    
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const row = data[i] as string[];
      const rowStr = row.map(cell => String(cell || '').trim().toLowerCase()).join(' ');
      
      // "순번", "내용" 같은 키워드가 있는 행을 헤더로 인식
      if (rowStr.includes('순번') || rowStr.includes('내용') || 
          rowStr.includes('question') || rowStr.includes('answer') ||
          rowStr.includes('질문') || rowStr.includes('답변')) {
        headerRowIndex = i;
        headerRow = row;
        console.log(`📋 헤더 행 발견: 행 ${i + 1}`, headerRow);
        break;
      }
    }

    // 헤더를 찾지 못한 경우, 첫 번째 비어있지 않은 행을 헤더로 사용
    if (headerRowIndex === -1) {
      for (let i = 0; i < Math.min(5, data.length); i++) {
        const row = data[i] as string[];
        const hasData = row.some(cell => cell && String(cell).trim());
        if (hasData && i > 0) { // 첫 번째 행은 제목일 가능성이 높음
          headerRowIndex = i;
          headerRow = row;
          console.log(`📋 헤더로 추정: 행 ${i + 1}`, headerRow);
          break;
        }
      }
    }

    // 여전히 찾지 못한 경우, 2번째 행을 헤더로 사용 (1번째는 제목)
    if (headerRowIndex === -1) {
      headerRowIndex = 1;
      headerRow = data[1] as string[];
      console.log(`📋 기본값으로 행 2를 헤더로 사용:`, headerRow);
    }
    
    // "내용" 컬럼 인덱스 찾기 (공백 제거 후 비교)
    let contentIndex = -1;
    for (let i = 0; i < headerRow.length; i++) {
      const header = String(headerRow[i] || '').trim();
      const headerNormalized = header.replace(/\s+/g, '').toLowerCase(); // 공백 제거 후 비교
      console.log(`   컬럼 ${i}: "${header}" (정규화: "${headerNormalized}")`);
      if (
        headerNormalized.includes('내용') ||
        headerNormalized.includes('content') ||
        headerNormalized.includes('질문') ||
        headerNormalized.includes('question')
      ) {
        contentIndex = i;
        console.log(`   ✅ "내용" 컬럼 발견: 인덱스 ${i} ("${header}")`);
        break;
      }
    }

    // "내용" 컬럼을 찾지 못한 경우, 첫 번째 비어있지 않은 컬럼 사용
    if (contentIndex === -1) {
      console.log(`   ⚠️ "내용" 컬럼을 찾지 못함. 다른 컬럼 찾는 중...`);
      for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i] || '').trim();
        if (header && !header.startsWith('__empty') && !header.match(/^\d+$/)) {
          contentIndex = i;
          console.log(`   ✅ 사용할 컬럼: 인덱스 ${i} ("${header}")`);
          break;
        }
      }
    }

    // 여전히 찾지 못한 경우, 두 번째 컬럼 사용 (첫 번째는 "순번"일 가능성)
    if (contentIndex === -1) {
      contentIndex = headerRow.length > 1 ? 1 : 0;
      console.log(`   ⚠️ 기본값으로 컬럼 인덱스 ${contentIndex} 사용`);
    }

    const contentHeader = headerRow[contentIndex] || `컬럼${contentIndex + 1}`;
    console.log(`📋 최종 선택된 컬럼: "${contentHeader}" (인덱스: ${contentIndex})\n`);

    // 헤더 다음 행부터 데이터 읽기
    let parsedCount = 0;
    let skippedCount = 0;
    const dataStartIndex = headerRowIndex + 1;
    
    console.log(`📝 데이터 읽기 시작: 행 ${dataStartIndex + 1}부터\n`);
    
    for (let i = dataStartIndex; i < data.length; i++) {
      const row = data[i];
      let content = row[contentIndex];

      if (!content) {
        skippedCount++;
        continue;
      }

      let contentStr = String(content);
      
      // 질문과 답변이 같은 행에 있지 않은 경우, 다음 행도 확인
      // 현재 행에 Q.가 있고 다음 행에 A.가 있을 수 있음
      if (contentStr.includes('Q.') && !contentStr.includes('A.')) {
        // 다음 행 확인
        if (i + 1 < data.length) {
          const nextRow = data[i + 1];
          const nextContent = nextRow[contentIndex];
          if (nextContent && String(nextContent).includes('A.')) {
            contentStr = contentStr + '\n' + String(nextContent);
            console.log(`📝 행 ${i + 1}-${i + 2} 결합: Q와 A가 다른 행에 있음`);
            i++; // 다음 행은 건너뛰기
          }
        }
      }

      console.log(`📝 행 ${i + 1} 내용 (처음 150자): ${contentStr.substring(0, 150)}...`);

      // Q.와 A.로 구분된 텍스트 파싱
      const parsed = parseQAFromContent(contentStr);

      if (parsed) {
        qaPairs.push({
          question: parsed.question,
          answer: parsed.answer,
        });
        parsedCount++;
        console.log(`   ✅ 파싱 성공: Q="${parsed.question.substring(0, 50)}..."`);
      } else {
        skippedCount++;
        console.log(`   ⚠️ 파싱 실패: Q. 또는 A.를 찾을 수 없음`);
        // 디버깅: 실제 내용 출력
        console.log(`   디버깅 - 전체 내용: "${contentStr}"`);
      }
    }

    console.log(`\n📊 파싱 결과: 성공 ${parsedCount}개, 건너뜀 ${skippedCount}개\n`);

    return qaPairs;
  } catch (error) {
    console.error('Excel 파일 읽기 오류:', error);
    throw error;
  }
}

/**
 * 텍스트에서 고유 ID 생성
 */
function generateId(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('🚀 데이터셋 임베딩 시작...\n');

  // 환경 변수 확인
  console.log('🔍 환경 변수 확인 중...');
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const keyPreview = geminiKey.substring(0, 10) + '...' + geminiKey.substring(geminiKey.length - 5);
    console.log(`   GEMINI_API_KEY: ✅ 설정됨 (${keyPreview}, 길이: ${geminiKey.length})`);
    // 공백이나 특수문자 확인
    if (geminiKey.includes(' ') || geminiKey.includes('\n') || geminiKey.includes('\r')) {
      console.log(`   ⚠️ 경고: API 키에 공백이나 줄바꿈이 포함되어 있을 수 있습니다.`);
    }
  } else {
    console.log(`   GEMINI_API_KEY: ❌ 없음`);
  }
  console.log(`   QDRANT_URL: ${process.env.QDRANT_URL || '❌ 없음'}`);
  console.log(`   QDRANT_API_KEY: ${process.env.QDRANT_API_KEY ? '✅ 설정됨' : '⚠️ 선택사항'}`);
  console.log('');

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.\n.env.local 파일에 GEMINI_API_KEY를 설정해주세요.'
    );
  }
  if (!process.env.QDRANT_URL) {
    throw new Error(
      'QDRANT_URL 환경 변수가 설정되지 않았습니다.\n.env.local 파일에 QDRANT_URL을 설정해주세요.\n예: QDRANT_URL=https://your-instance.qdrant.io 또는 QDRANT_URL=http://localhost:6333'
    );
  }

  // Excel 파일 경로
  const excelPath = path.join(process.cwd(), 'dataset', 'QnA.xlsx');

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel 파일을 찾을 수 없습니다: ${excelPath}`);
  }

  // 1. Excel 파일 읽기
  console.log('📖 Excel 파일 읽는 중...');
  const qaPairs = readQADataset(excelPath);
  console.log(`✅ ${qaPairs.length}개의 Q&A 쌍을 읽었습니다.\n`);

  if (qaPairs.length === 0) {
    throw new Error('읽은 데이터가 없습니다. Excel 파일 형식을 확인해주세요.');
  }

  // 2. 컬렉션 초기화
  console.log('🔧 Qdrant 컬렉션 초기화 중...');
  await initializeCollection();
  console.log('✅ 컬렉션 준비 완료.\n');

  // 3. 질문들을 임베딩 (배치 처리)
  console.log('🧮 임베딩 생성 중...');
  const questions = qaPairs.map((qa) => qa.question);
  const embeddings = await getEmbeddings(questions);
  console.log(`✅ ${embeddings.length}개의 임베딩 생성 완료.\n`);

  // 4. 벡터 포인트 생성
  console.log('📦 벡터 포인트 생성 중...');
  const points: VectorPoint[] = qaPairs.map((qa, index) => ({
    id: generateId(qa.question),
    vector: embeddings[index],
    payload: {
      question: qa.question,
      answer: qa.answer,
    },
  }));
  console.log(`✅ ${points.length}개의 벡터 포인트 생성 완료.\n`);

  // 5. Qdrant에 업서트
  console.log('💾 Qdrant에 업로드 중...');
  await upsertVectors(points);
  console.log('✅ 업로드 완료!\n');

  console.log('🎉 모든 작업이 완료되었습니다!');
}

// 스크립트 실행
main().catch((error) => {
  console.error('❌ 오류 발생:', error);
  process.exit(1);
});

