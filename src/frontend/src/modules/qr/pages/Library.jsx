import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Button, Dropdown, Empty, Skeleton, Tag, Tooltip } from 'antd';
import { AppstoreOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, MoreOutlined, PlusOutlined, ThunderboltFilled } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';
import ModuleHeader from '../../shared/ModuleHeader';
import { qrApi } from '../api';
import { TYPE_META, typeIcon } from '../components/ContentForm';
import { useExport } from '../components/Preview';
import QrCode from '../components/QrCode';
import { payloadFor, summarize } from '../engine/encode';
import { useQr } from '../QrContext';

const QUICK = ['url', 'vcard', 'wifi', 'whatsapp', 'email', 'event'];

function CodeCard({ code, onDelete, onDuplicate }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const result = useRef(null);
  const run = useExport(code.name);
  const payload = payloadFor(code, window.location.origin);
  const onResult = useCallback((value) => {
    result.current = value;
  }, []);
  return (
    <article className="qr-card">
      <Link to={`/app/qr/${code.id}`} className="qr-card__thumb" aria-label={code.name}>
        <QrCode payload={payload} design={code.design} onResult={onResult} label={code.name} />
      </Link>
      <div className="qr-card__body">
        <div className="qr-card__top">
          <span className={`qr-type__icon is-${code.type} is-small`}>{typeIcon(code.type)}</span>
          <span className="qr-card__type">{t(`qr.types.${code.type}.name`)}</span>
          {code.dynamic && (
            <Tooltip title={code.active ? t('qr.dynamic.title') : t('qr.dynamic.paused')}>
              <Tag bordered={false} className={`qr-badge${code.active ? ' is-dynamic' : ' is-paused'}`}>
                <ThunderboltFilled /> {t('qr.library.scansN', { count: code.scans })}
              </Tag>
            </Tooltip>
          )}
        </div>
        <Link to={`/app/qr/${code.id}`} className="qr-card__name">
          {code.name}
        </Link>
        <span className="qr-card__summary">{summarize(code.type, code.content) || '—'}</span>
        <div className="qr-card__foot">
          <span className="qr-muted">{formatRelative(code.updatedAt, locale)}</span>
          <span className="qr-card__actions">
            <Tooltip title={t('qr.export.png')}>
              <Button type="text" size="small" icon={<DownloadOutlined />} aria-label={t('qr.export.png')} onClick={() => run(result.current, 'png', 1024)} />
            </Tooltip>
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: [
                  { key: 'edit', icon: <EditOutlined />, label: t('common.edit'), onClick: () => navigate(`/app/qr/${code.id}`) },
                  { key: 'svg', icon: <DownloadOutlined />, label: t('qr.export.svg'), onClick: () => run(result.current, 'svg') },
                  { key: 'png4', icon: <DownloadOutlined />, label: t('qr.export.pngSize', { px: 4096 }), onClick: () => run(result.current, 'png', 4096) },
                  { key: 'dup', icon: <CopyOutlined />, label: t('qr.library.duplicate'), onClick: () => onDuplicate(code) },
                  { type: 'divider' },
                  { key: 'del', icon: <DeleteOutlined />, danger: true, label: t('common.delete'), onClick: () => onDelete(code) },
                ],
              }}
            >
              <Button type="text" size="small" icon={<MoreOutlined />} aria-label={t('moduleHeader.more')} />
            </Dropdown>
          </span>
        </div>
      </div>
    </article>
  );
}

/** /app/qr — the person's codes, quick start by type. */
export default function Library() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const qr = useQr();
  const [codes, setCodes] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await qrApi.codes();
      setCodes(res.data.codes);
    } catch (err) {
      message.error(errorMessage(err));
      setCodes([]);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (codes || []).filter((code) => {
      if (filter === 'dynamic' && !code.dynamic) return false;
      if (filter !== 'all' && filter !== 'dynamic' && code.type !== filter) return false;
      if (!needle) return true;
      return `${code.name} ${summarize(code.type, code.content)}`.toLowerCase().includes(needle);
    });
  }, [codes, search, filter]);

  const types = useMemo(() => [...new Set((codes || []).map((code) => code.type))], [codes]);

  const remove = (code) =>
    modal.confirm({
      title: t('qr.library.deleteTitle', { name: code.name }),
      content: code.dynamic ? t('qr.library.deleteDynamic') : t('qr.library.deleteText'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        await qrApi.remove(code.id);
        setCodes((list) => list.filter((entry) => entry.id !== code.id));
      },
    });

  const duplicate = async (code) => {
    try {
      const res = await qrApi.create({ name: t('qr.library.copyName', { name: code.name }), type: code.type, content: code.content, templateId: code.templateId, design: code.design, dynamic: false });
      setCodes((list) => [res.data.code, ...list]);
      message.success(t('qr.library.duplicated'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const empty = codes && codes.length === 0;

  return (
    <div className="qr-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.qr.name') }]}
        icon={<MenuIcon name="qr" />}
        title={t('apps.qr.name')}
        description={t('qr.library.lead')}
        actions={[
          qr.canManage && { key: 'templates', icon: <AppstoreOutlined />, label: t('qr.templates.title'), onClick: () => navigate('/app/qr/templates') },
          {
            key: 'new',
            primary: true,
            icon: <PlusOutlined />,
            label: t('qr.library.create'),
            onClick: () => navigate('/app/qr/new'),
            menu: TYPE_META.map((meta) => ({ key: meta.id, icon: meta.icon, label: t(`qr.types.${meta.id}.name`), onClick: () => navigate(`/app/qr/new?type=${meta.id}`) })),
          },
        ]}
        search={codes && codes.length > 0 ? { value: search, onChange: setSearch, onSearch: setSearch, placeholder: t('qr.library.search') } : undefined}
        filters={
          codes && codes.length > 0 ? (
            <Segmented
              size="small"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('qr.library.all') },
                ...(codes.some((code) => code.dynamic) ? [{ value: 'dynamic', label: t('qr.library.dynamic') }] : []),
                ...types.map((type) => ({ value: type, label: t(`qr.types.${type}.name`) })),
              ]}
            />
          ) : null
        }
        status={codes && codes.length > 0 ? t('qr.library.countN', { count: shown.length }) : null}
      />

      <section className="qr-quick" data-tour="qr.quick">
        {QUICK.map((type) => {
          const meta = TYPE_META.find((entry) => entry.id === type);
          return (
            <Link key={type} to={`/app/qr/new?type=${type}`} className="qr-quick__item">
              <span className={`qr-type__icon is-${type}`}>{meta.icon}</span>
              <span>
                <strong>{t(`qr.types.${type}.name`)}</strong>
                <small>{t(`qr.types.${type}.desc`)}</small>
              </span>
            </Link>
          );
        })}
      </section>

      {!codes ? (
        <div className="qr-grid">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="qr-card is-loading">
              <Skeleton.Image active />
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : empty ? (
        <div className="qr-empty">
          <div className="qr-empty__art">
            <QrCode payload="https://example.com/hello" design={qr.defaultTemplate?.design} />
          </div>
          <h2>{t('qr.library.emptyTitle')}</h2>
          <p>{t('qr.library.emptyText')}</p>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => navigate('/app/qr/new')}>
            {t('qr.library.createFirst')}
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <Empty description={t('qr.library.nothingFound')} />
      ) : (
        <div className="qr-grid">
          {shown.map((code) => (
            <CodeCard key={code.id} code={code} onDelete={remove} onDuplicate={duplicate} />
          ))}
        </div>
      )}
    </div>
  );
}
