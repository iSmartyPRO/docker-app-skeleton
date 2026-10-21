import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { App, Button, Checkbox, Input, Skeleton, Switch, Tabs } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import ModuleHeader from '../../shared/ModuleHeader';
import { qrApi, templateText } from '../api';
import Designer from '../components/Designer';
import Preview from '../components/Preview';
import { encodeContent } from '../engine/encode';
import { DEFAULT_DESIGN, mergeDesign } from '../engine/render';
import { useQr } from '../QrContext';

const LOCKS = ['colors', 'shape', 'logo', 'frame'];

/** Sample contents: a template is judged on a short link and on a dense business card. */
const SAMPLES = {
  url: () => 'https://example.com/welcome',
  vcard: (t) =>
    encodeContent('vcard', { firstName: t('qr.sample.firstName'), lastName: t('qr.sample.lastName'), org: t('qr.sample.org'), title: t('qr.sample.title'), mobile: '+996 555 123 456', email: 'aida@example.com', website: 'example.com' }),
  wifi: () => encodeContent('wifi', { ssid: 'Example-Guest', password: 'welcome-2026', security: 'WPA' }),
};

/** /app/qr/templates/new and /app/qr/templates/:id — names, locks and the look of a template. */
export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, languages, portalDefault, locale } = useLocale();
  const { message } = App.useApp();
  const qr = useQr();
  const [state, setState] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState('url');
  const primary = portalDefault || locale;

  useEffect(() => {
    if (!qr.ready || !qr.canManage) return;
    const blank = { i18n: {}, design: mergeDesign(DEFAULT_DESIGN), locks: {}, active: true };
    if (!id) {
      setState(blank);
      setSaved(JSON.stringify(blank));
      return;
    }
    qrApi
      .templates()
      .then((res) => {
        const found = res.data.templates.find((item) => String(item.id) === id);
        if (!found) {
          navigate('/app/qr/templates', { replace: true });
          return;
        }
        const i18n = { ...found.i18n };
        if (!i18n[primary]?.name) i18n[primary] = { name: found.name, description: found.description, ...(i18n[primary] || {}) };
        const next = { ...found, i18n, design: mergeDesign(found.design) };
        setState(next);
        setSaved(JSON.stringify(next));
      })
      .catch((err) => message.error(errorMessage(err)));
  }, [id, qr.ready, qr.canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = state && saved !== JSON.stringify(state);
  const text = state ? templateText({ ...state, name: state.i18n?.[primary]?.name || '' }, locale) : null;
  const payload = useMemo(() => SAMPLES[sample](t), [sample, t]);

  if (qr.ready && !qr.canManage) return <Navigate to="/app/qr" replace />;

  const setText = (lang, key, value) => setState((current) => ({ ...current, i18n: { ...current.i18n, [lang]: { ...(current.i18n[lang] || {}), [key]: value } } }));
  const name = state ? state.i18n?.[primary]?.name || Object.values(state.i18n || {}).find((entry) => entry?.name)?.name || '' : '';

  const save = async () => {
    if (!name.trim()) {
      message.warning(t('qr.templates.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const body = { name: name.trim(), description: state.i18n?.[primary]?.description || '', i18n: state.i18n, design: state.design, locks: state.locks, active: state.active };
      const res = state.id ? await qrApi.updateTemplate(state.id, body) : await qrApi.createTemplate(body);
      await qr.refresh();
      message.success(t('qr.templates.saved'));
      const next = { ...state, ...res.data.template, i18n: state.i18n, design: mergeDesign(res.data.template.design) };
      setState(next);
      setSaved(JSON.stringify(next));
      if (!state.id) navigate(`/app/qr/templates/${res.data.template.id}`, { replace: true });
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const title = state ? text?.name || name || t('qr.templates.newTitle') : null;

  return (
    <div className="qr-page">
      <ModuleHeader
        crumbs={[
          { key: 'root', label: t('apps.qr.name'), to: '/app/qr' },
          { key: 'templates', label: t('qr.templates.title'), to: '/app/qr/templates' },
          { key: 'cur', label: title || '…' },
        ]}
        icon={<MenuIcon name="qr" />}
        title={title}
        titleExtra={dirty ? <span className="qr-dirty">{t('qr.studio.unsaved')}</span> : null}
        actions={[{ key: 'save', primary: true, icon: <SaveOutlined />, label: t('common.save'), onClick: save, loading: saving, disabled: !state }]}
      />
      {!state ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <div className="qr-studio">
          <div className="qr-studio__main">
            <section className="qr-step">
              <header className="qr-step__head">
                <span className="qr-step__n">1</span>
                <div>
                  <h2>{t('qr.templates.aboutTitle')}</h2>
                  <p>{t('qr.templates.aboutHint')}</p>
                </div>
              </header>
              <Tabs
                size="small"
                items={languages.map(({ code, name: native }) => ({
                  key: code,
                  label: `${native || code.toUpperCase()}${code === primary ? ' ★' : ''}`,
                  children: (
                    <div className="qr-form">
                      <label className="qr-field is-wide">
                        <span className="qr-field__label">{t('qr.templates.name')}</span>
                        <Input value={state.i18n?.[code]?.name || ''} maxLength={80} onChange={(event) => setText(code, 'name', event.target.value)} placeholder={code === primary ? t('qr.templates.namePlaceholder') : name} />
                      </label>
                      <label className="qr-field is-wide">
                        <span className="qr-field__label">{t('qr.templates.description')}</span>
                        <Input.TextArea value={state.i18n?.[code]?.description || ''} maxLength={300} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => setText(code, 'description', event.target.value)} />
                      </label>
                    </div>
                  ),
                }))}
              />
              <div className="qr-locks" data-tour="qr.locks">
                <div className="qr-locks__head">
                  <strong>{t('qr.templates.locksTitle')}</strong>
                  <p>{t('qr.templates.locksHint')}</p>
                </div>
                {LOCKS.map((key) => (
                  <Checkbox key={key} checked={Boolean(state.locks?.[key])} onChange={(event) => setState((current) => ({ ...current, locks: { ...current.locks, [key]: event.target.checked } }))}>
                    <strong>{t(`qr.locks.${key}`)}</strong> <span className="qr-muted">— {t(`qr.locks.${key}Desc`)}</span>
                  </Checkbox>
                ))}
              </div>
              <label className="qr-inline__switch">
                <Switch size="small" checked={state.active} disabled={state.isDefault} onChange={(active) => setState((current) => ({ ...current, active }))} /> {t('qr.templates.activeLabel')}
              </label>
            </section>
            <section className="qr-step">
              <header className="qr-step__head">
                <span className="qr-step__n">2</span>
                <div>
                  <h2>{t('qr.studio.designTitle')}</h2>
                  <p>{t('qr.templates.designHint')}</p>
                </div>
              </header>
              <Designer design={state.design} onChange={(design) => setState((current) => ({ ...current, design }))} admin type={sample} />
            </section>
          </div>
          <div className="qr-studio__side">
            <Preview
              payload={payload}
              design={state.design}
              name={name || 'qr-template'}
              footer={
                <div className="qr-preview__name">
                  <label>{t('qr.templates.sample')}</label>
                  <Segmented block value={sample} onChange={setSample} options={Object.keys(SAMPLES).map((key) => ({ value: key, label: t(`qr.types.${key}.name`) }))} />
                  <Button type={dirty ? 'primary' : 'default'} block size="large" icon={<SaveOutlined />} loading={saving} onClick={save}>
                    {t('qr.templates.saveTemplate')}
                  </Button>
                </div>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
