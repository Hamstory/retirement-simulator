import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const [id, file, name] of [
  ['REG-001', 'test-planner.cjs', '기존 연간 계산과 인출 우선순위'],
  ['REG-002', 'test-records.cjs', '이름 있는 기록 저장·복원·실패 보호'],
  ['REG-003', 'test-stress.cjs', '기존 연간 확률 경로와 순서 위험'],
  ['REG-004', 'test-stress-ui.cjs', '스트레스 실행·무효화·취소·CSV'],
  ['REG-005', 'test-budget-allocation.cjs', '연도별 안전자산·생활비 항목·수익률 표시'],
  ['REG-006', 'test-buffer.cjs', '월별 자금 조달·세 보충 전략·추가 자산'],
]) {
  test(`${id} ${name}`, { timeout: 30000 }, () => {
    execFileSync(process.execPath, [`tests/regression/${file}`], { cwd: root, timeout: 25000, stdio: 'pipe' });
  });
}
