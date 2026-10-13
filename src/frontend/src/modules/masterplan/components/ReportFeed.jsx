import { useState } from 'react';
import { App, Button, Image, Input, Modal, Popconfirm } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { mpApi } from '../api';
import { formatPercent } from '../lib';
import { Empty } from './bits';

/** The construction journal as a feed of photo reports by date (§7.3). */
export default function ReportFeed({ reports, compact, onChanged, onOpenNode }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [reject, setReject] = useState(null);
  if (!reports?.length) return <Empty icon="📷" title={t('mp.report.empty')} text={compact ? null : t('mp.report.emptyText')} />;

  const review = async (report, action, note) => {
    try {
      await mpApi.reviewReport(report.id, { action, note });
      message.success(action === 'publish' ? t('mp.report.publishedOk') : t('mp.report.rejectedOk'));
      onChanged?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  const remove = async (report) => {
    try {
      await mpApi.deleteReport(report.id);
      onChanged?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <>
      <ul className={`mp-feed${compact ? ' is-compact' : ''}`}>
        {reports.map((report) => (
          <li key={report.id} className={`mp-feed__item is-${report.status}`}>
            <div className="mp-feed__head">
              <time dateTime={report.factDate}>{fmtDate(report.factDate)}</time>
              {report.status !== 'published' && <span className={`mp-feed__state is-${report.status}`}>{t(`mp.report.state.${report.status}`)}</span>}
              <span className="mp-feed__who">{report.author?.name}</span>
            </div>
            <div className="mp-feed__what">
              {report.nodes.slice(0, 6).map((node) =>
                onOpenNode ? (
                  <button key={node.id} type="button" className="mp-chip" onClick={() => onOpenNode(node.id)}>{node.code || node.name}</button>
                ) : (
                  <span key={node.id} className="mp-chip">{node.code || node.name}</span>
                )
              )}
              {report.nodes.length > 6 && <span className="mp-chip is-more">+{report.nodes.length - 6}</span>}
              {report.stage && (
                <span className="mp-feed__stage">
                  {report.stage.name}
                  {report.percent !== null && <b> · {formatPercent(report.percent, locale)}</b>}
                </span>
              )}
            </div>
            {report.body && <p className="mp-feed__body">{report.body}</p>}
            {report.media.length > 0 && (
              <div className="mp-feed__photos">
                <Image.PreviewGroup>
                  {report.media.slice(0, compact ? 6 : 12).map((item) =>
                    item.mime?.startsWith('video/') ? (
                      <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="mp-feed__video">🎬</a>
                    ) : (
                      <Image key={item.id} src={item.thumbUrl || item.url} preview={{ src: item.url }} alt="" width={compact ? 72 : 96} height={compact ? 54 : 72} loading="lazy" />
                    )
                  )}
                </Image.PreviewGroup>
                {report.media.length > (compact ? 6 : 12) && <span className="mp-chip is-more">+{report.media.length - (compact ? 6 : 12)}</span>}
              </div>
            )}
            {report.reviewNote && <p className="mp-feed__note">{t('mp.report.note')}: {report.reviewNote}</p>}
            {(report.canReview || report.canDelete) && !compact && (
              <div className="mp-feed__actions">
                {report.canReview && <Button size="small" type="primary" onClick={() => review(report, 'publish')}>{t('mp.report.publish')}</Button>}
                {report.canReview && <Button size="small" onClick={() => setReject({ report, note: '' })}>{t('mp.report.reject')}</Button>}
                {report.canDelete && (
                  <Popconfirm title={t('mp.report.deleteConfirm')} onConfirm={() => remove(report)} okText={t('common.delete')} cancelText={t('common.cancel')}>
                    <Button size="small" type="text" danger>{t('common.delete')}</Button>
                  </Popconfirm>
                )}
                <span className="mp-muted mp-small">{fmtDateTime(report.createdAt)}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Modal open={Boolean(reject)} title={t('mp.report.reject')} onCancel={() => setReject(null)} onOk={() => { review(reject.report, 'reject', reject.note); setReject(null); }} okText={t('mp.report.reject')} cancelText={t('common.cancel')} destroyOnClose>
        {reject && <Input.TextArea value={reject.note} onChange={(event) => setReject({ ...reject, note: event.target.value })} placeholder={t('mp.report.rejectHint')} autoSize={{ minRows: 3 }} maxLength={500} />}
      </Modal>
    </>
  );
}
