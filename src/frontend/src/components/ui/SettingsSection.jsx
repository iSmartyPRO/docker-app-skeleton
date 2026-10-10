/**
 * Settings building blocks in the "label left, control right" layout used by
 * premium consoles. Rows stack vertically on narrow screens.
 */
export function SettingsSection({ title, description, extra, children, danger = false, flush = false }) {
  return (
    <section className={`settings-section${danger ? ' is-danger' : ''}`}>
      {(title || extra) && (
        <header className="settings-section__head">
          <div>
            {title && <h3 className="settings-section__title">{title}</h3>}
            {description && <p className="settings-section__desc">{description}</p>}
          </div>
          {extra && <div className="settings-section__extra">{extra}</div>}
        </header>
      )}
      <div className={`settings-section__body${flush ? ' is-flush' : ''}`}>{children}</div>
    </section>
  );
}

export function SettingRow({ label, description, children, stacked = false, htmlFor }) {
  return (
    <div className={`setting-row${stacked ? ' is-stacked' : ''}`}>
      <div className="setting-row__text">
        <label className="setting-row__label" htmlFor={htmlFor}>
          {label}
        </label>
        {description && <div className="setting-row__desc">{description}</div>}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}
