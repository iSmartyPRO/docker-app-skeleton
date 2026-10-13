import { useEffect, useState } from 'react';
import { App, Alert, Button, Modal, Table, Tag, Upload } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { mpApi } from '../api';
import { useMp } from '../MpContext';
import { IMPORT_COLUMNS, importTemplate, readImportFile } from '../media/xlsx';

/**
 * Import of units from Excel / CSV (spec §9.10): the file is read in the
 * browser, columns are matched by their headers, the server checks every row
 * (dry run) and shows what is wrong; only a clean file is written, in one go.
 */
export default function ImportDialog({ open, project, onClose }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { types } = useMp();
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setParsed(null);
    setReport(null);
  }, [open]);

  const pick = async (chosen) => {
    setFile(chosen);
    setReport(null);
    try {
      setParsed(await readImportFile(chosen));
    } catch (err) {
      message.error(t('mp.import.unreadable', { error: errorMessage(err) }));
      setParsed(null);
    }
    return false;
  };

  const run = async (dryRun) => {
    setBusy(true);
    try {
      const res = await mpApi.importUnits({ projectId: project.id, rows: parsed.rows, dryRun });
      setReport({ ...res.data, dryRun });
      if (!dryRun && res.data.ok) {
        message.success(t('mp.import.done', { created: res.data.created, updated: res.data.updated }));
        onClose(true);
      }
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const mapped = parsed?.headers.filter((header) => header.key) || [];
  const unknown = parsed?.headers.filter((header) => !header.key && header.text.trim()) || [];
  return (
    <Modal
      open
      width={760}
      title={t('mp.import.title', { project: project.name })}
      onCancel={() => onClose(false)}
      destroyOnClose
      footer={[
        <Button key="tpl" onClick={() => importTemplate(locale, types)}>{t('mp.import.template')}</Button>,
        <Button key="cancel" onClick={() => onClose(false)}>{t('common.cancel')}</Button>,
        report?.ok && report.dryRun ? (
          <Button key="go" type="primary" loading={busy} onClick={() => run(false)}>{t('mp.import.run', { n: report.total })}</Button>
        ) : (
          <Button key="check" type="primary" loading={busy} disabled={!parsed?.rows.length || !mapped.some((header) => header.key === 'code')} onClick={() => run(true)}>{t('mp.import.check')}</Button>
        ),
      ]}
    >
      <p className="dialog-lead">{t('mp.import.lead')}</p>
      <Upload.Dragger accept=".xlsx,.csv" maxCount={1} showUploadList={false} beforeUpload={pick}>
        <p className="mp-upload__icon" aria-hidden="true">📄</p>
        <p>{file ? file.name : t('mp.import.drop')}</p>
        {parsed && <p className="mp-muted">{t('mp.import.rows', { n: parsed.rows.length })}</p>}
      </Upload.Dragger>
      {parsed && (
        <div className="mp-import__cols">
          {mapped.map((header) => (
            <Tag key={header.text} color="green">{header.text} → {t(`mp.import.col.${header.key}`)}</Tag>
          ))}
          {unknown.map((header) => (
            <Tag key={header.text}>{header.text} — {t('mp.import.skippedCol')}</Tag>
          ))}
          {!mapped.some((header) => header.key === 'code') && <Alert type="error" showIcon message={t('mp.import.noCode')} />}
        </div>
      )}
      {report && (
        <div className="mp-import__report">
          {report.ok ? (
            <Alert type="success" showIcon message={t('mp.import.ok', { created: report.created, updated: report.updated })} />
          ) : (
            <>
              <Alert type="error" showIcon message={t('mp.import.errors', { n: report.errors.length })} />
              <Table
                size="small"
                rowKey={(row, index) => `${row.row}-${row.field}-${index}`}
                pagination={{ pageSize: 8, hideOnSinglePage: true }}
                dataSource={report.errors}
                columns={[
                  { title: t('mp.import.row'), dataIndex: 'row', width: 70 },
                  { title: t('mp.import.field'), dataIndex: 'field', width: 140, render: (field) => (IMPORT_COLUMNS.some((col) => col.key === field) ? t(`mp.import.col.${field}`) : field) },
                  { title: t('mp.import.problem'), dataIndex: 'code', render: (code, row) => t(`mp.import.err.${code}`, {}) === `mp.import.err.${code}` ? row.message : t(`mp.import.err.${code}`) },
                ]}
              />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
