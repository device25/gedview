import {useRef} from 'react';
import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {useDispatch} from '../store';
import {Icon} from './icons';
import {useLoader} from './loader';

export const ACCEPTED = '.ged,.gdz,.zip,image/*';

/** "Open file" (picker) and "By link" (URL dialog) buttons. */
export function FileActions({
  variant = 'row',
  onDone,
}: {
  variant?: 'row' | 'stack' | 'hero';
  onDone?: () => void;
}) {
  const intl = useIntl();
  const dispatch = useDispatch();
  const {openFiles} = useLoader();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={`file-actions file-actions--${variant}`}>
      {/* A plain hidden input: react-aria's FileTrigger warns when it is
          mounted from an update inside Tabs. */}
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={ACCEPTED}
        data-testid="file-input"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          openFiles(files);
          onDone?.();
        }}
      />
      <Button
        className={variant === 'hero' ? 'btn btn--primary' : 'btn'}
        onPress={() => input.current?.click()}
      >
        <Icon name="plus" size={18} strokeWidth={2} />
        {intl.formatMessage({id: 'file.open'})}
      </Button>
      <Button
        className="btn"
        onPress={() => {
          onDone?.();
          dispatch({type: 'setUrlDialog', open: true});
        }}
      >
        <Icon name="link" size={18} strokeWidth={2} />
        {intl.formatMessage({id: 'file.openUrl'})}
      </Button>
    </div>
  );
}
