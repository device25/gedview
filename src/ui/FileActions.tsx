import {useRef} from 'react';
import {Button} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {useDispatch} from '../store';
import {Icon} from './icons';
import {useLoader} from './loader';

export const ACCEPTED = '.ged,.gdz,.zip,image/*';

/** Whether this browser can pick a whole folder (not phones, mostly). */
const FOLDERS =
  typeof document !== 'undefined' &&
  'webkitdirectory' in document.createElement('input') &&
  !/iPhone|iPad|Android/i.test(navigator.userAgent);

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
  const folder = useRef<HTMLInputElement>(null);
  const pick = (el: HTMLInputElement) => {
    const files = Array.from(el.files ?? []);
    el.value = '';
    openFiles(files);
    onDone?.();
  };
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
        onChange={(e) => pick(e.currentTarget)}
      />
      {/* A folder with the tree and its photos: the browser lists every
          file with its path inside the folder; none is read until shown. */}
      <input
        ref={(el) => {
          folder.current = el;
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        hidden
        data-testid="folder-input"
        onChange={(e) => pick(e.currentTarget)}
      />
      <Button
        className={variant === 'hero' ? 'btn btn--primary' : 'btn'}
        onPress={() => input.current?.click()}
      >
        <Icon name="plus" size={18} strokeWidth={2} />
        {intl.formatMessage({id: 'file.open'})}
      </Button>
      {FOLDERS && (
        <Button className="btn" onPress={() => folder.current?.click()}>
          <Icon name="folder" size={18} strokeWidth={2} />
          {intl.formatMessage({id: 'file.openFolder'})}
        </Button>
      )}
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
