import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Table } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader from '../../shared/ModuleHeader';
import { faApi, faError, personUrl } from '../api';
import { StatusTag } from '../components/Bits';

/** Find a person in the directory and open their card. */
export default function People() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [text, setText] = useState(q);
  const [people, setPeople] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) {
      setPeople(null);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    faApi
      .people(q)
      .then(({ data }) => mine === seq.current && (setPeople(data.people), setError(null)))
      .catch((err) => mine === seq.current && setError(faError(err, t)))
      .finally(() => mine === seq.current && setLoading(false));
  }, [q, t]);

  const search = (value) => setParams(value ? { q: value } : {}, { replace: true });

  return (
    <div className="fs-page fa-page">
      <ModuleHeader
        title={t('folderAccess.people.title')}
        description={t('folderAccess.people.lead')}
        search={{ value: text, onChange: setText, onSearch: search, loading, placeholder: t('folderAccess.people.placeholder') }}
      />
      {error && <div className="signin__error">{error}</div>}
      <section className="panel">
        <Table
          rowKey="dn"
          loading={loading}
          dataSource={people || []}
          pagination={false}
          locale={{ emptyText: q.trim().length < 2 ? t('folderAccess.people.typeToSearch') : t('folderAccess.people.none') }}
          onRow={(person) => ({ onClick: () => navigate(personUrl(person.dn)), className: 'fa-row' })}
          columns={[
            { title: t('folderAccess.person'), dataIndex: 'name' },
            { title: t('folderAccess.login'), dataIndex: 'login' },
            { title: t('folderAccess.department'), dataIndex: 'department', responsive: ['md'] },
            { title: t('folderAccess.status'), width: 110, render: (_, person) => <StatusTag person={person} /> },
          ]}
        />
      </section>
    </div>
  );
}
