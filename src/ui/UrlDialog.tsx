import {useState} from 'react';
import {
  Button,
  Dialog,
  FieldError,
  Form,
  Heading,
  Input,
  Label,
  Modal,
  ModalOverlay,
  Text,
  TextField,
} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {useAppState, useDispatch} from '../store';
import {useLoader} from './loader';

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** "By link": the browser fetches the file itself, nothing goes via a proxy. */
export function UrlDialog() {
  const {urlDialogOpen} = useAppState();
  const dispatch = useDispatch();
  const {openUrl} = useLoader();
  const intl = useIntl();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const t = (id: string) => intl.formatMessage({id});
  const close = () => dispatch({type: 'setUrlDialog', open: false});

  return (
    <ModalOverlay
      isOpen={urlDialogOpen}
      onOpenChange={(open) => {
        dispatch({type: 'setUrlDialog', open});
        if (!open) setInvalid(false);
      }}
      isDismissable
      className="modal-overlay"
    >
      <Modal className="modal">
        <Dialog className="modal__dialog">
          <Heading slot="title" className="flyout__title">
            {t('url.title')}
          </Heading>
          <Form
            className="modal__form"
            validationBehavior="aria"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isHttpUrl(value)) {
                setInvalid(true);
                return;
              }
              openUrl(value.trim());
              close();
              setValue('');
            }}
          >
            <TextField
              autoFocus
              type="url"
              value={value}
              onChange={(v) => {
                setValue(v);
                setInvalid(false);
              }}
              isInvalid={invalid}
              isRequired
              validationBehavior="aria"
              className="field"
            >
              <Label>{t('url.label')}</Label>
              <Input
                className="field__input"
                placeholder="https://example.org/tree.ged"
              />
              <Text slot="description" className="hint">
                {t('url.hint')}
              </Text>
              <FieldError className="field__error">
                {t('url.invalid')}
              </FieldError>
            </TextField>
            <div className="modal__actions">
              <Button className="btn" onPress={close}>
                {t('common.cancel')}
              </Button>
              <Button className="btn btn--primary" type="submit">
                {t('file.open')}
              </Button>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
