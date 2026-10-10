import { Link } from 'react-router-dom';
import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

/**
 * Consistent page heading: optional back link / eyebrow, title, lead text and
 * right-aligned actions. Every admin and cabinet screen starts with it.
 */
export default function PageHeader({ title, description, eyebrow, back, icon, extra }) {
  return (
    <header className="page-header">
      {(back || eyebrow) && (
        <div className="page-header__eyebrow">
          {back ? (
            <Link to={back.to} className="page-header__back">
              <span aria-hidden="true">←</span> {back.label}
            </Link>
          ) : (
            eyebrow
          )}
        </div>
      )}
      <div className="page-header__row">
        <div className="page-header__text">
          <div className="page-header__title">
            {icon && <span className="page-header__icon">{icon}</span>}
            <Title level={2}>{title}</Title>
          </div>
          {description && <Paragraph className="page-header__lead">{description}</Paragraph>}
        </div>
        {extra && <div className="page-header__extra">{extra}</div>}
      </div>
    </header>
  );
}
