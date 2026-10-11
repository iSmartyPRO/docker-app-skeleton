import { Suspense, lazy, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Drawer, Result, Spin } from 'antd';
import Chrome from '../../components/Chrome';
import PageTransition from '../../components/ui/PageTransition';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { TASK_REF } from './api';
import { TasksProvider, useTasks } from './TasksContext';
import ProjectDialog from './components/ProjectDialog';
import { TaskEditorProvider, useTaskEditor } from './components/editor/EditorContext';
import { CreateButton } from './components/editor/QuickTask';
import '../shared/module.css';
import './tasks.css';

const MyTasks = lazy(() => import('./pages/MyTasks'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectPage = lazy(() => import('./pages/ProjectPage'));

function Sidebar({ onNavigate }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { projects, mine, config } = useTasks();
  const editor = useTaskEditor();
  const [dialog, setDialog] = useState(null);
  return (
    <div className="mod-side">
      <NavLink to="/app/tasks" end className="mod-side__brand" onClick={onNavigate}>
        <MenuIcon name="tasks" />
        <span>{t('apps.tasks.name')}</span>
      </NavLink>
      <CreateButton block onQuick={() => { onNavigate?.(); editor.openQuick(); }} onFull={() => { onNavigate?.(); editor.openFull(); }} onTemplate={(draft) => { onNavigate?.(); editor.openFull(draft); }} />
      <nav className="mod-nav">
        <NavLink to="/app/tasks" end className="mod-nav__link" onClick={onNavigate}>
          <MenuIcon name="user" variant="mono" />
          <span className="mod-nav__text">{t('tasks.myTitle')}</span>
          {mine?.open > 0 && <span className={`mod-nav__count${mine.overdue ? ' is-alert' : ''}`}>{mine.open}</span>}
        </NavLink>
        <NavLink to="/app/tasks/projects" className="mod-nav__link" onClick={onNavigate}>
          <MenuIcon name="kanban" variant="mono" />
          <span className="mod-nav__text">{t('tasks.allProjects')}</span>
        </NavLink>
      </nav>
      <div className="mod-side__label">
        <span>{t('tasks.projects')}</span>
        {config?.canCreateProjects && (
          <button type="button" onClick={() => setDialog('project')} aria-label={t('tasks.newProject')}>
            +
          </button>
        )}
      </div>
      <nav className="mod-nav">
        {projects.map((project) => (
          <NavLink key={project.id} to={`/app/tasks/${project.key}`} className={({ isActive }) => `mod-nav__link${isActive ? ' active' : ''}`} onClick={onNavigate}>
            <span className="mod-dot" style={{ '--c': project.color }} />
            <span className="mod-nav__text">{project.name}</span>
            {project.counts.open > 0 && <span className={`mod-nav__count${project.counts.overdue ? ' is-alert' : ''}`}>{project.counts.open}</span>}
          </NavLink>
        ))}
        {!projects.length && <div className="mod-side__empty">{t('tasks.noProjects')}</div>}
      </nav>
      <ProjectDialog
        open={dialog === 'project'}
        onClose={(project) => {
          setDialog(null);
          if (project) {
            onNavigate?.();
            navigate(`/app/tasks/${project.key}`);
          }
        }}
      />
    </div>
  );
}

/** /app/tasks/HR → project; /app/tasks/HR-12 → project with the task open. */
function RefRoute() {
  const { ref } = useParams();
  const { projects } = useTasks();
  const match = TASK_REF.exec(ref || '');
  const projectKey = (match ? match[1] : ref || '').toUpperCase();
  // A task without a project, or of a project the person does not see as a whole, opens over "My tasks".
  if (match && !projects.some((project) => project.key === projectKey)) return <MyTasks openRef={`${projectKey}-${match[2]}`} />;
  return <ProjectPage projectKey={projectKey} taskRef={match ? `${projectKey}-${match[2]}` : null} />;
}

function Shell() {
  const { t } = useLocale();
  const { config, error } = useTasks();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  // Opening a task keeps the board mounted: animate per project, not per task.
  const transitionKey = location.pathname.replace(/^(\/app\/tasks\/[A-Za-z][A-Za-z0-9]*)-\d+$/, '$1').toUpperCase();

  if (error) return <Result status="warning" title={errorMessage(error)} />;
  if (!config) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
      </div>
    );
  }
  return (
    <div className="mod-shell">
      <aside className="mod-shell__side">
        <Sidebar />
      </aside>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={300} styles={{ body: { padding: 0 } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
      <main className="mod-shell__main">
        <Button className="mod-shell__menu" onClick={() => setDrawer(true)} icon={<span>☰</span>}>
          {t('tasks.projects')}
        </Button>
        <Suspense fallback={<div className="page-fallback"><Spin /></div>}>
          <PageTransition id={transitionKey}>
            <Routes>
              <Route index element={<MyTasks />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path=":ref" element={<RefRoute />} />
              <Route path="*" element={<Navigate to="/app/tasks" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
}

/** Tasks app: /app/tasks (my tasks), /app/tasks/projects, /app/tasks/KEY, /app/tasks/KEY-12. */
export default function TasksApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <TasksProvider>
        <TaskEditorProvider>
          <Shell />
        </TaskEditorProvider>
      </TasksProvider>
    </div>
  );
}
