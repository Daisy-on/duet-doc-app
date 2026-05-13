import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

export default function MainLayout() {
  return (
    <div className="design-canvas bg-bg-main">
      <Sidebar />
      <div className="flex-1 flex overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
