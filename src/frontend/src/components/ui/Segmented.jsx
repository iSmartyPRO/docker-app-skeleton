import { forwardRef } from 'react';
import { Segmented as AntSegmented } from 'antd';
import { t } from '../../i18n/translations';

/**
 * antd Segmented with a screen-reader name in the interface language:
 * rc-segmented labels every group "segmented control" in English. Pass your
 * own `aria-label` to name the group better.
 */
const Segmented = forwardRef(function Segmented(props, ref) {
  return <AntSegmented ref={ref} aria-label={t('common.a11y.segmented')} {...props} />;
});

export default Segmented;
