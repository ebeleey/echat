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
 * Excel 파일에서 Q&A 데이터 읽기
 * 형식: 1행에 Question, Answer 두 열, 2행부터 질문과 답변
 */
function readQADataset(filePath: string): QAPair[] {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    console.log(`📄 시트 이름: ${sheetName}`);
    
    // 첫 번째 행을 헤더로 사용하여 객체 배열로 읽기
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: ['Question', 'Answer'], // 1행을 헤더로 사용
      defval: null, // 빈 셀은 null로 처리
    }) as Array<{ Question?: string; Answer?: string }>;

    console.log(`📊 총 ${data.length}행 읽음 (헤더 제외)`);
    
    // 처음 몇 행 출력해서 구조 파악
    for (let i = 0; i < Math.min(5, data.length); i++) {
      console.log(`📋 행 ${i + 1}:`, {
        Question: data[i].Question?.substring(0, 50) || '(비어있음)',
        Answer: data[i].Answer?.substring(0, 50) || '(비어있음)',
      });
    }

    const qaPairs: QAPair[] = [];

    if (data.length === 0) {
      console.warn('⚠️ Excel 파일에 데이터가 없습니다.');
      return qaPairs;
    }

    // 데이터 파싱
    let parsedCount = 0;
    let skippedCount = 0;
    
    console.log(`\n📝 데이터 읽기 시작...\n`);
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const question = row.Question ? String(row.Question).trim() : '';
      const answer = row.Answer ? String(row.Answer).trim() : '';

      // 질문과 답변이 모두 있어야 함
      if (!question || !answer) {
        skippedCount++;
        console.log(`   ⚠️ 행 ${i + 2} 건너뜀: 질문 또는 답변이 비어있음`);
        continue;
      }

      qaPairs.push({
        question,
        answer,
      });
      parsedCount++;
      
      if (parsedCount <= 5 || parsedCount % 10 === 0) {
        console.log(`   ✅ 행 ${i + 2} 파싱 성공: Q="${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`);
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

