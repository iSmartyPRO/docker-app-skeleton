import dayjs from 'dayjs';
import { DatePicker, TimePicker } from 'antd';
import { dayFromPicker, dayToPicker, fromPicker, pickerFormat, toPicker, useRegional } from '../../lib/datetime';

/*
 * Date and time inputs that follow the person's time zone and formats
 * (lib/datetime.js). Use these instead of bare antd pickers:
 *
 *   <DateTimeField value={iso} onChange={(iso) => …} />   a moment (ISO instant)
 *   <DateField value="2026-10-13" onChange={(day) => …} />  a calendar day ('YYYY-MM-DD')
 *   <TimeField value="09:30" onChange={(hhmm) => …} />       a wall-clock time
 *
 * They work inside antd Form.Item too (value/onChange). Other antd props pass through.
 */

export function DateTimeField({ value, onChange, showTime = true, ...rest }) {
  const regional = useRegional();
  const format = pickerFormat(regional);
  return (
    <DatePicker
      showTime={showTime ? { format: format.time, use12Hours: regional.timeFormat === '12', minuteStep: 5 } : false}
      format={showTime ? format.dateTime : format.date}
      value={toPicker(value, regional)}
      onChange={(d) => onChange?.(d ? fromPicker(d, regional) : null)}
      {...rest}
    />
  );
}

export function DateField({ value, onChange, ...rest }) {
  const regional = useRegional();
  return <DatePicker format={pickerFormat(regional).date} value={dayToPicker(value)} onChange={(d) => onChange?.(dayFromPicker(d))} {...rest} />;
}

export function TimeField({ value, onChange, ...rest }) {
  const regional = useRegional();
  const format = pickerFormat(regional).time;
  return (
    <TimePicker
      format={format}
      use12Hours={regional.timeFormat === '12'}
      minuteStep={5}
      value={value ? dayjs(value, 'HH:mm') : null}
      onChange={(d) => onChange?.(d ? d.format('HH:mm') : null)}
      {...rest}
    />
  );
}

/** A moment as text in the person's zone and formats, with the full value in a tooltip-friendly title. */
export { fmtDate, fmtDateTime, fmtSmart, fmtTime } from '../../lib/datetime';
