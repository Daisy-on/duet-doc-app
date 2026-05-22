import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Workbench from './pages/Workbench';
import KnowledgeBaseHome from './pages/KnowledgeBaseHome';
import DocEdit from './pages/DocEdit';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Workbench />} />
          <Route path="kb/:kbId" element={<KnowledgeBaseHome />} />
          <Route path="kb/:kbId/doc/:docId" element={<DocEdit />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
