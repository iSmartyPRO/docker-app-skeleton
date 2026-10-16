import { Alert, Tag } from 'antd';
import { useLocale } from '../../../../../context/LocaleContext';

function EntryLine({ entry, sign, inherited = false }) {
  const { t } = useLocale();
  return (
    <li className={`fa-ntfs-diff__line is-${sign === '+' ? 'add' : 'remove'}`}>
      <span className="fa-ntfs-diff__sign">{sign}</span>
      <Tag color={entry.type === 'deny' ? 'red' : 'default'}>{t(`folderAccess.ntfs.${entry.type === 'deny' ? 'deny' : entry.type === 'allow' ? 'allow' : 'other'}`)}</Tag>
      {inherited && <Tag>{t('folderAccess.ntfs.inheritedTag')}</Tag>}
      <strong>{entry.name || entry.sid || t('folderAccess.ntfs.special')}</strong>
      <span className="fa-muted">
        {t(`folderAccess.ntfs.preset.${entry.preset || 'special'}`)} · {t(`folderAccess.ntfs.applies.${entry.appliesTo || 'this'}`)}
      </span>
    </li>
  );
}

/** Before → after of the explicit entries, the inherited ones and of inheritance (from the server's summary). */
export function ChangeSummary({ summary }) {
  const { t } = useLocale();
  if (!summary) return null;
  const inheritance = summary.protectedBefore !== summary.protectedAfter;
  const inheritedAdded = summary.inheritedAdded || [];
  const inheritedRemoved = summary.inheritedRemoved || [];
  if (!summary.added.length && !summary.removed.length && !inheritedAdded.length && !inheritedRemoved.length && !inheritance) return <p className="fa-muted">{t('folderAccess.ntfs.apply.noChange')}</p>;
  return (
    <ul className="fa-ntfs-diff">
      {inheritance && (
        <li className="fa-ntfs-diff__line">
          <span className="fa-ntfs-diff__sign">⟳</span>
          {summary.protectedAfter ? t('folderAccess.ntfs.apply.inheritanceOff') : t('folderAccess.ntfs.apply.inheritanceOn')}
        </li>
      )}
      {summary.removed.map((entry, index) => (
        <EntryLine key={`r${index}`} entry={entry} sign="−" />
      ))}
      {summary.added.map((entry, index) => (
        <EntryLine key={`a${index}`} entry={entry} sign="+" />
      ))}
      {inheritedRemoved.map((entry, index) => (
        <EntryLine key={`ir${index}`} entry={entry} sign="−" inherited />
      ))}
      {inheritedAdded.map((entry, index) => (
        <EntryLine key={`ia${index}`} entry={entry} sign="+" inherited />
      ))}
    </ul>
  );
}

/** Who loses rights (per scope) and the guard refusals of a change. */
export function LossList({ guards }) {
  const { t } = useLocale();
  if (!guards) return null;
  const loss = guards.loss || [];
  return (
    <>
      {(guards.errors || []).length > 0 && (
        <Alert
          type="error"
          showIcon
          className="fa-notice"
          message={t('folderAccess.ntfs.apply.protectedTitle')}
          description={guards.errors.map((error) => (error.code === 'EMPTY_DACL' ? t('folderAccess.ntfs.apply.emptyDacl') : error.name || error.sid)).join(', ')}
        />
      )}
      {loss.length > 0 && (
        <div className="fa-ntfs-loss">
          <div className="fa-ntfs-loss__title">{t('folderAccess.ntfs.apply.losesTitle')}</div>
          <ul>
            {loss.map((entry) => (
              <li key={entry.sid}>
                {entry.deny && entry.kind !== 'user' ? (
                  <span>{t('folderAccess.ntfs.apply.membersOf', { name: entry.name || entry.sid })}</span>
                ) : (
                  <strong>{entry.name || entry.sid}</strong>
                )}{' '}
                <span className="fa-muted">
                  {entry.losesAll
                    ? t('folderAccess.ntfs.apply.losesAll')
                    : ['this', 'subfolders', 'files']
                        .filter((scope) => entry.lost?.[scope])
                        .map((scope) => t(`folderAccess.ntfs.scope.${scope}`))
                        .join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
