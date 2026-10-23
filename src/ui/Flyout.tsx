import type {ReactElement, ReactNode} from 'react';
import {
  Button,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  Popover,
  type Placement,
} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {useAppState, useDispatch, useIsMobile} from '../store';
import type {FlyoutId} from '../store/reducer';
import {Icon} from './icons';
import './flyout.css';

interface FlyoutProps {
  id: FlyoutId;
  title: string;
  /** The button that opens it (a react-aria Button). */
  trigger: ReactElement;
  placement?: Placement;
  /** Pixel width on desktop. */
  width?: number;
  /** A disabled trigger is rendered alone (react-aria warns otherwise). */
  disabled?: boolean;
  children: ReactNode;
}

/**
 * A panel next to the rail on desktop (popover) and a full-width bottom
 * sheet on phones. Open state lives in the store so `/` and Esc work
 * everywhere; focus moves into the panel and returns to the trigger.
 */
export function Flyout({
  id,
  title,
  trigger,
  placement = 'right top',
  width = 320,
  disabled,
  children,
}: FlyoutProps) {
  const {flyout} = useAppState();
  const dispatch = useDispatch();
  const isMobile = useIsMobile();
  const intl = useIntl();
  const close = () => dispatch({type: 'closeFlyout', id});

  const dialog = (
    <Dialog className="flyout__dialog" data-flyout={id}>
      <div className="flyout__head">
        <Heading slot="title" className="flyout__title">
          {title}
        </Heading>
        <Button
          className="icon-btn"
          aria-label={intl.formatMessage({id: 'flyout.close'}, {title})}
          onPress={close}
        >
          <Icon name="close" size={18} strokeWidth={2} />
        </Button>
      </div>
      {children}
    </Dialog>
  );

  if (disabled) return trigger;

  return (
    <DialogTrigger
      isOpen={flyout === id}
      onOpenChange={(open) =>
        dispatch(open ? {type: 'openFlyout', id} : {type: 'closeFlyout', id})
      }
    >
      {trigger}
      {isMobile ? (
        <ModalOverlay isDismissable className="sheet-overlay">
          <Modal className="sheet">{dialog}</Modal>
        </ModalOverlay>
      ) : (
        <Popover
          className="flyout"
          placement={placement}
          offset={18}
          style={{width}}
        >
          {dialog}
        </Popover>
      )}
    </DialogTrigger>
  );
}
