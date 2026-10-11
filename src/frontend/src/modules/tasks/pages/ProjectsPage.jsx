import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Empty, Progress, Switch } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { tasksApi } from '../api';
import { useTasks } from '../TasksContext';
import ProjectDialog from '../components/ProjectDialog';

/** All projects the user can see, with progress; archived ones on demand. */
export default function ProjectsPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { projects, config, refresh } = useTasks();
  const [archived, setArchived] = useState(false);
  const [list, setList] = useState(projects);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!archived) {
      setList(projects);
      return;
    }
    tasksApi.projects(true).then((res) => setList(res.data.projects)).catch(() => {});
  }, [archived, projects]);

  return (
    <div className="tasks-page">
      <header className="mod-hero">
        <div className="mod-hero__text">
          <h1>{t('tasks.projects')}</h1>
          <p>{t('tasks.projectsLead')}</p>
        </div>
        <div className="mod-hero__actions">
          <label className="toolbar-switch">
            <Switch size="small" checked={archived} onChange={setArchived} /> {t('tasks.showArchived')}
          </label>
          {config?.canCreateProjects && (
            <Button type="primary" onClick={() => setCreating(true)}>
              + {t('tasks.newProject')}
            </Button>
          )}
        </div>
      </header>
      {list.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('tasks.noProjects')} />
      ) : (
        <div className="project-grid">
          {list.map((project) => {
            const total = (project.counts.open || 0) + (project.counts.done || 0);
            const percent = total ? Math.round(((project.counts.done || 0) / total) * 100) : 0;
            return (
              <Link key={project.id} to={`/app/tasks/${project.key}`} className={`project-card${project.archived ? ' is-archived' : ''}`} style={{ '--c': project.color }}>
                <div className="project-card__top">
                  <span className="mod-hero__badge">{project.key}</span>
                  <div>
                    <strong>{project.name}</strong>
                    <span>{project.description || t(`tasks.level.${project.level}`)}</span>
                  </div>
                </div>
                <Progress percent={percent} size="small" strokeColor={project.color} showInfo={false} />
                <div className="project-card__stats">
                  <span>{t('tasks.stats.openN', { n: project.counts.open || 0 })}</span>
                  {project.counts.overdue > 0 && <span className="is-alert">{t('tasks.stats.overdueN', { n: project.counts.overdue })}</span>}
                  {project.counts.mine > 0 && <span>{t('tasks.stats.mineN', { n: project.counts.mine })}</span>}
                  <span className="project-card__pct">{percent}%</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <ProjectDialog
        open={creating}
        onClose={async (project) => {
          setCreating(false);
          if (project) {
            await refresh();
            navigate(`/app/tasks/${project.key}`);
          }
        }}
      />
    </div>
  );
}
