import type {MouseEvent, ReactNode} from 'react';
import {personHref} from '../store/hash';
import {useAppState, useDispatch} from '../store';

/** A link that selects a person; a real URL so it can be opened in a tab. */
export function PersonLink({
  id,
  children,
  onSelect,
  className = 'link',
  ...rest
}: {
  id: string;
  children: ReactNode;
  onSelect?: () => void;
  className?: string;
  'data-disputed'?: boolean;
}) {
  const {view} = useAppState();
  const dispatch = useDispatch();
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    dispatch({type: 'select', id});
    onSelect?.();
  };
  return (
    <a
      className={className}
      href={personHref(view, id)}
      onClick={onClick}
      {...rest}
    >
      {children}
    </a>
  );
}
