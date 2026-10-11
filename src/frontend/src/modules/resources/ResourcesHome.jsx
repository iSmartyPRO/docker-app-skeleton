import PublicLayout from '../../layouts/PublicLayout';
import ResourceBoard from './components/ResourceBoard';
import './resources.css';

/** "/" when the home page is set to Online resources: public tiles for guests, personal ones for employees. */
export default function ResourcesHome() {
  return (
    <PublicLayout>
      <div className="rs-shell">
        <ResourceBoard variant="home" />
      </div>
    </PublicLayout>
  );
}
