import { useEffect, useState } from 'react';
import { Button, Card } from 'antd';
import { api, useLocale } from '@portal/sdk';

export default function HelloApp() {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/app/hello/ping').then((res) => setData(res.data)).catch(() => setData({ pong: '—' }));
  }, []);
  return (
    <Card title={t('hello.title')} style={{ margin: 24 }}>
      <p>{data ? data.pong : '…'}</p>
      <Button type="primary" onClick={() => window.location.reload()}>
        {t('hello.reload')}
      </Button>
    </Card>
  );
}
