import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Input, Skeleton, Switch, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined, LinkOutlined, SaveOutlined, ThunderboltFilled } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import ModuleHeader from '../../shared/ModuleHeader';
import { qrApi } from '../api';
import ContentForm from '../components/ContentForm';
import Designer from '../components/Designer';
import { TemplateGallery, TypePicker } from '../components/Pickers';
import Preview from '../components/Preview';
import ScanStats from '../components/ScanStats';
import { encodeContent, summarize } from '../engine/encode';
import { DEFAULT_DESIGN, mergeDesign } from '../engine/render';
import { useQr } from '../QrContext';

const clone = (value) => JSON.parse(JSON.stringify(value));
const PLACEHOLDER_SLUG = 'Xk7pQ2m';

function Step({ n, title, hint, children, extra, tour }) {
  return (
    <section className="qr-step" data-tour={tour}>
      <header className="qr-step__head">
        <span className="qr-step__n">{n}</span>
        <div>
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
        {extra && <div className="qr-step__extra">{extra}</div>}
      </header>
      {children}
    </section>
  );
}

function initialState(type, template) {
  return {
    id: null,
    name: '',
    type,
    contents: { [type]: type === 'wifi' ? { security: 'WPA' } : {} },
    templateId: template?.id ?? null,
    design: mergeDesign(clone(template?.design || DEFAULT_DESIGN)),
    dynamic: false,
    active: true,
    slug: null,
  };
}

function fromCode(code) {
  return {
    id: code.id,
    name: code.name,
    type: code.type,
    contents: { [code.type]: code.content || {} },
    templateId: code.templateId,
    design: mergeDesign(code.design),
    dynamic: code.dynamic,
    active: code.active,
    slug: code.slug,
    scans: code.scans,
  };
}

