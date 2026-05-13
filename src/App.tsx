import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Workbench from './pages/Workbench';
import Edit from './pages/Edit';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Workbench />} />
          <Route path="edit" element={<Edit />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
