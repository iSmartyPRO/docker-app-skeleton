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
import { pick } from '../../../i18n/languages';

/**
 * Import columns: key → header in each language (the template uses the person's language) and extra
 * accepted spellings. A file is read with headers in any portal language (warehouse/xlsx readImportFile).
 */
export const EMPLOYEE_COLUMNS = [
  { key: 'lastName', ru: 'Фамилия', en: 'Last name', ky: 'Фамилиясы', tr: 'Soyadı', zh: '姓', aliases: ['фамилия', 'last name', 'surname', 'soyad', 'soyadi', '姓氏'] },
  { key: 'firstName', ru: 'Имя', en: 'First name', ky: 'Аты', tr: 'Adı', zh: '名', aliases: ['имя', 'first name', 'name', 'ат', 'ad', 'adi', '名字'] },
  { key: 'middleName', ru: 'Отчество', en: 'Middle name', ky: 'Атасынын аты', tr: 'Baba adı', zh: '父称', aliases: ['отчество', 'middle name', 'patronymic', 'baba adi'] },
  { key: 'personnelNo', ru: 'Табельный номер', en: 'Personnel number', ky: 'Табель номери', tr: 'Sicil numarası', zh: '工号', aliases: ['табельный номер', 'таб. №', 'табельный', 'personnel number', 'employee id', 'табель', 'sicil no', 'sicil', '员工编号'] },
  { key: 'position', ru: 'Должность', en: 'Position', ky: 'Кызмат орду', tr: 'Pozisyon', zh: '职位', aliases: ['должность', 'position', 'job title', 'кызматы', 'unvan', 'görev', '岗位'] },
  { key: 'unit', ru: 'Подразделение', en: 'Unit', ky: 'Бөлүм', tr: 'Birim', zh: '部门', aliases: ['подразделение', 'отдел', 'unit', 'department', 'departman', 'bölüm'] },
  { key: 'site', ru: 'Объект', en: 'Site', ky: 'Объект', tr: 'Şantiye', zh: '工地', aliases: ['объект', 'площадка', 'site', 'santiye'] },
  { key: 'status', ru: 'Статус', en: 'Status', ky: 'Статус', tr: 'Durum', zh: '状态', aliases: ['статус', 'status', 'абалы'] },
  { key: 'employment', ru: 'Тип занятости', en: 'Employment', ky: 'Иштөө түрү', tr: 'İstihdam türü', zh: '用工类型', aliases: ['тип занятости', 'занятость', 'employment', 'istihdam'] },
  { key: 'hireDate', ru: 'Дата приёма', en: 'Hire date', ky: 'Ишке кабыл алынган күнү', tr: 'İşe giriş tarihi', zh: '入职日期', aliases: ['дата приёма', 'дата приема', 'hire date', 'принят', 'ишке кабыл алынган', 'işe giriş'] },
  { key: 'birthDate', ru: 'Дата рождения', en: 'Birth date', ky: 'Туулган күнү', tr: 'Doğum tarihi', zh: '出生日期', aliases: ['дата рождения', 'birth date', 'birthday', 'туулган күн'] },
  { key: 'workEmail', ru: 'Рабочий e-mail', en: 'Work e-mail', ky: 'Жумушчу электрондук почта', tr: 'İş e-postası', zh: '工作邮箱', aliases: ['рабочий e-mail', 'e-mail', 'email', 'почта', 'work email', 'электрондук почта', 'e-posta', '邮箱', '电子邮件'] },
  { key: 'workPhone', ru: 'Рабочий телефон', en: 'Work phone', ky: 'Жумушчу телефон', tr: 'İş telefonu', zh: '工作电话', aliases: ['рабочий телефон', 'телефон', 'work phone', 'phone', 'telefon', '电话'] },
  { key: 'workMobile', ru: 'Мобильный', en: 'Mobile', ky: 'Мобилдик', tr: 'Cep telefonu', zh: '手机', aliases: ['мобильный', 'mobile', 'cep', 'мобилдик телефон'] },
  { key: 'personalEmail', ru: 'Личный e-mail', en: 'Personal e-mail', ky: 'Жеке электрондук почта', tr: 'Kişisel e-posta', zh: '个人邮箱', aliases: ['личный e-mail', 'personal email'] },
  { key: 'personalPhone', ru: 'Личный телефон', en: 'Personal phone', ky: 'Жеке телефон', tr: 'Kişisel telefon', zh: '个人电话', aliases: ['личный телефон', 'personal phone'] },
];

/** The template's example row, in the person's language (status and employment as the interface names them). */
const EXAMPLE_NAMES = {
  ru: { lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович', position: 'Монтажник' },
  en: { lastName: 'Smith', firstName: 'John', middleName: '', position: 'Installer' },
  ky: { lastName: 'Асанов', firstName: 'Азамат', middleName: 'Бакытович', position: 'Монтажчы' },
  tr: { lastName: 'Yılmaz', firstName: 'Ahmet', middleName: '', position: 'Montajcı' },
  zh: { lastName: '王', firstName: '伟', middleName: '', position: '安装工' },
};
const exampleRow = (t, locale) => ({
  ...(EXAMPLE_NAMES[locale] || EXAMPLE_NAMES.en),
  personnelNo: '0001',
  unit: 'EX-N-1',
  site: 'EX-N-1',
  status: t('emp.status.active'),
  employment: t('emp.employment.staff'),
  hireDate: '2024-03-01',
  birthDate: '15.06.1990',
  workEmail: 'ivanov@example.com',
  workPhone: '+1 555 0100',
});

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
    return col ? pick(col, locale) : field;
  };
  const problems = [...(report?.errors || []).map((item) => ({ ...item, level: 'error' })), ...(report?.warnings || []).map((item) => ({ ...item, level: 'warning' }))];
  return (
    <div className="emp-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.employees.name'), to: '/app/employees' }, { key: 'import', label: t('emp.nav.import') }]}
        icon={<MenuIcon name="upload" />}
        title={t('emp.nav.import')}
        description={t('emp.import.lead')}
        actions={[{ key: 'template', label: t('emp.import.template'), onClick: () => importTemplate(EMPLOYEE_COLUMNS, exampleRow(t, locale), locale, 'employees-template.xlsx') }]}
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
