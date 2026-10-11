import { useEffect, useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import api from '../../../services/api';

/** 🔔 Follow a project: new and completed tasks reach you as notifications. */
export default function FollowButton({ projectId }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get('/account/notifications/subscriptions')
      .then((res) => setOn(res.data.subscriptions.some((item) => item.type === 'tasks.project' && item.id === projectId)))
      .catch(() => {});
  }, [projectId]);
  const toggle = async () => {
    setBusy(true);
    try {
      await api.put('/account/notifications/subscriptions', { type: 'tasks.project', id: projectId, on: !on });
      setOn(!on);
      message.success(on ? t('tasks.v2.follow.off') : t('tasks.v2.follow.on'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tooltip title={t(on ? 'tasks.v2.follow.hintOn' : 'tasks.v2.follow.hintOff')}>
      <Button onClick={toggle} loading={busy} type={on ? 'primary' : 'default'} ghost={on}>
        {on ? '🔔' : '🔕'} {t(on ? 'tasks.v2.follow.following' : 'tasks.v2.follow.follow')}
      </Button>
    </Tooltip>
  );
}
