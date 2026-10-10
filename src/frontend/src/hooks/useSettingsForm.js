import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Form } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { errorMessage } from '../lib/errors';

function stable(value) {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k] ?? null]))
      : v ?? null
  );
}

/**
 * Glue between an antd form and the SaveBar: tracks whether the values differ
 * from `initialValues`, resets them, and wraps saving with toasts.
 *
 *   const { form, dirty, saving, formProps, reset, submit } =
 *     useSettingsForm(initial, (values) => api.save(values));
 *   <Form {...formProps}>…</Form>
 *   <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
 */
export function useSettingsForm(initialValues, onSave, { form: external } = {}) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm(external);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const fields = useMemo(() => Object.keys(initialValues || {}), [initialValues]);
  const snapshot = useMemo(() => stable(initialValues || {}), [initialValues]);

  useEffect(() => {
    if (!initialValues) return;
    form.setFieldsValue(initialValues);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const recompute = useCallback(() => {
    setDirty(stable(form.getFieldsValue(fields)) !== snapshot);
  }, [form, fields, snapshot]);

  const reset = useCallback(() => {
    form.resetFields();
    form.setFieldsValue(initialValues || {});
    setDirty(false);
  }, [form, initialValues]);

  const submit = useCallback(async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return false;
    }
    setSaving(true);
    try {
      await onSave(values);
      setDirty(false);
      message.success(t('common.saved'));
      return true;
    } catch (err) {
      message.error(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [form, onSave, message, t]);

  return {
    form,
    dirty,
    saving,
    reset,
    submit,
    recompute,
    formProps: {
      form,
      layout: 'vertical',
      initialValues,
      onValuesChange: recompute,
      onFinish: submit,
      requiredMark: false,
    },
  };
}
