import { useCallback, useEffect, useState } from 'react';
import { Checkbox, Select, Table, Tag } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader from '../../shared/ModuleHeader';
import { Link } from 'react-router-dom';
import { DIRECTORY_ROOT, adApi, adError, objectUrl } from '../api';
import { DateText, KindIcon } from '../components/Bits';

const ACTIONS = ['user_create', 'attributes', 'move', 'enable', 'disable', 'unlock', 'password_reset', 'member_add', 'member_remove', 'portal_user', 'portal_link', 'portal_unlink', 'employee_link', 'employee_unlink'];

function Details({ item }) {
  const { t } = useLocale();
  const d = item.details || {};
  if (item.action === 'attributes') return <span className="ad-muted">{(d.changes || []).map((change) => t(`directory.attr.${change.type}`)).join(', ')}</span>;
  if (item.action === 'move') return <span className="ad-muted">→ {String(d.to || '').split(/,(?=[A-Za-z]+=)/).slice(1, 2).join('').replace(/^OU=/i, '')}</span>;
  if (item.action === 'member_add' || item.action === 'member_remove') return <span className="ad-muted">{d.group?.name}</span>;
  if (item.action === 'password_reset') return <span className="ad-muted">{d.mustChange ? t('directory.status.mustChange') : ''}</span>;
  if (item.action === 'user_create') return <span className="ad-muted">{[d.login, d.enabled ? t('directory.status.enabled') : t('directory.status.disabled')].filter(Boolean).join(' · ')}</span>;
  if (item.action.startsWith('portal')) return <span className="ad-muted">@{d.username}</span>;
  return null;
}

/** Every change made through the module: who, as which AD account, what, the result. */
export default function Journal() {
  const { t } = useLocale();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [actions, setActions] = useState([]);
  const [failed, setFailed] = useState(false);
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await adApi.journal({ q: query || undefined, actions: actions.join(',') || undefined, result: failed ? 'failed' : undefined, mine: mine ? '1' : undefined, page, pageSize: 50 });
      setData(res);
      setError(null);
    } catch (err) {
      setError(adError(err, t));
    } finally {
      setLoading(false);
    }
  }, [query, actions, failed, mine, page, t]);
  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: 'at', title: t('directory.journal.at'), width: 170, render: (_, item) => <DateText value={item.at} time /> },
    {
      key: 'action',
      title: t('directory.journal.actionCol'),
      render: (_, item) => (
        <span>
          {t(`directory.journal.action.${item.action}`)} {item.demo && <Tag className="ad-tag ad-tag--demo">{t('directory.demoBadge')}</Tag>}
        </span>
      ),
    },
    {
      key: 'target',
      title: t('directory.journal.target'),
      render: (_, item) =>
        item.target ? (
          <Link to={objectUrl(item.target.dn)} className="ad-cell-name">
            <KindIcon kind={item.target.kind} /> {item.target.name}
          </Link>
        ) : null,
    },
    { key: 'details', title: t('directory.journal.details'), responsive: ['lg'], render: (_, item) => <Details item={item} /> },
    { key: 'who', title: t('directory.journal.who'), responsive: ['md'], render: (_, item) => <span>{item.user}{item.adAccount && <span className="ad-muted"> · {t('directory.journal.as', { account: item.adAccount })}</span>}</span> },
    { key: 'result', title: t('directory.journal.result'), render: (_, item) => <Tag color={item.ok ? (item.outcome === 'unchanged' ? 'default' : item.outcome === 'partial' ? 'orange' : 'green') : 'red'}>{item.ok ? t(`directory.outcome.${item.outcome}`) : t(`directory.errors.${item.errorCode}`) !== `directory.errors.${item.errorCode}` ? t(`directory.errors.${item.errorCode}`) : t('directory.outcome.failed')}</Tag> },
  ];

  return (
    <div>
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.directory.name'), to: DIRECTORY_ROOT }, { key: 'j', label: t('directory.journal.title') }]}
        icon={<HistoryOutlined />}
        title={t('directory.journal.title')}
        description={t('directory.journal.lead')}
        search={{ value: q, onChange: setQ, onSearch: (value) => { setPage(1); setQuery(value.trim()); }, placeholder: t('directory.journal.search') }}
        filters={
          <div className="ad-filters">
            <Select mode="multiple" allowClear maxTagCount="responsive" className="ad-flag-select" value={actions} onChange={(value) => { setPage(1); setActions(value); }} placeholder={t('directory.journal.allActions')} options={ACTIONS.map((action) => ({ value: action, label: t(`directory.journal.action.${action}`) }))} />
            <Checkbox checked={failed} onChange={(event) => { setPage(1); setFailed(event.target.checked); }}>{t('directory.journal.failedOnly')}</Checkbox>
            <Checkbox checked={mine} onChange={(event) => { setPage(1); setMine(event.target.checked); }}>{t('directory.journal.mine')}</Checkbox>
          </div>
        }
        status={data ? t('directory.itemsN', { n: data.total }) : null}
      />
      {error && <div className="ad-error">{error}</div>}
      <Table className="ad-table" size="middle" rowKey="id" loading={loading} dataSource={data?.items || []} columns={columns} pagination={data && data.total > data.pageSize ? { current: page, pageSize: data.pageSize, total: data.total, showSizeChanger: false, onChange: setPage } : false} />
    </div>
  );
}
