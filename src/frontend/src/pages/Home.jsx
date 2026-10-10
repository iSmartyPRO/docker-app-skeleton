import { Link } from 'react-router-dom';
import { Card, Col, Row, Statistic, Steps, Tag, Typography } from 'antd';
import PublicLayout from '../layouts/PublicLayout';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { can } from '../lib/access';

const { Title, Paragraph } = Typography;

export default function Home() {
  const { t, dict } = useLocale();
  const { user } = useAuth();
  const { settings } = useSettings();
  const landing = dict.landing;

  return (
    <PublicLayout>
      <section className="hero">
        <p className="hero__kicker">{t('landing.kicker')}</p>
        <Title className="hero__title">{settings?.appName || t('brand')}</Title>
        <Paragraph className="hero__lead">
          {settings?.appDescription || t('landing.title')}
        </Paragraph>
        <Paragraph className="hero__sub">{t('landing.subtitle')}</Paragraph>
        <div className="hero__cta">
          {user ? (
            <>
              <Link className="btn btn--primary" to="/account">
                {t('landing.ctaAccount')}
              </Link>
              {can(user, 'console.access') && (
                <Link className="btn btn--ghost" to="/admin">
                  {t('landing.ctaAdmin')}
                </Link>
              )}
            </>
          ) : (
            <Link className="btn btn--primary" to="/login">
              {t('landing.ctaLogin')}
            </Link>
          )}
        </div>
      </section>

      <Row gutter={[16, 16]} className="stats-row">
        {landing.stats.map((item) => (
          <Col xs={12} md={6} key={item.label}>
            <Card className="panel-card" variant="borderless">
              <Statistic title={item.label} value={item.value} />
            </Card>
          </Col>
        ))}
      </Row>

      <section className="section">
        <Title level={2}>{t('landing.featuresTitle')}</Title>
        <Row gutter={[16, 16]}>
          {landing.features.map((item) => (
            <Col xs={24} md={12} key={item.title}>
              <Card className="panel-card" variant="borderless" title={item.title}>
                <Paragraph type="secondary">{item.text}</Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </section>

      <section className="section">
        <Title level={2}>{t('landing.antdTitle')}</Title>
        <Paragraph type="secondary">{t('landing.antdLead')}</Paragraph>
        <Card className="panel-card" variant="borderless">
          <Steps
            current={2}
            items={[
              { title: t('setup.database') },
              { title: t('setup.admin') },
              { title: t('setup.access') },
              { title: t('setup.done') },
            ]}
          />
          <div className="tag-row">
            <Tag color="gold">Ant Design</Tag>
            <Tag color="default">PostgreSQL</Tag>
            <Tag>Express</Tag>
            <Tag>i18n</Tag>
          </div>
        </Card>
      </section>
    </PublicLayout>
  );
}
