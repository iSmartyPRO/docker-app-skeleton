import Chrome from '../components/Chrome';
import AppFooter from '../components/AppFooter';

export default function PublicLayout({ children }) {
  return (
    <div className="shell">
      <Chrome />
      <main className="shell__main">{children}</main>
      <AppFooter />
    </div>
  );
}
