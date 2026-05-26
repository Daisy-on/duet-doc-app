import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Workbench from './pages/Workbench';
import KnowledgeBaseHome from './pages/KnowledgeBaseHome';
import DocEdit from './pages/DocEdit';
import AIWriting from './pages/AIWriting';
import MemoHome from './pages/MemoHome';
import MemoEdit from './pages/MemoEdit';
import Favorites from './pages/Favorites';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Workbench />} />
          <Route path="kb/:kbId" element={<KnowledgeBaseHome />} />
          <Route path="kb/:kbId/doc/:docId" element={<DocEdit />} />
          <Route path="ai-writing" element={<AIWriting />} />
          <Route path="ai-writing/:sessionId" element={<AIWriting />} />
          <Route path="memo" element={<MemoHome />} />
          <Route path="memo/:memoId" element={<MemoEdit />} />
          <Route path="favorites" element={<Favorites />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
