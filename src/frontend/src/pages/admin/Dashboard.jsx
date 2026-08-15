import { Card, Col, Row, Statistic, Typography } from 'antd';
import { useSettings } from '../../context/SettingsContext';
import { useLocale } from '../../context/LocaleContext';

const { Title, Paragraph } = Typography;

export default function AdminDashboard() {
  const { t } = useLocale();
  const { settings } = useSettings();
  const integrations = settings?.integrations || {};

  return (
    <div>
      <Title level={2}>{t('admin.dashboard')}</Title>
      <Paragraph type="secondary">{t('admin.dashboardLead')}</Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="panel-card" bordered={false}>
            <Statistic title={t('admin.accessMode')} value={settings?.accessMode || 'closed'} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="panel-card" bordered={false}>
            <Statistic
              title={t('admin.template')}
              value={settings?.appearance?.template || 'navy'}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="panel-card" bordered={false}>
            <Statistic
              title={t('admin.integrations')}
              value={Object.values(integrations).filter((item) => item?.enabled).length}
              suffix="/ 4"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
