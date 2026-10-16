import { useCallback, useEffect, useState } from 'react';
import { App, Button, Input, Popconfirm, Switch, Table, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import ModuleHeader from '../../shared/ModuleHeader';
import { empApi } from '../api';
import { useEmp } from '../EmpContext';
import { empError } from '../lib';

/** «Должности»: the positions directory (employees.admin). A position in use is archived, not deleted. */
export default function PositionsPage() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { touch } = useEmp();
  const [list, setList] = useState(null);
  const [name, setName] = useState('');
  const [archived, setArchived] = useState(false);
  const load = useCallback(() => {
    empApi
      .positions(true)
      .then((res) => setList(res.data.positions))
      .catch((err) => message.error(empError(err, t)));
  }, [message, t]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (fn) => {
    try {
      await fn();
      load();
      touch();
    } catch (err) {
      message.error(empError(err, t));
    }
  };
  const add = () =>
    act(async () => {
      await empApi.createPosition({ name });
      setName('');
    });
  const rows = (list || []).filter((item) => archived || !item.archived);
  return (
    <div className="emp-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.employees.name'), to: '/app/employees' }, { key: 'positions', label: t('emp.nav.positions') }]}
        icon={<MenuIcon name="briefcase" />}
        title={t('emp.nav.positions')}
        description={t('emp.positions.lead')}
      />
      <section className="emp-panel">
        <div className="emp-tabbar">
          <Input value={name} onChange={(event) => setName(event.target.value)} onPressEnter={() => name.trim() && add()} placeholder={t('emp.positions.new')} maxLength={160} style={{ maxWidth: 320 }} />
          <Button type="primary" icon={<PlusOutlined />} disabled={!name.trim()} onClick={add}>
            {t('emp.positions.add')}
          </Button>
          <label className="emp-switch">
            <Switch size="small" checked={archived} onChange={setArchived} /> {t('emp.positions.showArchived')}
          </label>
        </div>
        <Table
          rowKey="id"
          loading={!list}
          dataSource={rows}
          pagination={rows.length > 50 ? { pageSize: 50 } : false}
          columns={[
            {
              key: 'name',
              title: t('emp.positions.name'),
              render: (_, row) => (
                <Input
                  defaultValue={row.name}
                  variant="borderless"
                  maxLength={160}
                  onBlur={(event) => event.target.value.trim() && event.target.value.trim() !== row.name && act(() => empApi.updatePosition(row.id, { name: event.target.value.trim() }))}
                  onPressEnter={(event) => event.target.blur()}
                  aria-label={t('emp.positions.name')}
                />
              ),
            },
            { key: 'people', title: t('emp.positions.people'), dataIndex: 'people', width: 120 },
            {
              key: 'state',
              title: '',
              width: 220,
              render: (_, row) =>
                row.archived ? (
                  <>
                    <Tag bordered={false}>{t('emp.positions.archived')}</Tag>
                    <Button size="small" type="link" onClick={() => act(() => empApi.updatePosition(row.id, { name: row.name, archived: false }))}>
                      {t('emp.positions.restore')}
                    </Button>
                  </>
                ) : (
                  <Popconfirm title={row.people ? t('emp.positions.archiveConfirm') : t('emp.positions.deleteConfirm')} okText={t('common.yes')} cancelText={t('common.cancel')} onConfirm={() => act(() => empApi.removePosition(row.id))}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                      {row.people ? t('emp.positions.archive') : t('common.delete')}
                    </Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      </section>
    </div>
  );
}
