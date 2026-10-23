import {useMemo, useState} from 'react';
import {
  Button,
  ComboBox,
  Dialog,
  DialogTrigger,
  Group,
  Heading,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  NumberField,
  Popover,
  Radio,
  RadioGroup,
  Text,
} from 'react-aria-components';
import {useIntl} from 'react-intl';
import {
  GENERATIONS_MAX,
  LEVELS,
  MIN_UP,
  isLevel,
  scopeCount,
  scopePeople,
  type BreadthLevel,
} from '../model/scope';
import {useAppState, useDispatch} from '../store';
import {Icon} from './icons';
import {buildIndex, searchPeople, type PersonEntry} from './search';
import './scope.css';

/** People drawn for every level, with the current root and generations. */
function useLevelCounts(): Record<BreadthLevel, number> | undefined {
  const {tree, settings, rootId, scope} = useAppState();
  return useMemo(() => {
    if (!tree || !rootId) return undefined;
    const out = {} as Record<BreadthLevel, number>;
    for (const level of LEVELS) {
      const people = scopePeople(tree, settings, {
        rootId,
        level,
        up: scope.up,
        down: scope.down,
      });
      out[level] = scopeCount(tree, people);
    }
    return out;
  }, [tree, settings, rootId, scope.up, scope.down]);
}

