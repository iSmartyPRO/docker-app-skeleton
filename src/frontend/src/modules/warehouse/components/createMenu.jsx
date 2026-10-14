import { useNavigate } from 'react-router-dom';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { useWh } from '../WhContext';
import { CREATE_TYPES, TYPE_LOOK } from '../lib';

/** The «+» menu: document types the person may create somewhere. */
export function useCreateItems(onNavigate) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { meta } = useWh();
  const rights = meta?.rights || {};
  return CREATE_TYPES.filter((entry) => rights[entry.right]).map((entry) => ({
    key: entry.type,
    label: (
      <span className="wh-create-item" style={{ '--c': TYPE_LOOK[entry.type].color }}>
        <MenuIcon name={TYPE_LOOK[entry.type].icon} variant="mono" />
        {t(`wh.types.${entry.type}`)}
      </span>
    ),
    onClick: () => {
      onNavigate?.();
      navigate(`/app/warehouse/documents/new/${entry.type}`);
    },
  }));
}
