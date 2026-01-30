import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from '@/components/app/Sidebar';

const AppLayout = () => {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Noise overlay */}
      <div className="noise-overlay" />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <Outlet />
      </motion.div>
    </div>
  );
};

export default AppLayout;