/** /app/qr/new and /app/qr/:id — content, template and design with the live preview. */
export default function Studio() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const qr = useQr();
  const [state, setState] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load the code, or start a new one from the default template.
  useEffect(() => {
    if (!qr.ready) return;
    if (!id) {
      const type = params.get('type') || 'url';
      const next = initialState(type, qr.defaultTemplate);
      setState(next);
      setSaved(JSON.stringify(next));
      return;
    }
    let alive = true;
    qrApi
      .code(id)
      .then((res) => {
        if (!alive) return;
        const next = fromCode(res.data.code);
        setState(next);
        setSaved(JSON.stringify(next));
      })
      .catch((err) => {
        message.error(errorMessage(err));
        navigate('/app/qr', { replace: true });
      });
    return () => {
      alive = false;
    };
  }, [id, qr.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = state && saved !== JSON.stringify(state);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const patch = useCallback((change) => setState((current) => ({ ...current, ...change })), []);
  const content = state?.contents[state.type] || {};
  const template = qr.templates.find((entry) => entry.id === state?.templateId) || null;
  const lockAll = !qr.canManage && !qr.settings.allowCustom;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const isDynamic = Boolean(state?.dynamic && state.type === 'url');
  const target = state ? encodeContent(state.type, content) : '';
  const payload = isDynamic ? (target ? `${origin}/q/${state.slug || PLACEHOLDER_SLUG}` : '') : target;
  const galleryTemplates = qr.activeTemplates;
  const shortLink = state?.slug ? `${origin}/q/${state.slug}` : '';

  const setContent = (change) => setState((current) => ({ ...current, contents: { ...current.contents, [current.type]: { ...(current.contents[current.type] || {}), ...change } } }));
  const setType = (type) => setState((current) => ({ ...current, type, contents: { ...current.contents, [type]: current.contents[type] || (type === 'wifi' ? { security: 'WPA' } : {}) } }));
  const pickTemplate = (picked) => patch({ templateId: picked.id, design: mergeDesign(clone(picked.design)) });

  const save = async () => {
    if (!target) {
      message.warning(t('qr.studio.fillContent'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: state.name.trim() || summarize(state.type, content).slice(0, 120) || t(`qr.types.${state.type}.name`),
        type: state.type,
        content,
        templateId: state.templateId,
        design: state.design,
        dynamic: isDynamic,
        active: state.active,
      };
      const res = state.id ? await qrApi.update(state.id, body) : await qrApi.create(body);
      const next = fromCode(res.data.code);
      next.contents = { ...state.contents, [next.type]: next.contents[next.type] };
      setState(next);
      setSaved(JSON.stringify(next));
      message.success(t('qr.studio.saved'));
      if (!state.id) navigate(`/app/qr/${res.data.code.id}`, { replace: true });
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    modal.confirm({
      title: t('qr.library.deleteTitle', { name: state.name }),
      content: isDynamic ? t('qr.library.deleteDynamic') : t('qr.library.deleteText'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        await qrApi.remove(state.id);
        setSaved(JSON.stringify(state));
        navigate('/app/qr', { replace: true });
      },
    });

  const duplicate = async () => {
    try {
      const res = await qrApi.create({ name: t('qr.library.copyName', { name: state.name }), type: state.type, content, templateId: state.templateId, design: state.design, dynamic: false });
      navigate(`/app/qr/${res.data.code.id}`);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shortLink);
      message.success(t('qr.studio.linkCopied'));
    } catch {
      /* clipboard unavailable */
    }
  };

  const title = state ? state.name || (state.id ? t(`qr.types.${state.type}.name`) : t('qr.studio.newTitle')) : null;

  return (
    <div className="qr-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.qr.name'), to: '/app/qr' }, { key: 'cur', label: title || '…' }]}
        icon={<MenuIcon name="qr" />}
        title={title}
        titleExtra={dirty ? <span className="qr-dirty">{t('qr.studio.unsaved')}</span> : null}
        actions={[
          { key: 'save', primary: true, icon: <SaveOutlined />, label: t('common.save'), onClick: save, loading: saving, disabled: !state },
        ]}
        more={
          state?.id
            ? [
                { key: 'duplicate', icon: <CopyOutlined />, label: t('qr.library.duplicate'), onClick: duplicate },
                { type: 'divider' },
                { key: 'delete', danger: true, icon: <DeleteOutlined />, label: t('common.delete'), onClick: remove },
              ]
            : undefined
        }
      />

      {!state ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <div className="qr-studio">
          <div className="qr-studio__main">
            <Step n="1" title={t('qr.studio.contentTitle')} hint={t('qr.studio.contentHint')} tour="qr.content">
              <TypePicker value={state.type} onChange={setType} />
              <div className="qr-step__body">
                <ContentForm key={state.type} type={state.type} content={content} onChange={setContent} />
                {state.type === 'url' && (qr.settings.dynamic || state.dynamic) && (
                  <div className={`qr-dynamic${isDynamic ? ' is-on' : ''}`} data-tour="qr.dynamic">
                    <div className="qr-dynamic__head">
                      <span className="qr-dynamic__icon">
                        <ThunderboltFilled />
                      </span>
                      <div>
                        <strong>{t('qr.dynamic.title')}</strong>
                        <p>{t('qr.dynamic.desc')}</p>
                      </div>
                      <Switch checked={isDynamic} onChange={(dynamic) => patch({ dynamic })} disabled={!qr.settings.dynamic && !state.dynamic} />
                    </div>
                    {isDynamic && (
                      <div className="qr-dynamic__body">
                        {state.slug ? (
                          <>
                            <div className="qr-dynamic__link">
                              <LinkOutlined />
                              <a href={shortLink} target="_blank" rel="noreferrer">
                                {shortLink.replace(/^https?:\/\//, '')}
                              </a>
                              <Tooltip title={t('qr.studio.copyLink')}>
                                <Button size="small" type="text" icon={<CopyOutlined />} onClick={copyLink} aria-label={t('qr.studio.copyLink')} />
                              </Tooltip>
                            </div>
                            <label className="qr-inline__switch">
                              <Switch size="small" checked={state.active} onChange={(active) => patch({ active })} /> {state.active ? t('qr.dynamic.active') : t('qr.dynamic.paused')}
                            </label>
                            {state.id && <ScanStats id={state.id} />}
                          </>
                        ) : (
                          <p className="qr-muted">{t('qr.dynamic.afterSave')}</p>
                        )}
                      </div>
                    )}
                    {!isDynamic && state.slug && <p className="qr-warning">{t('qr.dynamic.offWarning')}</p>}
                  </div>
                )}
              </div>
            </Step>

            <Step n="2" title={t('qr.studio.templateTitle')} hint={lockAll ? t('qr.studio.templateOnlyHint') : t('qr.studio.templateHint')} tour="qr.template">
              {galleryTemplates.length ? (
                <TemplateGallery
                  templates={galleryTemplates}
                  value={state.templateId}
                  payload={payload}
                  onPick={pickTemplate}
                  custom={!lockAll}
                  onCustom={() => patch({ templateId: null })}
                />
              ) : (
                <p className="qr-muted">{t('qr.studio.noTemplates')}</p>
              )}
            </Step>

            <Step n="3" title={t('qr.studio.designTitle')} hint={template && Object.values(template.locks).some(Boolean) && !qr.canManage ? t('qr.studio.designLockedHint') : t('qr.studio.designHint')}>
              <Designer
                design={state.design}
                onChange={(design) => patch({ design })}
                locks={template?.locks || {}}
                lockAll={lockAll}
                allowUploads={qr.settings.allowUploads}
                type={state.type}
                admin={qr.canManage}
              />
            </Step>
          </div>

          <div className="qr-studio__side">
            <Preview
              payload={payload}
              design={state.design}
              name={state.name || summarize(state.type, content)}
              footer={
                <div className="qr-preview__name">
                  <label htmlFor="qr-name">{t('qr.studio.name')}</label>
                  <Input id="qr-name" value={state.name} maxLength={120} placeholder={summarize(state.type, content) || t(`qr.types.${state.type}.name`)} onChange={(event) => patch({ name: event.target.value })} />
                  <Button type={dirty ? 'primary' : 'default'} block size="large" icon={<SaveOutlined />} loading={saving} onClick={save}>
                    {state.id ? (dirty ? t('qr.studio.saveChanges') : t('qr.studio.savedState')) : t('qr.studio.saveToLibrary')}
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
