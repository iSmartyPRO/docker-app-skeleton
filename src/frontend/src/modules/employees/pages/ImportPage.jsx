import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Switch, Table, Upload } from 'antd';
import { CheckCircleOutlined, InboxOutlined, WarningOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import ModuleHeader from '../../shared/ModuleHeader';
import { importTemplate, readImportFile } from '../../warehouse/xlsx';
import { empApi } from '../api';
import { useEmp } from '../EmpContext';
import { empError } from '../lib';

/** Import columns: key → accepted header spellings (Russian or English). */
export const EMPLOYEE_COLUMNS = [
  { key: 'lastName', ru: 'Фамилия', en: 'Last name', aliases: ['фамилия', 'last name', 'surname'] },
  { key: 'firstName', ru: 'Имя', en: 'First name', aliases: ['имя', 'first name', 'name'] },
  { key: 'middleName', ru: 'Отчество', en: 'Middle name', aliases: ['отчество', 'middle name', 'patronymic'] },
  { key: 'personnelNo', ru: 'Табельный номер', en: 'Personnel number', aliases: ['табельный номер', 'таб. №', 'табельный', 'personnel number', 'employee id'] },
  { key: 'position', ru: 'Должность', en: 'Position', aliases: ['должность', 'position', 'job title'] },
  { key: 'unit', ru: 'Подразделение', en: 'Unit', aliases: ['подразделение', 'отдел', 'unit', 'department'] },
  { key: 'site', ru: 'Объект', en: 'Site', aliases: ['объект', 'площадка', 'site'] },
  { key: 'status', ru: 'Статус', en: 'Status', aliases: ['статус', 'status'] },
  { key: 'employment', ru: 'Тип занятости', en: 'Employment', aliases: ['тип занятости', 'занятость', 'employment'] },
  { key: 'hireDate', ru: 'Дата приёма', en: 'Hire date', aliases: ['дата приёма', 'дата приема', 'hire date', 'принят'] },
  { key: 'birthDate', ru: 'Дата рождения', en: 'Birth date', aliases: ['дата рождения', 'birth date', 'birthday'] },
  { key: 'workEmail', ru: 'Рабочий e-mail', en: 'Work e-mail', aliases: ['рабочий e-mail', 'e-mail', 'email', 'почта', 'work email'] },
  { key: 'workPhone', ru: 'Рабочий телефон', en: 'Work phone', aliases: ['рабочий телефон', 'телефон', 'work phone', 'phone'] },
  { key: 'workMobile', ru: 'Мобильный', en: 'Mobile', aliases: ['мобильный', 'mobile'] },
  { key: 'personalEmail', ru: 'Личный e-mail', en: 'Personal e-mail', aliases: ['личный e-mail', 'personal email'] },
  { key: 'personalPhone', ru: 'Личный телефон', en: 'Personal phone', aliases: ['личный телефон', 'personal phone'] },
];

const EXAMPLE = {
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  personnelNo: '0001',
  position: 'Монтажник',
  unit: 'EX-N-1',
  site: 'EX-N-1',
  status: 'работает',
  employment: 'штат',
  hireDate: '2024-03-01',
  birthDate: '15.06.1990',
  workEmail: 'ivanov@example.com',
  workPhone: '+1 555 0100',
};

/** Import from Excel / CSV (spec §4.2): a check with a report first, then all or nothing. */
export default function ImportPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { touch } = useEmp();
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [report, setReport] = useState(null);
  const [createPositions, setCreatePositions] = useState(true);
  const [busy, setBusy] = useState(false);
  const read = async (f) => {
    setFile(f);
    setReport(null);
    try {
      const result = await readImportFile(f, EMPLOYEE_COLUMNS);
      setParsed(result);
      if (!result.rows.length) message.warning(t('emp.import.noRows'));
    } catch (err) {
      message.error(empError(err, t));
    }
    return false;
  };
  const send = async (dryRun) => {
    setBusy(true);
    try {
      const res = await empApi.importRows({ rows: parsed.rows, dryRun, createPositions });
      setReport(res.data.report);
      if (!dryRun && res.data.report.ok) {
        message.success(t('emp.import.done', { created: res.data.report.created, updated: res.data.report.updated }));
        touch();
      }
    } catch (err) {
      message.error(empError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const columnName = (field) => {
    const col = EMPLOYEE_COLUMNS.find((item) => item.key === field);
    return col ? (locale === 'ru' ? col.ru : col.en) : field;
  };
  const problems = [...(report?.errors || []).map((item) => ({ ...item, level: 'error' })), ...(report?.warnings || []).map((item) => ({ ...item, level: 'warning' }))];
  return (
    <div className="emp-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.employees.name'), to: '/app/employees' }, { key: 'import', label: t('emp.nav.import') }]}
        icon={<MenuIcon name="upload" />}
        title={t('emp.nav.import')}
        description={t('emp.import.lead')}
        actions={[{ key: 'template', label: t('emp.import.template'), onClick: () => importTemplate(EMPLOYEE_COLUMNS, EXAMPLE, locale, 'employees-template.xlsx') }]}
      />
      <section className="emp-panel emp-import">
        <ol className="emp-steps">
          <li>{t('emp.import.step1')}</li>
          <li>{t('emp.import.step2')}</li>
          <li>{t('emp.import.step3')}</li>
        </ol>
        <Upload.Dragger accept=".xlsx,.csv" maxCount={1} showUploadList={false} beforeUpload={read}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{file ? file.name : t('emp.import.drop')}</p>
          <p className="ant-upload-hint">{t('emp.import.dropHint')}</p>
        </Upload.Dragger>
        {parsed && (
          <>
            <div className="emp-import__headers">
              {parsed.headers.map((header, index) => (
                <span key={index} className={`emp-flag${header.key ? ' is-ok' : ''}`}>
                  {header.text}
                  {header.key ? ' ✓' : ` — ${t('emp.import.ignored')}`}
                </span>
              ))}
            </div>
            <p>{t('emp.import.rows', { n: parsed.rows.length })}</p>
            <label className="emp-switch">
              <Switch size="small" checked={createPositions} onChange={setCreatePositions} /> {t('emp.import.createPositions')}
            </label>
            <div className="emp-tabbar">
              <Button loading={busy} disabled={!parsed.rows.length} onClick={() => send(true)}>
                {t('emp.import.check')}
              </Button>
              <Button type="primary" loading={busy} disabled={!parsed.rows.length || (report && !report.ok)} onClick={() => send(false)}>
                {t('emp.import.run')}
              </Button>
              {report?.written && (
                <Button type="link" onClick={() => navigate('/app/employees')}>
                  {t('emp.import.toRegistry')}
                </Button>
              )}
            </div>
          </>
        )}
        {report && (
          <div className={`emp-banner ${report.ok ? 'is-ok' : 'is-bad'}`} role="status">
            {report.ok ? <CheckCircleOutlined /> : <WarningOutlined />}{' '}
            {report.ok
              ? report.written
                ? t('emp.import.resultOk', { created: report.created, updated: report.updated })
                : t('emp.import.checkOk', { created: report.created, updated: report.updated })
              : t('emp.import.errorsFound', { n: report.errors.length })}
          </div>
        )}
        {problems.length > 0 && (
          <Table
            size="small"
            rowKey={(item, index) => `${item.row}:${item.field}:${index}`}
            dataSource={problems}
            pagination={problems.length > 50 ? { pageSize: 50 } : false}
            columns={[
              { key: 'row', title: t('emp.import.row'), dataIndex: 'row', width: 80 },
              { key: 'level', title: '', width: 40, render: (_, item) => (item.level === 'error' ? <WarningOutlined className="emp-bad" /> : <CheckCircleOutlined className="emp-warn" />) },
              { key: 'field', title: t('emp.import.field'), dataIndex: 'field', width: 160, render: columnName },
              {
                key: 'message',
                title: t('emp.import.problem'),
                render: (_, item) => {
                  const key = `emp.importErrors.${item.code}`;
                  const text = t(key);
                  return text === key ? item.message : `${text} — ${item.message}`;
                },
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
