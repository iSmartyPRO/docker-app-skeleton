import { Button, Result, Spin } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';

/** Spinner while loading, a retryable error card on failure, children when ready. */
export default function LoadState({ ready, error, onRetry, children }) {
  const { t } = useLocale();
  if (!ready) {
    return (
      <div className="page-fallback">
        <Spin />
      </div>
    );
  }
  if (error) {
    return (
      <Result
        status="warning"
        title={errorMessage(error)}
        extra={onRetry && <Button onClick={onRetry}>{t('common.retry')}</Button>}
      />
    );
  }
  return children;
}
