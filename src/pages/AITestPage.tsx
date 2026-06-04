import { testTextGeneration } from '../ai-test.ts';
export default function AITestPage() {
  return (
    <div>
      <h1>AI 测试页面</h1>
      <button onClick={() => testTextGeneration()}>
        🧪 测试 AI 推理
      </button>
    </div>
  );
}
