import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

const NO_FOOTER = ['/login', '/register'];

const PublicLayout = () => {
  const { pathname } = useLocation();
  const showFooter = !NO_FOOTER.includes(pathname);

  return (
    <>
      <Navbar />
      <Outlet />
      {showFooter && <Footer />}
    </>
  );
};

export default PublicLayout;
