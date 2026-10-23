import type {ReactNode} from 'react';
import {
  Button,
  Checkbox,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from 'react-aria-components';
import './controls.css';

/** Checkbox with the label on the left and the box on the right. */
export function CheckField({
  isSelected,
  onChange,
  children,
}: {
  isSelected: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Checkbox className="check" isSelected={isSelected} onChange={onChange}>
      <span className="check__label">{children}</span>
      <span className="check__box" aria-hidden="true">
        <svg viewBox="0 0 18 18" width="18" height="18">
          <path
            d="M4 9.5l3.2 3.2L14 5.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Checkbox>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{id: T; label: string}>;
}) {
  return (
    <Select
      className="select"
      selectedKey={value}
      onSelectionChange={(k) => onChange(String(k) as T)}
    >
      <Label className="select__label">{label}</Label>
      <Button className="select__button">
        <SelectValue />
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>
      <Popover className="select__popover" offset={4}>
        <ListBox className="select__list">
          {options.map((o) => (
            <ListBoxItem
              key={o.id}
              id={o.id}
              textValue={o.label}
              className="select__item"
            >
              {o.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