/** «От кого считать»: a searchable list of everyone in the tree. */
export function RootPicker() {
  const {tree, rootId, lang, settings} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const index = useMemo(
    () =>
      tree ? buildIndex(tree, {locale: lang, style: settings.dateStyle}) : [],
    [tree, lang, settings.dateStyle],
  );
  const rootName = index.find((e) => e.id === rootId)?.name ?? '';
  const [query, setQuery] = useState<string | null>(null);
  const items = useMemo(
    () => searchPeople(index, query ?? '', 50),
    [index, query],
  );
  return (
    <ComboBox
      className="scope-root"
      items={items}
      inputValue={query ?? rootName}
      onInputChange={setQuery}
      selectedKey={rootId ?? null}
      onSelectionChange={(key) => {
        setQuery(null);
        if (key !== null) dispatch({type: 'reroot', id: String(key)});
      }}
      onBlur={() => setQuery(null)}
      menuTrigger="focus"
    >
      <Label className="scope__label">
        {intl.formatMessage({id: 'scope.root'})}
      </Label>
      <div className="scope-root__field">
        <Icon name="search" size={16} strokeWidth={2} />
        <Input className="scope-root__input" />
        <Button
          className="scope-root__toggle"
          aria-label={intl.formatMessage({id: 'scope.rootList'})}
        >
          <Icon name="chevronDown" size={16} strokeWidth={2} />
        </Button>
      </div>
      <Popover className="scope-root__popover" offset={4}>
        <ListBox className="scope-root__list">
          {(e: PersonEntry) => (
            <ListBoxItem
              id={e.id}
              textValue={e.name}
              className="scope-root__item"
            >
              <span className="scope-root__name">{e.name}</span>
              <span className="scope-root__life">{e.life}</span>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

function Generations({which}: {which: 'up' | 'down'}) {
  const {scope} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const all = scope.level === 'all';
  const min = which === 'up' ? MIN_UP[scope.level] : 0;
  const value = which === 'up' ? Math.max(scope.up, min) : scope.down;
  return (
    <NumberField
      className="stepper"
      minValue={min}
      maxValue={GENERATIONS_MAX}
      value={all ? NaN : value}
      isDisabled={all}
      onChange={(v) => {
        if (Number.isFinite(v))
          dispatch({type: 'setScope', patch: {[which]: v}});
      }}
    >
      <Label className="scope__label">
        {intl.formatMessage({id: `scope.${which}`})}
      </Label>
      <Group className="stepper__group">
        <Button slot="decrement" className="stepper__btn">
          <Icon name="minus" size={16} strokeWidth={2} />
        </Button>
        <Input className="stepper__input" placeholder="—" />
        <Button slot="increment" className="stepper__btn">
          <Icon name="plus" size={16} strokeWidth={2} />
        </Button>
      </Group>
    </NumberField>
  );
}

function LevelPicker({layout}: {layout: 'bar' | 'list'}) {
  const {scope} = useAppState();
  const dispatch = useDispatch();
  const intl = useIntl();
  const counts = useLevelCounts();
  const people = (n: number) =>
    intl.formatMessage({id: 'scope.people'}, {count: n});
  return (
    <RadioGroup
      className={`levels levels--${layout}`}
      value={scope.level}
      onChange={(v) => {
        if (isLevel(v)) dispatch({type: 'setScope', patch: {level: v}});
      }}
      orientation={layout === 'bar' ? 'horizontal' : 'vertical'}
    >
      <Label className="scope__label">
        {intl.formatMessage({id: 'scope.who'})}
      </Label>
      <div className="levels__options">
        {LEVELS.map((level) => (
          <Radio key={level} value={level} className="levels__option">
            <span className="levels__name">
              {intl.formatMessage({id: `level.${level}`})}
              {counts && (
                <span className="sr-only">, {people(counts[level])}</span>
              )}
            </span>
            {counts && (
              <span className="levels__count" aria-hidden="true">
                {layout === 'bar' ? counts[level] : people(counts[level])}
              </span>
            )}
            {layout === 'list' && (
              <span className="levels__desc">
                {intl.formatMessage({id: `level.${level}.desc`})}
              </span>
            )}
          </Radio>
        ))}
      </div>
      {layout === 'bar' && (
        <Text slot="description" className="levels__desc">
          {intl.formatMessage({id: `level.${scope.level}.desc`})}
        </Text>
      )}
    </RadioGroup>
  );
}

function CountStatus() {
  const {tree, scope} = useAppState();
  const intl = useIntl();
  const counts = useLevelCounts();
  if (!tree || !counts) return null;
  return (
    <p role="status" className="scope__count">
      {intl.formatMessage(
        {id: 'scope.count'},
        {count: counts[scope.level], total: tree.indis.size},
      )}
    </p>
  );
}

/** The chart's scope controls in the header (desktop). */
export function ScopeBar() {
  return (
    <div className="scope">
      <RootPicker />
      <LevelPicker layout="bar" />
      <Generations which="up" />
      <Generations which="down" />
      <CountStatus />
    </div>
  );
}

/** The same controls on a phone: one header button and a bottom sheet. */
export function ScopeSheet() {
  const {scope} = useAppState();
  const intl = useIntl();
  const counts = useLevelCounts();
  const title = intl.formatMessage({id: 'scope.who'});
  const value = intl.formatMessage(
    {id: 'scope.summary'},
    {
      level: intl.formatMessage({id: `level.${scope.level}`}).toLowerCase(),
      count: counts?.[scope.level] ?? 0,
    },
  );
  return (
    <DialogTrigger>
      <Button className="scope-sheet__trigger">
        <span>
          <span className="scope-sheet__key">{title}: </span>
          {value}
        </span>
        <Icon name="chevronDown" size={16} strokeWidth={2} />
      </Button>
      <ModalOverlay isDismissable className="sheet-overlay">
        <Modal className="sheet">
          <Dialog className="flyout__dialog scope-sheet">
            {({close}) => (
              <>
                <div className="flyout__head">
                  <Heading slot="title" className="flyout__title">
                    {title}
                  </Heading>
                  <Button className="btn" onPress={close}>
                    {intl.formatMessage({id: 'scope.close'})}
                  </Button>
                </div>
                <RootPicker />
                <LevelPicker layout="list" />
                <div className="scope-sheet__steppers">
                  <Generations which="up" />
                  <Generations which="down" />
                </div>
                <CountStatus />
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
