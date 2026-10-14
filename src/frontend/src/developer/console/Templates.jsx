import { useEffect, useMemo, useState } from 'react';
import { App, Button, Drawer, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { consoleApi } from '../client';
import { GlyphIcon, PolicyTester, RulesEditor, ScopeChips, ScopeMatrix, templateDesc, templateName } from '../components';

const COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6', '#64748B', '#F97316'];
const ICONS = ['key', 'eye', 'user', 'tasks', 'calendar', 'chat', 'people', 'chart', 'bolt', 'shield', 'cloud', 'robot', 'rocket', 'folder', 'database', 'building'];

function TemplateEditor({ open, template, areas, onClose, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft({
        name: template?.name || '',
        description: template?.description || '',
        color: template?.color || COLORS[0],
        icon: template?.icon || 'key',
        scopes: { ...(template?.scopes || {}) },
        rules: (template?.rules || []).map((rule) => ({ ...rule })),
      });
    }
  }, [open, template]);
  const moduleIds = useMemo(() => areas.filter((area) => area.module).map((area) => area.module), [areas]);
  if (!draft) return null;
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const save = async () => {
    setSaving(true);
    try {
      const body = { ...draft, rules: draft.rules.filter((rule) => rule.path.trim()) };
      const res = template?.id ? await consoleApi.updateTemplate(template.id, body) : await consoleApi.createTemplate(body);
      message.success(t('api.saved'));
      onSaved(res.data.template);
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={980}
      className="ax-drawer"
      title={template?.id ? t('api.templates.editTitle') : t('api.templates.createTitle')}
      destroyOnHidden
      footer={
        <div className="ax-drawer__foot">
          <Button type="primary" size="large" loading={saving} onClick={save}>
            {t('common.save')}
          </Button>
          <Button size="large" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      }
    >
      <div className="ax-editor">
        <div className="ax-editor__main">
          <section className="ax-sec">
            <div className="ax-tplhead" style={{ '--tpl': draft.color }}>
              <span className="ax-tplhead__icon">
                <GlyphIcon name={draft.icon} />
              </span>
              <div className="ax-tplhead__fields">
                <Input size="large" value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder={t('api.templates.name')} autoFocus />
                <Input.TextArea value={draft.description} onChange={(event) => set({ description: event.target.value })} placeholder={t('api.templates.description')} autoSize={{ minRows: 1, maxRows: 3 }} />
              </div>
            </div>
            <div className="ax-swatches">
              <span>{t('api.templates.color')}</span>
              {COLORS.map((color) => (
                <button key={color} type="button" className={draft.color === color ? 'is-on' : ''} style={{ background: color }} onClick={() => set({ color })} aria-label={color} />
              ))}
            </div>
            <div className="ax-iconpick">
              <span>{t('api.templates.icon')}</span>
              {ICONS.map((icon) => (
                <button key={icon} type="button" className={draft.icon === icon ? 'is-on' : ''} onClick={() => set({ icon })}>
                  <GlyphIcon name={icon} />
                </button>
              ))}
            </div>
          </section>
          <section className="ax-sec">
            <h3>{t('api.editor.scopesTitle')}</h3>
            <ScopeMatrix areas={areas} value={draft.scopes} onChange={(key, level) => set({ scopes: { ...draft.scopes, [key]: level } })} />
          </section>
          <section className="ax-sec">
            <h3>{t('api.editor.rulesTitle')}</h3>
            <p className="ax-hint">{t('api.editor.rulesHint')}</p>
            <RulesEditor value={draft.rules} onChange={(rules) => set({ rules })} />
          </section>
        </div>
        <aside className="ax-editor__side">
          <div className="ax-summary">
            <div className="ax-summary__title">{t('api.editor.summary')}</div>
            <ScopeChips scopes={draft.scopes} max={20} />
            <PolicyTester policy={{ scopes: draft.scopes, rules: draft.rules }} moduleIds={moduleIds} />
          </div>
        </aside>
      </div>
    </Drawer>
  );
}

export default function Templates({ templates, meta, setTemplates, reload }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const [editor, setEditor] = useState({ open: false, template: null });
  const refresh = async () => {
    const res = await consoleApi.templates();
    setTemplates(res.data.templates);
    reload();
  };
  const duplicate = (template) =>
    setEditor({
      open: true,
      template: { ...template, id: null, key: null, name: t('api.templates.copyOf', { name: templateName(t, template) }), description: templateDesc(t, template) },
    });
  const remove = (template) =>
    modal.confirm({
      title: templateName(t, template),
      content: t('api.templates.deleteConfirm'),
      okButtonProps: { danger: true },
      okText: t('common.delete'),
      onOk: async () => {
        try {
          await consoleApi.deleteTemplate(template.id);
          refresh();
        } catch (err) {
          message.error(err?.response?.data?.code === 'TEMPLATE_IN_USE' ? t('api.templates.inUse') : errorMessage(err));
        }
      },
    });
  if (!meta) return <div className="ax-skeleton" />;
  return (
    <div className="ax-stack">
      <div className="ax-toolbar">
        <p className="ax-muted ax-toolbar__lead">{t('api.editor.templateHint')}</p>
        <span className="ax-grow" />
        <Button type="primary" onClick={() => setEditor({ open: true, template: null })} icon={<PlusOutlined />}>
          {t('api.newTemplate')}
        </Button>
      </div>
      <div className="ax-tplgrid">
        {templates.map((template) => (
          <article key={template.id} className="ax-tpl" style={{ '--tpl': template.color }}>
            <header>
              <span className="ax-tpl__icon">
                <GlyphIcon name={template.icon} />
              </span>
              <div>
                <h4>{templateName(t, template)}</h4>
                <span className="ax-muted">
                  {template.system ? `🔒 ${t('api.templates.system')} · ` : ''}
                  {t('api.templates.tokens', { n: template.tokens })}
                </span>
              </div>
            </header>
            <p>{templateDesc(t, template)}</p>
            <ScopeChips scopes={template.scopes} max={8} />
            {template.rules.length > 0 && (
              <ul className="ax-tpl__rules">
                {template.rules.map((rule, index) => (
                  <li key={index} className={`is-${rule.effect}`}>
                    {rule.effect === 'deny' ? '⛔' : '✅'} {rule.methods.join(', ') || '*'} <code>{rule.path}</code>
                  </li>
                ))}
              </ul>
            )}
            <footer>
              {template.system ? (
                <Button size="small" onClick={() => duplicate(template)}>
                  {t('api.templates.duplicate')}
                </Button>
              ) : (
                <>
                  <Button size="small" onClick={() => setEditor({ open: true, template })}>
                    {t('api.edit')}
                  </Button>
                  <Button size="small" onClick={() => duplicate(template)}>
                    {t('api.templates.duplicate')}
                  </Button>
                  <Button size="small" danger type="text" onClick={() => remove(template)}>
                    {t('common.delete')}
                  </Button>
                </>
              )}
            </footer>
          </article>
        ))}
      </div>
      <TemplateEditor open={editor.open} template={editor.template} areas={meta.areas} onClose={() => setEditor({ open: false, template: null })} onSaved={refresh} />
    </div>
  );
}
