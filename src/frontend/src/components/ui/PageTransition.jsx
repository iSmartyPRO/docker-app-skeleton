import { useLocation } from 'react-router-dom';

/**
 * Re-mounts its children on navigation so the page plays the `page-in`
 * entrance (see index.css → Motion). `id` overrides the default key
 * (the pathname) when a whole section should animate as one page.
 */
export default function PageTransition({ id, children }) {
  const { pathname } = useLocation();
  return (
    <div key={id ?? pathname} className="page-transition">
      {children}
    </div>
  );
}
